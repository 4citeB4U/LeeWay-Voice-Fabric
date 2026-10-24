# LeeWay Voice Fabric — Duplex Architecture v1

**Owner:** LeeWay Industries. **Code acceptance:** software tests pass.
**Live acoustics:** NOT VERIFIED. **Standalone native AEC3:** NOT INSTALLED.

## Component ownership

| Component | Canonical repository | Contract |
|---|---|---|
| Spatial audio Studio | LeeWay Voice Fabric | Preserve the existing 3D sphere and wave/tuning UI; show one inline live conversation workspace |
| PCM acquisition | Edge RTC src/voice/audio.ts | Single getUserMedia track with browser AEC/NS/AGC |
| Speech recognition | Voice Fabric src/edge-rtc-audio-adapter.mjs | Bind the SAME live audio track, reject default-mic fallback |
| Interrupt controller | Edge RTC src/voice/realtime-conversation.ts | Near-end VAD, echo exclusion, stop TTS and stale turns |
| Session | Voice Fabric src/realtime-voice-session.mjs | Cancellation and session identity |
| TTS | Existing Voice Fabric Kokoro | Selectable voice; Chatterbox not required |
| Language | Optional local Qwen 3.5 4B | Not LeeWay identity or authority |
| Machine Consciousness | Existing carrier | Governs native action and response, receipts distinct |
| Device Bridge | Existing CLI/MCP | Local voice discovery and explicit launch, commands still gated |

## Audio graph

Microphone -> browser WebRTC AEC -> one shared audio track -> PCM and
SpeechRecognition -> near-end candidate + non-echo text -> governed turn ->
Machine Consciousness and/or optional LLM -> Kokoro -> speaker.
Audio recognition stays open during playback on supported desktop browsers.
Output-like transcripts are filtered and must never become new user turns.
Confirmed user barge-in stops audio and cancels outdated turns.

## Recreate

1. Clone LeeWay-Voice-Fabric and LeeWay-Edge-RTC. Place Edge RTC in the
   Voice Fabric work/edge-rtc-publish directory.
2. Run node scripts/voice-duplex-lock.mjs verify (SHA-256 exact files).
3. Install existing node dependencies: npm ci inside Edge RTC.
4. Run Edge RTC check:conversation, test:conversation, check:dictation,
   test:dictation, and node --test tests/shared-aec-track.test.mjs.
5. Run Voice Fabric npm test and npm run check.
6. Start the existing local Kokoro engine, optional Ollama and the
   existing authorized Agent Lee runtime. Start Voice Fabric static
   server at 8897 and Edge RTC Vite at 5173. Set
   LEEWAY_ENABLE_CONVERSATION_FIXTURE=1 and
   LEEWAY_VOICE_FABRIC_DEV_ORIGIN=http://127.0.0.1:8897.
7. In the existing Studio, use the single **Live conversation** module below
   the original 3D sphere and click **Activate live voice test**. The sphere
   remains visible and responds to the observed conversation state. The test
   also remains available as a standalone localhost application.
8. Confirm capture evidence reports shared track and AEC enabled.
   Listen on physical speakers, test self-echo and natural interruption.
   A test pass cannot substitute for acoustic acceptance.

## Boundaries and rollback

This is a development-mode browser WebRTC AEC candidate, not proof of
native AEC3 integration, device parity or production qualification.
Mobile/unsupported browsers use fallback turn-taking. The near-end
RMS threshold is preliminary and must be acoustically tuned. Explicit
voice communication does not authorize device actions or bypass Formula
and independent Veritas. Studio microphone and live duplex microphone
must not both be activated as independent capture consumers.
Manifest drift requires review; the verifier NEVER overwrites files.

## Exact pinned restore

The source manifest records the exact Edge RTC and Device Bridge commit
identifiers. After cloning the LeeWay Voice Fabric integration branch, run:

    node scripts/voice-duplex-restore.mjs restore
    node scripts/voice-duplex-restore.mjs restore-install
    npm run voice:duplex:start

The start command serves the existing Studio and the standalone Edge RTC
conversation page from loopback where those ports are not already running.
Kokoro, Machine Consciousness, and optional Ollama are independent providers
and their readiness must be checked separately.

The first action only clones an absent Edge RTC checkout at the pinned
commit and verifies its SHA-256 lock. The second also executes npm ci.
Existing checkouts are never force-replaced. On a different OS the exact
source file digests normalize CRLF to LF for portability.

Device Bridge remains independent; use its matching integration branch and
node operator/device-bridge-cli.mjs voice-status / voice-open.

## Deploy into an existing live Studio without replacing the UI

To update an already-running canonical Studio checkout that has different
owner-specific voice/tuning changes, use an additive deployment:

    npm run voice:duplex:deploy -- "E:\LeeWay-Work\pc-consciousness-live\voice"

The command checks exact Studio anchors, takes an immutable backup under
the target's .leeway-voice-backups directory, inserts one inline live
conversation workspace beside the original sphere, and installs the scoped
adapter and CSS. Repeating the same deployment returns ALREADY_INTEGRATED.
Unexpected edits cause a fail-closed review rather than silent replacement.

The original Studio remains at http://127.0.0.1:8877/studio.html.
Its separate microphone capture and audition controls are temporarily
suppressed while the embedded test owns microphone capture, and restored
on exit. The voice sphere receives observed speaking/listening state plus
actual post-AEC microphone RMS from Edge RTC. Its speaking pulse is a
state-derived animation, NOT a measured outgoing speaker FFT. No second
microphone is opened for sphere animation.

The previous fullscreen voice-test overlay, header launcher, and duplicate
right-rack test have been removed. A single live conversation section
below the existing sphere offers the same Kokoro selector, Qwen/Machine
Consciousness routing, transcripts, evidence log and continuous listening.
When expanded on a desktop screen, the sphere and conversation occupy
adjacent columns. All original speaker library and tuning controls remain
intact and return after the live conversation stops.

Verify speaker acoustic quality and human barge-in separately before
production use. Voice Fabric Studio telemetry is not a production admission
or evidence that physical speaker output was measured.
