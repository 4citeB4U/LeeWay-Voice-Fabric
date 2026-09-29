# Runtime Fabric Adapter

Runtime Fabric is the canonical execution owner for cross-system voice work.

## Capability IDs

- `speech.output`
- `speech.stream`
- `speech.cancel`
- `speech.resume`
- `speech.voice_inventory`
- `speech.reference.select`
- `speech.metrics.read`

## Envelope

```json
{
  "workId": "stable caller-owned work id",
  "threadId": "optional",
  "voiceId": "agent-lee-voice-one",
  "operation": "stream.chunk",
  "payload": {"text": "..."},
  "authorizationRef": "...",
  "traceId": "..."
}
```

Runtime Fabric selects a qualified adapter binding from its canonical registry. Browser, native host, phone/device or remote speech providers remain replaceable.

Voice cancellation and upstream work cancellation are separate operations.
