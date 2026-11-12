const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const COST = {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024};
const DISCLAIMER = `23 TV 为私人邀请制家庭观影工具，不提供公开注册。影视资料及播放内容来自所配置的第三方服务，本站不托管影片，不保证片源的授权状态、准确性、持续可用性或播放质量。请仅观看你有权访问的内容，并遵守所在地适用规则；不得转售账号或传播无权传播的内容。\n账号邮箱、加盐密码摘要和邀请状态保存在部署主机；服务保存有限的访问 IP、路径和时间记录。观看历史与续播位置按账号独立保存，其他普通账号不可查看；管理员可在本机后台查看全站访问日志与统计。搜索历史按账号保存在各自浏览器，界面偏好保存在浏览器。播放时设备可能连接第三方片源。\n目前服务仅在家庭局域网开放，外网及移动数据无法直接访问；主机关机、休眠或未启动服务时不可用。当前内网 HTTP 不加密，请仅在可信家庭网络使用，不要复用其他服务的密码。请妥善保管本邮件和账号，勿转发；如有疑问或需要停用账号，请回复邀请邮件联系管理员。`;
function emailAddress(value) {
  if (typeof value !== 'string') throw Error('请输入有效邮箱');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) throw Error('请输入有效邮箱');
  return email;
}
function randomPassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_+?'];
  const all = groups.join('');
  const chars = groups.map(g => g[crypto.randomInt(g.length)]);
  while (chars.length < 16) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return {salt, hash: (await scrypt(password, salt, 32, COST)).toString('hex')};
}
function siteAddress() {
  if (process.env.SITE_URL) {
    const url = new URL(process.env.SITE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('SITE_URL 必须为不含凭证的 HTTP(S) 地址');
    return url.origin + '/';
  }
  const addresses = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal);
  const lan = addresses.find(x => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address));
  return `http://${lan ? lan.address : 'localhost'}:${process.env.PORT || 8080}/`;
}
class AccountStore {
  constructor(dir = process.env.ACCOUNT_DATA_DIR || path.join(process.cwd(), '.accounts-data')) { this.dir = dir; this.file = path.join(dir, 'accounts.json'); }
  read() {
    if (!fs.existsSync(this.file)) return {version: 1, users: [], invitations: []};
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.invitations)) throw Error('账号数据异常，请恢复备份');
    return data;
  }
  write(data) {
    fs.mkdirSync(this.dir, {recursive: true, mode: 0o700});
    const tmp = this.file + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), {mode: 0o600}); fs.renameSync(tmp, this.file);
  }
  key() {
    const file = path.join(this.dir, 'mail.key');
    fs.mkdirSync(this.dir, {recursive: true, mode: 0o700});
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32), {mode: 0o600, flag: 'wx'});
    return fs.readFileSync(file);
  }
  seal(text) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), body].map(b => b.toString('base64')).join('.');
  }
  unseal(text) {
    const [iv, tag, body] = text.split('.').map(x => Buffer.from(x, 'base64'));
    const c = crypto.createDecipheriv('aes-256-gcm', this.key(), iv); c.setAuthTag(tag);
    return Buffer.concat([c.update(body), c.final()]).toString('utf8');
  }
  list() {
    const d = this.read();
    return {users: d.users.map(({id, email, active, createdAt, lastLoginAt}) => ({id, email, active, createdAt, lastLoginAt})),
      invitations: d.invitations.map(({id, email, status, createdAt, sentAt, provider, messageId}) => ({id, email, status, createdAt, sentAt, provider, messageId})),
      siteUrl: siteAddress(), disclaimer: DISCLAIMER, smtpReady: smtpReady()};
  }
  async invite(value, reset = false) {
    const email = emailAddress(value), password = randomPassword(), hashed = await passwordHash(password);
    // Read after the expensive hash so simultaneous requests cannot overwrite each other.
    const d = this.read(); let user = d.users.find(u => u.email === email);
    if (user && !reset) throw Error('该邮箱已有账号；如需新密码，请使用重置邀请');
    if (!user && reset) throw Error('账号不存在');
    if (d.users.length >= 500 && !user) throw Error('账号数量已达上限');
    if (user) { user.active = false; user.revision++; user.credentialVersion++; }
    else { user = {id: crypto.randomUUID(), email, active: false, revision: 1, credentialVersion: 1, createdAt: Date.now(), lastLoginAt: null}; d.users.push(user); }
    Object.assign(user, hashed);
    for (const old of d.invitations.filter(x => x.userId === user.id && x.status !== 'sent')) { old.status = 'superseded'; delete old.mail; }
    const url = siteAddress();
    const text = `你好！\n\n你已获邀加入 23 TV · 把喜欢的故事，带回家。\n\n访问网址：${url}\n邮箱账号：${email}\n登录密码：${password}\n\n密码为系统随机生成的 16 位独立密码，区分大小写。请在登录窗口输入邮箱和密码，不对外开放注册。该账号仅有观影权限，无后台管理权限。\n\n使用说明与免责声明\n${DISCLAIMER}\n\n23 TV 管理员`;
    const invitation = {id: crypto.randomUUID(), userId: user.id, credentialVersion: user.credentialVersion, email, status: 'pending', createdAt: Date.now(), mail: this.seal(JSON.stringify({to: email, subject: '邀请加入 23 TV｜你的家庭观影账号', text}))};
    d.invitations.push(invitation);
    // Retain all pending work; bound completed audit history.
    d.invitations = [...d.invitations.filter(x => x.mail), ...d.invitations.filter(x => !x.mail).slice(-1000)];
    this.write(d); return {id: invitation.id, email, status: invitation.status};
  }
  mail(id) {
    const x = this.read().invitations.find(x => x.id === id);
    if (!x || !x.mail || !['pending','failed','sending'].includes(x.status)) throw Error('该邀请已发送或已失效；重发需生成重置邀请');
    return JSON.parse(this.unseal(x.mail));
  }
  setStatus(id, status, provider = '', messageId = '') {
    const d = this.read(), x = d.invitations.find(x => x.id === id);
    if (!x || !x.mail) throw Error('邀请不存在或已完成');
    if (!['pending', 'failed', 'sending'].includes(x.status)) throw Error('邀请已失效');
    x.status = status;
    if (status === 'sent') {
      if (!messageId || !provider) throw Error('缺少发送凭证');
      x.provider = provider; x.messageId = String(messageId).slice(0, 300); x.sentAt = Date.now(); delete x.mail;
      const user = d.users.find(u => u.id === x.userId);
      if (!user || user.credentialVersion !== x.credentialVersion) throw Error('该邀请已被重置');
      user.active = true;
    }
    this.write(d);
  }
  toggle(id, active) {
    const d = this.read(), user = d.users.find(u => u.id === id);
    if (!user || typeof active !== 'boolean') throw Error('账号不存在或状态无效');
    if (active && d.invitations.some(x=>x.userId===id && x.mail)) throw Error('请先完成新的邀请发送');
    if (active && !d.invitations.some(x => x.userId === id && x.credentialVersion === user.credentialVersion && x.status === 'sent')) throw Error('请先完成邀请发送');
    user.active = active; user.revision++;
    if (!active) for (const x of d.invitations.filter(x=>x.userId===id && x.mail)) { x.status='superseded'; delete x.mail; }
    this.write(d);
  }
  valid(id, revision) { const u = this.read().users.find(u => u.id === id); return !!u && u.active && u.revision === revision; }
  async authenticate(value, password) {
    let email; try { email = emailAddress(value); } catch { email = ''; }
    const user = this.read().users.find(u => u.email === email);
    const candidate = await passwordHash(password, user?.salt || '00000000000000000000000000000000');
    if (!user || !user.active || !crypto.timingSafeEqual(Buffer.from(candidate.hash, 'hex'), Buffer.from(user.hash, 'hex'))) return null;
    const d = this.read(), latest = d.users.find(u=>u.id===user.id);
    if (!latest || !latest.active || latest.revision!==user.revision) return null;
    latest.lastLoginAt = Date.now(); this.write(d);
    return {id: user.id, revision: user.revision};
  }
}
function smtpReady() { return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM); }
const sending = new Set();
async function sendInvitation(store, id) {
  if (!smtpReady()) throw Error('尚未配置 SMTP；邀请已保存为待发送，可通过已连接的 Gmail 发送');
  if (sending.has(id)) throw Error('正在发送，请勿重复提交');
  sending.add(id);
  try {
    const mail = store.mail(id);
    if (store.read().invitations.find(x=>x.id===id).status==='sending') throw Error('上次发送状态未知，请先核对发件箱，避免重复发送');
    store.setStatus(id, 'sending');
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = require('nodemailer').createTransport({host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
      auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD}, connectionTimeout: 15000, socketTimeout: 30000});
    try {
      const info = await transport.sendMail({...mail, from: process.env.SMTP_FROM});
      if (!info.accepted?.includes(mail.to)) throw Error('收件地址未被邮件服务接受');
      store.setStatus(id, 'sent', 'smtp', info.messageId);
    } finally { transport.close(); }
    return {sent: true};
  } finally { sending.delete(id); }
}
module.exports = {AccountStore, randomPassword, emailAddress, siteAddress, DISCLAIMER, sendInvitation, smtpReady};
