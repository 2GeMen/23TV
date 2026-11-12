const {validatePolicy,parseRule}=require('./admin-security.cjs');
const fs=require('node:fs');const path=require('node:path');
class AdminStore {
  constructor(dir) {
    this.dir=dir;this.file=path.join(dir,'state.json');this.dirty=false;
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    this.state={version:1,policy:{allow:[],deny:[],bans:[],retentionDays:7},logs:[],totals:{requests:0,bytes:0,blocked:0,since:Date.now()}};
    // Fail closed on damaged policy files; do not silently clear IP restrictions.
    if(fs.existsSync(this.file)){const s=JSON.parse(fs.readFileSync(this.file,'utf8'));if(s.version!==1||!s.policy||!Array.isArray(s.logs)||!s.totals)throw Error('后台数据格式异常，请恢复备份');validatePolicy(s.policy);if(!Array.isArray(s.policy.bans)||s.policy.bans.length>200)throw Error('封禁数据异常');for(const b of s.policy.bans){parseRule(b.ip);if(!Number.isFinite(b.expiresAt))throw Error('封禁期限异常');}this.state=s;}
    this.prune();
  }
  prune(){const cutoff=Date.now()-this.state.policy.retentionDays*86400000;this.state.logs=this.state.logs.filter(l=>l.time>=cutoff).slice(-2000);this.state.policy.bans=this.state.policy.bans.filter(b=>b.expiresAt>Date.now());}
  record(row){this.state.logs.push(row);if(this.state.logs.length>2000)this.state.logs.splice(0,this.state.logs.length-2000);this.dirty=true;}
  flush(){if(!this.dirty)return;this.prune();const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.state),{mode:0o600});fs.renameSync(temp,this.file);this.dirty=false;}
}
module.exports={AdminStore};
