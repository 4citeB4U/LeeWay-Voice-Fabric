"""Create level-matched local auditions with FFmpeg; no pitch shifting.

Targets are engineering candidates, not measured Spruce characteristics.
Requires ffmpeg/ffprobe on PATH. Raw audio is preserved.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

PROFILES = {
    'level-matched': 'anull',
    'clear': 'highpass=f=75,equalizer=f=300:t=q:w=0.8:g=-1.5,'
             'equalizer=f=3000:t=q:w=0.8:g=1.5,'
             'acompressor=threshold=0.125:ratio=2:attack=25:release=110:makeup=1',
    'warm': 'highpass=f=70,equalizer=f=300:t=q:w=0.8:g=-0.75,'
            'equalizer=f=2800:t=q:w=0.8:g=0.75',
    'clean': 'highpass=f=75,afftdn=nr=12:nf=-40:tn=1:gs=8,'
             'lowpass=f=9500,equalizer=f=300:t=q:w=0.8:g=-1,'
             'equalizer=f=2800:t=q:w=0.8:g=0.75',
    'clean-strong': 'highpass=f=75,afftdn=nr=18:nf=-35:tn=1:gs=12,'
                    'lowpass=f=8500,equalizer=f=300:t=q:w=0.8:g=-1',
    'clean-warm': 'highpass=f=85,afftdn=nr=18:nf=-35:tn=1:gs=12,'
                  'lowpass=f=9000,bass=g=-2:f=150:w=0.6,'
                  'equalizer=f=350:t=q:w=0.8:g=-0.5,'
                  'equalizer=f=1500:t=q:w=0.8:g=0.8',
}


def run(command):
    return subprocess.run(command, check=True, capture_output=True, text=True)


def measure(path, filters='anull'):
    result = run(['ffmpeg', '-nostdin', '-hide_banner', '-i', str(path), '-af',
                  filters + ',loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
                  '-f', 'null', '-'])
    blocks = re.findall(r'\{[^{}]+"input_i"[^{}]+\}', result.stderr)
    if not blocks:
        raise RuntimeError('FFmpeg did not return loudness measurements')
    values = json.loads(blocks[-1])
    if not all(math.isfinite(float(values[k])) for k in
               ('input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset')):
        raise ValueError('Silent or non-finite audio cannot be mastered')
    return values


def master(source, destination, profile, speed=1.0):
    if destination.exists():
        raise FileExistsError(destination)
    if not math.isfinite(speed) or not 0.85 <= speed <= 1.3:
        raise ValueError('Audition speed must be between 0.85 and 1.30')
    filters = PROFILES[profile] + (f',atempo={speed}' if speed != 1 else '')
    before = measure(source, filters)
    norm = ('loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:'
            f'measured_I={before["input_i"]}:measured_TP={before["input_tp"]}:'
            f'measured_LRA={before["input_lra"]}:measured_thresh={before["input_thresh"]}:'
            f'offset={before["target_offset"]}')
    run(['ffmpeg', '-nostdin', '-hide_banner', '-n', '-i', str(source), '-af',
         filters + ',' + norm, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le',
         str(destination)])
    after = measure(destination)
    passed = abs(float(after['input_i']) + 16) <= 1 and float(after['input_tp']) <= -1
    return dict(profile=profile, speed=speed, filters=filters, measured=after,
                loudnessAndPeakGate='PASS' if passed else 'FAIL',
                audioSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                naturalness='PENDING_HUMAN_AUDITION')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--profiles', nargs='+', choices=list(PROFILES),
                        default=['level-matched', 'clear', 'warm'])
    parser.add_argument('--speed', type=float, default=1.0)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if not math.isfinite(args.speed) or not 0.85 <= args.speed <= 1.3:
        parser.error('speed must be between 0.85 and 1.30')
    paths = [args.output_dir / (name + '.wav') for name in args.profiles]
    if any(p.exists() for p in paths) or (args.output_dir / 'measurements.json').exists():
        raise FileExistsError('Use a fresh output directory to preserve auditions')
    receipt = dict(schema='leeway.clarity-audition/v1',
                   sourceSha256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
                   sourceMeasurement=measure(args.input),
                   targetProvenance='Engineering starting targets; not measured Spruce',
                   outputs=[master(args.input, p, name, args.speed)
                            for name, p in zip(args.profiles, paths)])
    (args.output_dir / 'measurements.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt, indent=2))
    if any(p['loudnessAndPeakGate'] != 'PASS' for p in receipt['outputs']):
        raise SystemExit('Output failed measured loudness/peak gate; do not promote')


if __name__ == '__main__':
    main()
