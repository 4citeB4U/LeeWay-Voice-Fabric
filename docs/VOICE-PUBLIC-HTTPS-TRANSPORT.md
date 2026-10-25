# LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.HTTPS.TRANSPORT
TAG: VOICE_ONLY_AUTHENTICATED_DEVICE_BRIDGE
WHO: LeeWay Industries; WHAT: public Voice Fabric transport adapter; WHY: avoid loopback assumptions on GitHub Pages; WHERE: Studio; WHEN: 2026-10-24; HOW: opt-in browser recognition then HTTPS owner session; AUTHORITY: authenticated voice only; LICENSE: existing terms.

# Public Voice Fabric — HTTPS conversation contract

This is **client-side connection preparation**, not a running remote service. No LeeWay GPU files or grants are touched. The current Device Bridge relay gateway supports device capability discovery and does **not** expose a qualified remote voice-turn endpoint. A generic device control relay must not be repurposed for microphone text.

A separately reviewed LeeWay Device Bridge HTTPS host must provide the following browser-session endpoints over TLS with an authenticated, secure, HttpOnly browser session and origin-restricted credentialed CORS for `https://4citeb4u.github.io`:

- `GET /v1/voice/session`: `{"schema":"leeway.voice.session.v1","authenticated":true,"authority":"LEEWAY_DEVICE_BRIDGE_VOICE"}`. No tokens or private keys are sent to the browser.
- `POST /v1/voice/turn`: accept only `{"schema":"leeway.voice.turn.v1","final":true,"mode":"machine","text":"...","allowDeviceActions":false}` with session authentication, origin/CSRF protection, request size and rate limits, and read-only Machine Consciousness routing. Response must be `{"schema":"leeway.voice.turn-result.v1","source":"LEEWAY_MACHINE_CONSCIOUSNESS","verified":true,"veritasStatus":"PASS","text":"..."}` with request/receipt identifiers. For an explicit local Qwen model request (`mode: "llm"`), the authenticated backend may instead return `source: "OLLAMA_QWEN35_4B"`, `status: "GENERATED_NOT_VERITAS_VERIFIED"`, `verified: false`, `gpuInferenceVerified: false`, and the text. This optional provider is not a verified Machine Consciousness answer or a LeeWay GPU execution claim. Claims must come from the qualified backend evidence, not self-asserted test data.

Deploy/qualify the service and its authentication independently first. Then set `<meta name="leeway-voice-api-origin" content="https://YOUR-APPROVED-VOICE-HOST/">` in both `index.html` and `studio.html` through a reviewed deployment, replacing the intentionally empty default. The Studio never accepts localhost or a GitHub Pages origin as its API. No credential is embedded in static HTML.

The connect button remains disabled until this configuration exists. Browser dictation still functions offline from this connection (although browser recognition may itself require a vendor network service). Only **final** recognized text is sent after explicit Connect succeeds. Verified response text is placed in Studio's existing `speechText` field; audio playout and speaking-sphere motion require a separately qualified voice playout channel and are *not* claimed by this adapter.

## Verification

`node --test tests/studio-https-voice-client.test.mjs`

`node tests/public-dictation-browser.mjs`

`npm run test:browser`

Production acceptance: authenticated live HTTPS session, origin/CORS and CSRF rejection, real consented microphone transcript → read-only LeeWay answer → Kokoro voice stream → same sphere playback telemetry, and phone/PC parity.
