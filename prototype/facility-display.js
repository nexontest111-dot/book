(() => {
 const root=document.querySelector("#published-facility-grid"),status=document.querySelector("#published-facility-status");
 if(!root)return;
 let serial=0;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function card(f){
  const article=node("article",undefined,"slot-card published-facility");
  const imageWrap=node("div",undefined,"card-landscape "+f.sport);
  imageWrap.setAttribute("aria-hidden","true");
  if(f.image_url){
   try{const u=new URL(f.image_url);if(u.protocol==="https:"&&!u.username&&!u.password){
    const image=node("img");image.src=u.href;image.alt="";image.loading="lazy";image.referrerPolicy="no-referrer";
    image.addEventListener("error",()=>image.remove());imageWrap.append(image);
   }}catch{}
  }
  imageWrap.append(node("span",f.sport==="golf"?"골프장":"야구장","card-label"));
  if(f.pin_order!==null)imageWrap.append(node("span","상단 고정","facility-pin-label"));
  const content=node("div",undefined,"card-content");
  content.append(node("h3",f.name),node("p",f.region,"muted"),node("p",f.address,"facility-address"));
  if(f.description){
   const detail=node("details");detail.append(node("summary","시설 소개"),node("p",f.description,"facility-description"));content.append(detail);
  }
  article.append(imageWrap,content);return article;
 }
 async function refresh(){
  const request=++serial;root.replaceChildren();status.textContent="공개 시설을 불러오고 있습니다.";
  const params=new URLSearchParams();
  const sport=document.querySelector("[data-sport].active")?.dataset.sport;
  if(sport&&sport!=="all")params.set("sport",sport);
  const region=document.querySelector("#region-filter")?.value;if(region&&region!=="all")params.set("region",region);
  try{
   const response=await fetch("/api/facilities?"+params,{cache:"no-store",signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error();
   const body=await response.json();if(request!==serial)return;
   root.replaceChildren(...body.data.map(card));
   status.textContent=body.data.length?body.data.length+"개 공개 시설 · 고정 시설 우선"+(body.data.length===body.limit?" (최대 "+body.limit+"개 표시)":""):"현재 조건에 공개된 시설이 없습니다.";
  }catch{if(request===serial)status.textContent="시설 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";}
 }
 document.querySelector("#facility-refresh").addEventListener("click",refresh);
 document.addEventListener("click",e=>{if(e.target.closest("[data-sport]"))refresh();});
 document.querySelector("#search-form").addEventListener("submit",refresh);
 refresh();
})();
