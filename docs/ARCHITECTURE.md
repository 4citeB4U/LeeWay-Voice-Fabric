# Architecture

## Authority

LeeWay Standards > Formula/Runtime governance > Voice Fabric contract > provider adapters > audio execution.

The voice system is deliberately **model-agnostic, path-agnostic, application-agnostic and provider-agnostic**. A model emits text. Voice Fabric owns segmentation, synthesis routing, playback order, interruption and voice identity.

## Browser topology

Each application imports `src/voice-sdk.js`. The SDK creates one hidden iframe pointing at this repository's `bridge.html`. The iframe runs on the Voice Fabric GitHub Pages origin and owns the Chatterbox worker, voice reference, queue and audio playback.

This is preferable to copying Chatterbox into every application because the browser can retain model/cache state under one origin.

## Low-latency illusion

The system does not claim token-synchronous speech. It uses bounded phrase streaming:

1. caller starts a stream;
2. text fragments arrive as generated;
3. the stream emits a complete clause when possible;
4. otherwise it flushes after 18 words / 180 characters;
5. after ten complete words, a 1.2 s dwell may flush unpunctuated text;
6. segment N plays while at most segment N+1 is synthesized;
7. interrupt increments the epoch and rejects stale audio.

This produces progressive speech while preserving word order and interruptibility.

## One-mouth law

Only one speech lane owns audible playback at a time. New authoritative speech may stop the previous lane, but **stopping speech does not cancel upstream reasoning**.

## Provider contract

A provider implements:
- `prepare(progress)`
- `setReference(audio)`
- `configure(options)`
- `speak(text, session)` or generation primitives consumed by the shared speech pipeline
- `stop()`
- `dispose()`
- optional `metrics()`

Provider-specific files never become Agent Lee identity.

## Candidate voice telemetry mathematics

These are engineering measurements, **not canonical Formula inputs**:

```
X_voice = [L_first, L_synth, G_playback, I_spill, Q_chars, A_seconds, RTF]
RTF = synthesis_seconds / generated_audio_seconds
```

A candidate optimization objective is to minimize latency, playback gaps, interruption spill and resource pressure subject to:

```
ordered_words = true
dropped_words = 0
stale_audio_after_interrupt = 0
voice_identity_verified = true
queue_bounded = true
```

Promotion into LeeWay Formula requires an authorized mapping and verified centralized evaluator.
