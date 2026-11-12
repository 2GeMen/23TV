/** Same audio the viewer hears; no microphone and no second live-stream connection. */
type Tap = { context: AudioContext; source: MediaElementAudioSourceNode; resume: () => void };
const taps = new WeakMap<HTMLVideoElement, Tap>();
export function preparePlayerAudio(video: HTMLVideoElement): Tap | null {
  // Native HLS on iOS does not reliably expose its decoded audio to Web Audio.
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios || !window.AudioContext) return null;
  const current = video.currentSrc;
  if (current && !current.startsWith('blob:') && new URL(current, location.href).origin !== location.origin) return null;
  let tap = taps.get(video);
  if (!tap) {
    const context = new AudioContext();
    try {
      const source = context.createMediaElementSource(video);
      source.connect(context.destination); // Keep normal playback audible even when captions are off.
      const resume = () => { void context.resume().catch(() => {}); };
      tap = { context, source, resume };
      video.addEventListener('playing', resume);
      taps.set(video, tap);
    } catch { void context.close(); return null; }
  }
  tap.resume(); // Invoked from the caption-button user gesture.
  return tap;
}
export function releasePlayerAudio(video: HTMLVideoElement) {
  const tap = taps.get(video);
  if (!tap) return;
  video.removeEventListener('playing', tap.resume);
  tap.source.disconnect();
  void tap.context.close();
  taps.delete(video);
}
export function capturePlayerAudio(video: HTMLVideoElement, onFrame: (pcm: string, rms: number) => void): () => void {
  const tap = taps.get(video);
  if (!tap) throw new Error('播放器音轨不可用');
  // ScriptProcessor works over family-LAN HTTP; AudioWorklet requires a secure context.
  const processor = tap.context.createScriptProcessor(4096, 1, 1);
  const silent = tap.context.createGain(); silent.gain.value = 0;
  tap.source.connect(processor); processor.connect(silent); silent.connect(tap.context.destination);
  let phase = 0, sum = 0, count = 0;
  const ratio = tap.context.sampleRate / 16000;
  let samples: number[] = [];
  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0);
    for (const value of input) {
      sum += value; count++; phase++;
      if (phase >= ratio) {
        const sample = Math.max(-1, Math.min(1, sum / count));
        samples.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
        phase -= ratio; sum = 0; count = 0;
      }
    }
    if (samples.length >= 12800) { // ~0.8s, not a complete sentence.
      const pcm = new Int16Array(samples);
      const bytes = new Uint8Array(pcm.buffer);
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      const rms = Math.sqrt(samples.reduce((total, value) => total + (value / 32768) ** 2, 0) / samples.length);
      samples = [];
      onFrame(btoa(binary), rms);
    }
  };
  let detached = false;
  return () => {
    if (detached) return; detached = true;
    processor.onaudioprocess = null;
    try { tap.source.disconnect(processor); } catch { /* Player may already have been destroyed. */ }
    processor.disconnect(); silent.disconnect(); samples = [];
  };
}
