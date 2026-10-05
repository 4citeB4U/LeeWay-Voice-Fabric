/*
REGION: LeeWay Voice Fabric RTC adapter
TAG: LEEWAY-VOICE-EDGE-RTC-ADAPTER
WHO: Agent Lee / LeeWay Live / authorized realtime transports
WHAT: Normalize realtime transcript/session events into the canonical LeeWay Voice boundary.
WHEN: When an RTC session produces text/audio-control events for Agent Lee.
WHERE: 4citeB4U/LeeWay-Voice-Fabric/src
WHY: Preserve one voice authority while reusing qualified Edge RTC behavior.
HOW: Transport-neutral event normalization; Voice Fabric remains speech authority, RTC remains transport.
LICENSE: MIT
*/

export const EDGE_RTC_VOICE_EVENT_VERSION = "1.0.0";

export function normalizeRtcVoiceEvent(event = {}) {
  if (!event || typeof event !== "object") throw new Error("RTC_VOICE_EVENT_REQUIRED");
  const type = String(event.type || "");
  const sessionId = String(event.sessionId || "");
  if (!type || !sessionId) throw new Error("RTC_VOICE_EVENT_IDENTITY_REQUIRED");

  if (type === "transcript.final") {
    const text = String(event.text || "").trim();
    if (!text) throw new Error("RTC_TRANSCRIPT_TEXT_REQUIRED");
    return {
      version: EDGE_RTC_VOICE_EVENT_VERSION,
      kind: "voice.input.final",
      sessionId,
      text,
      source: "leeway-live-rtc",
      personaAuthority: "UPSTREAM_AGENT_LEE_RUNTIME",
      voiceAuthority: "4citeB4U/LeeWay-Voice-Fabric"
    };
  }

  if (type === "speech.stop" || type === "speech.pause" || type === "speech.resume") {
    return {
      version: EDGE_RTC_VOICE_EVENT_VERSION,
      kind: "voice.control",
      action: type.split(".")[1],
      sessionId,
      source: "leeway-live-rtc",
      voiceAuthority: "4citeB4U/LeeWay-Voice-Fabric"
    };
  }

  if (type === "barge-in") {
    return {
      version: EDGE_RTC_VOICE_EVENT_VERSION,
      kind: "voice.interrupt",
      action: "invalidate-stale-speech",
      sessionId,
      source: "leeway-live-rtc",
      voiceAuthority: "4citeB4U/LeeWay-Voice-Fabric"
    };
  }

  throw new Error("RTC_VOICE_EVENT_UNSUPPORTED:" + type);
}

export function rtcPromotionMap() {
  return {
    sourceAuthority: "4citeB4U/LeeWay-Edge-RTC",
    targetAuthority: "4citeB4U/LeeWay-Voice-Fabric",
    promote: [
      "src/voice/audio.ts",
      "src/voice/emotion-engine.ts",
      "src/voice/engine-controller.ts",
      "src/voice/engine-types.ts",
      "src/voice/persona.ts",
      "src/voice/speech-queue.ts",
      "src/voice/voice-loop.ts"
    ],
    rule: "Promote behavior after equivalence tests; do not maintain divergent copies."
  };
}
