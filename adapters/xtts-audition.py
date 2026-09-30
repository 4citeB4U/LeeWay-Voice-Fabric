"""Offline, opt-in XTTS audition. Never changes a running service or voice registry.

Requires an existing licensed XTTS installation/model. Speaker audio stays local.
"""
import argparse
import hashlib
import json
import random
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', required=True, type=Path)
    parser.add_argument('--reference-sha256', required=True)
    parser.add_argument('--text-file', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--model', default='tts_models/multilingual/multi-dataset/xtts_v2')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    digest = hashlib.sha256(args.reference.read_bytes()).hexdigest()
    if digest != args.reference_sha256.lower():
        raise ValueError('Reference hash differs from authorized reference')
    text = args.text_file.read_text(encoding='utf-8-sig').strip()
    if not text or len(text) > 1000:
        raise ValueError('Use a nonempty audition passage of at most 1000 characters')
    if args.output.exists():
        raise FileExistsError('Use a new output path to preserve previous auditions')
    import numpy as np
    import torch
    from TTS.api import TTS
    torch.set_num_threads(max(1, min(args.threads, 16)))
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    started = time.monotonic()
    model = TTS(model_name=args.model, progress_bar=False, gpu=False)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    model.tts_to_file(text=text, file_path=str(args.output),
                      speaker_wav=str(args.reference), language='en', speed=1.0)
    receipt = dict(schema='leeway.voice-audition/v1', engine='xtts-v2',
                   model=args.model, referenceSha256=digest, seed=args.seed,
                   speed=1.0, synthesisSeconds=time.monotonic()-started,
                   textSha256=hashlib.sha256(text.encode()).hexdigest(),
                   audioSha256=hashlib.sha256(args.output.read_bytes()).hexdigest(),
                   acceptance='PENDING_HUMAN_AUDITION', formula='NOT_EXECUTED')
    args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
