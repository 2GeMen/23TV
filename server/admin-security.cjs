const net = require('node:net');
const crypto = require('node:crypto');
function normalizeIP(raw = '') {
  if (raw.startsWith('::ffff:') && net.isIP(raw.slice(7)) === 4) return raw.slice(7);
  return raw;
}
function ipValue(raw) {
  const ip = normalizeIP(raw);
  const version = net.isIP(ip);
  if (!version) throw new Error('无效 IP 地址');
  if (version === 4) return { bits: 32, value: ip.split('.').reduce((v,x)=> (v << 8n) + BigInt(x), 0n) };
  let text = ip;
  if (text.includes('.')) {
    const colon = text.lastIndexOf(':');
    const v4 = ipValue(text.slice(colon + 1)).value;
    text = text.slice(0, colon) + ':' + (v4 >> 16n).toString(16) + ':' + (v4 & 65535n).toString(16);
  }
  const [left,right] = text.split('::');
  const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
  const groups = text.includes('::') ? [...a,...Array(8-a.length-b.length).fill('0'),...b] : a;
  return { bits: 128, value: groups.reduce((v,x)=>(v<<16n)+BigInt('0x'+x),0n) };
}
function parseRule(rule) {
  if (typeof rule !== 'string' || rule.length > 100) throw new Error('无效 IP／网段');
  const parts = rule.trim().split('/');
  if (parts.length > 2) throw new Error('无效网段');
  const ip = ipValue(parts[0]);
  const prefix = parts.length === 1 ? ip.bits : /^\d+$/.test(parts[1]) ? Number(parts[1]) : -1;
  if (prefix < 0 || prefix > ip.bits) throw new Error('无效网段前缀');
  return {...ip, prefix};
}
function matches(ip, rule) {
  try { const a=ipValue(ip), b=parseRule(rule);return a.bits===b.bits && (a.value >> BigInt(a.bits-b.prefix))===(b.value >> BigInt(b.bits-b.prefix)); } catch { return false; }
}
function loopback(ip) { return ip === '::1' || matches(normalizeIP(ip), '127.0.0.0/8'); }
function localHost(host = '') { return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host); }
function adminLocal(req) { return loopback(normalizeIP(req.socket.remoteAddress)) && localHost(req.headers.host); }
function allowed(ip, policy, now = Date.now()) {
  if (loopback(ip)) return true; // Never lock the local administrator out.
  if (policy.bans.some(b=>b.expiresAt>now && matches(ip,b.ip))) return false;
  if (policy.deny.some(r=>matches(ip,r))) return false;
  return !policy.allow.length || policy.allow.some(r=>matches(ip,r));
}
function equal(a,b) { return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest()); }
function sign(secret, expires = Date.now() + 6*60*60*1000) {
  const payload=String(expires);return payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('hex');
}
function session(cookie, secret) {
  const token=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tv23_admin='))?.slice(11);
  if (!token || !/^\d+\.[a-f0-9]{64}$/.test(token)) return false;
  const expires=Number(token.split('.')[0]);
  return expires>Date.now() && expires<=Date.now()+6*60*60*1000+1000 && equal(token,sign(secret,expires));
}
function validatePolicy(input) {
  const result={};
  for (const key of ['allow','deny']) {
    if (!Array.isArray(input[key]) || input[key].length>200) throw new Error('每类最多 200 条 IP／网段规则');
    result[key]=[...new Set(input[key].map(r=>{parseRule(r);return r.trim();}))];
  }
  if (!Number.isInteger(input.retentionDays) || input.retentionDays<1 || input.retentionDays>30) throw new Error('日志保留期限须为 1–30 天');
  return {...result,retentionDays:input.retentionDays};
}
module.exports={normalizeIP,parseRule,matches,loopback,localHost,adminLocal,allowed,equal,sign,session,validatePolicy};
