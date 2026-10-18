const $=id=>document.getElementById(id);
const state={user:null,bookings:[],catalog:null,page:1,total:0,register:false,cancelId:null};
const money=value=>new Intl.NumberFormat('en-EG',{maximumFractionDigits:0}).format(value);
const initials=name=>name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(path,options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok){if(response.status===401&&state.user){state.user=null;$('workspace').hidden=true;$('auth').hidden=false;}throw new Error(data.error?.message||'Something went wrong. Please retry.');}return data;
}
async function login(email,password,name){const data=await api(`/api/auth/${state.register?'register':'login'}`,{method:'POST',body:JSON.stringify({email,password,name})});state.user=data.user;await enter();}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-error').textContent='';$('auth-submit').disabled=true;try{await login($('email').value,$('password').value,$('name').value);$('password').value='';}catch(e){$('auth-error').textContent=e.message;}finally{$('auth-submit').disabled=false;}});
$('toggle-register').onclick=()=>{state.register=!state.register;$('name-label').hidden=!state.register;$('name').required=state.register;$('auth-submit').textContent=state.register?'Create account →':'Sign in →';$('toggle-register').textContent=state.register?'Already registered? Sign in':'New here? Create an account';$('password').autocomplete=state.register?'new-password':'current-password';$('auth-error').textContent='';};
for(const [id,email] of [['demo-admin','admin@example.test'],['demo-member','nour@example.test']])$(id).onclick=async()=>{state.register=false;try{await login(email,'DemoOnly!2026');}catch(e){$('auth-error').textContent=e.message;}};
async function enter(){
  state.catalog=await api('/api/catalog');$('auth').hidden=true;$('workspace').hidden=false;
  $('profile-name').textContent=state.user.name;$('profile-role').textContent=state.user.role;$('avatar').textContent=initials(state.user.name);
  $('greeting').textContent=`A little clarity, ${state.user.name.split(' ')[0]}.`;
  $('today').textContent=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const tomorrow=new Date(Date.now()+86400000);$('calendar-day').textContent=tomorrow.getDate();$('calendar-month').textContent=tomorrow.toLocaleDateString('en',{month:'long'}).toUpperCase();
  $('branch-filter').innerHTML='<option value="">All branches</option>'+state.catalog.branches.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('branch').innerHTML=state.catalog.branches.map(b=>`<option value="${b.id}">${esc(b.name)} · ${esc(b.city)}</option>`).join('');
  $('service').innerHTML=state.catalog.services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('location-list').innerHTML=state.catalog.branches.map(b=>`<div class="location"><span class="location-icon">⌂</span><div><strong>${esc(b.name)}</strong><small>${esc(b.city)}</small></div><span>Open</span></div>`).join('');
  state.page=1;await load();
}
async function load(){
  const params=new URLSearchParams({page:state.page});if($('branch-filter').value)params.set('branch',$('branch-filter').value);if($('status-filter').value)params.set('status',$('status-filter').value);
  const response=await api('/api/bookings?'+params);state.bookings=response.data;state.total=response.pagination.total;render();
  const s=await api('/api/stats');
  if(state.user.role==='admin'){showStats(s.total,s.confirmed,s.cancelled,money(s.bookedValue));$('value-label').textContent='Booked value';$('value-note').textContent='EGP · confirmed appointments';}
  else{showStats(s.total,s.confirmed,s.cancelled,s.branches);$('value-label').textContent='Spaces explored';$('value-note').textContent='Branches you have booked';}
}
function showStats(total,confirmed,cancelled,value){$('stat-total').textContent=total;$('stat-confirmed').textContent=confirmed;$('stat-cancelled').textContent=cancelled;$('stat-value').textContent=value;$('nav-count').textContent=total;}
function render(){
  const query=$('search').value.toLowerCase();const rows=state.bookings.filter(b=>[b.customer,b.service,b.city,b.branch].some(s=>s.toLowerCase().includes(query)));
  $('result-count').textContent=state.total;
  $('booking-rows').innerHTML=rows.length?rows.map(b=>{const date=new Date(b.starts_at);return `<tr><td><div class="customer-cell"><span class="avatar">${esc(initials(b.customer))}</span><div><strong>${esc(b.customer)}</strong><small>${esc(b.email)}</small></div></div></td><td><strong>${esc(b.service)}</strong><small>${esc(b.branch)} · ${esc(b.city)}</small></td><td><strong>${date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</strong><small>${date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} — ${new Date(b.ends_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</small></td><td><span class="badge ${b.status}">● ${b.status==='confirmed'?'Confirmed':'Cancelled'}</span></td><td>${b.status==='confirmed'?`<button class="row-cancel" data-cancel="${b.id}">Cancel</button>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="5" class="empty">A little room in your calendar.<br><br>No appointments match these filters.</td></tr>';
  $('table-info').textContent=`${rows.length} shown · ${state.total} matching appointments · page ${state.page}${query?' · search applies to this page':''}`;
  $('previous').disabled=state.page===1;$('next').disabled=state.page*50>=state.total;
}
for(const id of ['branch-filter','status-filter'])$(id).onchange=()=>{state.page=1;load().catch(e=>toast(e.message));};$('search').oninput=render;
$('refresh').onclick=()=>load().then(()=>toast('Your calendar is up to date.')).catch(e=>toast(e.message));
for(const [id,delta]of [['previous',-1],['next',1]])$(id).onclick=()=>{state.page+=delta;load().catch(e=>toast(e.message));};
function summary(){const s=state.catalog.services.find(s=>s.id===Number($('service').value));$('booking-summary').textContent=`${s.duration} minutes · ${s.price?'EGP '+money(s.price):'Complimentary'} · Reserved just for you`;}
function openBooking(){const d=new Date(Date.now()+86400000);$('booking-date').value=localDate(d);$('booking-date').min=localDate(new Date());$('booking-date').max=localDate(new Date(Date.now()+179*86400000));$('booking-error').textContent='';summary();$('booking-dialog').showModal();}
for(const id of ['new-booking','hero-book','sidebar-book'])$(id).onclick=openBooking;$('service').onchange=summary;$('close-dialog').onclick=()=>$('booking-dialog').close();
$('booking-form').onsubmit=async e=>{e.preventDefault();$('book-submit').disabled=true;$('booking-error').textContent='';try{const date=new Date(`${$('booking-date').value}T${$('booking-time').value}`);await api('/api/bookings',{method:'POST',body:JSON.stringify({branch_id:Number($('branch').value),service_id:Number($('service').value),starts_at:date.toISOString()})});$('booking-dialog').close();toast('A moment, booked. Your appointment is confirmed.');await load();}catch(e){$('booking-error').textContent=e.message;}finally{$('book-submit').disabled=false;}};
$('booking-rows').onclick=e=>{const button=e.target.closest('[data-cancel]');if(button){state.cancelId=Number(button.dataset.cancel);$('cancel-dialog').showModal();}};
$('keep-booking').onclick=()=>$('cancel-dialog').close();$('confirm-cancel').onclick=async()=>{$('confirm-cancel').disabled=true;try{await api(`/api/bookings/${state.cancelId}/cancel`,{method:'POST',body:'{}'});$('cancel-dialog').close();toast('Appointment cancelled. The time is yours again.');await load();}catch(e){toast(e.message);}finally{$('confirm-cancel').disabled=false;}};
$('logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});state.user=null;$('workspace').hidden=true;$('auth').hidden=false;}catch(e){toast(e.message);}};
for(const [id,overview]of [['nav-overview',true],['nav-bookings',false]])$(id).onclick=()=>{$('nav-overview').classList.toggle('active',overview);$('nav-bookings').classList.toggle('active',!overview);$('feature-row').hidden=!overview;$('view-title').textContent=overview?'Overview':'Appointments';};
async function init(){try{const h=await api('/api/health');$('demo-accounts').hidden=!h.demo;try{const data=await api('/api/auth/me');state.user=data.user;await enter();}catch{/* An unauthenticated visitor starts at the sign-in screen. */}}catch(e){$('auth-error').textContent='Unable to reach the server. Please refresh and try again.';}}
init();
