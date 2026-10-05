# Edge RTC promotion into LeeWay Voice Fabric

## Authority decision

`4citeB4U/LeeWay-Edge-RTC` is a donor/source estate, not a second canonical voice authority.

The canonical split is:

- **LeeWay Voice Fabric** owns speech synthesis, Agent Lee voice identity, speech queue, interruption, acoustic delivery, and reusable voice/persona delivery helpers.
- **LeeWay Live** owns browser/realtime interaction-session transport and consumes Voice Fabric.
- **LeeWay Device Bridge** owns physical device transports and device authority.
- **Edge RTC** remains provenance/evidence until each promoted behavior passes equivalence tests.

## Promote from Edge RTC to Voice Fabric

Candidate behavior sources:

- `src/voice/audio.ts`
- `src/voice/emotion-engine.ts`
- `src/voice/engine-controller.ts`
- `src/voice/engine-types.ts`
- `src/voice/persona.ts`
- `src/voice/speech-queue.ts`
- `src/voice/voice-loop.ts`

Promotion does **not** mean copying all files verbatim. Existing Voice Fabric streaming, one-mouth queue, provider registry and Agent Lee voice binding remain canonical. Each donor behavior is mapped into those contracts and tested before the donor copy can be retired.

## Do not promote here

RTC signaling, WebSocket signaling, mediasoup/SFU transport, ICE/TURN, peer/session state and WebRTC client code belong to LeeWay Live's realtime transport boundary.

## Gate

No donor component is called VERIFIED in Voice Fabric until:
1. canonical source behavior is identified;
2. inputs/outputs are mapped;
3. interruption/order semantics are tested;
4. persona remains upstream of TTS;
5. one `voicePackageId` remains authoritative;
6. regressions are measured;
7. a receipt records the result.
