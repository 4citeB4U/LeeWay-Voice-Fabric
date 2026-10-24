const DEFAULT_VOICE_PACKAGE_ID = 'agent-lee-voice-one';
const DEFAULT_VOICE_PROVIDER = 'chatterbox';

const isRecord = value => value !== null && typeof value === 'object';
const makeAbortError = message => {
  if (typeof globalThis.DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name} must be a non-empty string.`);
}

function decision(result, stage) {
  if (result === true || result === undefined) return {allowed: true};
  if (result === false) return {allowed: false, reason: `${stage} was rejected.`};
  if (!isRecord(result) || typeof result.allowed !== 'boolean') {
    throw new TypeError(`${stage} must return a boolean or an object with an allowed boolean.`);
  }
  return {allowed: result.allowed, reason: typeof result.reason === 'string' ? result.reason : undefined};
}

function emitSafely(listener, event) {
  try { listener?.(Object.freeze({...event})); } catch {}
}

/**
 * Adapt the public LeeWay Voice SDK to the realtime conversation output contract.
 *
 * Preparation is intentionally independent from a conversation generation. A
 * barge-in stops playout, but does not discard a model download or cached voice.
 * The selected package is verified before and after every spoken turn so a
 * provider fallback cannot silently replace Agent Lee's approved voice.
 */
export function createVoiceSdkOutput({
  client,
  voicePackageId = DEFAULT_VOICE_PACKAGE_ID,
  provider = DEFAULT_VOICE_PROVIDER,
  allowFallback = false,
  onEvent,
} = {}) {
  if (!isRecord(client)) throw new TypeError('client must be a LeeWay Voice SDK client.');
  for (const method of ['connect', 'selectVoice', 'prepare', 'status', 'speak', 'stop']) {
    assertFunction(client[method], `client.${method}`);
  }
  assertString(voicePackageId, 'voicePackageId');
  assertString(provider, 'provider');

  let prepared;
  let stopped = false;

  const verify = (status, stage) => {
    if (!isRecord(status)) throw new Error(`Voice Fabric returned no ${stage} status.`);
    if (!allowFallback && status.selectedVoiceId !== voicePackageId) {
      throw new Error(`Voice Fabric selected "${status.selectedVoiceId ?? 'unknown'}" instead of required "${voicePackageId}".`);
    }
    if (status.ready === false) throw new Error(`Voice Fabric is not ready for ${stage}.`);
    return status;
  };

  const prepare = () => {
    if (prepared) return prepared;
    stopped = false;
    prepared = (async () => {
      emitSafely(onEvent, {type: 'voice.prepare.started', voicePackageId, provider});
      await client.connect();
      const selected = await client.selectVoice(voicePackageId);
      if (!allowFallback && selected?.selectedVoiceId !== voicePackageId) {
        throw new Error(`Voice Fabric refused required voice package "${voicePackageId}".`);
      }
      const result = await client.prepare(provider);
      const status = verify(await client.status(), 'preparation');
      emitSafely(onEvent, {type: 'voice.prepare.completed', voicePackageId, provider: status.provider, result});
      return status;
    })().catch(error => {
      prepared = undefined;
      emitSafely(onEvent, {type: 'voice.prepare.failed', voicePackageId, provider, error});
      throw error;
    });
    return prepared;
  };

  const stop = async () => {
    stopped = true;
    try { return await client.stop(); }
    finally { emitSafely(onEvent, {type: 'voice.playout.stopped', voicePackageId}); }
  };

  const speak = async ({text, signal, turnId} = {}) => {
    assertString(text, 'text');
    if (signal?.aborted) throw signal.reason ?? makeAbortError('Voice output was cancelled.');
    stopped = false;
    const status = await prepare();
    if (signal?.aborted) throw signal.reason ?? makeAbortError('Voice output was cancelled.');
    verify(status, 'playout');

    let rejectCancelled;
    const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
    const onAbort = () => {
      void stop().catch(() => {});
      rejectCancelled(signal.reason ?? makeAbortError('Voice output was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, {once: true});
    emitSafely(onEvent, {type: 'voice.playout.started', turnId, text, voicePackageId, provider: status.provider});
    const operation = Promise.resolve().then(() => client.speak(text));
    // Always observe a provider's late settlement after cancellation.
    operation.catch(() => {});
    try {
      const result = signal ? await Promise.race([operation, cancelled]) : await operation;
      if (stopped || signal?.aborted) throw signal?.reason ?? makeAbortError('Voice output was cancelled.');
      const finalStatus = verify(await client.status(), 'completed playout');
      emitSafely(onEvent, {type: 'voice.playout.completed', turnId, text, voicePackageId, provider: finalStatus.provider});
      return {renderedText: text, voicePackageId, provider: finalStatus.provider, result};
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  };

  return Object.freeze({
    prepare,
    speak,
    stop,
    status: () => client.status(),
    get voicePackageId() { return voicePackageId; },
  });
}

/**
 * Build the governed turn processor used by RealtimeVoiceSession.
 *
 * Committed transcripts only enqueue interruptible turn work. Generation and
 * playout therefore receive the session generation AbortSignal and cannot hold
 * the bus after a barge-in, even when a provider ignores cancellation.
 */
export function createGovernedConversationProcessor({
  generateResponse,
  authorizeInput,
  authorizeResponse,
  output,
  onEvent,
  maxHistoryMessages = 40,
} = {}) {
  assertFunction(generateResponse, 'generateResponse');
  assertFunction(authorizeInput, 'authorizeInput');
  assertFunction(authorizeResponse, 'authorizeResponse');
  if (!isRecord(output)) throw new TypeError('output must be an object.');
  assertFunction(output.speak, 'output.speak');
  assertFunction(output.stop, 'output.stop');
  if (!Number.isInteger(maxHistoryMessages) || maxHistoryMessages < 2) {
    throw new TypeError('maxHistoryMessages must be an integer of at least 2.');
  }

  const history = [];
  const acceptedSegments = new Set();
  const activeTurns = new Set();

  const event = detail => emitSafely(onEvent, detail);
  const launchTurn = (turnId, stage, signal, run) => {
    activeTurns.add(turnId);
    void Promise.resolve().then(run).catch(error => {
      if (error?.name !== 'AbortError') event({type: 'conversation.task.failed', turnId, stage, error});
    }).finally(() => activeTurns.delete(turnId));
  };
  const append = message => {
    history.push(Object.freeze({...message}));
    if (history.length > maxHistoryMessages) history.splice(0, history.length - maxHistoryMessages);
  };
  const snapshot = () => history.map(message => ({...message}));

  const processor = {
    get responding() { return activeTurns.size > 0; },
    history: snapshot,
    async handle(frame, context) {
      if (frame.kind === 'interruption') {
        event({type: 'conversation.interrupted', epoch: frame.epoch, turnId: frame.turnId, reason: frame.payload?.reason});
        Promise.resolve().then(() => output.stop()).catch(error => event({type: 'conversation.output.stop.failed', error}));
        return;
      }

      if (frame.kind === 'transcript.final') {
        const segmentId = frame.payload?.segmentId;
        const text = String(frame.payload?.text ?? '').trim();
        assertString(segmentId, 'transcript segmentId');
        if (!text || acceptedSegments.has(segmentId)) return;
        acceptedSegments.add(segmentId);
        const turnId = frame.turnId ?? `turn-${segmentId}`;
        event({type: 'conversation.turn.committed', turnId, segmentId, text, epoch: context.session.epoch});
        await context.emit(context.session.frame('conversation.turn.requested', {segmentId, text}, {
          turnId,
          direction: 'downstream',
          class: 'control',
          interruptible: true,
        }));
        return;
      }

      if (frame.kind === 'conversation.turn.requested') {
        const text = String(frame.payload?.text ?? '').trim();
        assertString(text, 'conversation input');
        const turnId = frame.turnId ?? `turn-${frame.sequence}`;
        launchTurn(turnId, 'turn', context.signal, async () => {
          const inputGate = decision(await authorizeInput({
            text,
            turnId,
            history: snapshot(),
            signal: context.signal,
            sessionId: frame.sessionId,
          }), 'Input governance');
          if (!inputGate.allowed) {
            event({type: 'conversation.input.blocked', turnId, text, reason: inputGate.reason});
            return;
          }
          if (!context.isCurrent()) throw makeAbortError('Conversation turn was interrupted before generation.');
          append({role: 'user', content: text, turnId, evidence: 'transcript.final'});
          event({type: 'conversation.input.accepted', turnId, text});

          const generated = await generateResponse({
            text,
            turnId,
            history: snapshot(),
            signal: context.signal,
            sessionId: frame.sessionId,
          });
          if (!context.isCurrent()) throw makeAbortError('Conversation turn was interrupted during generation.');
          const response = typeof generated === 'string' ? generated.trim() : String(generated?.text ?? '').trim();
          assertString(response, 'generated response');
          event({type: 'conversation.response.generated', turnId, text: response});

          const responseGate = decision(await authorizeResponse({
            input: text,
            response,
            turnId,
            history: snapshot(),
            signal: context.signal,
            sessionId: frame.sessionId,
          }), 'Response governance');
          if (!responseGate.allowed) {
            event({type: 'conversation.response.blocked', turnId, text: response, reason: responseGate.reason});
            return;
          }
          if (!context.isCurrent()) throw makeAbortError('Conversation turn was interrupted before output.');
          event({type: 'conversation.response.authorized', turnId, text: response});
          await context.emit(context.session.frame('agent.text.final', {text: response, inputText: text}, {
            turnId,
            direction: 'downstream',
            class: 'data',
            interruptible: true,
          }));
          if (!context.isCurrent()) throw makeAbortError('Conversation turn was interrupted before playout.');
          event({type: 'conversation.playout.started', turnId, text: response});
          const result = await output.speak({text: response, turnId, signal: context.signal});
          if (!context.isCurrent()) throw makeAbortError('Conversation playout was interrupted.');
          const renderedText = typeof result?.renderedText === 'string' ? result.renderedText.trim() : '';
          if (renderedText) append({role: 'assistant', content: renderedText, turnId, evidence: 'audio.rendered'});
          event({type: 'conversation.playout.completed', turnId, text: response, renderedText, result});
        });
        return;
      }

      if (frame.kind === 'agent.text.final') {
        // This frame is an observable text artifact. Slow TTS is owned by the
        // background turn task above and must never block the serialized media drain.
      }
    },
  };

  return Object.freeze(processor);
}

export const LeeWayConversationDefaults = Object.freeze({
  voicePackageId: DEFAULT_VOICE_PACKAGE_ID,
  provider: DEFAULT_VOICE_PROVIDER,
});
