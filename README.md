# LeeWay Voice Fabric

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

## Public browser surface

GitHub Pages hosts:
- `index.html` — voice lab: type, listen, change delivery/pace, and load an owned reference clip.
- `bridge.html` — hidden same-origin runtime used by the SDK.
- `src/voice-sdk.js` — tiny client used by any web application.
- `src/bridge-runtime.js` — message boundary and voice-session owner.

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
- `4citeB4U/RapidWebDev` — Voice One browser Chatterbox, speech stream, interruption and qualification.
- `4citeB4U/LeeWay-Agent-Skills` — Codex read-aloud stop/mute/resume contract.
- `4citeB4U/Leeway-formula-live` — centralized Formula consumer rule.

This repository is a consolidation boundary. Existing applications remain unchanged until adapters are individually migrated and verified.
