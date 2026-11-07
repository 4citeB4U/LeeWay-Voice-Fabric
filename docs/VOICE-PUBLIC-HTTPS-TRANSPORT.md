# LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.HTTPS.TRANSPORT
TAG: VOICE_ONLY_AUTHENTICATED_DEVICE_BRIDGE
WHO: LeeWay Industries; WHAT: public Voice Fabric transport adapter; WHY: avoid loopback assumptions on GitHub Pages; WHERE: Studio; WHEN: 2026-10-24; HOW: opt-in browser recognition then HTTPS owner session; AUTHORITY: authenticated voice only; LICENSE: existing terms.

# Public Voice Fabric — HTTPS conversation contract

This is the browser client contract for the existing Device Bridge Voice Gateway. A client implementation is not proof that the HTTPS service is deployed, reachable, paired, or production-qualified. No GPU model is activated by this client. A generic device-control relay must not be repurposed for microphone text.

A separately reviewed LeeWay Device Bridge HTTPS host must provide the following browser-session endpoints over TLS with an authenticated, secure, HttpOnly browser session and origin-restricted credentialed CORS for `https://4citeb4u.github.io`:

- `GET /v1/voice/session`: `{"schema":"leeway.voice.session.v1","authenticated":true,"authority":"LEEWAY_DEVICE_BRIDGE_VOICE"}`. No tokens or private keys are sent to the browser.
- `POST /v1/voice/turn`: accept only `schema: leeway.voice.turn.v1`, a final transcript, `allowDeviceActions:false`, `source: LEEWAY_EDGE_RTC`, `transcriptSource: LEEWAY_EDGE_GPU_ASR`, `inferenceRoute: LEEWAY_EDGE_GPU`, `inferenceAuthority: LEEWAY_EDGE_GPU_ONLY`, `storageAuthority: LEEWAY_CONTINUUM_ONLY`, owner device and segment IDs, capture timestamps, audio record ID, and the audio SHA-256. Require session authentication, exact origin/CSRF protection, bounded request/rate limits, and read-only Machine Consciousness routing. The result must identify `Agent Lee`, `LEEWAY_MACHINE_CONSCIOUSNESS`, Voice Fabric audio, and the hash-read-back Continuum record. Gateway evidence is not an independent Veritas PASS; its current response uses `veritasStatus: NOT_ASSERTED`.
- `POST /v1/voice/interrupt`: accept only an interruption event tied to Edge RTC, LeeWay GPU ASR, LeeWay GPU inference authority, Continuum storage authority, owner device, and segment identity. The result must return a verified interruption epoch and stale-output guard.
- `POST /v1/voice/synthesize`: require Agent Lee identity, the selected Voice Fabric package, session/CSRF, and a response bound to the selected voice revision. The request may not silently select another provider.

Deploy/qualify the service and its authentication independently first. Then set `<meta name="leeway-voice-api-origin" content="https://YOUR-APPROVED-VOICE-HOST/">` in both `index.html` and `studio.html` through a reviewed deployment, replacing the intentionally empty default. The Studio never accepts localhost or a GitHub Pages origin as its API. No credential is embedded in static HTML.

The connect button remains disabled until this configuration exists. The public Studio does not use browser speech recognition or an unverified model fallback for production conversation. Microphone capture remains closed until a LeeWay GPU ASR adapter is bound and can provide the required hash-bound capture evidence. The HTTPS client rejects plain text, browser-ASR provenance, non-GPU inference, and non-Continuum storage claims before sending a turn. Gateway-validated Agent Lee audio is played by Studio's existing audio owner; successful software playback does not prove physical audibility.

## Verification

`node --test tests/studio-https-voice-client.test.mjs`

`node tests/public-dictation-browser.mjs`

`npm run test:browser`

Production acceptance: authenticated live HTTPS session; origin/CORS and CSRF negative checks; a real microphone capture processed by LeeWay GPU ASR; hash-bound Continuum evidence; authenticated Agent Lee turn; selected Voice Fabric audio playout; human spoken barge-in advancing the interruption epoch; stale-output rejection; independent Veritas and canonical Continuum receipt readback. Phone/PC parity is a separate platform acceptance gate.

## 2026-11-07 integration audit

The prior client sent only `{mode,text,allowDeviceActions}` and expected `veritasStatus: PASS`; those fields did not match the current Device Bridge Voice Gateway contract. The client now requires GPU-ASR/Continuum capture evidence, validates Agent Lee and Voice Fabric output, uses the Gateway's `NOT_ASSERTED` Veritas state truthfully, binds synthesis to `agent-lee`, and exposes a provenance-bound interruption call. The public Studio still has no qualified LeeWay GPU ASR producer, so it fails closed before opening its microphone. This source correction does not qualify the live gateway or C3.
