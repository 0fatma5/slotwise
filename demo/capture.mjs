// Capture actual HTTP requests against a fresh in-memory application.
// Passwords and session cookies are deliberately omitted from the saved trace.
import { createApp } from '../src/server.js';
import { writeFile } from 'node:fs/promises';
const server=createApp({demo:true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const trace=[];
async function call(title,path,{method='GET',cookie,body,save=true}={}) {
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();
  if(save)trace.push({title,method,path,status:r.status,request:body,response:data});
  return {cookie:r.headers.get('set-cookie')?.split(';')[0],data};
}
try {
  await call('A real Node.js application','/api/health');
  const admin=await call('','/api/auth/login',{method:'POST',body:{email:'admin@example.test',password:'DemoOnly!2026'},save:false});
  const member=await call('','/api/auth/login',{method:'POST',body:{email:'nour@example.test',password:'DemoOnly!2026'},save:false});
  await call('Signed in as a member','/api/auth/me',{cookie:member.cookie});
  await call('Explore branches and services','/api/catalog',{cookie:member.cookie});
  const date=new Date(Date.now()+10*86400000);date.setUTCHours(12,0,0,0);
  const body={branch_id:1,service_id:1,starts_at:date.toISOString()};
  const created=await call('Book a strategy session','/api/bookings',{method:'POST',cookie:member.cookie,body});
  await call('Conflicting slots are rejected','/api/bookings',{method:'POST',cookie:member.cookie,body});
  await call('Permissions stay on the server','/api/admin/stats',{cookie:member.cookie});
  await call('The admin sees the bigger picture','/api/admin/stats',{cookie:admin.cookie});
  await call('Cancel and free the slot',`/api/bookings/${created.data.data.id}/cancel`,{method:'POST',cookie:member.cookie,body:{}});
  await call('The same time can be booked again','/api/bookings',{method:'POST',cookie:member.cookie,body});
  await writeFile(new URL('./trace.json',import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),note:'Actual responses from a fresh synthetic demo database. No secrets or session tokens.',steps:trace},null,2));
  console.log(`Captured ${trace.length} real HTTP interactions.`);
} finally {await new Promise(r=>server.close(r));}
