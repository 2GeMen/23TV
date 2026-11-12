'use client';
import { useEffect, useRef, useState } from 'react';
import { capturePlayerAudio, preparePlayerAudio } from '@/lib/player-audio-tap';

type Caption = { status: string; en?: string; mode?: string; updated?: number; error?: string };
const call = async (body: object, keepalive = false) => {
  const res = await fetch('/api/live/captions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-23TV-Captions': '1' }, body: JSON.stringify(body), keepalive });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '字幕服务不可用');
  return data;
};
export function LiveCaptions({ url, video }: { url: string; video: HTMLVideoElement }) {
  const [enabled, setEnabled] = useState(false);
  const modeRef = useRef<'browser' | 'server'>('server');
  const [caption, setCaption] = useState<Caption>({ status: 'off' });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, id = '', uploading = false;
    let timer: ReturnType<typeof setTimeout>;
    let detachAudio = () => {};
    let mode = modeRef.current;
    let lastSignal = Date.now();
    const stop = () => { detachAudio(); if (id) void call({ action: 'stop', id }, true).catch(() => {}); };
    const poll = async () => {
      if (disposed) return;
      try {
        // Some browsers expose only zeroes for native/protected video audio. Fall back visibly.
        if (mode === 'browser' && Date.now() - lastSignal > 10000) {
          detachAudio();
          await call({ action: 'stop', id });
          if (disposed) return;
          mode = 'server';
          const started = await call({ action: 'start', url, mode });
          id = started.id;
          if (disposed) { stop(); return; }
        }
        const data = await call({ action: 'poll', id });
        if (!disposed) { setCaption(data); setNow(Date.now()); }
        if (data.status === 'error') { stop(); return; }
      } catch (err) {
        if (!disposed) setCaption({ status: 'error', error: (err as Error).message });
        stop(); return;
      }
      if (!disposed) timer = setTimeout(poll, 250);
    };
    setCaption({ status: 'loading', mode });
    void call({ action: 'start', url, mode }).then(data => {
      id = data.id;
      if (disposed) { stop(); return; }
      if (mode === 'browser') {
        detachAudio = capturePlayerAudio(video, (pcm, rms) => {
          if (rms > 0.002) lastSignal = Date.now();
          if (disposed || uploading) return; // Drop stale work instead of queueing it.
          uploading = true;
          void call({ action: 'audio', id, pcm }).catch(err => {
            if (!disposed) setCaption({ status: 'error', error: err.message });
          }).finally(() => { uploading = false; });
        });
      }
      void poll();
    }).catch(err => { if (!disposed) { setCaption({ status: 'error', error: err.message }); stop(); } });
    const onHide = () => { if (document.hidden) { stop(); setEnabled(false); } };
    const onPause = () => { stop(); setEnabled(false); };
    video.addEventListener('pause', onPause);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', onHide);
    return () => { video.removeEventListener('pause', onPause); disposed = true; clearTimeout(timer); stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', onHide); };
  }, [enabled, url, video]);
  const fresh = caption.updated && now - caption.updated < 5000;
  return <>
    <button type="button" aria-pressed={enabled} onClick={event => {
      event.stopPropagation();
      if (enabled) { setEnabled(false); return; }
      modeRef.current = preparePlayerAudio(video) ? 'browser' : 'server';
      void video.play().then(() => setEnabled(true)).catch(() => setCaption({ status: 'error', error: '请先播放直播，再开启字幕' }));
    }} title="本地英语流式字幕，文字随识别结果修订；不做中文翻译。iPhone 使用兼容模式，延迟可能较高。暂停或离开页面后停止。系统全屏／AirPlay 不显示网页叠层。"
      className="absolute right-3 top-12 z-30 rounded-lg bg-black/70 px-3 py-2 text-xs text-white hover:bg-black/90">
      {enabled ? '英文字幕：开' : '英文字幕：关'}
    </button>
    {enabled && <div aria-live="off" className="absolute bottom-16 left-0 right-0 z-20 pointer-events-none px-4 text-center" style={{ textShadow: '0 1px 3px #000' }}>
      {caption.status === 'error' ? <span className="inline-block rounded bg-black/75 px-3 py-2 text-sm text-amber-200">{caption.error}</span>
        : fresh && caption.en ? <div className="mx-auto w-fit max-w-[92%] rounded-lg bg-black/75 px-3 py-2 text-white" style={{ fontSize: 'clamp(16px, 2vw, 22px)', lineHeight: 1.45 }}>{caption.en}</div>
        : <span className="rounded bg-black/65 px-3 py-1 text-xs text-white">{caption.status === 'loading' ? '正在加载英语字幕模型…' : caption.mode === 'server' ? '正在聆听 · 兼容模式（延迟较高）' : '正在聆听 · 英文实时更新'}</span>}
    </div>}
  </>;
}
