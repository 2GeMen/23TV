const crypto = require('node:crypto');
const {AccountStore} = require('./accounts.cjs');
/** Resolve identity exclusively from a signed, unexpired cookie and current account state. */
function readViewerSession(cookie) {
  if (process.env.ACCOUNT_MODE !== 'invite') return null;
  try {
    const part = (cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('ltv_session='));
    if (!part || part.length > 4096) return null;
    const token = decodeURIComponent(part.slice(12));
    const dot = token.lastIndexOf('.'); if (dot < 1) return null;
    const payload = token.slice(0,dot), signature = token.slice(dot+1);
    const secret = process.env.PROXY_SECRET || crypto.createHash('sha256').update((process.env.PASSWORD || '') + ':libretv::session-salt').digest('hex');
    const expected = crypto.createHmac('sha256',secret).update(payload).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return null;
    const identity = JSON.parse(Buffer.from(payload,'base64url').toString());
    if (!Number.isFinite(identity.exp) || identity.exp <= Date.now() || identity.exp > Date.now()+90*86400000+1000 || !Number.isInteger(identity.revision)) return null;
    if (identity.id === 'local-admin') return identity.revision === 1 ? {id:'local-admin',email:'本机管理员',role:'admin',revision:1} : null;
    const user = new AccountStore().read().users.find(u=>u.id===identity.id && u.active && u.revision===identity.revision);
    return user ? {id:user.id,email:user.email,role:'viewer',revision:user.revision} : null;
  } catch { return null; }
}
module.exports={readViewerSession};
