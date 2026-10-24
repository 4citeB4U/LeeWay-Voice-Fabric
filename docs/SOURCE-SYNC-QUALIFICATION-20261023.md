# LeeWay Voice Fabric — source-only GitHub sync

Date: 2026-10-23. Source branch: `review/voice-source-sync-20261023`.
Original workspace: `E:/LeeWay-Work/pc-consciousness-live/voice`.

A clean Git worktree was created from the original Voice Fabric commit. It preserved 20 selected source files from 46 local changed/untracked paths and excluded 26 owner-specific receipts, binding snapshots, audio recordings, temporary backups, logs and runtime files. The bundled Three.js module and its LICENSE were included together. The original live Voice directory was not changed or restarted.

Source covers the studio, speech pipeline, explicit speaker authority gate, Voice SDK, studio DSP and visualizer, tests and creator-controlled maintenance scripts.

Initial isolated tests found two **test contract** issues: a data URL could no longer resolve a relative ESM import in `voice-package-core.js`, and the legacy max-length test expected 1,500 characters while the current runtime accepts up to 9,000. The review test uses a file URL and the actual limit; the runtime limit was not changed. The standalone persona-voice-gate test also used a private `runtime/employee-voice-bindings.v1.json`; it now runs against a synthetic binding from the public catalog, keeping the real owner binding private. These edits were made only in the review worktree.

Qualification:
- `npm run check`: syntax PASS.
- `npm test`: **129/129 PASS**.
- `node --test runtime/persona-voice-gate.test.mjs tests/voice-owned-sessions.test.cjs`: **19/19 PASS**.
- No native speaker playback, real microphone, phone enrollment or synchronized cross-device audio was qualified by these source tests.

This branch remains a candidate for code review and controlled future integration. Do not treat source tests or a synthetically signed voice receipt as production speech verification.
