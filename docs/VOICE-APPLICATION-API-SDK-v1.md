# LeeWay Voice Fabric — Application API and SDK v1

**Owner authority:** Existing LeeWay Voice Fabric Studio selection. Voice packages and identity do not belong to the LLM.

## Contract

- `GET http://127.0.0.1:5173/__leeway/voice-binding`: read-only, localhost Edge RTC API. Response returns `schema`, `authority`, `binding.voicePackageId`, and `recordRevision` only. It does not return owner CSRF, session cookies, raw audio, conversation history, or credentials.
- `POST /__leeway/voice-turn`: existing separately guarded read-only conversation route; **not** device-action authorization.
- `import {createLeeWayVoiceClient} from './src/voice-fabric-client.mjs'`: JavaScript SDK. `current()` returns the canonical voice, `subscribe(listener)` observes revisions, `conversationUrl({voice})` builds a standalone test URL. Apps should not duplicate the voice selector.
- `node operator/device-bridge-cli.mjs voice-binding`: bounded local Device Bridge readback of the same owner voice.
- Owner publication is **only** through the existing Studio **Apply Agent Lee voice** control and authorized `POST /api/agent-lee/selection`, with owner session CSRF, expected revision, and readback. The consumer SDK intentionally has no publish method.

## Example

```js
import {createLeeWayVoiceClient} from './src/voice-fabric-client.mjs';
const client=createLeeWayVoiceClient({
  endpoint:'http://127.0.0.1:5173/__leeway/voice-binding'
});
const initial=await client.current();
console.log(initial.voicePackageId,initial.revision);
const unsubscribe=client.subscribe(binding=>{
  // Stop old playout and rebuild the voice engine when voicePackageId changes.
  console.log('LeeWay voice changed',binding.voicePackageId);
});
```

This code runs only on an allowed host that can reach the endpoint. The local development API is intentionally loopback-only and does **not** enable phone-to-PC networking. Mobile and remote applications need an authenticated Device Bridge transport forwarding this read-only contract; remote transport enrollment, full phone parity, and synchronization acceptance are **not yet certified**. Do not disable auth or expose the localhost owner API over the network.

## UI rules

Studio's left voice library is the only visual voice selector. The embedded conversation UI contains **no** second selector and no duplicate voice-test button. Selecting another Studio Kokoro speaker releases the previous conversation frame and admits the newly selected speaker. Studio's explicit owner **Apply** publishes the choice to the canonical revision for all connected future consumers. Selecting a draft for a local test alone does not claim to have published to other devices.

## Test gates

- Voice Fabric SDK: `node --test tests/voice-fabric-client.test.cjs`
- Edge RTC API: `node --test tests/voice-binding-api.test.mjs`
- Edge RTC conversation: `npm run test:conversation`
- Device Bridge: `node --test tests/voice-duplex.test.mjs`
- Actual speaker echo, model loading, mobile transport, and cross-device owner-revision convergence still need physical/device verification.
