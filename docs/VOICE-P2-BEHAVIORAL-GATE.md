# Voice P2: behavioral repair and live acceptance

Status: candidate on PR #12; not promoted or merged by this repair.

## Canonical implementation

`src/edge-rtc-voice-adapter.js` now both normalizes events and binds them to the existing `LeeWayBrowserVoice`. It reuses the existing speech stream, generation epoch, pending synthesis requests and active media sources. It does not create another queue, persona, reasoning runtime or provider selector.

`LeeWayVoiceClient.pause()`, `resume()` and `interrupt()` travel through the authenticated iframe bridge into this binding. Final transcripts are delivered upstream as `voice.input.final`; they are not echoed to TTS or treated as an Agent Lee answer. Incoming text is not rewritten by the adapter.

Pause retains the same HTMLAudioElement, position and generation. Stop/interruption invalidate the epoch, detach active audio, reject interrupted work and prevent late generated waveforms from playing. Resume after stop cannot replay the discarded turn.

The bridge also rejects foreign message sources/tokens, preserves a newer stream when an older stream settles, and returns failure rather than `completed:true` for failed synthesis.

## Automated reproduction

Run from the repository root:

```sh
npm run check
npm test
```

`tests/edge-rtc-voice-adapter.test.cjs` executes the production adapter, speech engine, SDK and message handler. Its deterministic media/synthesis fixtures exercise 25 behaviors including rejection paths and delayed-result races. Reading source for execution is not a source-string assertion.

`tests/rtc-browser-playback-gate.js` executes real browser playback using the versioned Voice One preview WAV. It checks nonzero audio, advancing media time, retained pause position, same-element resume, interruption, stale-epoch rejection, package stability and browser normalization. This is an audio-fixture test, not neural synthesis.

`tests/rtc-fresh-speech-gate.js` must run in the prepared lab with browser audio authorization. It executes the actual Speak handler, waits for neural synthesis and real playback, exercises the actual UI controls, and tests a fresh turn after interruption. It reports to `globalThis.__voiceP2FreshEvidence`. Its temporary wrapper only observes the existing play method; it does not replace inference or playback.

## Creator listening test

Open `lab.html` on the served candidate checkout. Confirm the page says Voice One is ready. Press Speak with the prepared text. Pause mid-sentence, wait, and Resume: it should continue rather than restart. Interrupt while speech is active; the old speech must stay silent, including after Resume. Speak a new sentence and confirm the same Agent Lee voice is retained. Export the receipt from the lab after testing.

Stop only affects speech, not a parent reasoning or work task. The test does not authorize silent production promotion.

## Evidence boundaries

Deterministic test doubles, real browser fixture playback, fresh neural speech, upstream microphone/RTC conversation and Creator hearing are separate acceptance levels. A stable package ID does not by itself establish perceived voice fidelity. Browser playback read-back is not proof that the Creator heard the speakers. No canonical Formula execution or native Veritas acceptance is claimed by these tests.

This repair qualifies the Voice Fabric output/control boundary. Microphone capture, actual Leeway Live transport, upstream Agent Lee reasoning/persona selection, physical-device execution, Android equivalence and Creator acoustic acceptance must be recorded separately before claiming complete end-to-end live conversation.

## Recorded result: 2026-10-05 Windows candidate

Evidence lives in `receipts/voice-p2-20261005/`.

- Node regression: 118 passed, 0 failed; includes 25 RTC/bridge behavioral tests and the additional first-control-gesture regression.
- Python regression: 24 passed, 0 failed. Syntax checks passed.
- Real-browser Voice One fixture: 9 checks passed.
- Actual Chatterbox/WebGPU fresh speech: 10 checks passed, including pause/resume, interruption, stable package and completed playback of a new turn after interruption.

**Live-readiness blocker:** the first 11.16-second waveform required about 98.10 seconds to become ready (14.26 seconds token phase, 83.84 seconds waveform phase). The post-interruption request required about 64.96 seconds to become ready; its measured model generation was 41.53 seconds for 5.68 seconds of audio. These measurements do not qualify responsive live conversation. Playback invalidation also does not prove immediate preemption of an in-flight GPU kernel.

The first-gesture guard was added after the recorded browser speech checks and then executed in the complete Node regression. The lab was reloaded for Creator testing. The source-hash/provenance note in `summary.json` preserves this distinction.

Promotion remains blocked pending synthesis-latency repair, actual microphone/RTC-to-Agent-Lee integration evidence, required platform acceptance and Creator listening confirmation. Do not replace these outstanding checks with the passing playback fixture or source-level claims.
