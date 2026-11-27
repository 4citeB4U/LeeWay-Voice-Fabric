# LeeWay Voice Fabric

[Open the live Voice Studio](https://4citeb4u.github.io/LeeWay-Voice-Fabric/) — the homepage includes all profiles and the tuning console.

**Canonical purpose:** one governed voice boundary for the LeeWay ecosystem.

LeeWay Voice Fabric separates **what produces words** from **how Agent Lee speaks them**. LLMs, SLMs, deterministic runtimes, Codex-style read-aloud adapters, browser apps, device runtimes and future providers all call the same voice contract.

## Invariants

- Voice identity is independent of the reasoning model.
- The default Agent Lee identity is **Voice One**.
- Callers may stream partial text; they do not own speech synthesis.
- Stop/mute cancels voice work without canceling the caller's reasoning job.
- Speech order is preserved; stale queued speech is discarded after interruption.
- No caller embeds a divergent copy of the canonical voice logic.
- Provider choice is replaceable: Chatterbox is a provider, not the authority.
- Formula/Runtime Fabric integrations consume this service through contracts; this repository does not invent Formula states.

## Voice Studio

Open `studio.html` for the Creator's **3D Spatial Audio Studio**: an audio-reactive orb, independent microphone and voice spectra, actual listening gain/reverb/pan, runtime/device controls, the complete voice library, acoustic and synthesis racks, portable packages and tuned WAV export. Speak / Stream plays bounded synthesized clauses as they become ready; Interrupt invalidates pending audio and stops the listening mix.

The existing catalog includes 28 distinct English Kokoro speakers (13 male, 15 female), Agent Lee's reference clone and optional hosted account voices. Model preparation and hosted calls remain explicit actions. The shared Agent Lee panel publishes admitted speakers and acoustic tuning through the existing employee binding with owner session/CSRF protection, revision checks and readback. Local audition settings do not silently change the shared voice.

Start `python adapters/start-studio.py --setup` (Python 3.10+ and Node.js), then open `http://127.0.0.1:8877/studio.html`. Subsequent launches omit `--setup`. See the [spatial Studio control map and verification scope](docs/spatial-voice-studio.md), [shared publication contract](docs/shared-voice-publication.md), [local runtime setup](docs/local-studio-runtime.md) and [existing tuning guide](docs/voice-studio.md). Static hosting supports bundled previews and the optional browser engine; shared publication and local engines require their configured existing runtime. Installed phone bundles require their own asset/package update.


## Public browser surface

The experimental Pipecat-inspired session and Edge RTC adapter are documented in
[the realtime integration status](docs/PIPECAT-INTEGRATION.md). Publishing that
source is not a live-conversation release: microphone dictation, governed
responses and full-duplex interruption require their own acceptance evidence.

GitHub Pages hosts:
- `index.html` — the same full spatial Studio as `studio.html`.
- `bridge.html` â€” hidden same-origin runtime used by the SDK.
- `src/voice-sdk.js` â€” tiny client used by any web application.
- `src/bridge-runtime.js` â€” message boundary and voice-session owner.

The iframe bridge keeps the heavy browser voice provider on one GitHub Pages origin, so compatible browsers can reuse that origin's cached model assets instead of each LeeWay application owning its own voice stack.

## Streaming speech

The recovered LeeWay pipeline speaks complete clauses as text arrives, uses an 18-word / 180-character fallback, a 1.2-second dwell after ten complete words, bounds text backlog at 12,000 characters, and pre-synthesizes at most one following segment during playback. Interruption invalidates queued and prefetched speech.

## Default voice authority

The default reference is the user-selected **Agent Voice One**. Its provenance manifest is in `voices/agent-lee-reference.json`. The corresponding WAV is copied from the verified RapidWebDev source artifact; verify its SHA-256 before promotion.

## Runtime boundary

```
text producer
   |
   v
LeeWay Voice SDK
   |
   v
GitHub Pages bridge origin
   |
   +--> provider router
          +--> browser Chatterbox
          +--> prepared audio
          +--> Runtime Fabric / native provider adapter
   |
   v
one-mouth speech queue -> audio
```

## Formula boundary

Voice telemetry may be measured here, but canonical Formula evaluation remains external. Consumers must call the centralized Formula authority with an authorized mapping/version. If no verified evaluator is available:

`FORMULA EVALUATION = NOT EXECUTED`

## Evidence carried forward

Source recovery used:
- `4citeB4U/RapidWebDev` â€” Voice One browser Chatterbox, speech stream, interruption and qualification.
- `4citeB4U/LeeWay-Agent-Skills` â€” Codex read-aloud stop/mute/resume contract.
- `4citeB4U/Leeway-formula-live` â€” centralized Formula consumer rule.

This repository is a consolidation boundary. Existing applications remain unchanged until adapters are individually migrated and verified.


### Android installed English provider

The Fabric registry also contains `android-installed-english` (`android-tts`,
`HOST_ADAPTER`). Its Android API catalog marks `adapterAvailable` only when the
host exposes `LeeWayPocketEnglish`; other hosts cannot select this adapter.
Pocket invokes the same Fabric `list/get/select/prepare/speak/stop` contract for
this provider and Chatterbox profiles. Preparation reports the actual installed
engine, voice and English locale. It does not claim a cloned Voice One identity.
There is no automatic switch between providers after a failure. The Android
adapter accepts bounded prepared text, supports cancellation, and currently
rejects streaming. Chatterbox Natural/Calm/Lively and Voice One remain selectable;
Fabric's global default remains Voice One. Pocket's conversation preference is
the explicitly registered installed-English adapter. This provider requires an
installed English TTS engine on that Android host, not a universal platform
capability.

<!-- LEEWAY UNIVERSAL FORMULA GOVERNANCE BEGIN -->

# LeeWay Universal Formula Governance

Authority: Creator and LeeWay Standards.
Formula identity: LEEWAY-FORMULA-v1.0.

The canonical LeeWay Formula is mandatory throughout
the entire LeeWay ecosystem.

Every current and future application, capability,
agent, worker, employee, model, provider, adapter,
automation and integration inherits this requirement.

All applicable interactions, responses, decisions,
actions, revisions, executions, computations, model
inferences, resource allocations, information transfers,
memory operations, storage operations and deployments
must consume the canonical Formula through their
authorized and qualified domain contracts.

Formula availability, documentation, configuration,
health and historical results do not constitute actual
Formula consumption for a new operation.

Recover relevant authorized memory before substantive
work. Preserve identity, provenance, Formula integrity,
authorization, original receipts and verified learning.

Never invent observations, adapter mappings, mathematical
results, execution evidence or independent verification.

No application may bypass applicable Formula governance
by dispatching directly to a provider.

Every new application and capability must demonstrate
applicable Formula consumption before production admission.

Preserve the existing authority hierarchy:

Creator > Standards > Root of Trust > Runtime Fabric >
Agent Lee > Harness > Formula > skills/models/tools >
execution > Veritas > Receipt Authority > Learning Ledger.

Execute the complete engineering loop:

INVESTIGATE > DIAGNOSE > PLAN > IMPLEMENT > TEST >
VALIDATE > REPAIR > RETEST > VERIFY > EVIDENCE >
CHECKPOINT > CONTINUE.

Documentation compliance does not establish executable
enforcement or production admission.

<!-- LEEWAY UNIVERSAL FORMULA GOVERNANCE END -->
