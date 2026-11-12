import fs from 'node:fs';
import crypto from 'node:crypto';
const file = '.env.local';
const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!%*-_+?'];
function password(){const all=groups.join('');const out=groups.map(g=>g[crypto.randomInt(g.length)]);while(out.length<16)out.push(all[crypto.randomInt(all.length)]);for(let i=out.length-1;i>0;i--){const j=crypto.randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out.join('');}
const adminPassword=password();
const config=`# Private deployment configuration; do not commit.\nACCOUNT_MODE=invite\nADMIN_USERNAME=admin\nADMIN_PASSWORD=${adminPassword}\nPASSWORD=${password()}\nPROXY_SECRET=${crypto.randomBytes(32).toString('hex')}\nHOST=127.0.0.1\nPORT=8080\nDEFAULT_SOURCES=[]\nDEFAULT_LIVE_SOURCES=[]\nDEFAULT_SUBSCRIPTIONS=[]\nDEFAULT_RECOMMEND_SOURCE=hot-list\n`;
try {fs.writeFileSync(file,config,{mode:0o600,flag:'wx'});}catch(error){if(error.code==='EEXIST'){console.error('.env.local already exists; no changes made.');process.exit(1);}throw error;}
console.log('Created private .env.local with unique credentials.');
console.log('Administrator account: admin');
console.log('Administrator password: '+adminPassword);
console.log('Management: http://localhost:8080/admin (on the server itself)');
console.log('Save these credentials. To enable LAN viewing, set HOST=0.0.0.0 before npm start.');
