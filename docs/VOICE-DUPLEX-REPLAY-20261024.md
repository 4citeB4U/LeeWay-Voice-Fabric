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
