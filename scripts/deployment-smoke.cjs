const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const {AccountStore}=require('../server/accounts.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'23tv-deploy-'));let child;let checks=0;
 const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
 try {
  const setup=cp.spawnSync(process.execPath,[path.join(root,'scripts/setup.mjs')],{cwd:dir,encoding:'utf8'});assert.equal(setup.status,0);
  const before=fs.readFileSync(path.join(dir,'.env.local'),'utf8');const config=Object.fromEntries(before.split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>{const p=x.indexOf('=');return [x.slice(0,p),x.slice(p+1)];}));
  check('setup creates unique 16-character administrator credentials',config.ADMIN_PASSWORD.length===16&&config.PROXY_SECRET.length===64);
  const again=cp.spawnSync(process.execPath,[path.join(root,'scripts/setup.mjs')],{cwd:dir,stdio:'ignore'});
  check('setup refuses to overwrite existing credentials',again.status!==0&&fs.readFileSync(path.join(dir,'.env.local'),'utf8')===before);
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  child=cp.spawn(process.execPath,['server/gateway.cjs'],{cwd:root,stdio:'ignore',env:{...process.env,...config,NODE_ENV:'production',PORT:String(port),ACCOUNT_DATA_DIR:path.join(dir,'accounts'),ADMIN_DATA_DIR:path.join(dir,'admin'),WATCH_DATA_DIR:path.join(dir,'watch')}});
  const base=`http://127.0.0.1:${port}`;
  async function request(route,body,cookie='',owner=''){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{cookie,...(owner?{'X-23TV-Account':owner}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-23TV-Admin':'1','X-23TV-History':'1'})},body:body===undefined?undefined:JSON.stringify(body)});return {r,data:await r.json()};}
  let ready=false;for(let i=0;i<80;i++){try{const r=await request('/api/status');if(r.r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'production gateway started');
  check('anonymous management API denied',(await request('/admin/api/status')).r.status===401);
  check('administrator username required',(await request('/admin/api/login',{password:config.ADMIN_PASSWORD})).r.status===401);
  const admin=await request('/admin/api/login',{username:config.ADMIN_USERNAME,password:config.ADMIN_PASSWORD});check('generated administrator credentials work',admin.r.status===200);const ac=admin.r.headers.get('set-cookie').split(';')[0];
  check('source presets contain no private channels',(await request('/api/status')).data.defaultSources.length===0);
  const store=new AccountStore(path.join(dir,'accounts')),users=[];
  for(const email of ['test-a@example.invalid','test-b@example.invalid']){const i=await store.invite(email),password=store.mail(i.id).text.match(/登录密码：(.*)/)[1];store.setStatus(i.id,'sent','test','isolated-fixture');const login=await request('/api/auth',{email,password});assert.equal(login.r.status,200);const cookie=login.r.headers.get('set-cookie').split(';')[0];const status=await request('/api/status',undefined,cookie);users.push({cookie,id:status.data.user.id});}
  const [a,b]=users;check('invited users start with empty isolated history',(await request('/api/watch-history',undefined,a.cookie,a.id)).data.length===0&&(await request('/api/watch-history',undefined,b.cookie,b.id)).data.length===0);
  const record={sourceKey:'test',vodId:'1',title:'Isolation fixture',episodeIndex:0,totalEpisodes:1,playbackPosition:42,duration:100,timestamp:Date.now()};
  await request('/api/watch-history',{action:'save',record},a.cookie,a.id);
  check('history written for one account stays private',(await request('/api/watch-history',undefined,a.cookie,a.id)).data.length===1&&(await request('/api/watch-history',undefined,b.cookie,b.id)).data.length===0);
  check('stale or forged account header denied',(await request('/api/watch-history',undefined,a.cookie,b.id)).r.status===409);
  check('viewer session cannot administer accounts',(await request('/admin/api/accounts',undefined,a.cookie)).r.status===401);
  check('local administrator retains global statistics',(await request('/admin/api/status',undefined,ac)).r.status===200);
  const blocked=await new Promise((resolve,reject)=>{const q=require('node:http').get(base+'/admin',{headers:{host:'untrusted.example','x-forwarded-for':'127.0.0.1'}},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);});check('forged Host and forwarded IP cannot open management',blocked===403);
  const cookies=fs.readFileSync(path.join(dir,'accounts/accounts.json'),'utf8');check('account store contains no recoverable sent mail',!JSON.parse(cookies).invitations.some(x=>x.mail));
  console.log(`Deployment smoke checks passed: ${checks}. No real email was sent.`);
 } finally {if(child){child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,4000).unref();});}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
