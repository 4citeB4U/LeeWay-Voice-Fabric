# Studio publication to the existing Agent Lee voice binding

The Studio keeps auditions and its local monitor separate from Agent Lee's shared
voice selection. **Apply to Agent Lee** publishes the selected admitted profile and
acoustic tuning to the existing Voice Fabric binding. Publication does not establish
that the runtime rendered that tuning or that a phone or PC played it.

This integration reuses the owner publisher inspected on the live Voice Fabric
checkout. The inspected source SHA-256 was
`3b840eb91595fa97c103427651fbbe487728bb6adf701105d3c4cafabd8ff353`.
The repository version adds explicit missing-authority errors, private static-file
protection, session reuse across tabs, capability reporting, and failure reporting
when a publication needs a read-back check.

## Existing authority is required

The publisher uses `runtime/employee-voice-bindings.v1.json` and
`voices/catalog.v1.json` beneath the Studio server's configured directory. An
operator may set `LEEWAY_VOICE_RUNTIME_ROOT` to the already-owned Voice Fabric
runtime root when the UI is served from a different checkout. This is an explicit
deployment binding; the server does not search for, choose among, or create new
authority records. The existing record must declare `LEEWAY_VOICE_FABRIC` and
contain its `agent-lee` binding. The catalog must declare
`4citeB4U/LeeWay-Voice-Fabric`. The configured paths must remain inside that root.

A clean source checkout does not contain a private employee binding. Its shared
publication controls report `VOICE_EXISTING_AUTHORITY_RECORD_REQUIRED`; ordinary
previews, recording, tuning, profile export, and available synthesis adapters still
work. Do not copy an owner's private binding into the distributable application.

## UI contract

| Operation | Request | Result |
| --- | --- | --- |
| Read current binding and obtain owner session | `GET /api/agent-lee/selection/session` with `credentials: 'same-origin'`, `cache: 'no-store'` | Current binding, SHA-256 `recordRevision`, normalized `tuning`, `csrf`, capability fields, and an HttpOnly SameSite cookie |
| Validate candidate without writing | `POST /api/agent-lee/selection` with the body below plus `dryRun: true` | `VALIDATED_NOT_PUBLISHED`, current state, and normalized `candidate` |
| Explicitly apply candidate | The same POST with `approve: true` and without `dryRun: true` | New read-back revision, `PUBLISHED_NOT_DEVICE_ACKNOWLEDGED`, receipt reference and SHA-256 |
| Refresh after apply, conflict, or uncertain outcome | Repeat the GET with the existing cookie | Actual current binding and revision; compare to the POST result before reporting publication confirmed |

POST body:

```json
{
  "expectedRevision": "the recordRevision received from the session endpoint",
  "voicePackageId": "an ID from sharedVoicePackageIds",
  "tuning": {"pace": 1, "pitch": 0, "bass": 0, "gain": 0},
  "approve": true
}
```

Use `Content-Type: application/json`, `X-LeeWay-Owner-CSRF: <csrf>`, and
`credentials: 'same-origin'`. The browser supplies its same-origin `Origin` header.
The publisher requires loopback access and rejects cross-origin callers even if
the synthesis server separately allows their origin. A phone needs its existing
authenticated device transport to the owner runtime; adding the phone's origin to
an allowlist does not grant publication authority.

Sessions last up to ten minutes. Refresh reuses a valid cookie and CSRF pair so
opening another Studio tab does not invalidate the first tab. After expiry,
refresh creates a new pair. A stale record revision returns HTTP 409; the user
must refresh and review the new selection before reapplying.

Session and successful POST responses include:

```json
{
  "sharedVoicePackageIds": ["catalog IDs admitted for this publisher"],
  "tuningProcessor": "LEEWAY_STUDIO_DSP_V1",
  "capabilities": {
    "acousticTuning": true,
    "synthesisTuning": false,
    "monitorMix": false
  },
  "deliveryState": "DEVICE_ACKNOWLEDGEMENTS_NOT_YET_RECORDED",
  "renderingState": "RUNTIME_TUNING_CONSUMER_NOT_VERIFIED"
}
```

`acousticTuning` means that this publication contract accepts bounded acoustic
settings. It is not a runtime-health claim. Only catalog Kokoro voices and the
existing `agent-lee-voice-one` clone binding are admitted, and Apply additionally
checks that the selected local provider is ready. Imported reference recordings,
custom copies, browser Chatterbox profiles, and hosted Resemble profiles remain
available to their supported audition/export flows without acquiring shared
publication authority.

## Accepted tuning and limits

| Field | Range | Default |
| --- | --- | --- |
| `pace` | 0.6–1.6 | 1 |
| `pitch` | −6–6 semitones | 0 |
| `bass`, `warmth`, `presence`, `air` | −9–9 dB | 0 |
| `highpass` | 40–180 Hz | 40 |
| `deEss`, `noiseReduction` | 0–1 | 0 |
| `compression` | 1–4 | 1 |
| `gain` | −9–6 dB | 0 |

Missing fields use the existing Studio DSP defaults. Unknown fields, booleans,
nonfinite values, and out-of-range values are rejected. The request is limited to
8 KiB. Temperature, seed, repetition controls, exaggeration, microphone gain,
monitor panning, monitor mute, visualization style, sample-rate display, and
latency-buffer display do not become shared synthesis parameters through this
endpoint. Runtime/model switching still uses the existing adapter readiness and
synthesis contracts.

## Publication and recovery

The publisher preserves other employee records and Agent Lee's persona fields.
It acquires the existing publication lock, checks the expected SHA-256 revision,
backs up the original bytes beneath `receipts/selection-publications`, atomically
replaces the selected binding, reads it back, and records the observed revision.
The receipt explicitly says Formula was not executed, speaker audibility was not
measured, and the Learning Ledger was not updated. Binding data and publication
backups are blocked from static GET and HEAD routes.

If the binding was replaced but read-back or receipt creation fails, HTTP 503
includes `publicationMayHaveChanged: true`, a recovery reference, and
`PUBLICATION_OUTCOME_REQUIRES_REFRESH`. The UI must refresh actual state rather
than claiming the selection stayed unchanged or automatically retrying. Existing
backups support an owner-reviewed rollback, with a current-revision check to
avoid overwriting a later publication.

The runtime remains responsible for consuming the selected revision through its
existing Voice Fabric authority, applying `LEEWAY_STUDIO_DSP_V1`, rejecting stale
speaker audio, and recording device acknowledgements. Those are separate live
acceptance gates. The publication API has no simulated acknowledgement path.

## Verification

Run `python -m unittest discover -s tests -p 'test_voice_selection_owner.py'`.
The tests exercise real loopback HTTP sessions and temporary authority files,
including consent, CSRF/origin checks, stale and concurrent writers, missing
authority, dry-run behavior, exact backups, private paths, and uncertain receipt
outcomes. Provider readiness is mocked; the suite does not claim live model,
phone, PC playback, or Formula qualification.
