import { authenticate } from "../auth/supabase.js";
import { withDatabase } from "../db.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(code,status)=>json({error:{code}},status);
class InputError extends Error { constructor(code,status=400){super(code);this.status=status;} }
async function readBody(request){
 if(!(request.headers.get("Content-Type")??"").toLowerCase().startsWith("application/json")) throw new InputError("JSON_REQUIRED",415);
 const reader=request.body?.getReader();if(!reader)throw new InputError("INVALID_BODY");
 let size=0;const chunks=[];
 try{while(true){const part=await reader.read();if(part.done)break;
  size+=part.value.byteLength;if(size>16384){await reader.cancel();throw new InputError("BODY_TOO_LARGE",413);}
  chunks.push(part.value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new InputError("INVALID_JSON");}
}
function validate(v,updating){
 if(!v||typeof v!=="object"||Array.isArray(v))throw new InputError("INVALID_BODY");
 const out={};
 for(const [key,max,required] of [["name",160,true],["region",80,true],["address",300,true],["description",3000,false],["image_url",2048,false]]){
  if(typeof v[key]!=="string")throw new InputError("INVALID_"+key.toUpperCase());
  out[key]=v[key].trim();if((required&&!out[key])||out[key].length>max)throw new InputError("INVALID_"+key.toUpperCase());
 }
 if(!["golf","baseball"].includes(v.sport))throw new InputError("INVALID_SPORT");
 if(typeof v.published!=="boolean")throw new InputError("INVALID_PUBLISHED");
 if(v.pin_order!==null&&(!Number.isInteger(v.pin_order)||v.pin_order<1||v.pin_order>1000))throw new InputError("INVALID_PIN_ORDER");
 if(out.image_url){let u;try{u=new URL(out.image_url);}catch{throw new InputError("INVALID_IMAGE_URL");}
  if(u.protocol!=="https:"||u.username||u.password)throw new InputError("INVALID_IMAGE_URL");
  out.image_url=u.href;if(out.image_url.length>2048)throw new InputError("INVALID_IMAGE_URL");
 }
 if(updating&&(!Number.isInteger(v.version)||v.version<1))throw new InputError("VERSION_REQUIRED");
 return {...out,sport:v.sport,published:v.published,pin_order:v.pin_order,version:updating?v.version:null};
}
export async function adminFacilities(request,env){
 const url=new URL(request.url),collection=url.pathname==="/api/admin/facilities";
 const match=url.pathname.match(/^\/api\/admin\/facilities\/([^/]+)$/);
 if(!collection&&!match)return fail("NOT_FOUND",404);
 if(match&&!uuid.test(match[1]))return fail("INVALID_FACILITY_ID",400);
 if(!(collection&&["GET","POST"].includes(request.method))&&!(match&&request.method==="PATCH"))return fail("METHOD_NOT_ALLOWED",405);
 const origin=request.headers.get("Origin");
 if(request.method!=="GET"&&origin&&origin!==url.origin)return fail("ORIGIN_NOT_ALLOWED",403);
 const identity=await authenticate(request,env);
 if(identity.error)return fail(identity.error,identity.status);
 if(!env.HYPERDRIVE?.connectionString)return fail("DATABASE_NOT_CONFIGURED",503);
 try{
  let data,action;
  if(request.method==="GET"){
   const q=url.searchParams.get("q")??"",sport=url.searchParams.get("sport")||null,page=url.searchParams.get("page")??"0";
   if(!/^\d{1,5}$/.test(page)||Number(page)>10000||q.length>160||(sport!==null&&!["golf","baseball"].includes(sport)))throw new InputError("INVALID_FILTER");
   data={q,sport,page:Number(page)};action="list";
  }else{data=validate(await readBody(request),Boolean(match));action=collection?"create":"update";}
  return await withDatabase(env,async db=>{
   const result=await db.query("SELECT booking.admin_facilities($1::uuid,$2::text,$3::uuid,$4::integer,$5::jsonb) AS payload",
    [identity.user.id,action,match?.[1]??null,data.version??null,JSON.stringify(data)]);
   return json(result.rows[0].payload,action==="create"?201:200);
  });
 }catch(e){
  if(e instanceof InputError)return fail(e.message,e.status);
  if(e.code==="42501")return fail("ADMIN_REQUIRED",403);
  if(e.code==="P0002")return fail("FACILITY_NOT_FOUND",404);
  if(e.code==="40001")return fail("VERSION_CONFLICT",409);
  if(["42883","42703","42P01"].includes(e.code))return fail("ADMIN_SETUP_REQUIRED",503);
  if(e.code==="23514"&&e.message==="SPORT_HAS_RESOURCES")return fail("SPORT_HAS_RESOURCES",409);
  if(["23514","22023","22P02","22003","23502"].includes(e.code))return fail("INVALID_FACILITY_DATA",400);
  return fail("DATABASE_UNAVAILABLE",503);
 }
}
