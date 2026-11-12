"""On-demand offline, rolling English ASR. PCM from the player or a compatibility stream."""
import os, sys, json, signal, subprocess, threading, queue, time, resource, base64, shutil
from pathlib import Path
root = Path(os.environ.get('CAPTION_RUNTIME_DIR', str(Path(__file__).resolve().parents[2] / '.caption-runtime')))
models = root / 'models'
os.environ['HF_HOME'] = str(models / 'hf')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['OMP_NUM_THREADS'] = '2'
child = None

def emit(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)

def stop(*_):
    if child is not None:
        child.terminate()
        try: child.wait(timeout=2)
        except subprocess.TimeoutExpired: child.kill()
    sys.exit(0)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
parent_pid = os.getppid()
def parent_watchdog():
    while True:
        time.sleep(2)
        if os.getppid() != parent_pid: os.kill(os.getpid(), signal.SIGTERM)
threading.Thread(target=parent_watchdog, daemon=True).start()
try:
    config = json.loads(sys.stdin.readline())
    import numpy as np
    chunks = queue.Queue(maxsize=6)
    def enqueue(data):
        if chunks.full():
            try: chunks.get_nowait()
            except queue.Empty: pass
        chunks.put_nowait(data)
    def read_audio():
        if config.get('mode') == 'browser':
            for line in sys.stdin:
                try: enqueue(base64.b64decode(json.loads(line)['pcm'], validate=True))
                except (ValueError, KeyError): continue
        else:
            while True:
                data = child.stdout.read(16000 * 2)  # One second, not six seconds.
                if not data: break
                enqueue(data)
        enqueue(None)
    if config.get('mode') != 'browser':
        ffmpeg = os.environ.get('FFMPEG_PATH') or shutil.which('ffmpeg')
        if not ffmpeg: raise RuntimeError('Install FFmpeg or set FFMPEG_PATH')
        cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1',
               '-rw_timeout', '15000000', '-headers', 'Cookie: ' + config['cookie'] + '\r\n',
               '-i', config['url'], '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1']
        child = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    threading.Thread(target=read_audio, daemon=True).start()
    from faster_whisper import WhisperModel
    model = WhisperModel('tiny.en', device='cpu', compute_type='int8', cpu_threads=2,
                         num_workers=1, download_root=str(models / 'whisper'), local_files_only=True)
    emit(status='listening')
    audio = np.zeros(0, dtype=np.float32)
    previous = ''
    while True:
        data = chunks.get(timeout=35)
        if data is None: raise RuntimeError('audio ended')
        # Catch up immediately rather than accumulating latency under load.
        while not chunks.empty():
            more = chunks.get_nowait()
            if more is None: break
            data += more
        new_audio = np.frombuffer(data, dtype='<i2').astype(np.float32) / 32768.0
        audio = np.concatenate((audio, new_audio))[-16000 * 5:]
        if len(audio) < 12000: continue
        if np.sqrt(np.mean(new_audio ** 2)) < 0.003:
            if len(new_audio) >= 16000: audio = audio[-16000:]
            continue
        started = time.monotonic()
        segments, _ = model.transcribe(audio, language='en', beam_size=1, vad_filter=False,
            condition_on_previous_text=False, no_speech_threshold=0.6, max_new_tokens=96)
        text = ' '.join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()
        if text and text != previous:
            previous = text
            emit(status='listening', en=text, processing=round(time.monotonic()-started, 3),
                 audioSeconds=round(len(audio)/16000, 2),
                 peakMB=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1048576 if sys.platform == 'darwin' else 1024), 1))
except Exception:
    import traceback
    traceback.print_exc(file=sys.stderr)
    emit(status='error', error='英语字幕处理失败，请关闭后重试或更换频道。')
finally:
    if child is not None:
        child.terminate()
        try: child.wait(timeout=2)
        except subprocess.TimeoutExpired: child.kill()
