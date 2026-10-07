# Spatial Voice Studio

The supplied 3D Studio is implemented at both `studio.html` and `index.html` inside the existing LeeWay Voice Fabric. It uses the existing catalog, reference storage, browser synthesis, local synthesis adapters, acoustic processor and employee-binding publisher.

## Design provenance

The Creator supplied `interactive_visual_im_9dd9d7c61d7e0ef0.html`, SHA-256 `8ee12ed511ab383d239b1b6cc73b403ecf764d4a713ac744fcd6fa75510d3f88`. Its geodesic orb, wire shell, virtual microphone, spectral display, Speak/Stream and Interrupt actions, four sliders and three environment presets are preserved as the central Studio design. The expanded layout retains the full existing voice library and tuning controls.

The original attachment's artificial spectrum, hard-coded sample rate, calculated fake latency, global canvas shim and external CDN dependency are not used. Three.js is pinned locally with its MIT license and upstream integrity evidence in `src/vendor/three-0.160.1/`.

## Control map

| Control | Actual implementation | Scope |
| --- | --- | --- |
| Speaker library, search, delivery presets | `voice-registry.js`, the existing catalog and local profile store | Audition selection; shared selection changes only on Apply |
| Reference import, package import/export, custom copies | Existing reference validation and portable package format | Browser profile store and explicit downloads |
| Render complete take | Existing local/hosted HTTP adapters or browser Chatterbox, then `studio-audio.js` in its worker | Full editable audition |
| Speak / Stream | Same selected synthesis adapter, bounded clauses, real PCM playback, epoch rejection | Sequential clause streaming; provider output is complete audio per clause |
| Interrupt | Abort local fetch, invalidate generation/render epochs, stop browser voice, pause media, mute mixer and flush reverb tail | Speech lane only; no parent reasoning job cancellation |
| Microphone / output spectra | Separate Web Audio analysers | Actual captured/played signal; zero when absent or stopped |
| Master gain | Connected output GainNode | Local listening mix |
| Spatial reverb | Connected convolver, wet and dry gains | Local listening mix; not exported into the tuned WAV |
| Mic orbit / stereo pan | Virtual position and connected StereoPannerNode | Local listening mix; explicit unsupported state where unavailable |
| Mesh deform, lighting, environment | Local Three shader/material scene | Visual only |
| Sample rate | AudioContext configuration before it opens | Browser monitoring device; source synthesis rate is preserved |
| Buffer preference | AudioContext `latencyHint` before it opens | Browser preference; actual latency is separately reported |
| Acoustic rack | Existing pace, pitch, EQ, de-ess, noise, compression and gain processing | Rendered WAV and admitted shared tuning |
| Synthesis rack | Existing provider-supported sampling parameters | Next generation; unsupported controls stay disabled |
| Apply voice & acoustic tuning | Existing owner session, CSRF and revision-checked publication | Canonical employee binding; see `shared-voice-publication.md` |
| Load shared voice into audition | Read current shared profile/settings into the local draft | No publication |
| Export session observations | Bounded local event/measurement snapshot without audition text, credentials or audio | Browser observations; no Formula/physical hearing/ledger claim |

Microphone capture begins only after the user enables it. It is not connected to the speakers or uploaded. Optional sustained-level interruption uses local detection settings; it is not STT and is not claimed as calibrated Formula evidence. A host denying microphone capture displays the error without substituting simulated input.

## State and audio behavior

The orb's signal response follows actual analyser bytes. A quiet visual breathing motion does not create activity in the spectra. Status comes from real preparation, synthesis, streaming, playback, pause, interruption and error state. The idle page does not claim a connected or streaming engine.

`outputLatency` is the browser's output-device estimate. First-segment-ready and generation durations are measured separately; neither is represented as full conversational round-trip latency or proof of human hearing.

The Studio preserves one output media element, and creates only one media source per element. Microphone permission results that arrive after cancellation are stopped. Shared revision changes stop stale local speech while preserving the user's audition draft. An Apply result is checked with a separate readback; a failure or conflict requires inspection/refresh rather than automatic retry.

The 3D renderer is independent of the control handlers. It falls back to a 2D visual when WebGL is unavailable. It bounds device pixel ratio, responds to resize, suspends animation while hidden, respects reduced motion and disposes its own resources. No claim of universal 60 fps is made.

## Publication and runtime ownership

A static server supports previews, imported recordings, visual monitoring and browser synthesis after explicit preparation. Local Kokoro/XTTS require their existing adapters. Hosted Resemble requires a configured account and explicit user action; there is no provider substitution or automatic paid call.

Shared publication requires the existing Voice Fabric employee record. The server never invents another record when one is absent. An explicitly configured `LEEWAY_VOICE_RUNTIME_ROOT` may point the Studio to that existing authority. This is a logical runtime binding, not a required drive or device path.

The live consumer inspected during this implementation is separate from batch `/api/local/synthesize`: the existing persona voice gate reads the employee binding each turn, applies the Studio DSP to bound speech and rejects changed revisions. Its runtime and installed phone package are independently qualified artifacts; publishing this UI repository is not proof that every installed consumer has received it.

`FORMULA_EXECUTION = NOT_EXECUTED`. The canonical voice-domain mapping requires its documented 16-segment history and calibrated ranges. UI activity and graph tests do not satisfy that gate.

## Verification

Run:

```sh
npm ci --ignore-scripts
npm run check
npm test
python -m unittest discover -s tests -p 'test_*.py'
npx playwright install --with-deps chromium --only-shell
npm run test:browser
npm run test:graphics
npm run test:owner
npm run test:races
npm run test:prepare
```

The pull-request workflow runs all five browser gates after the JavaScript and Python tests. They use the pinned Playwright dependency and one Chromium headless-shell installation.

| Command | Verified behavior | Evidence boundary |
| --- | --- | --- |
| `npm run test:browser` | Repository WAV playback through an independent audio analyser, nonzero output, muting, interruption, source reuse, desktop/mobile controls and sequential clause playback | Streaming uses controlled HTTP responses containing repository audio; no model execution |
| `npm run test:graphics` | Actual Three.js rendering and audio response, renderer lifecycle, context recovery and narrow viewport | Browser graphics and audio-graph behavior |
| `npm run test:owner` | Actual frontend session and Apply flow through the Python publisher, temporary binding mutation, exact revision readback, draft isolation and two-tab conflicts | A newly created temporary authority record and catalog; provider readiness is stubbed and synthesis is forbidden |
| `npm run test:races` | Stop during replay or Speak device startup, cancellation of pending monitor activation, reference/stream handoff and preservation of a provider's 48 kHz source rate with a 24 kHz monitor | Actual browser code with an explicitly held AudioContext resume boundary and deterministic PCM HTTP fixtures |
| `npm run test:prepare` | Cancel remains visible and stops pending browser preparation after runtime or profile switching on both entry pages | Actual browser load/cancel lifecycle held at the worker-request boundary; no model download |

The owner browser gate verifies that Apply stays disabled until a session admits the selected profile. Voice selection and all dials remain a draft until Apply. Its real publication request contains only the selected voice, revision, approval and admitted acoustic settings; synthesis controls and listening mix are excluded. The publisher must preserve persona, permissions, other employees and unrelated data, write an exact backup, produce a receipt and return the same revision on a separate readback. Two real tabs exercise an intentionally stale request: the server returns HTTP 409, preserves the newer file and triggers no automatic retry. Explicit refresh stops obsolete speech while retaining the audition draft, and loading shared settings does not republish. An unadmitted profile remains available for audition and export. All publication writes stay inside the test's temporary directory, which is removed afterward; no live employee binding is changed.

The race gate holds the real AudioContext resume boundary to verify that Stop prevents late playback, unmuting and synthesis ingress. An independent monitor cut rejects pending activation. Reference playback must end an active stream without overlapping output, leaving the controller busy or requesting its next clause. Its hosted-provider HTTP fixture returns 48 kHz PCM, and the rendered WAV must retain that rate even when the monitor runs at 24 kHz. No hosted account or provider model is used.

The Python publisher tests additionally cover dry-run behavior, tuning bounds and private-file protection using temporary files and controlled readiness. None of these gates establishes physical microphone or speaker qualification, human hearing, live provider execution, live device acknowledgements, Formula execution or a Learning Ledger update. Optional `STUDIO_OWNER_BROWSER_ARTIFACTS` and `STUDIO_RACE_ARTIFACTS` directories retain the respective gates' JSON evidence for inspection.

A live deployment additionally needs the real provider path, shared-binding readback and actual device playback. Phone applications that bundle Studio assets require a new asset integrity manifest and package; a Pages update cannot change those installed bytes.

### Isolated Windows qualification

`scripts/Qualify-VoiceStudioCandidate.ps1` accepts the reviewed candidate commit and tree, the expected script/runner SHA-256 values, and explicit paths to the existing live authority, artifact directory, Chrome and Puppeteer. It parses and hashes the saved script, verifies the canonical source and the existing Studio/Kokoro launcher relationship, and starts a temporary loopback Studio from an exact detached checkout. It reuses the existing Kokoro process and disables clone-container startup. `tests/studio-live-windows-gate.mjs` makes one reviewed real synthesis request through the UI, verifies WAV processing and the independent output graph, tests Interrupt during active playback, and exercises the real owner publisher in dry-run mode only.

The qualification retains an exact twelve-file activation manifest with target preimage hashes and verified backups after a pass. It performs no installed activation or live binding publication. Final source/binding readback, owned-process cleanup and script rehash must all pass before that manifest becomes `READY_FOR_APPROVAL`. Applying it requires recorded human authorization and a coordinated lifecycle for the existing launcher and both children; stopping only the Studio child would also terminate Kokoro. Headless graph measurements do not establish physical speaker audibility or phone qualification.

## Rollback

The repository change is isolated from the existing RTC promotion branch. Reverting this change restores the prior Studio assets and removes its owner-UI additions without editing a runtime's private binding. A live source deployment must first hash and back up only the files it will replace, preserve the current employee record and unrelated dirty runtime repairs, and retain that backup until the actual service and device gates pass. Do not reset a live divergent checkout to `main` to install this UI.
