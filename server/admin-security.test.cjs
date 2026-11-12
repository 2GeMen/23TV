const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const s=require('./admin-security.cjs');const {AdminStore}=require('./admin-store.cjs');
const req=(ip,host,extra={})=>({socket:{remoteAddress:ip},headers:{host,...extra}});
test('admin access uses socket and restricted Host, not spoofed headers',()=>{
 assert.equal(s.adminLocal(req('127.0.0.1','localhost:8080')),true);
 assert.equal(s.adminLocal(req('::ffff:127.0.0.1','127.0.0.1:8080')),true);
 assert.equal(s.adminLocal(req('::1','[::1]:8080')),true);
 assert.equal(s.adminLocal(req('192.168.1.50','localhost:8080',{'x-forwarded-for':'127.0.0.1','x-real-ip':'::1'})),false);
 assert.equal(s.adminLocal(req('127.0.0.1','evil.example')),false);
 assert.equal(s.adminLocal(req('127.0.0.1','localhost.evil.example')),false);
});
test('CIDR matching supports IPv4, mapped IPv4 and IPv6',()=>{
 assert(s.matches('192.168.1.9','192.168.1.0/24'));assert(!s.matches('192.168.2.9','192.168.1.0/24'));
 assert(s.matches('::ffff:192.168.1.9','192.168.1.0/24'));assert(s.matches('2001:db8::42','2001:db8::/32'));assert(!s.matches('2001:db9::42','2001:db8::/32'));
 for(const x of ['x','1.2.3.4/33','::1/129','1.2.3.4/-1','1.2.3.4/2/3'])assert.throws(()=>s.parseRule(x));
});
test('deny wins, allow is optional, bans expire, localhost is always recoverable',()=>{
 const p={allow:['192.168.1.0/24'],deny:['192.168.1.8'],bans:[{ip:'192.168.1.9',expiresAt:200}]};
 assert(s.allowed('127.0.0.1',p,100));assert(s.allowed('::1',p,100));assert(!s.allowed('192.168.2.8',p,100));assert(!s.allowed('192.168.1.8',p,100));assert(!s.allowed('192.168.1.9',p,100));assert(s.allowed('192.168.1.9',p,201));
});
test('admin sessions reject tampering, expired tokens, viewer cookies and old secrets',()=>{
 const token=s.sign('secret');assert(s.session('tv23_admin='+token,'secret'));assert(!s.session('tv23_admin='+token+'x','secret'));assert(!s.session('tv23_admin='+token,'other'));assert(!s.session('ltv_session='+token,'secret'));assert(!s.session('tv23_admin='+s.sign('secret',Date.now()-1),'secret'));assert(!s.session('tv23_admin=%xx','secret'));
});
test('policy validation bounds rules and retention',()=>{
 assert.deepEqual(s.validatePolicy({allow:['1.2.3.4','1.2.3.4'],deny:[],retentionDays:7}),{allow:['1.2.3.4'],deny:[],retentionDays:7});
 for(const p of [{allow:['bad'],deny:[],retentionDays:7},{allow:[],deny:[],retentionDays:31},{allow:Array(201).fill('1.2.3.4'),deny:[],retentionDays:7}])assert.throws(()=>s.validatePolicy(p));
});
test('state is bounded, private, persistent, and corrupted policy fails closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'23tv-admin-test-'));
 try{const store=new AdminStore(dir);for(let i=0;i<2100;i++)store.record({time:Date.now(),ip:'1.2.3.4',bytes:1});store.state.policy.deny=['1.2.3.4'];store.flush();assert.equal(store.state.logs.length,2000);assert.equal(fs.statSync(store.file).mode&0o777,0o600);assert.equal(new AdminStore(dir).state.policy.deny[0],'1.2.3.4');fs.writeFileSync(store.file,'not json');assert.throws(()=>new AdminStore(dir));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
