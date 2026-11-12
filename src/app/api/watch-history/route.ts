import { sessionIdentityFromCookieHeader } from '@/lib/auth';
import { guardRequest } from '@/lib/api-guard';
import { applyWatchRecord, episodeKey, validateWatchRecord } from '@/lib/watch-history';
import { withWatchState } from '@/lib/watch-history-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  const identity = sessionIdentityFromCookieHeader(req.headers.get('cookie'));
  if (!identity) return json({error:'未登录'},401);
  if (req.headers.get('x-23tv-account') !== identity.id) return json({error:'登录账号已变化，请刷新页面'},409);
  const state = <T,>(fn: Parameters<typeof withWatchState<T>>[0], write = false) => withWatchState(fn, write, identity.id);
  return json(await state(s => Object.values(s.history).sort((a,b) => b.timestamp-a.timestamp)));
}
export async function POST(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  const identity = sessionIdentityFromCookieHeader(req.headers.get('cookie'));
  if (!identity) return json({error:'未登录'},401);
  if (req.headers.get('x-23tv-account') !== identity.id) return json({error:'登录账号已变化，请刷新页面'},409);
  const state = <T,>(fn: Parameters<typeof withWatchState<T>>[0], write = false) => withWatchState(fn, write, identity.id);
  if (req.headers.get('x-23tv-history') !== '1') return json({ error: '无效请求' }, 403);
  const origin = req.headers.get('origin');
  if (origin && origin !== `${new URL(req.url).protocol}//${req.headers.get('host')}`) return json({ error: '无效来源' }, 403);
  const text = await req.text(); if (text.length > 512000) return json({ error: '请求过大' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: '无效请求' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: '无效请求' }, 400);
  if (body.action === 'save' || body.action === 'import') {
    const records = body.action === 'save' ? [body.record] : body.records;
    if (!Array.isArray(records) || records.length > 100) return json({ error: '记录数量无效' }, 400);
    const valid = records.map(validateWatchRecord);
    if (valid.some(r => !r)) return json({ error: '记录格式无效' }, 400);
    await state(s => { for (const r of valid) applyWatchRecord(s, r!); }, true);
    return json({ ok: true });
  }
  if (body.action === 'progress') {
    const r = validateWatchRecord(body.record); if (!r) return json({ error: '无效记录' }, 400);
    return json(await state(s => s.progress[episodeKey(r)] || null));
  }
  if (body.action === 'remove' && typeof body.id === 'string') {
    await state(s => { delete s.history[body.id]; }, true); return json({ ok: true });
  }
  if (body.action === 'clear') {
    await state(s => { s.history = {}; s.progress = {}; s.clearedAt = Date.now(); }, true); return json({ ok: true });
  }
  return json({ error: '无效操作' }, 400);
}
