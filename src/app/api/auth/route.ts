import { NextResponse } from 'next/server';
import { SESSION_COOKIE, checkRateLimit, sessionFromCookieHeader, signSession, checkPassword, clearRateLimit, isPasswordConfigured, accountMode } from '@/lib/auth';

import { AccountStore } from '../../../../server/accounts.cjs';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { success: false, error: '服务器未完成登录配置，请联系管理员' },
      { status: 503 }
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: '尝试次数过多，请 10 分钟后再试' },
      { status: 429 }
    );
  }

  if (req.headers.get('origin') && req.headers.get('origin') !== `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`) return NextResponse.json({error:'请求来源无效'}, {status:403});
  if (Number(req.headers.get('content-length') || 0) > 4096) return NextResponse.json({error:'请求内容过大'}, {status:413});
  let password = '';
  let email = '';
  try {
    const body = (await req.json()) as { password?: string; email?: string };
    password = String(body.password ?? '');
    email = String(body.email ?? '').trim().toLowerCase();
    if (password.length > 256 || email.length > 254) throw Error('Invalid input');
  } catch {
    return NextResponse.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  let identity: {id: string; revision: number} | null = null;
  if (accountMode()) {
    if (email === 'admin') {
      const host = req.headers.get('host') || '';
      const local = req.headers.get('x-23tv-local-admin') === '1' && ['127.0.0.1', '::1'].includes(ip) && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
      const digest = (text: string) => crypto.createHash('sha256').update(text).digest();
      if (local && process.env.ADMIN_PASSWORD && crypto.timingSafeEqual(digest(password), digest(process.env.ADMIN_PASSWORD))) identity = {id:'local-admin', revision:1};
    } else { identity = await new AccountStore().authenticate(email, password); }
  }
  if (accountMode() ? !identity : !checkPassword(password)) {
    return NextResponse.json({ success: false, error: '邮箱或密码错误，或账号尚未启用' }, { status: 401 });
  }
  clearRateLimit(ip);
  const { token, expiresAt } = signSession(identity || undefined);
  const res = NextResponse.json({ success: true });
  // Cookie Secure 策略：COOKIE_SECURE 环境变量显式覆盖；否则按 x-forwarded-proto 推导。
  // 不能依赖 req.url——Next.js Route Handler 中它是内部转发地址，并非用户侧的原始协议。
  const secure = process.env.COOKIE_SECURE === 'true'
    ? true
    : process.env.COOKIE_SECURE === 'false'
      ? false
      : (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http') === 'https';
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
    path: '/',
  });
  return res;
}

/** GET：查询当前会话状态 */
export async function GET(req: Request) {
  const verified = sessionFromCookieHeader(req.headers.get('cookie'));
  return NextResponse.json({ success: true, verified });
}

/** DELETE：登出 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
