"""Fetch pinned Kokoro ONNX assets once; never stores user voice references."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'
ROOT = Path(__file__).resolve().parent / 'models' / 'kokoro'
MODEL_HASH = 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478'

def main():
    for name in ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']:
        target = ROOT / name
        if target.exists() and (not name.endswith('.onnx') or hashlib.sha256(target.read_bytes()).hexdigest() == MODEL_HASH):
            print('Verified existing '+name, flush=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_suffix(target.suffix+'.partial')
        url = f'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/{REVISION}/{name}'
        with urlopen(url, timeout=90) as response, temp.open('wb') as out:
            while chunk := response.read(1024*1024):
                out.write(chunk)
        if name.endswith('.onnx') and hashlib.sha256(temp.read_bytes()).hexdigest() != MODEL_HASH:
            raise RuntimeError('Downloaded model hash mismatch')
        temp.replace(target)
        print('Downloaded '+name, flush=True)

if __name__ == '__main__':
    main()
