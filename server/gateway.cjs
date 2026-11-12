// This is the production entry point. IP policy and /admin require this server.
require('@next/env').loadEnvConfig(process.cwd());
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {AccountStore,sendInvitation}=require('./accounts.cjs');
const {readViewerSession}=require('./viewer-session.cjs');
const next=require('next');const security=require('./admin-security.cjs');const {AdminStore}=require('./admin-store.cjs');
const port=Number(process.env.PORT||8080);const host=process.env.HOST||'0.0.0.0';
const app=next({dev:false,hostname:host,port});
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('请求内容过大');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
async function start(){
 await app.prepare(); // Loads .env.local before reading ADMIN_PASSWORD.
 const accounts=new AccountStore();
 const password=process.env.ADMIN_PASSWORD;
 const username=process.env.ADMIN_USERNAME || 'admin';
 if(!password)throw Error('请在 .env.local 配置独立的 ADMIN_PASSWORD');
 const secret=crypto.createHash('sha256').update('23tv-admin-v2:'+username+':'+password+':'+(process.env.PROXY_SECRET||'')).digest('hex');
 const store=new AdminStore(process.env.ADMIN_DATA_DIR||path.join(process.cwd(),'.admin-data'));
 const html=fs.readFileSync(path.join(__dirname,'admin.html'));
 const handle=app.getRequestHandler();const sockets=new Set();let activeRequests=0;const attempts=[];
 const timer=setInterval(()=>{try{store.flush();}catch(e){console.error('[23TV] 后台日志写入失败:',e.message);}},10000);timer.unref();
 const server=http.createServer(async(req,res)=>{
  const ip=security.normalizeIP(req.socket.remoteAddress||'');
  // Ignore all client-supplied identity headers. Only this socket is authoritative.
  delete req.headers['forwarded'];delete req.headers['x-real-ip'];delete req.headers['x-forwarded-for'];
  req.headers['x-real-ip']=ip;req.headers['x-forwarded-for']=ip;
  delete req.headers['x-23tv-local-admin'];
  req.headers['x-23tv-local-admin']=security.adminLocal(req)?'1':'0';
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{error:'请求地址无效'});}
  const isAdmin=pathname==='/admin'||pathname.startsWith('/admin/');
  if(isAdmin){
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   if(!security.adminLocal(req)){store.record({time:Date.now(),ip,method:req.method,path:pathname,status:403,ms:0,bytes:0,event:'拒绝远程后台访问'});return json(res,403,{error:'管理后台仅允许本机 localhost 访问'});}
   if(req.method!=='GET'){
    // Custom header forces a cross-origin preflight; no CORS permission is emitted.
    const origin=req.headers.origin;
    if(req.headers['x-23tv-admin']!=='1'||(origin&&origin!==`http://${req.headers.host}`))return json(res,403,{error:'管理请求来源无效'});
   }
   try {
    if(pathname==='/admin'||pathname==='/admin/'){
     if(req.method!=='GET')return json(res,405,{error:'不支持的请求方法'});
     res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
    }
    if(pathname==='/admin/api/login'&&req.method==='POST'){
     const now=Date.now();while(attempts.length&&attempts[0]<now-600000)attempts.shift();
     if(attempts.length>=5)return json(res,429,{error:'尝试次数过多，请 10 分钟后重试'});
     const data=await body(req);attempts.push(now);
     if(typeof data.username!=='string'||!security.equal(data.username,username)||typeof data.password!=='string'||!security.equal(data.password,password)){store.record({time:now,ip,method:'POST',path:pathname,status:401,bytes:0,ms:0,event:'管理员登录失败'});return json(res,401,{error:'管理员账号或密码错误'});}
     attempts.length=0;res.setHeader('Set-Cookie',`tv23_admin=${security.sign(secret)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=21600`);
     store.record({time:now,ip,method:'POST',path:pathname,status:200,bytes:0,ms:0,event:'管理员登录成功'});return json(res,200,{ok:true});
    }
    if(!security.session(req.headers.cookie,secret))return json(res,401,{error:'请先登录管理后台'});
    if(pathname==='/admin/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','tv23_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0');return json(res,200,{ok:true});}
    if(pathname==='/admin/api/status'&&req.method==='GET'){
     store.prune();const perIP=new Map();for(const row of store.state.logs){if(row.event)continue;const s=perIP.get(row.ip)||{ip:row.ip,requests:0,bytes:0,lastSeen:0};s.requests++;s.bytes+=row.bytes;s.lastSeen=Math.max(s.lastSeen,row.time);perIP.set(row.ip,s);}
     return json(res,200,{policy:store.state.policy,totals:store.state.totals,logs:store.state.logs.slice(-300).reverse(),logCount:store.state.logs.length,clients:[...perIP.values()].sort((a,b)=>b.lastSeen-a.lastSeen),runtime:{uptime:process.uptime(),rss:process.memoryUsage().rss,connections:sockets.size,activeRequests}});
    }
    if(pathname==='/admin/api/policy'&&req.method==='POST'){
     const policy=security.validatePolicy(await body(req));Object.assign(store.state.policy,policy);store.dirty=true;store.flush();return json(res,200,{ok:true});
    }
    if(pathname==='/admin/api/ban'&&req.method==='POST'){
     const data=await body(req);security.parseRule(data.ip);
     if(data.ip.includes('/')||security.loopback(data.ip))return json(res,400,{error:'临时封禁只接受单个非本机 IP'});
     const minutes=Number(data.minutes);if(![0,30,60,1440].includes(minutes))return json(res,400,{error:'无效封禁时长'});
     store.state.policy.bans=store.state.policy.bans.filter(b=>b.ip!==data.ip);if(minutes){if(store.state.policy.bans.length>=200)return json(res,400,{error:'临时封禁已达上限'});store.state.policy.bans.push({ip:data.ip,expiresAt:Date.now()+minutes*60000});}
     store.dirty=true;store.flush();return json(res,200,{ok:true});
    }
    if(pathname==='/admin/api/accounts'&&req.method==='GET')return json(res,200,accounts.list());
    if(pathname==='/admin/api/invite'&&req.method==='POST'){
     try {const data=await body(req);const invitation=await accounts.invite(data.email,data.reset===true);return json(res,200,{invitation});}
     catch(e){return json(res,400,{error:e.message});}
    }
    if(pathname==='/admin/api/invite/send'&&req.method==='POST'){
     try {const data=await body(req);return json(res,200,await sendInvitation(accounts,String(data.id)));}
     catch(e){return json(res,400,{error:e.message.startsWith('尚未配置')||e.message.startsWith('上次发送')?e.message:'邮件发送未完成，请核对 SMTP 配置和发件箱；不要重复提交状态未知的邮件'});}
    }
    if(pathname==='/admin/api/invite/preview'&&req.method==='POST'){
     try {const data=await body(req);return json(res,200,accounts.mail(String(data.id)));}
     catch(e){return json(res,400,{error:e.message});}
    }
    if(pathname==='/admin/api/accounts/toggle'&&req.method==='POST'){
     try {const data=await body(req);accounts.toggle(String(data.id),data.active);return json(res,200,{ok:true});}
     catch(e){return json(res,400,{error:e.message});}
    }
    if(pathname==='/admin/api/logs/clear'&&req.method==='POST'){store.state.logs=[];store.dirty=true;store.flush();return json(res,200,{ok:true});}
    return json(res,404,{error:'管理接口不存在'});
   }catch(e){return json(res,400,{error:e.message==='请求内容过大'?'请求内容过大':'请求无效或保存失败，请检查规则格式'});}
  }
  const viewer=readViewerSession(req.headers.cookie);
  const started=Date.now();let bytes=0,done=false;activeRequests++;
  const write=res.write,end=res.end;
  const length=(chunk,encoding)=>typeof chunk==='string'?Buffer.byteLength(chunk,typeof encoding==='string'?encoding:undefined):chunk?.byteLength||0;
  res.write=function(chunk,encoding,...rest){const n=length(chunk,encoding);bytes+=n;store.state.totals.bytes+=n;store.dirty=true;return write.call(this,chunk,encoding,...rest);};
  res.end=function(chunk,encoding,...rest){const n=length(chunk,encoding);bytes+=n;store.state.totals.bytes+=n;store.dirty=true;return end.call(this,chunk,encoding,...rest);};
  const finish=()=>{if(done)return;done=true;activeRequests--;const total=store.state.totals;total.requests++;if(res.statusCode===403)total.blocked++;store.record({time:started,ip,account:viewer?.email||null,method:req.method,path:(pathname.startsWith('/api/proxy/')?'/api/proxy/[url]':pathname.startsWith('/api/live/stream/')?'/api/live/stream/[url]':pathname).slice(0,240),status:res.writableFinished?res.statusCode:499,ms:Date.now()-started,bytes});};
  res.once('finish',finish);res.once('close',finish);
  if(!security.allowed(ip,store.state.policy))return json(res,403,{error:'此 IP 暂无访问权限'});
  try{await handle(req,res);}catch(e){console.error('[23TV] 请求失败:',e.message);if(!res.headersSent)json(res,500,{error:'服务暂时不可用'});else res.end();}
 });
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.listen(port,host,()=>console.log(`23 TV 已启动；本机管理：http://localhost:${port}/admin`));
 let stopping=false;function stop(){if(stopping)return;stopping=true;clearInterval(timer);try{store.flush();}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
start().catch(e=>{console.error('[23TV] 启动失败:',e.message);process.exit(1);});
