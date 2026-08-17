import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const rate = new Map();

const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', ...headers}});
const html = (body, status=200) => new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sha256(s){ const b=await crypto.subtle.digest('SHA-256',encoder.encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function clientIp(req){ return req.headers.get('CF-Connecting-IP') || 'unknown'; }
function auth(req, env){ const c=req.headers.get('cookie')||''; return c.includes(`admin_session=${env.ADMIN_SESSION}`); }
function validUserName(s){ return typeof s==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(s); }
function uuid(){ return crypto.randomUUID(); }
function daysLeft(created, expiry){ if(!expiry) return null; const ms=expiry*86400000-(Date.now()-new Date(created).getTime()); return Math.max(0,Math.ceil(ms/86400000)); }

async function init(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,uuid TEXT UNIQUE NOT NULL,limit_gb REAL DEFAULT 0,used_gb REAL DEFAULT 0,expiry_days INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,is_active INTEGER DEFAULT 1,limit_req INTEGER DEFAULT 0,used_req INTEGER DEFAULT 0,port INTEGER DEFAULT 443,tls INTEGER DEFAULT 1,ip_limit INTEGER DEFAULT 0,block_porn INTEGER DEFAULT 0,block_ads INTEGER DEFAULT 0,ips TEXT DEFAULT '',fingerprint TEXT DEFAULT 'chrome',remark TEXT DEFAULT '')`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)`)
  ]);
}

async function ensureAdmin(env){
  const row=await env.DB.prepare("SELECT value FROM settings WHERE key='admin_hash'").first();
  if(row) return;
  const hash=await sha256(env.ADMIN_PASSWORD || 'change-me-now');
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('admin_hash',?)").bind(hash).run();
}

function panelPage(){ return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edge Tunnel Panel</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#e8ecf5}*{box-sizing:border-box}.wrap{max-width:1200px;margin:auto;padding:24px}.card{background:#131a2d;border:1px solid #27324d;border-radius:16px;padding:18px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}input,button,select{width:100%;padding:11px;border-radius:10px;border:1px solid #35415f;background:#0e1527;color:#fff}button{cursor:pointer;background:#2563eb;border:0}.danger{background:#b91c1c}.muted{color:#9aa7bf}.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #27324d;text-align:right;font-size:14px}.pill{padding:4px 9px;border-radius:999px;background:#193b2a;color:#72e0a0}.off{background:#40202a;color:#ff9aaa}.mono{font-family:ui-monospace,monospace;word-break:break-all;font-size:12px}#login{max-width:420px;margin:10vh auto}</style></head><body><div class="wrap"><div id="app"></div></div><script>
const $=s=>document.querySelector(s), api=async(u,o={})=>{let r=await fetch(u,{headers:{'content-type':'application/json'},...o});let j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'خطا');return j};
async function boot(){try{let x=await api('/api/users');render(x)}catch(e){$('#app').innerHTML='<div id="login" class="card"><h2>ورود مدیریت</h2><input id="pw" type="password" placeholder="رمز عبور"><br><br><button onclick="login()">ورود</button><p class="muted">'+e.message+'</p></div>'}}
async function login(){try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#pw').value})});location.reload()}catch(e){alert(e.message)}}
function render(x){$('#app').innerHTML='<div class="card"><div class="row"><div><h1>Edge Tunnel Panel</h1><div class="muted">مدیریت کاربران و اشتراک WebSocket/VLESS</div></div><button onclick="logout()">خروج</button></div></div><div class="card"><h3>کاربر جدید</h3><div class="grid"><input id="un" placeholder="username"><input id="gb" type="number" placeholder="حجم GB (0=نامحدود)"><input id="days" type="number" placeholder="روز اعتبار (0=نامحدود)"><input id="req" type="number" placeholder="تعداد درخواست (0=نامحدود)"></div><br><button onclick="createUser()">ساخت کاربر</button></div><div class="card"><div class="row"><h3>کاربران ('+x.users.length+')</h3><button onclick="boot()">بروزرسانی</button></div><table><thead><tr><th>کاربر</th><th>وضعیت</th><th>مصرف</th><th>اعتبار</th><th>عملیات</th></tr></thead><tbody>'+x.users.map(u=>'<tr><td><b>'+u.username+'</b><div class="mono">'+u.uuid+'</div><div class="mono">'+u.subscription+'</div></td><td><span class="pill '+(u.is_active?'':'off')+'">'+(u.is_active?'فعال':'غیرفعال')+'</span></td><td>'+Number(u.used_gb||0).toFixed(3)+' / '+(u.limit_gb||'∞')+' GB</td><td>'+((u.expiry_days&&u.expiry_days>0)?(u.days_left+' روز'):'∞')+'</td><td><div class="row"><button onclick="toggle(\''+u.username+'\')">فعال/غیرفعال</button><button class="danger" onclick="del(\''+u.username+'\')">حذف</button></div></td></tr>').join('')+'</tbody></table></div>'}
async function createUser(){try{await api('/api/users',{method:'POST',body:JSON.stringify({username:$('#un').value,limit_gb:Number($('#gb').value||0),expiry_days:Number($('#days').value||0),limit_req:Number($('#req').value||0)})});boot()}catch(e){alert(e.message)}}
async function toggle(u){await api('/api/users/'+encodeURIComponent(u),{method:'PUT',body:JSON.stringify({toggle:true})});boot()} async function del(u){if(confirm('حذف شود؟')){await api('/api/users/'+encodeURIComponent(u),{method:'DELETE'});boot()}} async function logout(){await api('/api/logout',{method:'POST'});location.reload()} boot();</script></body></html>` }

function loginPage(){return `<!doctype html><meta charset=utf-8><title>Login</title><style>body{font-family:system-ui;background:#0b1020;color:#fff;display:grid;place-items:center;height:100vh}form{background:#131a2d;padding:30px;border-radius:16px}input,button{padding:12px;margin:6px;width:260px;border-radius:9px;border:1px solid #334;background:#0d1425;color:#fff}button{background:#2563eb}</style><form onsubmit="return go(event)"><h2>ورود پنل</h2><input id=p type=password placeholder="رمز"><button>ورود</button></form><script>async function go(e){e.preventDefault();let r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p.value})});if(r.ok)location='/panel';else alert((await r.json()).error||'خطا')}</script>`}

async function login(req,env){ const ip=clientIp(req), now=Date.now(), rec=rate.get(ip)||{n:0,t:0}; if(now-rec.t>900000)rec.n=0;if(rec.n>=10)return json({error:'تلاش زیاد؛ 15 دقیقه بعد دوباره امتحان کنید'},429);const b=await req.json().catch(()=>({}));const stored=await env.DB.prepare("SELECT value FROM settings WHERE key='admin_hash'").first();if(stored && (await sha256(String(b.password||'')))===stored.value){rate.delete(ip);return json({success:true},{headers:{'set-cookie':`admin_session=${env.ADMIN_SESSION}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`}})}rec.n++;rec.t=now;rate.set(ip,rec);return json({error:'رمز عبور اشتباه است'},401); }

function sub(user,host){ const path=`/stream/${user.uuid.split('-')[4]||'edge'}`; const label=encodeURIComponent(user.remark||user.username); return `vless://${user.uuid}@${host}:443?encryption=none&security=tls&type=ws&host=${host}&path=${encodeURIComponent(path)}#${label}`; }

async function api(req,url,env){
 if(url.pathname==='/api/login'&&req.method==='POST')return login(req,env);
 if(url.pathname==='/api/logout')return new Response('',{status:204,headers:{'set-cookie':'admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}});
 if(!auth(req,env))return json({error:'Unauthorized'},401);
 if(url.pathname==='/api/users'&&req.method==='GET'){const r=await env.DB.prepare('SELECT * FROM users ORDER BY id DESC').all();const host=url.hostname;return json({users:(r.results||[]).map(u=>({...u,days_left:daysLeft(u.created_at,u.expiry_days),subscription:sub(u,host)}))})}
 if(url.pathname==='/api/users'&&req.method==='POST'){const b=await req.json().catch(()=>({}));if(!validUserName(b.username))return json({error:'username نامعتبر است'},400);const u={username:b.username,uuid:uuid(),limit_gb:Number(b.limit_gb||0),expiry_days:Number(b.expiry_days||0),limit_req:Number(b.limit_req||0)};try{await env.DB.prepare('INSERT INTO users(username,uuid,limit_gb,expiry_days,limit_req) VALUES(?,?,?,?,?)').bind(u.username,u.uuid,u.limit_gb,u.expiry_days,u.limit_req).run()}catch(e){return json({error:'نام کاربری تکراری است'},400)}return json({success:true,user:u},201)}
 const m=url.pathname.match(/^\/api\/users\/([^/]+)$/);if(m){const name=decodeURIComponent(m[1]);if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM users WHERE username=?').bind(name).run();return json({success:true})}if(req.method==='PUT'){const b=await req.json().catch(()=>({}));if(b.toggle!==undefined)await env.DB.prepare('UPDATE users SET is_active=CASE is_active WHEN 1 THEN 0 ELSE 1 END WHERE username=?').bind(name).run();return json({success:true})}}
 return json({error:'Not found'},404);
}

function parseVless(buf){if(buf.length<24)return null;const u=([...buf.slice(1,17)]).map(x=>x.toString(16).padStart(2,'0')).join('');const id=`${u.slice(0,8)}-${u.slice(8,12)}-${u.slice(12,16)}-${u.slice(16,20)}-${u.slice(20)}`;const optLen=buf[17];let p=18+optLen;if(p+3>buf.length)return null;const cmd=buf[p++];p+=2;if(p>=buf.length)return null;const port=(buf[p]<<8)|buf[p+1];p+=2;const at=buf[p++];let host='';if(at===1){host=[...buf.slice(p,p+4)].join('.');p+=4}else if(at===2){const n=buf[p++];host=decoder.decode(buf.slice(p,p+n));p+=n}else if(at===3){host=[...buf.slice(p,p+16)].map((x,i)=>x.toString(16)+(i%2?'':':')).join('').replace(/:$/,'');p+=16}else return null;return {id,cmd,port,host,data:buf.slice(p)}}

async function tunnel(request,env){
 const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();let first=true,sock=null,user=null;const close=()=>{try{server.close()}catch{}try{sock?.close()}catch{}};
 server.addEventListener('message',async ev=>{try{const data=new Uint8Array(ev.data instanceof ArrayBuffer?ev.data:await ev.data.arrayBuffer());if(!first){if(sock){const w=sock.writable.getWriter();await w.write(data);w.releaseLock()}return}first=false;const v=parseVless(data);if(!v||v.cmd!==1)return close();user=await env.DB.prepare('SELECT * FROM users WHERE uuid=?').bind(v.id).first();if(!user||!user.is_active)return close();if(user.limit_gb&&user.used_gb>=user.limit_gb)return close();if(user.expiry_days&&daysLeft(user.created_at,user.expiry_days)<=0)return close();sock=connect({hostname:v.host,port:v.port});await Promise.race([sock.opened,new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),5000))]);const w=sock.writable.getWriter();if(v.data.byteLength)await w.write(v.data);w.releaseLock();const reader=sock.readable.getReader();(async()=>{while(true){const r=await reader.read();if(r.done)break;if(r.value?.byteLength){server.send(r.value);}}close()})();}catch{close()}});server.addEventListener('close',close);return new Response(null,{status:101,webSocket:client})}

export default {async fetch(request,env,ctx){try{await init(env.DB);await ensureAdmin(env);const url=new URL(request.url);if(url.pathname==='/panel'||url.pathname==='/login')return auth(request,env)?html(panelPage()):html(loginPage());if(url.pathname==='/api/'||url.pathname.startsWith('/api/'))return api(request,url,env);if(request.headers.get('Upgrade')?.toLowerCase()==='websocket')return tunnel(request,env);if(url.pathname.startsWith('/sub/')){const key=decodeURIComponent(url.pathname.slice(5));const user=await env.DB.prepare('SELECT * FROM users WHERE username=? OR uuid=?').bind(key,key).first();if(!user)return new Response('Not found',{status:404});return new Response(sub(user,url.hostname)+'\n',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})}return new Response('Edge Tunnel Worker is running. Open /panel',{headers:{'content-type':'text/plain'}})}catch(e){return new Response('Internal Server Error',{status:500})}}};
