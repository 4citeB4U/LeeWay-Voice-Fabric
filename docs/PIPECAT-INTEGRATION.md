# Pipecat-style realtime voice integration

This repository keeps LeeWay Voice Fabric as the authority for voice identity,
synthesis, playback and cancellation. The realtime session layer borrows the
useful mechanics from Pipecat without importing Pipecat or moving LeeWay's
voice authority into a framework-owned provider.

## Release status and acceptance gates

This is an **experimental source candidate**, not a released live Agent Lee
conversation. A feature-branch push does not update GitHub Pages, which currently
publishes `main`. No new module is imported by the existing production Studio.

Required progression:

1. Repair cancellation/queue/lifecycle defects and independently retest the
   adversarial cases, not only the original happy-path tests.
2. Qualify Edge RTC capture and real dictation with microphone permission,
   observable PCM frames, revised/final transcript evidence, and stop/restart.
3. Connect the governed conversation path and the selected Voice Fabric output;
   measure response timing, interruption spill and what actually reached playout.
4. Promote the reviewed changes and verify the deployed Pages URLs and browser
   behavior. Source publication and successful unit tests are not this gate.

The separate Web Speech recognizer does **not** prove that captured Edge RTC PCM
was transcribed, and a dictation display does not provide Agent Lee reasoning or
speech output. Keep the existing live-integration hold until its prerequisites
are satisfied. No Formula task evaluation, production Veritas receipt or
Learning Ledger update is claimed by this candidate.

## First gate

`src/realtime-voice-session.mjs` establishes the first integration boundary:

- `RealtimeVoiceSession` is the sole owner of a conversational session.
- Frames have explicit direction, class, sequence, epoch and interruption semantics.
- System frames have their own bounded priority lane and are processed ahead of queued data/control work.
- A saturated ordinary queue cannot reject an interruption; stale interruptible work is evicted when the generation changes.
- Protected user-input frames have a separate bounded lane, so assistant backlog cannot consume their capacity.
- Interruptible processors receive an `AbortSignal` and `isCurrent()` guard for in-flight cancellation.
- The ordinary queue is bounded so a producer cannot grow memory without limit.
- A session accepts one input owner at a time.
- `TranscriptReducer` replaces partial revisions and commits each final segment once; late or duplicate revisions are ignored.
- `audio.input` and `transcript.final` are protected from cancellation.
- Assistant deltas remain interruptible so a later Voice Fabric processor can stop and invalidate stale output.

The first gate deliberately does not replace the existing Voice Fabric speech
pipeline. It gives Edge RTC, a future local VAD/ASR adapter, Runtime Fabric and
Voice Fabric a stable frame boundary to connect to.

## Frame flow

```text
Edge RTC / fixture
  -> `createEdgeRtcAudioInput` -> audio.input
  -> VAD + ASR adapter
  -> transcript.partial / transcript.final
  -> turn manager
  -> Runtime Fabric adapter
  -> agent.text.delta / agent.text.final
  -> Voice Fabric streamStart / streamChunk / streamEnd
```

An accepted barge-in emits one `interruption` system frame. The future
interruption processor should cancel agent work and stop Voice Fabric output,
while leaving incoming audio and committed user transcript state intact. The
session now invalidates stale assistant frames immediately and exposes the
abort signal needed for a provider to stop in-flight work.

## Edge RTC capture boundary

`src/edge-rtc-audio-adapter.mjs` is the host-neutral bridge for the existing
Edge RTC `AudioCapture` contract. The host supplies its `AudioCapture` class;
the bridge claims the session's input owner, starts/stops capture, and emits
protected `audio.input` frames containing PCM, sample rate and channel count.
It does not create a second session input owner or start Runtime Fabric. The
temporary browser SpeechRecognition path may have its own browser capture
behavior; a future local ASR processor should consume the PCM lane directly.

`bindSpeechRecognitionToSession` is the separate browser-ASR boundary. It turns
revision-aware Web Speech-compatible results into `transcript.partial` and
`transcript.final` frames. That keeps dictation observable in the session while
leaving governed response generation and Voice Fabric output outside this gate.

## Pipecat boundary

Pipecat's current source uses a three-tier processor queue with system frames
ahead of ordinary frames, explicit interim/final transcription types, and
pipeline-wide interruption frames. LeeWay adopts those architectural ideas as
portable contracts. It does not claim Pipecat runtime execution, Pipecat
provider compatibility, or a live governed Agent Lee turn from this first gate.
