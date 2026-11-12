import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { guardRequest } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Session = { id: string; process: ChildProcessWithoutNullStreams; touched: number; seq: number;
  status: string; mode: 'browser' | 'server'; en?: string; error?: string; updated?: number; processing?: number };
const shared = globalThis as typeof globalThis & { captionsSession?: Session; captionsTimer?: NodeJS.Timeout };
function stop() {
  const session = shared.captionsSession;
  shared.captionsSession = undefined;
  if (session) session.process.kill('SIGTERM');
}
if (!shared.captionsTimer) {
  shared.captionsTimer = setInterval(() => {
    if (shared.captionsSession && Date.now() - shared.captionsSession.touched > 20000) stop();
  }, 5000);
  shared.captionsTimer.unref();
  process.once('exit', stop);
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  // Custom header prevents cross-origin form requests; no CORS is enabled.
  if (req.headers.get('x-23tv-captions') !== '1') return json({ error: '无效请求' }, 403);
  const origin = req.headers.get('origin');
  if (origin && origin !== `${new URL(req.url).protocol}//${req.headers.get('host')}`) return json({ error: '无效来源' }, 403);
  const raw = await req.text();
  if (raw.length > 90000) return json({ error: '请求过大' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: '无效请求' }, 400); }
  if (body.action === 'start') {
    // Restrict expensive ASR to verified, configured channels. No arbitrary URL/FFmpeg arguments.
    const { readFile } = await import('node:fs/promises');
    const playlist = await readFile(path.join(process.cwd(), 'public/live-curated.m3u'), 'utf8');
    const allowed = playlist.split(/\r?\n/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
    if (typeof body.url !== 'string' || !allowed.includes(body.url)) return json({ error: '字幕暂仅支持直播精选中的频道' }, 400);
    if (shared.captionsSession) return json({ error: '已有字幕任务运行，请先关闭另一页面的字幕（最多等待20秒）' }, 409);
    const root = path.resolve(process.env.CAPTION_RUNTIME_DIR || path.join(process.cwd(), '.caption-runtime'));
    const child = spawn(process.env.CAPTION_PYTHON || path.join(root, 'venv/bin/python'), ['-u', path.join(process.cwd(), 'server/captions/worker.py')],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { NODE_ENV: 'production', PATH: process.env.PATH, LANG: 'en_US.UTF-8', PYTHONDONTWRITEBYTECODE: '1', CAPTION_RUNTIME_DIR: root, ...(process.env.FFMPEG_PATH ? { FFMPEG_PATH: process.env.FFMPEG_PATH } : {}) } });
    const session: Session = { id: randomUUID(), process: child, touched: Date.now(), seq: 0, status: 'loading', mode: body.mode === 'browser' ? 'browser' : 'server' };
    shared.captionsSession = session;
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          session.status = event.status;
          if (event.en) { session.en = event.en; session.updated = Date.now(); session.seq++; session.processing = event.processing; }
          if (event.error) session.error = event.error;
        } catch { /* Ignore library diagnostics, never expose subprocess output. */ }
      }
    });
    child.stderr.resume();
    child.on('error', () => { session.status = 'error'; session.error = '本地字幕环境不可用'; });
    child.on('close', () => {
      if (session.status !== 'error') { session.status = 'error'; session.error = '字幕任务已停止，请关闭后重试'; }
    });
    child.stdin.on('error', () => { /* Worker shutdown may close the pipe during an upload. */ });
    child.stdin.write(JSON.stringify({ mode: session.mode, url: `http://127.0.0.1:${process.env.PORT || 8080}/api/live/stream?url=` + encodeURIComponent(body.url), cookie: req.headers.get('cookie') || '' }) + '\n');
    if (session.mode === 'server') child.stdin.end();
    return json({ id: session.id, status: session.status, mode: session.mode });
  }
  const session = shared.captionsSession;
  if (!session || session.id !== body.id) return json({ error: '字幕会话已结束' }, 404);
  if (body.action === 'stop') { stop(); return json({ ok: true }); }
  if (body.action === 'audio') {
    if (session.mode !== 'browser' || session.status === 'error') return json({ error: '音轨会话不可用' }, 409);
    if (typeof body.pcm !== 'string' || body.pcm.length > 86000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pcm)) return json({ error: '无效音频帧' }, 400);
    const bytes = Buffer.from(body.pcm, 'base64');
    if (bytes.length < 1600 || bytes.length > 64000 || bytes.length % 2) return json({ error: '音频帧长度无效' }, 400);
    session.touched = Date.now();
    // Never let a slow worker build an unbounded input backlog.
    if (session.process.stdin.writableLength > 90000) return json({ accepted: false });
    session.process.stdin.write(JSON.stringify({ pcm: body.pcm }) + '\n');
    return json({ accepted: true });
  }
  if (body.action !== 'poll') return json({ error: '无效操作' }, 400);
  session.touched = Date.now();
  return json({ status: session.status, en: session.en, mode: session.mode, updated: session.updated, seq: session.seq, error: session.error, processing: session.processing });
}
