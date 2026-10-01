"""Optional worker in an existing licensed Coqui environment; newline JSON IPC.

The caller configures a reference path; no historical host paths are required.
"""
import argparse
import base64
import hashlib
import io
import json
import sys
import time
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--reference', required=True)
parser.add_argument('--sha256', required=True)
parser.add_argument('--threads', type=int, default=4)
args = parser.parse_args()
if hashlib.sha256(open(args.reference, 'rb').read()).hexdigest() != args.sha256:
    raise ValueError('Authorized clone reference hash mismatch')
import numpy as np
import torch
from TTS.api import TTS
torch.set_num_threads(max(1, min(8, args.threads)))
torch.set_num_interop_threads(1)
model = TTS(model_name='tts_models/multilingual/multi-dataset/xtts_v2', progress_bar=False, gpu=False)

def reply(data):
    print('LEEWAY_JSON:'+json.dumps(data), flush=True)

reply({'ready': True, 'engine': 'xtts-v2-cpu-4-threads'})
for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request.get('text')
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1500:
            raise ValueError('Use 1–1500 text characters')
        started = time.monotonic()
        audio = model.tts(text=text, speaker_wav=args.reference, language='en', speed=1.0)
        samples = np.asarray(audio, dtype=np.float32)
        samples = np.nan_to_num(samples)
        pcm = (np.clip(samples, -1, 1)*32767).astype('<i2').tobytes()
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(pcm)
        reply({'audioContent':base64.b64encode(output.getvalue()).decode(), 'sampleRate':24000,
               'format':'wav', 'engine':'xtts-v2-cpu-4-threads',
               'metrics':{'generationMs':(time.monotonic()-started)*1000,'audioSeconds':len(samples)/24000}})
    except Exception:
        reply({'error':'Local clone synthesis failed; check the reference and model installation.'})
