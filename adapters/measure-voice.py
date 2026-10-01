#!/usr/bin/env python3
"""Measure PCM16 mono 24 kHz WAVs as 16 x 6 physical signal rows.

This is a new acoustic-input adapter with unit verification only. It is not a
calibrated quality score, latency model, architecture evaluation or naturalness
assessment. Formula may summarize these physical observations; interpreting its
output as one of those verdicts would require an independently validated mapping.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

WINDOW_COUNT = 16
METRICS = [
    {"name": "rms", "unit": "fraction_of_full_scale", "definition": "sqrt(mean((sample/32768)^2))"},
    {"name": "absolute_peak", "unit": "fraction_of_full_scale", "definition": "max(abs(sample/32768))"},
    {"name": "absolute_dc", "unit": "fraction_of_full_scale", "definition": "abs(mean(sample/32768))"},
    {"name": "zero_crossing_fraction", "unit": "fraction_of_adjacent_pairs", "definition": "count((sample[i]<0)!=(sample[i-1]<0))/(N-1); zero is nonnegative; N=1 yields 0"},
    {"name": "clipping_fraction", "unit": "fraction_of_samples", "definition": "count(sample == -32768 or sample == 32767)/N; measures rail occupancy, not proof of upstream clipping"},
    {"name": "non_finite_fraction", "unit": "fraction_of_samples", "definition": "count(not finite(sample/32768))/N; valid integer PCM16 is always finite"},
]


def measure_window(samples):
    if not samples:
        raise ValueError("An acoustic window cannot be empty.")
    if any(not isinstance(x, int) or not -32768 <= x <= 32767 for x in samples):
        raise ValueError("Samples must be signed PCM16 integers.")
    values = [x / 32768.0 for x in samples]
    count = len(samples)
    return [
        math.sqrt(math.fsum(v * v for v in values) / count),
        max(abs(v) for v in values),
        abs(math.fsum(values) / count),
        sum((a < 0) != (b < 0) for a, b in zip(samples, samples[1:])) / (count - 1) if count > 1 else 0.0,
        sum(x in (-32768, 32767) for x in samples) / count,
        sum(not math.isfinite(v) for v in values) / count,
    ]


def measure_wav(path, display_path=None):
    path = Path(path)
    raw = path.read_bytes()
    # Hash and decode the same bytes, even if the input file changes later.
    import io
    with wave.open(io.BytesIO(raw), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 24000, "NONE"):
            raise ValueError(f"{path.name}: expected uncompressed PCM16 mono 24000 Hz.")
        frame_count = wav.getnframes()
        if frame_count < WINDOW_COUNT:
            raise ValueError(f"{path.name}: need at least {WINDOW_COUNT} samples.")
        pcm = wav.readframes(frame_count)
    if len(pcm) != frame_count * 2:
        raise ValueError(f"{path.name}: truncated PCM data.")
    samples = array.array("h")
    samples.frombytes(pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    # Boundaries divide duration evenly to sample precision; all frames used once.
    boundaries = [i * frame_count // WINDOW_COUNT for i in range(WINDOW_COUNT + 1)]
    rows = [measure_window(samples[a:b]) for a, b in zip(boundaries, boundaries[1:])]
    return {
        "source": str(display_path if display_path is not None else path),
        "audioSha256": hashlib.sha256(raw).hexdigest(),
        "sampleRate": 24000, "channels": 1, "sampleFormat": "PCM16_LE",
        "frameCount": frame_count, "durationSeconds": frame_count / 24000,
        "windowFrameBoundaries": boundaries,
        "request": {"adapterId": "runtime-state-v1", "input": {"stateRows": rows, "ranges": [[0, 1] for _ in METRICS]}},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("voices/kokoro-previews"))
    parser.add_argument("--output", type=Path, default=Path("work/acoustic-formula-inputs.json"))
    args = parser.parse_args()
    files = sorted(args.input_dir.glob("*.wav"))
    if not files:
        parser.error("No WAV files found in input directory.")
    result = {
        "schema": "leeway.acoustic-measurement.v1",
        "verificationScope": "New acoustic adapter; unit and known-signal verification only. No naturalness, quality, architecture or latency calibration.",
        "mappingDefinition": {
            "windowCount": WINDOW_COUNT,
            "windowing": "Equal duration at sample precision: floor(i*frameCount/16). Adjacent windows may differ by one sample. Crossing pairs at window boundaries are excluded.",
            "dimensions": METRICS,
            "ranges": [[0, 1] for _ in METRICS],
            "meaning": "Dimensionless physical signal measurements. Zero-valued finite fraction follows PCM16 encoding, not a fabricated missing-data substitute.",
        },
        "audio": [measure_wav(path, path.as_posix()) for path in files],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Measured {len(files)} WAV files; saved {args.output}.")


if __name__ == "__main__":
    main()
