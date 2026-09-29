# Browser Application Adapter

## Capability
Connect any browser application to the canonical LeeWay Voice Fabric without embedding a TTS engine.

## Contract
Use `src/voice-sdk.js`.

```js
import { createLeeWayVoice } from "https://4citeb4u.github.io/LeeWay-Voice-Fabric/src/voice-sdk.js";
const voice = createLeeWayVoice();

await voice.prepare();
const streamId = await voice.streamStart();
await voice.streamChunk(streamId, "The first phrase is ready. ");
await voice.streamChunk(streamId, "The rest can continue arriving.");
await voice.streamEnd(streamId);
```

## Cancellation
`voice.stop()` cancels speech/queued audio only. The caller owns its reasoning job and decides separately whether to cancel it.

## Evidence
A successful SDK/bridge handshake proves transport availability only. It does not prove Chatterbox acoustic quality or that a human heard playback.
