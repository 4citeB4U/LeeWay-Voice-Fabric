# LeeWay Duplex Architecture — Clean Replay Evidence

**Date:** 2026-10-24
**Source:** Voice Fabric integration branch, baseline commit f35160e
**Edge RTC pinned commit:** 0d50c4dccea1a4b2789a8718e9d57a2390f882a5
**Device Bridge pinned commit:** dd2d38a9eafaa032328889065b75b3476761d864
**Environment:** Windows, Node.js v24.15.0.

## Reproducibility readback

- Independent clean Voice Fabric Git worktree: npm run check PASS, npm test 174/174 PASS.
- Pinned Edge RTC commit retrieved directly from GitHub: 14/14 source SHA-256 checks PASS.
- Pinned Edge RTC npm ci completed on Windows after correcting Node 24 npm.cmd launcher handling.
- From the reconstructed Edge RTC checkout: conversation 5/5 PASS, shared AEC-track 3/3 PASS, dictation 4/4 PASS, TypeScript conversation check PASS.
- Device Bridge tests: voice integration 5/5 PASS; separate MCP regression 45/45 PASS, CLI regression 7/7 PASS.
- Existing active Studio at localhost:8877: duplex panel and adapter HTTP 200; Kokoro provider reports 28 voices ready. Existing studio controls were retained.
- Standalone voice browser application is available at localhost:5173.
- Device Bridge voice-status and explicit voice-start commands completed. These do not verify remote-device audio transport.

## Production exclusions

1. The audio path uses browser WebRTC echo cancellation on the SAME processed microphone track, not independently installed native AEC3. Physical speaker/microphone overlap and conversational interruption are not yet acoustically qualified.
2. The clean npm installation reported 23 dependency advisories (2 low, 5 moderate, 15 high, 1 critical). These are findings for review, not evidence of exploitation. No automatic npm audit fix was applied, because that would silently change the pinned source/dependency state.
3. Optional Qwen 3.5 4B speech generation does not replace LeeWay identity, Formula, Veritas, or authorized Machine Consciousness.
4. Device Bridge discovery and local explicit UI startup do not confer production C3 device-command authorization.
5. The assembly is a verified reproducible software candidate, NOT full production or physical-acoustic certification.

## Exact rebuild commands

From the pinned LeeWay Voice Fabric integration branch:

    npm run voice:duplex:restore
    npm run voice:duplex:verify
    npm run voice:duplex:start

For the existing Studio, preserve all previous voice controls:

    npm run voice:duplex:deploy -- "E:\LeeWay-Work\pc-consciousness-live\voice"

The deploy tool creates a local backup and fails closed on unexpected files.

## 2026-11-07 07:47 America/Chicago — Device Bridge HTTPS contract repair

**Objective:** repair the LeeWay Voice Fabric client against the canonical Device Bridge Voice Gateway so browser turns can only use an authenticated, evidence-bound LeeWay route.

**Implementation:** `src/studio-https-voice-client.mjs` now rejects plain transcripts unless they carry final Edge RTC / LeeWay GPU ASR provenance, LeeWay GPU-only inference authority, Continuum-only storage authority, owner device/segment identity, capture times, and hash-bound audio record identity. It validates Agent Lee identity, Voice Fabric audio identity, and Continuum record reference in the Gateway response. It preserves `veritasStatus: NOT_ASSERTED` rather than converting Gateway evidence into an independent Veritas PASS. It now exposes an interruption call requiring GPU/Continuum provenance and validates the returned interruption epoch. Synthesis requests bind `agentId: agent-lee` and the selected Voice Fabric package; turn and synthesis timeouts allow the Gateway's bounded long-running work.

**Public Studio behavior:** browser SpeechRecognition and unverified model fallback are no longer default production inputs. When no LeeWay GPU ASR adapter is bound, the page does not open the microphone. A future adapter must supply the required hash-bound evidence before `turn()` can submit anything. Gateway-returned Voice Fabric audio is checked against Studio's selected Kokoro identity before playback.

**Verification:** `npm run test:browser` passed. The Studio browser gate passed its 16 UI/audio-fixture checks; the public dictation browser check passed both transcript-display fixture and no-GPU-adapter/no-microphone cases; Voice HTTPS client and passwordless pairing tests passed 7/7. `npm run check` and `git diff --check` passed. These are source/browser-fixture checks; no physical mic, speaker, remote HTTPS service, production ASR, or C3 exchange was exercised.

**Current boundary:** both public Studio documents configure `https://agent-lee.tail4baa5f.ts.net:8443/`; live reachability and Gateway status have not yet been verified. The canonical Model Hub catalog lists five models and no audio/ASR model; the Edge GPU source reports do not prove a live Qwen2-Audio route. Device Bridge preflight reports GPU dispatch unbound/denied, the selected renderer unavailable, owner session not established, and no independent production C3 verifier roots. Gateway source also has no C3-proof restore/admission assignment, and Receipt Authority has no production C3 custody. No audio, user text, GPU request, voice session, production flag, or qualification claim was sent or changed by these source tests.

**Disposition:** the client/server source contract now agrees and fails closed at the actual missing provider boundary. Production conversation and full C3 remain unqualified. Next, implement or recover the LeeWay-owned GPU ASR provider and its Continuum evidence path, bind the selected Voice Fabric renderer and deployed authenticated Gateway, and connect C3 health restoration only to a canonical, independently verified Continuum/Veritas admission record. No positive qualification flag may be set until those observations exist.
