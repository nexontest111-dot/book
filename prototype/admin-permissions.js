(() => {
 const $=s=>document.querySelector(s);
 const TIMEOUT_MS=25000,PAGE_SIZE=50;
 let client,busy=false,admins=[],facilities=[],facTotal=0,facPage=0,facQuery="",selectedFacility=null,operators=[],pending=null;
 let adminSeq=0,facSeq=0,opSeq=0;
 const tell=m=>{$("#perm-status").textContent=m;};
 const messages={
  UNAUTHORIZED:"로그인이 필요합니다. 위쪽 로그인 메뉴를 이용해주세요.",
  EMAIL_NOT_CONFIRMED:"이메일 인증을 완료해주세요.",
  ADMIN_REQUIRED:"이 계정에는 서비스 관리자 권한이 없습니다.",
  ADMIN_SETUP_REQUIRED:"권한 관리 DB 설정이 아직 적용되지 않았습니다. 마이그레이션 적용 후 다시 시도해주세요.",
  USER_NOT_FOUND:"해당 이메일의 인증된 계정을 찾지 못했습니다. 이메일을 정확히 입력했는지 확인해주세요.",
  FACILITY_NOT_FOUND:"시설을 찾을 수 없습니다. 목록을 새로 검색해주세요.",
  MEMBER_NOT_REGISTERED:"이 계정은 아직 회원 등록이 되어 있지 않습니다. 해당 사용자가 한 번 로그인해 프로필을 만든 뒤 다시 시도해주세요.",
  SELF_REVOKE:"본인의 관리자 권한은 해제할 수 없습니다.",
  LAST_ADMIN:"마지막 서비스 관리자는 해제할 수 없습니다.",
  INVALID_EMAIL:"이메일 형식을 확인해주세요.",
  AUTH_NOT_CONFIGURED:"로그인 설정이 되어 있지 않습니다. 관리자에게 문의해주세요.",
  INVALID_FILTER:"검색 조건이 올바르지 않습니다. 검색어를 확인해주세요.",
  INVALID_ID:"대상 정보가 올바르지 않습니다. 목록을 새로고침해주세요.",
  INVALID_JSON:"요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.",
  INVALID_BODY:"요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.",
  JSON_REQUIRED:"요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.",
  BODY_TOO_LARGE:"요청이 너무 큽니다. 입력을 확인해주세요.",
  ORIGIN_NOT_ALLOWED:"허용되지 않은 주소에서 요청했습니다. 서비스 주소로 접속해주세요.",
  METHOD_NOT_ALLOWED:"지원하지 않는 요청입니다. 새로고침 후 다시 시도해주세요.",
  NOT_FOUND:"요청한 기능을 찾을 수 없습니다. 서버 배포 상태를 확인해주세요.",
  AUTH_UNAVAILABLE:"로그인 확인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  DATABASE_NOT_CONFIGURED:"DB 연결 설정이 되어 있지 않습니다.",
  DATABASE_UNAVAILABLE:"DB에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  TIMEOUT:"응답이 25초 안에 오지 않았습니다. 잠시 후 상태를 확인하고 다시 시도해주세요.",
  NETWORK:"네트워크에 연결하지 못했습니다. 연결 상태를 확인해주세요."
 };
 const GATE=["UNAUTHORIZED","ADMIN_REQUIRED","EMAIL_NOT_CONFIRMED","ADMIN_SETUP_REQUIRED"];
 const message=e=>messages[e?.code]??"요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.";
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
 const fmt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
 const when=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"-":fmt.format(d)+" (KST)";};
 const who=(x,id)=>x.email||((x.displayName||"(이메일 없는 계정)")+" ("+String(id||"").slice(0,8)+")");
 const emailOk=v=>v.length>=3&&v.length<=254&&v.includes("@");

 async function api(path,options={}){
  const {data,error}=await client.auth.getSession();
  if(error||!data.session)throw {code:"UNAUTHORIZED"};
  let response;
  try{
   response=await fetch(path,{...options,cache:"no-store",signal:AbortSignal.timeout(TIMEOUT_MS),
    headers:{Authorization:"Bearer "+data.session.access_token,...(options.body?{"Content-Type":"application/json"}:{})}});
  }catch(e){throw {code:e?.name==="TimeoutError"||e?.name==="AbortError"?"TIMEOUT":"NETWORK"};}
  let body;
  try{body=await response.json();}catch{body=null;}
  if(!response.ok)throw body?.error??{code:"UNKNOWN"};
  return body??{};
 }

 function setBusy(v){
  busy=v;
  document.querySelectorAll("#perm-workspace button,#perm-workspace input").forEach(n=>{n.disabled=v;});
  if(!v)renderAll();
 }
 // 한 번에 하나의 요청만 실행한다. target 은 오류를 표시할 요소.
 async function run(task,target){
  if(busy)return false;
  setBusy(true);
  let ok=false;
  try{await task();ok=true;}
  catch(e){
   const text=message(e);
   if(GATE.includes(e?.code)){$("#perm-workspace").hidden=true;tell(text);}
   else if(target)target.textContent=text;
   else tell(text);
  }
  finally{setBusy(false);}
  return ok;
 }

 function confirmBox(label,onYes){
  const box=el("div",undefined,"perm-confirm");
  const yes=el("button","해제 확인","button primary"),no=el("button","취소","button");
  yes.type="button";no.type="button";
  yes.addEventListener("click",onYes);
  no.addEventListener("click",()=>{pending=null;renderAll();});
  box.append(el("span",label),yes,no);
  return box;
 }

 function renderAdmins(){
  const root=$("#admin-list");root.replaceChildren();
  if(!admins.length){root.append(el("p","지정된 서비스 관리자가 없습니다.","muted"));return;}
  for(const a of admins){
   const row=el("article",undefined,"perm-row"),info=el("div");
   info.append(el("strong",who(a,a.authUserId)),el("p",a.displayName?"표시 이름: "+a.displayName:"표시 이름 없음"),el("p","지정일: "+when(a.createdAt)));
   if(a.isSelf)info.append(el("span","본인","badge"));
   row.append(info);
   if(!a.isSelf){
    const b=el("button","해제","button");b.type="button";b.disabled=busy;
    b.addEventListener("click",()=>{pending={kind:"admin",id:a.authUserId};renderAll();});
    row.append(b);
    if(pending?.kind==="admin"&&pending.id===a.authUserId){
     b.hidden=true;
     row.append(confirmBox(who(a,a.authUserId)+" 계정의 관리자 권한을 해제할까요?",()=>revokeAdmin(a)));
    }
   }
   root.append(row);
  }
 }
 function renderFacilities(){
  const root=$("#facility-list");root.replaceChildren();
  $("#facility-page").textContent=(facPage+1)+" / "+Math.max(1,Math.ceil(facTotal/PAGE_SIZE));
  $("#facility-prev").disabled=busy||facPage===0;
  $("#facility-next").disabled=busy||(facPage+1)*PAGE_SIZE>=facTotal;
  if(!facilities.length){root.append(el("p","검색된 시설이 없습니다.","muted"));return;}
  for(const f of facilities){
   const sel=selectedFacility?.id===f.id;
   const row=el("article",undefined,"perm-row"+(sel?" is-selected":"")),info=el("div");
   info.append(el("strong",f.name),el("p",(f.sport==="golf"?"골프":"야구")+" · "+f.region));
   const b=el("button",sel?"선택됨":"선택","button");b.type="button";b.disabled=busy||sel;
   b.addEventListener("click",()=>selectFacility(f));
   row.append(info,b);root.append(row);
  }
 }
 function renderOperators(){
  const area=$("#operator-area"),root=$("#operator-list");root.replaceChildren();
  area.hidden=!selectedFacility;
  if(!selectedFacility)return;
  $("#operator-title").textContent=selectedFacility.name+" 운영자";
  if(!operators.length){root.append(el("p","연결된 운영자가 없습니다.","muted"));return;}
  if(operators.length>=200)root.append(el("p","최대 200명까지 표시합니다.","small muted"));
  for(const o of operators){
   const row=el("article",undefined,"perm-row"),info=el("div");
   info.append(el("strong",who(o,o.memberId)),el("p",o.displayName?"표시 이름: "+o.displayName:"표시 이름 없음"),el("p","연결일: "+when(o.createdAt)));
   const b=el("button","해제","button");b.type="button";b.disabled=busy;
   b.addEventListener("click",()=>{pending={kind:"operator",id:o.facilityId+"/"+o.memberId};renderAll();});
   row.append(info,b);
   if(pending?.kind==="operator"&&pending.id===o.facilityId+"/"+o.memberId){
    b.hidden=true;
    row.append(confirmBox(who(o,o.memberId)+" 계정을 "+selectedFacility.name+" 운영자에서 해제할까요?",()=>revokeOperator(o)));
   }
   root.append(row);
  }
 }
 function renderAll(){renderAdmins();renderFacilities();renderOperators();}

 async function loadAdmins(){
  const seq=++adminSeq,result=await api("/api/admin/permissions/admins");
  if(seq!==adminSeq)return;
  admins=Array.isArray(result.data)?result.data:[];
 }
 async function loadFacilities(){
  const seq=++facSeq,params=new URLSearchParams({q:facQuery,page:String(facPage)});
  const result=await api("/api/admin/facilities?"+params);
  if(seq!==facSeq)return;
  facilities=result.data??[];facTotal=result.total??0;
 }
 async function loadOperators(){
  if(!selectedFacility){operators=[];return;}
  const seq=++opSeq,fid=selectedFacility.id;
  const result=await api("/api/admin/permissions/operators?facilityId="+encodeURIComponent(fid));
  if(seq!==opSeq||selectedFacility?.id!==fid)return;
  operators=Array.isArray(result.data)?result.data:[];
 }

 function selectFacility(f){
  if(busy)return;
  selectedFacility=f;operators=[];pending=null;$("#operator-msg").textContent="";
  opSeq++;renderAll();
  run(async()=>{await loadOperators();},$("#operator-msg"));
 }
 function revokeAdmin(a){
  pending=null;$("#admin-msg").textContent="";
  run(async()=>{
   const r=await api("/api/admin/permissions/admins/"+encodeURIComponent(a.authUserId),{method:"DELETE"});
   await loadAdmins();
   $("#admin-msg").textContent=r.changed===false?"이미 해제된 관리자입니다.":who(a,a.authUserId)+" 계정의 관리자 권한을 해제했습니다.";
  },$("#admin-msg"));
 }
 function revokeOperator(o){
  pending=null;$("#operator-msg").textContent="";
  run(async()=>{
   const r=await api("/api/admin/permissions/operators/"+encodeURIComponent(o.facilityId)+"/"+encodeURIComponent(o.memberId),{method:"DELETE"});
   await loadOperators();
   $("#operator-msg").textContent=r.changed===false?"이미 해제된 운영자입니다.":who(o,o.memberId)+" 계정을 운영자에서 해제했습니다.";
  },$("#operator-msg"));
 }

 $("#admin-grant").addEventListener("submit",event=>{
  event.preventDefault();if(busy)return;
  const msg=$("#admin-msg"),input=$("#admin-email"),email=input.value.trim();
  pending=null;
  if(!emailOk(email)){msg.textContent=messages.INVALID_EMAIL;return;}
  msg.textContent="";
  run(async()=>{
   const r=await api("/api/admin/permissions/admins",{method:"POST",body:JSON.stringify({email})});
   await loadAdmins();input.value="";
   msg.textContent=r.changed?email+" 계정을 서비스 관리자로 지정했습니다.":"이미 서비스 관리자인 계정입니다.";
  },msg);
 });
 $("#operator-grant").addEventListener("submit",event=>{
  event.preventDefault();if(busy||!selectedFacility)return;
  const msg=$("#operator-msg"),input=$("#operator-email"),email=input.value.trim(),fid=selectedFacility.id;
  pending=null;
  if(!emailOk(email)){msg.textContent=messages.INVALID_EMAIL;return;}
  msg.textContent="";
  run(async()=>{
   const r=await api("/api/admin/permissions/operators",{method:"POST",body:JSON.stringify({facilityId:fid,email})});
   await loadOperators();input.value="";
   msg.textContent=r.changed?email+" 계정을 운영자로 연결했습니다.":"이미 연결된 운영자입니다.";
  },msg);
 });
 $("#facility-search").addEventListener("submit",event=>{
  event.preventDefault();if(busy)return;
  facQuery=$("#facility-query").value.trim();facPage=0;$("#facility-msg").textContent="";
  run(loadFacilities,$("#facility-msg"));
 });
 $("#facility-prev").addEventListener("click",()=>{if(!busy&&facPage>0){facPage--;run(loadFacilities,$("#facility-msg"));}});
 $("#facility-next").addEventListener("click",()=>{if(!busy&&(facPage+1)*PAGE_SIZE<facTotal){facPage++;run(loadFacilities,$("#facility-msg"));}});

 async function init(){
  try{
   if(!window.supabase?.createClient)throw {};
   const response=await fetch("/api/auth/config",{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)throw {};
   const config=await response.json();
   client=window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:"book-development-auth",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
   client.auth.onAuthStateChange(event=>{
    if(event==="SIGNED_OUT"){adminSeq++;facSeq++;opSeq++;admins=[];facilities=[];operators=[];selectedFacility=null;pending=null;$("#perm-workspace").hidden=true;tell(messages.UNAUTHORIZED);}
   });
  }catch{tell("관리 화면을 불러오지 못했습니다. 잠시 후 새로고침해주세요.");return;}
  const ok=await run(async()=>{await loadAdmins();$("#perm-workspace").hidden=false;tell("서비스 관리자 권한으로 접속했습니다.");await loadFacilities();});
  if(ok)renderAll();
 }
 init();
})();
