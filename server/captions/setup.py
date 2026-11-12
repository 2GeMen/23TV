"""Run with the dedicated venv. Download models once; runtime requires no model network access."""
import os
from pathlib import Path
root = Path(os.environ.get('CAPTION_RUNTIME_DIR', str(Path(__file__).resolve().parents[2] / '.caption-runtime'))) / 'models'
os.environ['HF_HOME'] = str(root / 'hf')
os.environ['HF_HUB_DISABLE_XET'] = '1'
from faster_whisper import WhisperModel
WhisperModel('tiny.en', device='cpu', compute_type='int8', download_root=str(root / 'whisper'), cpu_threads=2)
print('English streaming model ready', flush=True)
