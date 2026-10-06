# Voice authority repair — device output is not speaker authority

<!-- REGION: LEEWAY.VOICE.QUALIFICATION; TAG: AUTHORITY_VS_EXECUTION
WHO: Creator-authorized Agent Lee; WHAT: Remove carrier-owned voice defaults and prevent renderer substitution.
WHEN: Oct 6 ownership correction; WHERE: existing Voice Fabric core, existing live carrier and local provider.
WHY: Device loss/readiness failure must not invent or replace Agent Lee's voice.
HOW: Actual source repair, explicit bindings, regression tests, installed process readback and real synthesis.
LICENSE: MIT -->

## Ownership

Creator authority selects the owner-scoped agent voice binding. Agent Lee/Runtime supplies prepared persona-consistent text; an acoustic provider is not a new persona authority. LeeWay Voice Fabric resolves the selected voice package, dispatches its qualified renderer and checks the returned identity. Native devices supply permitted input/output and report hardware availability. Their default TTS, OS voice choice, browser default or audio-device change cannot become Agent Lee's speaker selection.

One Voice Fabric is a logical authority, not a requirement that every device call a daemon on one PC. The same qualified package can execute in device-local or authorized remote workers. Actual phone-local synthesis and cross-device selection propagation are separate unfinished qualifications in this repair.

Operating-system permissions, mute/volume, audio routing/focus and physical device availability remain constraints on execution. They do not authorize different speaker identity or rewritten persona. A configured synthesizer does not override owner privacy controls or prove audible sound.

## Exact defect and repair

The installed PC carrier previously read its own agent-lee-active-voice.v1.json and returned a hardcoded Kokoro default when loading failed. It also exposed a device-local selection write independent of Voice Fabric's employee binding. That was a real split of authority.

The existing src/voice-package-core.js now validates explicit Voice Fabric employee binding and catalog identity with no device-derived speaker. The existing runtime/persona-voice-gate.mjs now exposes selection snapshots and bound synthesis. The carrier reads the existing Voice-owned employee record for each request, no longer chooses providers/voices itself, and no longer supplies a default if the binding is absent. Synthesis uses only the selected provider and refuses mismatched output or a binding revision change before releasing generated audio.

The existing Kokoro worker now returns its actual dispatched voice ID with the waveform, and the native adapter verifies it against the queued job before reporting it. The carrier no longer labels Voice ready independently of the observed provider.

The old per-PC selection-write route is explicitly blocked pending the authorized shared-selection update transport. This refusal is not claimed as finished cross-device settings: owner selection from either device still needs its canonical write/synchronization implementation and live tests. The current selection was not changed. It remains kokoro-am_michael with TEMPORARY_VERIFIED_PROVIDER / CREATOR_PENDING_FINAL_AUDITION, productionAdmitted=false.

The generic catalog's historical demonstration/default entries are not agent-binding authority. Existing platform-specific code is an adapter, not a Voice policy owner.

## Executed evidence

- 111/111 Voice Fabric standard regression tests, including 19 new authority tests; zero failures or skips.
- Existing persona integration fixture reran separately after correcting its current-working-directory dependency. Together with the 19 authority tests that focused command reports 20/20; these overlap the 111 suite and must not be added as 20 extra distinct tests.
- Four actual live carrier/worker checks passed without fixture providers: Voice-owned binding readback; blocked local selection override; real Kokoro waveform uses only the selected identity despite attempted client override fields; owner record remains byte-for-byte unchanged.
- Real generated audio: 378044 bytes, 24000 Hz PCM, peak absolute sample 18087. Waveform SHA-256 b8ef328818c8c0c6c23421486b8cf386d8364bd1c7e18b00c6f3b3dcfda45ffd. This is measured synthesis, not acoustic speaker recognition or human listening approval.
- The exact generated waveform was played with a native PCM output API. The call returned successfully after 7993 ms. No native TTS engine was used and no volume or selected voice was changed. Human audibility is not confirmed by that API return.

The first focused test run failed an older test's relative-path lookup; that test was corrected to use module-relative resources and retested without weakening binding validation. Initial failure evidence is retained locally.

## Still open

Phone native speech execution, canonical conversation ingress, owner-approved PC-to-phone/phone-to-PC voice selection propagation, selection change during active playback, complete interruption/resume, offline same-voice recovery, and end-to-end persona/audibility remain unqualified.

The floating-host repair is still in progress. Its drafted UI must delegate speech lifecycle to the existing Voice Fabric session/stream API rather than install another UI-owned speech controller. Native speech recognition, when qualified, is an input adapter only; it is not the acoustic voice or Agent Lee identity. The original full UI/functionality checklist remains active.

No phone APK was installed by this voice-authority repair, no Golden release or branch merge was performed, Formula was not executed, and the Learning Ledger was not updated.
