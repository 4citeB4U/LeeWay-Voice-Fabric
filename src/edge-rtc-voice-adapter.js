/* LeeWay Voice Fabric: transport-neutral events, one existing speech engine.
 * Persona is upstream. This adapter never writes/rephrases the spoken answer.
 * Edge RTC is donor lineage; do not maintain divergent copies of its queue.
 */
export const EDGE_RTC_VOICE_EVENT_VERSION = '1.1.0';
const AUTHORITY = '4citeB4U/LeeWay-Voice-Fabric';
const required = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
};
export function normalizeRtcVoiceEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('RTC_VOICE_EVENT_REQUIRED');
  const type = required(event.type, 'RTC_VOICE_EVENT_IDENTITY_REQUIRED');
  const sessionId = required(event.sessionId, 'RTC_VOICE_EVENT_IDENTITY_REQUIRED');
  const base = {version:EDGE_RTC_VOICE_EVENT_VERSION, sessionId, source:'leeway-live-rtc', voiceAuthority:AUTHORITY};
  if (type === 'transcript.final') return {...base, kind:'voice.input.final', text:required(event.text, 'RTC_TRANSCRIPT_TEXT_REQUIRED'), personaAuthority:'UPSTREAM_AGENT_LEE_RUNTIME'};
  if (['speech.stop','speech.pause','speech.resume'].includes(type)) return {...base, kind:'voice.control', action:type.slice(7)};
  if (type === 'barge-in') return {...base, kind:'voice.interrupt', action:'invalidate-stale-speech'};
  throw new Error('RTC_VOICE_EVENT_UNSUPPORTED:' + type);
}

// Bind to the canonical engine; reuse its epoch, stream, and active media set.
// No independent speech queue, provider selector, persona, or reasoning runtime.
export function createRtcVoiceBinding({voice, sessionId, voicePackageId, getVoicePackageId = () => voicePackageId, onTranscript, onInvalidate = () => {}} = {}) {
  sessionId = required(sessionId, 'RTC_SESSION_REQUIRED');
  voicePackageId = required(voicePackageId, 'RTC_VOICE_PACKAGE_REQUIRED');
  for (const method of ['speak','stop','pause','resume']) if (typeof voice?.[method] !== 'function') throw new Error('RTC_VOICE_METHOD_REQUIRED:' + method);
  let disposed = false;
  const ensureIdentity = () => {
    if (disposed) throw new Error('RTC_BINDING_DISPOSED');
    if (getVoicePackageId() !== voicePackageId) {
      voice.stop(); onInvalidate();
      throw new Error('RTC_VOICE_IDENTITY_DRIFT');
    }
  };
  const snapshot = () => ({sessionId, voicePackageId, voiceAuthority:AUTHORITY,
    personaAuthority:'UPSTREAM_AGENT_LEE_RUNTIME', epoch:voice.epoch,
    paused:voice.paused === true, activeSources:voice.sources?.size || 0,
    pendingSynthesis:[...(voice.pending?.values() || [])].filter(x => x.type === 'generate').length,
    bufferedCharacters:voice.activeStream?.buffer?.length || 0, disposed});
  return Object.freeze({
    snapshot,
    async handle(event) {
      ensureIdentity();
      const normalized = normalizeRtcVoiceEvent(event);
      if (normalized.sessionId !== sessionId) throw new Error('RTC_SESSION_MISMATCH');
      if (event.voicePackageId !== undefined && event.voicePackageId !== voicePackageId) throw new Error('RTC_VOICE_PACKAGE_MISMATCH');
      if (normalized.kind === 'voice.input.final') {
        if (typeof onTranscript !== 'function') throw new Error('RTC_UPSTREAM_HANDLER_REQUIRED');
        // Handoff only: do not echo the user transcript as an Agent Lee answer.
        await onTranscript(Object.freeze({...normalized, voicePackageId}));
      } else if (normalized.action === 'pause') await voice.pause();
      else if (normalized.action === 'resume') await voice.resume();
      else { voice.stop(); onInvalidate(); }
      ensureIdentity();
      return {event:normalized, ...snapshot()};
    },
    async speak(text, options = {}) {
      ensureIdentity();
      required(text, 'RTC_SPEECH_TEXT_REQUIRED');
      // Pass original text, not the trimmed validation result: preserve persona.
      await voice.speak(text, options);
      ensureIdentity();
      return {completed:true, ...snapshot()};
    },
    dispose() { if (!disposed) { voice.stop(); onInvalidate(); disposed = true; } }
  });
}

export function rtcPromotionMap() {
  return {sourceAuthority:'4citeB4U/LeeWay-Edge-RTC', targetAuthority:AUTHORITY,
    promote:['src/voice/audio.ts','src/voice/emotion-engine.ts','src/voice/engine-controller.ts','src/voice/engine-types.ts','src/voice/persona.ts','src/voice/speech-queue.ts','src/voice/voice-loop.ts'],
    rule:'Promote behavior after equivalence tests; do not maintain divergent copies.'};
}
