# Voice One clarity tuning

This repair keeps the selected Voice One identity and improves delivery. Spruce is
a qualitative clarity reference only: no Spruce audio, embedding, pitch target or
measured fingerprint was supplied or copied.

## Browser delivery repair

- Sentence/clause boundaries replace unconditional 18/24-word cuts, while keeping
  the 180-character generation budget and bounded streaming dwell.
- Prepared speech uses the same one-segment lookahead as streaming speech.
- Cancellation invalidates prefetched work; it must never play after Stop.
- Delivery and pace adjustments survive asynchronous reference preparation.
- Voice One starts at **1.22×** after the Creator requested 15% faster delivery,
  then another tempo lift during the local audition on 2026-09-30. The latest
  candidate is about 6% faster than the 1.15× second pass. Pitch is preserved.

The browser provider remains Chatterbox; its synthesis model and reference are
unchanged. Browser time stretching can affect quality and needs device audition.

## Local acoustic diagnosis

The inspected local service identifies itself as XTTS-v2 at the configured host
endpoint. That service and the browser are separate providers. Its source M4A
hash matches the original Voice One manifest, but its converted reference is
121.94 seconds at 22.05 kHz, versus the browser's selected 15-second 24 kHz clip.
This difference is observed; it does not prove the cause of robotic delivery.

The service's `voice_enhancement_engine.py` inspects and records audio quality;
it does not apply EQ, denoising, compression or mastering. Its loaded-model status
alone therefore cannot establish acoustic quality. The running service was not
modified by these auditions.

The first local XTTS audition used the hash-verified browser Voice One reference,
seed 42, native speed 1.0 and the installed XTTS model. Its measured raw true peak
was +0.04 dBTP. The Creator heard static-like word tails and requested 15% faster
delivery; the first clarity profile is consequently **not accepted**.

## Reproducible local audition

Use an existing XTTS installation and model with the proper model license. The
offline adapter verifies the reference hash and never changes a running service.

```sh
python adapters/xtts-audition.py --reference /path/to/reference.wav \
  --reference-sha256 638c88b332ecc7a21950511871c724f68f3eb566c59157e46493ee79ec55970e \
  --text-file /path/to/passage.txt --output /path/to/raw.wav
python adapters/master-audition.py /path/to/raw.wav \
  --output-dir /path/to/new-audition-directory \
  --profiles clean-warm --speed 1.22
```

The FFmpeg adapter makes fresh 48 kHz, mono, 24-bit WAVs with two-pass loudness
normalization targeting -16 LUFS and -1.5 dBTP. It measures the exported files;
the acceptance gate allows ±1 LU and true peak no higher than -1 dBTP. Resampling
does not restore information absent from the native 24 kHz synthesis.

The `clean` and `clean-strong` candidates use FFT noise reduction with smoothed
spectral gains, rumble removal, limited upper-band energy, and modest low-mid EQ.
They omit the first candidate's compressor and strong presence boost. A 1.15
tempo factor preserves pitch. The latest `clean-warm` candidate keeps stronger
noise reduction, reduces bass around 150 Hz by 2 dB, and adds 0.8 dB around
1.5 kHz at 1.22× tempo. The Creator described the second pass as very close and
requested lighter bass, warmth and more deliberately intelligent delivery;
these acoustic changes address that preference without implying a change in
reasoning intelligence. See the [FFmpeg filter reference](https://ffmpeg.org/ffmpeg-filters.html#afftdn)
for `afftdn`, `atempo` and `loudnorm` semantics.

These are tunable engineering candidates, not a claim that static has been
eliminated. Noise suppression can dull consonants or add artifacts. If tails are
generated speech artifacts, reference conditioning or a different renderer may
be necessary. Keep the raw waveform and judge words, endings, warmth, and pace.

## Acceptance and rollback

Run `npm test`, `npm run check`, and `python -m unittest discover -s tests -p
"test_*.py"` (FFmpeg/ffprobe required for acoustic tests). Audition on the actual
output device. Human approval of noise/naturalness remains a separate gate from
the measured loudness/peak tests. Formula evaluation was not executed for this
task; no authorized voice-quality-to-Formula input mapping was established.

The browser changes can be reverted as one commit. Audition tools are opt-in,
write new output paths, and refuse overwrites. Voice samples and generated speech
stay local; they are not added to this repository.
