(() => {
 const $=s=>document.querySelector(s),form=$("#facility-editor");
 let client,items=[],selected=null,page=0,total=0,busy=false;
 const tell=m=>{$("#admin-status").textContent=m;};
 const messages={
  UNAUTHORIZED:"로그인이 필요합니다. 위쪽 로그인 메뉴를 이용해주세요.",
  EMAIL_NOT_CONFIRMED:"이메일 인증을 완료해주세요.",
  ADMIN_REQUIRED:"이 계정에는 서비스 관리자 권한이 없습니다.",
  ADMIN_SETUP_REQUIRED:"관리자 DB 설정이 아직 적용되지 않았습니다.",
  VERSION_CONFLICT:"다른 관리자가 먼저 수정했습니다. 새로고침해 최신 정보를 확인한 뒤 다시 편집해주세요.",
  SPORT_HAS_RESOURCES:"코스나 구장이 등록된 시설의 종목은 변경할 수 없습니다.",
  INVALID_IMAGE_URL:"사진 URL은 https 주소로 입력해주세요.",
  DATABASE_UNAVAILABLE:"DB에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."
 };
 const message=e=>messages[e.code]??"요청을 완료하지 못했습니다. 입력과 네트워크 상태를 확인해주세요.";
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function api(path,options={}){
  const {data,error}=await client.auth.getSession();
  if(error||!data.session)throw {code:"UNAUTHORIZED"};
  const response=await fetch(path,{...options,cache:"no-store",signal:AbortSignal.timeout(15000),
   headers:{Authorization:"Bearer "+data.session.access_token,...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});
  const body=await response.json();if(!response.ok)throw body.error??{code:"UNKNOWN"};return body;
 }
 function preview(){
  const image=$("#image-preview"),value=form.elements.image_url.value.trim();
  try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)throw new Error();image.src=u.href;image.hidden=false;}
  catch{image.hidden=true;image.removeAttribute("src");}
 }
 function edit(f){
  selected=f??null;form.reset();$("#save-status").textContent="";
  $("#editor-title").textContent=f?"시설 수정":"새 시설 등록";
  for(const key of ["name","sport","region","address","description","image_url"])form.elements[key].value=f?.[key]??(key==="sport"?"golf":"");
  form.elements.published.checked=f?.published??false;
  form.elements.pinned.checked=f?.pin_order!==null&&f?.pin_order!==undefined;
  form.elements.pin_order.value=f?.pin_order??1;
  form.elements.pin_order.disabled=!form.elements.pinned.checked||busy;
  preview();
 }
 function render(){
  const root=$("#admin-list");root.replaceChildren();
  $("#facility-total").textContent="검색 결과 "+total+"개 시설";
  $("#page-label").textContent=(page+1)+" / "+Math.max(1,Math.ceil(total/50));
  $("#previous").disabled=busy||page===0;$("#next").disabled=busy||(page+1)*50>=total;
  if(!items.length){root.append(el("p","등록된 시설이 없습니다. 시설 추가로 시작하세요.","muted"));return;}
  for(const f of items){
   const row=el("article",undefined,"admin-facility-row"),content=el("div");
   content.append(el("h3",f.name),el("p",(f.sport==="golf"?"골프":"야구")+" · "+f.region),
    el("span",f.published?"공개":"비공개","badge"));
   if(f.pin_order!==null)content.append(el("span","고정 "+f.pin_order,"badge"));
   const actions=el("div",undefined,"admin-row-actions");
   for(const [label,action] of [["수정",()=>edit(f)], [f.published?"비공개로":"공개하기",()=>quick(f,{published:!f.published})],
    [f.pin_order===null?"상단 고정":"고정 해제",()=>quick(f,{pin_order:f.pin_order===null?1:null})]]){
    const b=el("button",label,"button");b.type="button";b.disabled=busy;b.addEventListener("click",action);actions.append(b);
   }
   row.append(content,actions);root.append(row);
  }
 }
 function lock(value){
  busy=value;document.querySelectorAll("#admin-workspace button,#admin-workspace input,#admin-workspace select,#admin-workspace textarea").forEach(n=>n.disabled=value);
  form.elements.pin_order.disabled=value||!form.elements.pinned.checked;render();
 }
 async function load(){
  const params=new URLSearchParams({q:$("#admin-query").value.trim(),sport:$("#admin-sport").value,page:String(page)});
  const result=await api("/api/admin/facilities?"+params);
  items=result.data;total=result.total;$("#admin-workspace").hidden=false;render();tell("시설 정보를 관리할 수 있습니다.");
 }
 async function run(task){
  if(busy)return;lock(true);
  try{await task();}catch(e){tell(message(e));if(["UNAUTHORIZED","ADMIN_REQUIRED","EMAIL_NOT_CONFIRMED"].includes(e.code))$("#admin-workspace").hidden=true;}
  finally{lock(false);}
 }
 async function persist(data,id){
  return api("/api/admin/facilities"+(id?"/"+id:""),{method:id?"PATCH":"POST",body:JSON.stringify(data)});
 }
 function quick(f,change){
  if(selected&&form.querySelector(":focus"))return;
  if(!confirm(f.name+"의 노출 설정을 변경할까요?"))return;
  run(async()=>{const result=await persist({...f,...change},f.id);if(selected?.id===f.id)edit(result.data);await load();tell("노출 설정을 저장했습니다.");});
 }
 form.addEventListener("submit",event=>{
  event.preventDefault();if(busy)return;
  const data={};
  for(const key of ["name","sport","region","address","description","image_url"])data[key]=form.elements[key].value.trim();
  data.published=form.elements.published.checked;
  data.pin_order=form.elements.pinned.checked?Number(form.elements.pin_order.value):null;
  if(data.pin_order!==null&&(!Number.isInteger(data.pin_order)||data.pin_order<1||data.pin_order>1000)){tell("고정 순서는 1~1000의 정수를 입력해주세요.");return;}
  data.version=selected?.version??null;
  const id=selected?.id;
  run(async()=>{const result=await persist(data,id);edit(result.data);await load();$("#save-status").textContent="저장했습니다. 메인 페이지를 새로고침하면 반영됩니다.";});
 });
 $("#admin-search").addEventListener("submit",event=>{event.preventDefault();page=0;run(load);});
 $("#previous").addEventListener("click",()=>{if(page>0){page--;run(load);}});
 $("#next").addEventListener("click",()=>{if((page+1)*50<total){page++;run(load);}});
 $("#new-facility").addEventListener("click",()=>{edit(null);form.elements.name.focus();});
 $("#cancel-edit").addEventListener("click",()=>edit(null));
 form.elements.pinned.addEventListener("change",()=>{form.elements.pin_order.disabled=!form.elements.pinned.checked;});
 form.elements.image_url.addEventListener("change",preview);
 $("#image-preview").addEventListener("error",()=>{$("#image-preview").hidden=true;});
 async function init(){
  try{
   if(!window.supabase?.createClient)throw {};
   const response=await fetch("/api/auth/config",{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)throw {};
   const config=await response.json();
   client=window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:"book-development-auth",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
   client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"){items=[];selected=null;$("#admin-list").replaceChildren();$("#admin-workspace").hidden=true;tell(messages.UNAUTHORIZED);}});
   edit(null);await run(load);
  }catch{tell("관리 화면을 불러오지 못했습니다. 잠시 후 새로고침해주세요.");}
 }
 init();
})();
