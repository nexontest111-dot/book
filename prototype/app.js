'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const TYPES = {'golf-team':'골프 팀 예약','golf-join':'골프 개인 조인','baseball-rental':'야구장 대관','baseball-match':'야구 경기 매칭'};
const STATUSES = {negotiating:'협의 중',awaiting:'결제 대기',confirmed:'예약 확정',expired:'기한 만료',cancelled:'취소 완료'};
const STORAGE_KEY = 'play-promise-prototype-v1';
const DEMO_FEE = 3000;
const HOLD_DURATION = 30 * 60 * 1000;
const money = (value) => Number(value).toLocaleString('ko-KR') + '원';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dayAfter(days) { const date = new Date(); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function dateLabel(value) { const date = new Date(value + 'T12:00:00'); return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(date); }
function freshData() { return {slots:[
  {id:'s1',facility:'그린밸리 컨트리클럽',region:'경기',type:'golf-team',date:dayAfter(2),start:'07:20',end:'12:00',price:180000,notes:'18홀 · 4인 팀 · 카트·캐디 별도',published:true},
  {id:'s2',facility:'리버사이드 야구장',region:'경기',type:'baseball-match',date:dayAfter(2),start:'09:00',end:'12:00',price:240000,notes:'팀 대 팀 · 3시간 · 경기 조건 협의',published:true},
  {id:'s3',facility:'오션힐 골프클럽',region:'인천',type:'golf-join',date:dayAfter(3),start:'13:10',end:'17:30',price:160000,notes:'개인 조인 · 모집자와 조건 협의',published:true},
  {id:'s4',facility:'포레스트 베이스볼파크',region:'경기',type:'baseball-rental',date:dayAfter(3),start:'18:00',end:'21:00',price:300000,notes:'야간 조명 포함 · 3시간 대관',published:true},
  {id:'s5',facility:'레이크우드 컨트리클럽',region:'경기',type:'golf-join',date:dayAfter(4),start:'08:40',end:'13:00',price:150000,notes:'개인 조인 · 18홀 · 인원 협의',published:true},
  {id:'s6',facility:'한강 시민 야구장',region:'서울',type:'baseball-match',date:dayAfter(4),start:'14:00',end:'17:00',price:200000,notes:'주말 친선 경기 · 양 팀 대표 협의',published:true}
], bookings:[]}; }
let storageAvailable = true;
function readState() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved && Array.isArray(saved.slots) && Array.isArray(saved.bookings)) return saved; } catch { storageAvailable = false; } return freshData(); }
let state = readState();
let sport = 'all'; let currentBookingId = null; let toastTimeout;
function save() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); } catch { if(storageAvailable) toast('브라우저 저장을 사용할 수 없어 현재 화면에서만 유지됩니다.'); storageAvailable = false; } }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; },4500); }
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function slotById(id) { return state.slots.find(slot => slot.id === id); }
function bookingById(id) { return state.bookings.find(booking => booking.id === id); }
function overlaps(a,b) { return a.facility === b.facility && a.date === b.date && a.start < b.end && b.start < a.end; }
function occupied(slot,exceptId) { return state.bookings.some(b => b.id !== exceptId && ['awaiting','confirmed'].includes(b.status) && overlaps(slot,slotById(b.slotId) || {})); }
function addMessage(booking,author,text) { booking.messages.push({author,text}); }
function endBooking(booking,status,reason) { booking.status = status; booking.reason = reason; booking.refunds = booking.paid.map(paid => paid ? 'refunded' : 'none'); addMessage(booking,'시스템',reason + (booking.paid.some(Boolean) ? ' 납부자의 모의 수수료가 전액 환불 처리되었습니다.' : '')); }
function processExpiry() { let changed = false; for(const b of state.bookings) { if(b.status === 'awaiting' && Date.now() >= b.deadline) { endBooking(b,'expired','양측 결제 기한이 종료되어 슬롯을 해제했습니다.'); changed = true; } } if(changed) save(); return changed; }
function showView(view) { processExpiry(); $$('.view').forEach(el => {el.hidden = el.id !== `${view}-view`;}); $$('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view === view)); renderAll(); }
function renderSlots() {
  const region = $('#region-filter').value, date = $('#date-filter').value, type = $('#type-filter').value;
  const slots = state.slots.filter(s => s.published && (sport === 'all' || s.type.startsWith(sport)) && (region === 'all' || s.region === region) && (!date || s.date === date) && (type === 'all' || s.type === type));
  $('#result-count').textContent = `${slots.length}개 슬롯`;
  $('#slot-grid').innerHTML = slots.length ? slots.map((s,i) => { const busy = occupied(s); return `<article class="slot-card"><div class="card-landscape ${s.type.startsWith('golf')?'golf':'baseball'} variant-${i%3}" aria-hidden="true"><span class="card-label">${TYPES[s.type]}</span><span class="card-region">${escapeHTML(s.region)}</span></div><div class="card-content"><span class="availability ${busy?'busy':''}">${busy?'확보 중 또는 예약됨':'협의 가능한 공개 슬롯'}</span><h3>${escapeHTML(s.facility)}</h3><p class="slot-time">${dateLabel(s.date)} · ${s.start}–${s.end}</p><p class="notes">${escapeHTML(s.notes)}</p><div class="card-bottom"><div><span class="price-label">시설 이용료 예시${s.type.startsWith('golf')?' · 1인 기준':''}</span><span class="price">${money(s.price)}</span></div><button class="button" data-open-slot="${s.id}">상세 보기 ↗</button></div></div></article>`; }).join('') : '<div class="empty"><h3>조건에 맞는 슬롯이 없습니다.</h3><p>지역이나 날짜, 예약 형태를 변경해보세요.</p></div>';
}
function statusBadge(b) { return `<span class="badge ${b.status === 'awaiting'?'awaiting':b.status === 'confirmed'?'confirmed':['expired','cancelled'].includes(b.status)?'ended':''}">${STATUSES[b.status]}</span>`; }
function renderBookings() {
  $('#booking-count').textContent = state.bookings.filter(b=>!['expired','cancelled'].includes(b.status)).length;
  $('#booking-list').innerHTML = state.bookings.length ? [...state.bookings].reverse().map(b => {const s = slotById(b.slotId);return `<article class="booking-row"><div class="row-content">${statusBadge(b)}<h3>${escapeHTML(s.facility)}</h3><p>${TYPES[s.type]} · ${dateLabel(s.date)} ${s.start}–${s.end} · ${escapeHTML(b.parties[1])}</p></div><button class="button" data-open-booking="${b.id}">약속 확인 ↗</button></article>`;}).join('') : '<div class="empty"><h3>아직 잡힌 약속이 없어요.</h3><p>공개 슬롯에서 함께할 시간을 선택해보세요.</p><button class="button primary" data-view="explore">슬롯 찾기</button></div>';
}
function renderOperator() {
  $('#operator-count').textContent = `${state.slots.length}개`;
  $('#operator-slots').innerHTML = state.slots.map(s=>`<div class="operator-row"><div><strong>${escapeHTML(s.facility)}</strong><p>${TYPES[s.type]} · ${dateLabel(s.date)} ${s.start}–${s.end}</p><span class="badge">${occupied(s)?'점유·확정 있음':s.published?'공개 중':'공개 중지'}</span></div><button class="button" data-toggle-slot="${s.id}" ${occupied(s)?'disabled':''}>${s.published?'공개 중지':'공개하기'}</button></div>`).join('');
}
function renderAll() { renderSlots(); renderBookings(); renderOperator(); }
function openDialog(dialog) { if(!dialog.open) dialog.showModal(); }
function summary(s) { return `<div class="summary"><div class="summary-row"><span>예약 형태</span><strong>${TYPES[s.type]}</strong></div><div class="summary-row"><span>장소</span><strong>${escapeHTML(s.facility)} · ${escapeHTML(s.region)}</strong></div><div class="summary-row"><span>시간</span><strong>${dateLabel(s.date)} ${s.start}–${s.end}</strong></div><div class="summary-row"><span>시설 이용료 예시</span><strong>${money(s.price)}${s.type.startsWith('golf')?' / 1인':''}</strong></div><div class="summary-row"><span>기본 조건</span><strong>${escapeHTML(s.notes)}</strong></div></div>`; }
function openSlot(id) {
  processExpiry(); const s = slotById(id); if(!s) return;
  const bilateral = ['golf-join','baseball-match'].includes(s.type), busy = occupied(s);
  $('#slot-detail').innerHTML = `<div class="dialog-body"><div class="dialog-heading"><div><span class="eyebrow">OPEN SLOT</span><h2>${escapeHTML(s.facility)}</h2></div><button class="close-button" data-close="slot-dialog" aria-label="닫기">×</button></div>${summary(s)}<div class="notice">${bilateral?'참가자 양측이 조건에 동의한 뒤 각각 수수료를 납부하면 최종 예약을 확정합니다.':'단독 예약·대관은 수수료 적용 정책이 미정입니다. 이 시안에서는 시설에 문의하는 단계까지 제공합니다.'}<br>시설 이용료는 예시이며 이 데모에서 결제하지 않습니다.</div>${busy?'<p class="notice">이 시간은 다른 약속이 확보 중이거나 확정했습니다. 다른 슬롯을 선택해주세요.</p>':`<form id="request-form" data-slot="${s.id}"><label>${bilateral?'상대 참가자 / 팀 이름':'예약자 / 팀 이름'}<input name="opponent" required maxlength="40" placeholder="${s.type==='baseball-match'?'예: 블루삭스 팀 대표':'예: 함께할 참가자'}"></label><label>희망 조건<textarea name="terms" maxlength="300" required placeholder="인원, 실력, 비용 분담 등 협의할 조건을 적어주세요."></textarea></label><button class="button primary" type="submit">${bilateral?'약속 요청하기':'시설 문의하기'}</button></form>`}</div>`;
  openDialog($('#slot-dialog'));
}
function openBooking(id) { processExpiry(); currentBookingId = id; renderBookingDetail(); openDialog($('#booking-dialog')); }
function renderBookingDetail() {
  const b = bookingById(currentBookingId); if(!b) return; const s = slotById(b.slotId);
  const ended = ['expired','cancelled'].includes(b.status), bilateral = ['golf-join','baseball-match'].includes(s.type);
  const stage = b.status === 'confirmed'?2:b.status === 'awaiting'?1:0;
  const available = state.slots.filter(x => x.published && x.type === s.type && !occupied(x,b.id));
  let content = '';
  if(b.status === 'negotiating') content = `<div class="summary"><div class="summary-row"><span>최신 제안</span><strong>버전 ${b.version}</strong></div><div class="small">${escapeHTML(b.terms)}</div></div>${bilateral?`<div class="party-grid">${b.parties.map((name,i)=>`<div class="party-card"><h3>${escapeHTML(name)}</h3><p>${b.consents[i]?'현재 조건에 동의했어요.':'조건을 확인하고 동의해주세요.'}</p><button class="button ${b.consents[i]?'secondary':'primary'}" data-consent="${i}" ${b.consents[i]?'disabled':''}>${i===0?'내 조건 동의':'상대방 동의 시뮬레이션'}</button></div>`).join('')}</div>`:'<div class="notice">시설 문의가 접수되었습니다. 단독 예약 과금 정책 결정 전에는 결제·최종 확정을 진행하지 않습니다.</div>'}<details style="margin-top:20px"><summary class="small">시간·조건 다시 제안하기</summary><form id="proposal-form" style="margin-top:15px"><label>대체 공개 슬롯<select name="slot">${available.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${escapeHTML(x.facility)} · ${dateLabel(x.date)} ${x.start}</option>`).join('')}</select></label><label>새 조건<textarea name="terms" required maxlength="300">${escapeHTML(b.terms)}</textarea></label><button class="button" type="submit">새 제안 보내기 · 동의 초기화</button></form></details>`;
  if(b.status === 'awaiting') content = `<div class="timer"><span>양측 공통 결제 마감까지</span><strong id="payment-timer">${timeRemaining(b)}</strong></div><div class="party-grid">${b.parties.map((name,i)=>`<div class="party-card"><h3>${escapeHTML(name)}</h3><span class="price-label">부킹 수수료 예시</span><strong>${money(DEMO_FEE)}</strong><p>${b.paid[i]?'모의 결제 완료':'결제 대기'}</p><button class="button ${b.paid[i]?'secondary':'primary'}" data-pay="${i}" ${b.paid[i]?'disabled':''}>${b.paid[i]?'납부 완료':i===0?'내 모의 결제':'상대방 모의 결제'}</button></div>`).join('')}</div><div class="notice">각 ${money(DEMO_FEE)}은 화면 확인용 예시 금액입니다. 양측 납부 전에는 최종 예약이 아닙니다. 기한 내 미납 시 납부한 쪽의 모의 결제도 전액 환불합니다.</div><button class="text-button" data-expire="true">데모: 기한 만료시키기</button>`;
  if(b.status === 'confirmed') content = `<div class="summary"><div class="summary-row"><span>예약번호</span><strong>PA-${b.id.replace(/-/g,'').slice(0,8).toUpperCase()}</strong></div><div class="summary-row"><span>약속·시설 예약</span><strong>모의 확정 완료</strong></div><div class="small">${escapeHTML(b.terms)}</div></div><div class="party-grid">${b.parties.map(name=>`<div class="party-card"><h3>${escapeHTML(name)}</h3><p>모의 수수료 ${money(DEMO_FEE)} 납부 완료</p></div>`).join('')}</div><div class="notice">실제 시설에 예약되지 않았습니다. 확정 이후 취소·우천·환불 정책은 추가 결정이 필요합니다.</div>`;
  if(ended) content = `<div class="notice">${escapeHTML(b.reason)}</div><div class="party-grid">${b.parties.map((name,i)=>`<div class="party-card"><h3>${escapeHTML(name)}</h3><p>${b.refunds[i]==='refunded'?'모의 결제 전액 환불 완료':'납부 내역 없음'}</p></div>`).join('')}</div><div class="dialog-actions"><button class="button" data-retry-slot="${s.id}">새 요청 만들기</button></div>`;
  $('#booking-detail').innerHTML = `<div class="dialog-body"><div class="dialog-heading"><div>${statusBadge(b)}<h2>${escapeHTML(s.facility)}</h2><span class="muted">${TYPES[s.type]} · 양측 약속과 시설 예약</span></div><button class="close-button" data-close="booking-dialog" aria-label="닫기">×</button></div><div class="stepper"><span class="${stage>=0&&!ended?'active':''}">01 조건 협의</span><span class="${stage>=1&&!ended?'active':''}">02 양측 결제</span><span class="${stage>=2&&!ended?'active':''}">03 예약 확정</span></div>${summary(s)}${content}<div class="messages" aria-label="협의 메시지">${b.messages.map(m=>`<p class="message"><span>${escapeHTML(m.author)}</span>${escapeHTML(m.text)}</p>`).join('')}</div>${!ended&&b.status!=='confirmed'?'<form id="chat-form" class="chat-form"><input name="message" required maxlength="300" aria-label="협의 메시지" placeholder="협의 메시지를 남겨보세요"><button class="button" type="submit">보내기</button></form>':''}${['negotiating','awaiting'].includes(b.status)?'<div class="dialog-actions"><button class="button danger" data-withdraw="true">확정 전 요청 철회</button></div>':''}</div>`;
}
function timeRemaining(b) { const seconds = Math.max(0,Math.ceil((b.deadline-Date.now())/1000)); return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
document.addEventListener('click',event=>{
  const button = event.target.closest('button'); if(!button || button.disabled) return;
  if(button.dataset.view) showView(button.dataset.view);
  if(button.dataset.sport) {sport = button.dataset.sport; $$('[data-sport]').forEach(el=>el.classList.toggle('active',el===button)); renderSlots();}
  if(button.dataset.openSlot) openSlot(button.dataset.openSlot);
  if(button.dataset.openBooking) openBooking(button.dataset.openBooking);
  if(button.dataset.close) document.getElementById(button.dataset.close).close();
  if(button.dataset.retrySlot) {$('#booking-dialog').close();openSlot(button.dataset.retrySlot);}
  if(button.dataset.toggleSlot) { const slot=slotById(button.dataset.toggleSlot);processExpiry();if(occupied(slot)) return toast('점유 또는 확정된 슬롯은 변경할 수 없습니다.');slot.published=!slot.published;save();renderAll();toast(slot.published?'슬롯을 공개했습니다.':'슬롯 공개를 중지했습니다.'); }
  const b = bookingById(currentBookingId);
  if(button.dataset.consent !== undefined && b?.status === 'negotiating') {
    processExpiry(); b.consents[Number(button.dataset.consent)] = true;
    if(b.consents.every(Boolean)) { const slot=slotById(b.slotId); if(!slot.published || occupied(slot,b.id)) {b.consents=[false,false];toast('다른 예약이 슬롯을 확보했습니다. 대체 슬롯을 제안해주세요.');} else {b.status='awaiting';b.deadline=Date.now()+HOLD_DURATION;addMessage(b,'시스템','양측이 최신 조건에 동의했습니다. 슬롯을 30분간 확보하고 양측 수수료 결제를 기다립니다.');toast('양측 합의 완료 · 결제 대기를 시작합니다.');} }
    save();renderAll();renderBookingDetail();
  }
  if(button.dataset.pay !== undefined && b) {
    if(processExpiry() || b.status!=='awaiting') {renderAll();renderBookingDetail();return toast('결제 기한이 지났거나 결제할 수 없는 상태입니다.');}
    b.paid[Number(button.dataset.pay)]=true;
    if(b.paid.every(Boolean)) { if(occupied(slotById(b.slotId),b.id)) {endBooking(b,'cancelled','시설 확보에 실패해 예약을 취소했습니다.');} else {b.status='confirmed';addMessage(b,'시스템','양측 모의 결제가 완료되어 약속과 시설 예약을 모의 확정했습니다.');} }
    save();renderAll();renderBookingDetail();toast(b.status==='confirmed'?'양측 납부 완료 · 예약을 모의 확정했습니다.':'내역에 모의 결제를 반영했습니다.');
  }
  if(button.dataset.expire && b?.status==='awaiting') {b.deadline=Date.now()-1;processExpiry();renderAll();renderBookingDetail();toast('기한 만료 · 슬롯을 해제하고 납부금을 모의 환불했습니다.');}
  if(button.dataset.withdraw && b && ['negotiating','awaiting'].includes(b.status)) {if(!confirm('요청을 철회할까요? 납부한 모의 수수료는 전액 환불됩니다.'))return;endBooking(b,'cancelled','확정 전 요청을 철회했습니다.');save();renderAll();renderBookingDetail();}
});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(form.id==='search-form') {event.preventDefault();renderSlots();return;}
  if(form.id==='request-form') {event.preventDefault();processExpiry();const s=slotById(form.dataset.slot),data=new FormData(form),name=String(data.get('opponent')).trim(),terms=String(data.get('terms')).trim();if(!name||!terms)return toast('이름과 희망 조건을 입력해주세요.');if(!s.published||occupied(s))return toast('선택한 슬롯을 이용할 수 없습니다.');const b={id:uid(),slotId:s.id,status:'negotiating',parties:['나 · 데모 예약자',name],terms,version:1,consents:[false,false],paid:[false,false],refunds:['none','none'],messages:[{author:'나 · 데모 예약자',text:terms}],createdAt:Date.now()};state.bookings.push(b);save();$('#slot-dialog').close();showView('bookings');openBooking(b.id);return;}
  if(form.id==='proposal-form') {event.preventDefault();processExpiry();const b=bookingById(currentBookingId);if(b.status!=='negotiating')return;const data=new FormData(form),s=slotById(data.get('slot')),terms=String(data.get('terms')).trim();if(!s||!s.published||occupied(s,b.id))return toast('다른 공개 슬롯을 선택해주세요.');if(!terms)return toast('새 조건을 입력해주세요.');b.slotId=s.id;b.terms=terms;b.version++;b.consents=[false,false];addMessage(b,'나 · 새 조건 제안',`제안 버전 ${b.version}: ${terms}`);save();renderAll();renderBookingDetail();toast('새 제안을 보냈습니다. 양측 동의가 초기화되었습니다.');return;}
  if(form.id==='chat-form') {event.preventDefault();const b=bookingById(currentBookingId);processExpiry();if(!['negotiating','awaiting'].includes(b.status)){renderBookingDetail();return;}const text=String(new FormData(form).get('message')).trim();if(!text)return;addMessage(b,'나 · 데모 예약자',text);save();renderBookingDetail();return;}
  if(form.id==='slot-form') {event.preventDefault();processExpiry();const data=new FormData(form),s={id:uid(),facility:String(data.get('facility')).trim(),region:data.get('region'),type:data.get('type'),date:data.get('date'),start:data.get('start'),end:data.get('end'),price:Number(data.get('price')),notes:String(data.get('notes')).trim()||'시간·참가 조건 협의 가능',published:true};if(!s.facility)return toast('시설 이름을 입력해주세요.');if(s.date<dayAfter(0))return toast('오늘 이후의 날짜를 선택해주세요.');if(s.start>=s.end)return toast('종료시간은 시작시간보다 늦어야 합니다.');if(!Number.isFinite(s.price)||s.price<0)return toast('올바른 이용료를 입력해주세요.');if(state.slots.some(existing=>overlaps(existing,s)))return toast('같은 시설의 겹치는 시간대가 이미 등록되어 있습니다.');state.slots.push(s);save();form.reset();form.elements.date.value=dayAfter(2);renderAll();toast('새 슬롯을 공개했습니다. 슬롯 찾기에서 확인할 수 있습니다.');}
});
$('#reset-demo').addEventListener('click',()=>{if(!confirm('예약과 추가 슬롯을 모두 지우고 데모를 초기화할까요?'))return;state=freshData();save();$$('dialog').forEach(d=>d.close());currentBookingId=null;sport='all';$('#search-form').reset();$$('[data-sport]').forEach(el=>el.classList.toggle('active',el.dataset.sport==='all'));showView('explore');toast('데모 데이터를 초기화했습니다.');});
$$('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(dialog.id==='booking-dialog')currentBookingId=null;}));
setInterval(()=>{const changed=processExpiry();if(changed){renderAll();if($('#booking-dialog').open)renderBookingDetail();}const b=bookingById(currentBookingId);if(b?.status==='awaiting'&&$('#payment-timer'))$('#payment-timer').textContent=timeRemaining(b);},1000);
$('#slot-form').elements.date.value=dayAfter(2);
$('#slot-form').elements.date.min=dayAfter(0);
processExpiry();renderAll();
