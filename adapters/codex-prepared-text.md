# Codex / Prepared Text Adapter

Codex and other text-first agents should treat Voice Fabric as a **speech renderer**, not a reasoning provider.

## Logical flow

```
assistant text
  -> prepared UTF-8 text/chunks
  -> Voice Fabric connector
  -> speech.output / speech.stream
  -> Agent Lee voice provider
```

The existing LeeWay `read-aloud` skill remains useful as a host accessibility fallback. It MUST NOT be mislabeled as Agent Lee Voice One when it is using Windows system speech.

## Required connector semantics

A host connector MUST support:

- `speak(text)`
- `stream.start(workId)`
- `stream.chunk(workId,text)`
- `stream.end(workId)`
- `stopSpeech()`
- `resumeSpeech()`
- `status()`

Stop speech MUST NOT cancel Codex's parent task.

## Current implementation state

Browser SDK/bridge: implemented and tested.  
Direct Codex-host-to-Voice-Fabric audio transport: CONTRACT_PORTABLE / CONNECTOR_IMPLEMENTATION_PENDING.

Until that connector is implemented and tested, Codex read-aloud and Voice One remain separate output routes rather than pretending they are connected.
