import http from 'node:http';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { openDatabase, hashPassword, verifyPassword } from './database.js';

class ApiError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const sha=t=>createHash('sha256').update(t).digest('hex');
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const bookingSelect=`SELECT b.id,b.user_id,b.branch_id,b.service_id,b.starts_at,b.ends_at,b.status,
  u.name AS customer,u.email,br.name AS branch,br.city,s.name AS service,s.price,s.color
  FROM bookings b JOIN users u ON u.id=b.user_id JOIN branches br ON br.id=b.branch_id JOIN services s ON s.id=b.service_id`;

export function createApp({databasePath=':memory:',demo=false,secure=false}={}) {
  const db=openDatabase(databasePath,demo);
  const attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const requestId=randomUUID();
    res.setHeader('X-Request-Id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost'); const path=url.pathname; const method=req.method;
      if(!path.startsWith('/api/')) {
        if(method!=='GET') fail(405,'METHOD_NOT_ALLOWED','Use GET for static files.');
        const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(!assets[path]) fail(404,'NOT_FOUND','Page not found.');
        const data=await readFile(resolve(publicDir,assets[path]));
        res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(assets[path])]}); return res.end(data);
      }
      if(!['GET','HEAD'].includes(method)) {
        // Browser requests must be same-origin; non-browser API clients can omit Origin.
        if(req.headers.origin) {
          let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'ORIGIN_REJECTED','Invalid origin.');}
          if(origin.host!==req.headers.host) fail(403,'ORIGIN_REJECTED','Cross-origin writes are not allowed.');
        }
        if(req.headers['content-type']?.split(';')[0]!=='application/json') fail(415,'JSON_REQUIRED','Use application/json.');
      }
      let body={};
      if(['POST','PATCH','DELETE'].includes(method)) {
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384) fail(413,'BODY_TOO_LARGE','Maximum request size is 16 KB.');}
        try{body=JSON.parse(raw||'{}');}catch{fail(400,'INVALID_JSON','Request body must be valid JSON.');}
        if(!body || Array.isArray(body)||typeof body!=='object') fail(400,'INVALID_BODY','Expected a JSON object.');
      }
      if(path==='/api/health'&&method==='GET') return json(200,{status:'ok',app:'SlotWise',demo});
      if(['/api/auth/login','/api/auth/register'].includes(path)&&method==='POST') {
        const ip=req.socket.remoteAddress;const now=Date.now();let entry=attempts.get(ip);
        if(!entry||entry.until<now){entry={count:0,until:now+60000};attempts.set(ip,entry);}
        // Prune expired IPs so the in-process limiter stays bounded over time.
        if(attempts.size>1000) for(const [key,value]of attempts) if(value.until<now) attempts.delete(key);
        if(++entry.count>15) {res.setHeader('Retry-After','60');fail(429,'RATE_LIMITED','Too many attempts. Try again in one minute.');}
        const email=String(body.email||'').trim().toLowerCase();const password=body.password;
        if(!emailPattern.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>128) fail(422,'VALIDATION_ERROR','Use a valid email and a password of 10–128 characters.');
        if(path.endsWith('register')) {
          const name=String(body.name||'').trim();if(name.length<2||name.length>80) fail(422,'VALIDATION_ERROR','Name must contain 2–80 characters.');
          try{db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,hashPassword(password));}catch(e){if(e.code?.includes('SQLITE'))fail(409,'EMAIL_EXISTS','An account already exists for this email.');throw e;}
        }
        const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        // Always perform scrypt to reduce account-enumeration timing differences.
        const valid=verifyPassword(password,user?.password||hashPassword('invalid-placeholder'));
        if(!user||!valid)fail(401,'INVALID_CREDENTIALS','Email or password is incorrect.');
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
        const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(token),user.id,Date.now()+86400000);
        res.setHeader('Set-Cookie',`slotwise_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure?'; Secure':''}`);
        return json(path.endsWith('register')?201:200,{user:{id:user.id,name:user.name,email:user.email,role:user.role}});
      }
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('slotwise_session='))?.slice(17);
      const user=token?db.prepare('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?').get(sha(token),Date.now()):null;
      if(!user)fail(401,'UNAUTHENTICATED','Please sign in first.');
      if(path==='/api/auth/me'&&method==='GET')return json(200,{user});
      if(path==='/api/auth/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));res.setHeader('Set-Cookie','slotwise_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{message:'Signed out.'});}
      if(path==='/api/catalog'&&method==='GET')return json(200,{branches:db.prepare('SELECT * FROM branches').all(),services:db.prepare('SELECT * FROM services').all()});
      if(path==='/api/stats'&&method==='GET') {
        const where=user.role==='admin'?'':' WHERE b.user_id=?';
        const params=user.role==='admin'?[]:[user.id];
        return json(200,db.prepare(`SELECT count(*) AS total,coalesce(sum(status='confirmed'),0) AS confirmed,coalesce(sum(status='cancelled'),0) AS cancelled,count(DISTINCT branch_id) AS branches,coalesce(sum(CASE WHEN status='confirmed' THEN s.price ELSE 0 END),0) AS bookedValue FROM bookings b JOIN services s ON s.id=b.service_id`+where).get(...params));
      }
      if(path==='/api/bookings'&&method==='GET') {
        const clauses=[],params=[];
        if(user.role!=='admin'){clauses.push('b.user_id=?');params.push(user.id);}
        if(url.searchParams.has('branch')){const id=Number(url.searchParams.get('branch'));if(!Number.isInteger(id)||id<1)fail(422,'VALIDATION_ERROR','Invalid branch.');clauses.push('b.branch_id=?');params.push(id);}
        const status=url.searchParams.get('status');if(status){if(!['confirmed','cancelled'].includes(status))fail(422,'VALIDATION_ERROR','Invalid status.');clauses.push('b.status=?');params.push(status);}
        const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)fail(422,'VALIDATION_ERROR','Invalid page.');
        const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
        const total=db.prepare('SELECT count(*) AS n FROM bookings b'+where).get(...params).n;
        return json(200,{data:db.prepare(bookingSelect+where+' ORDER BY b.starts_at ASC,b.id ASC LIMIT 50 OFFSET ?').all(...params,(page-1)*50),pagination:{page,pageSize:50,total}});
      }
      if(path==='/api/bookings'&&method==='POST') {
        const branch=Number(body.branch_id),serviceId=Number(body.service_id);
        if(!Number.isInteger(branch)||!Number.isInteger(serviceId))fail(422,'VALIDATION_ERROR','Choose a branch and service.');
        if(!db.prepare('SELECT id FROM branches WHERE id=?').get(branch))fail(422,'VALIDATION_ERROR','Unknown branch.');
        const service=db.prepare('SELECT * FROM services WHERE id=?').get(serviceId);if(!service)fail(422,'VALIDATION_ERROR','Unknown service.');
        if(typeof body.starts_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.starts_at))fail(422,'VALIDATION_ERROR','Start time must be ISO 8601 with a timezone.');
        const start=new Date(body.starts_at);
        if(!Number.isFinite(+start)||+start<Date.now()+60000||+start>Date.now()+180*86400000)fail(422,'VALIDATION_ERROR','Book between one minute and 180 days from now.');
        const end=new Date(+start+service.duration*60000);
        let id;try{id=Number(db.prepare('INSERT INTO bookings(user_id,branch_id,service_id,starts_at,ends_at) VALUES(?,?,?,?,?)').run(user.id,branch,serviceId,start.toISOString(),end.toISOString()).lastInsertRowid);}catch(e){if(e.message.includes('SLOT_CONFLICT'))fail(409,'SLOT_CONFLICT','This branch already has a booking during that time. Choose another slot.');throw e;}
        return json(201,{data:db.prepare(bookingSelect+' WHERE b.id=?').get(id)});
      }
      const cancel=path.match(/^\/api\/bookings\/(\d+)\/cancel$/);
      if(cancel&&method==='POST') {
        const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(cancel[1]));
        if(!booking||(user.role!=='admin'&&booking.user_id!==user.id))fail(404,'NOT_FOUND','Booking not found.');
        if(booking.status==='cancelled')fail(409,'ALREADY_CANCELLED','Booking is already cancelled.');
        db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(booking.id);return json(200,{message:'Booking cancelled.'});
      }
      if(path==='/api/admin/stats'&&method==='GET') {
        if(user.role!=='admin')fail(403,'FORBIDDEN','Administrator access is required.');
        return json(200,db.prepare(`SELECT count(*) AS total,coalesce(sum(status='confirmed'),0) AS confirmed,coalesce(sum(status='cancelled'),0) AS cancelled,coalesce(sum(CASE WHEN status='confirmed' THEN s.price ELSE 0 END),0) AS bookedValue FROM bookings b JOIN services s ON s.id=b.service_id`).get());
      }
      fail(404,'NOT_FOUND','Endpoint not found.');
    }catch(e){if(!e.status)console.error(JSON.stringify({requestId,error:e.message}));json(e.status||500,{error:{code:e.code&&e.status?e.code:'INTERNAL_ERROR',message:e.status?e.message:'An unexpected error occurred.',requestId}});}
  });
  server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=process.env.HOST||'127.0.0.1';const demo=process.env.DEMO_MODE==='true';
  if(demo&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Demo credentials are allowed only on loopback.');
  const port=Number(process.env.PORT||3000);
  const server=createApp({databasePath:process.env.DATABASE_PATH||'data/slotwise.sqlite',demo,secure:process.env.COOKIE_SECURE==='true'});
  server.listen(port,host,()=>console.log(`SlotWise is running at http://${host}:${port}${demo?' (synthetic demo mode)':''}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
