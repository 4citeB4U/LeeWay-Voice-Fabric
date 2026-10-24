const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS = 1;

const isRecord = value => value !== null && typeof value === 'object';
const makeAbortError = message => {
  if (typeof globalThis.DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

function assertObject(value, name) {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object.`);
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string.`);
}

function dispatchFrame(session, frame, onError) {
  const accepted = session.dispatch(frame);
  accepted.catch(error => {
    try { onError?.(error, frame); } catch {}
  });
  return accepted;
}

/**
 * Connect an Edge RTC AudioCapture-compatible source to a RealtimeVoiceSession.
 *
 * The adapter owns the input claim and maps each PCM callback to an
 * `audio.input` frame. It deliberately does not create an ASR provider or
 * enter Runtime Fabric; an ASR processor may consume the frames later.
 */
export function createEdgeRtcAudioInput({
  session,
  AudioCapture,
  ownerId = 'edge-rtc-audio',
  sampleRate = DEFAULT_SAMPLE_RATE,
  channels = DEFAULT_CHANNELS,
  onError,
  startSession = true,
} = {}) {
  assertObject(session, 'session');
  assertFunction(session.frame, 'session.frame');
  assertFunction(session.dispatch, 'session.dispatch');
  assertFunction(session.claimInput, 'session.claimInput');
  if (startSession) assertFunction(session.start, 'session.start');
  assertFunction(AudioCapture, 'AudioCapture');
  assertString(ownerId, 'ownerId');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new TypeError('sampleRate must be positive.');
  if (!Number.isInteger(channels) || channels < 1) throw new TypeError('channels must be a positive integer.');

  let releaseInput = null;
  let capture = null;
  let running = false;
  let startPromise = null;

  const emitPcm = pcm => {
    if (!running) return Promise.reject(makeAbortError('Audio input is not running.'));
    if (!(pcm instanceof ArrayBuffer)) throw new TypeError('AudioCapture must provide PCM as an ArrayBuffer.');
    const frame = session.frame('audio.input', {
      pcm,
      sampleRate,
      channels,
    }, {
      direction: 'downstream',
      class: 'data',
      interruptible: false,
    });
    return dispatchFrame(session, frame, onError);
  };

  capture = new AudioCapture(pcm => {
    void emitPcm(pcm).catch(error => {
      try { onError?.(error); } catch {}
    });
  });

  const start = async () => {
    if (running) return;
    if (startPromise) return startPromise;
    const pending = (async () => {
      try {
        releaseInput = session.claimInput(ownerId);
        if (startSession) await session.start();
        await capture.start();
        running = true;
      } catch (error) {
        try { capture.stop?.(); } catch {}
        releaseInput?.();
        releaseInput = null;
        throw error;
      }
    })();
    startPromise = pending;
    pending.then(
      () => { if (startPromise === pending) startPromise = null; },
      () => { if (startPromise === pending) startPromise = null; },
    );
    return pending;
  };

  const stop = () => {
    running = false;
    try { capture.stop?.(); } finally {
      releaseInput?.();
      releaseInput = null;
    }
  };

  return Object.freeze({
    capture,
    start,
    stop,
    emitPcm,
    get running() { return running; },
  });
}

function eventListenerTarget(recognition) {
  return typeof recognition.addEventListener === 'function';
}

function installHandler(recognition, name, handler) {
  if (eventListenerTarget(recognition)) {
    recognition.addEventListener(name, handler);
    return () => recognition.removeEventListener?.(name, handler);
  }
  const property = `on${name}`;
  const previous = recognition[property];
  recognition[property] = handler;
  return () => {
    if (recognition[property] === handler) recognition[property] = previous ?? null;
  };
}

/**
 * Bind a SpeechRecognition-compatible recognizer to transcript frames.
 *
 * This is an ASR boundary only. It emits revision-aware partial/final frames
 * and leaves turn policy, governance and response generation to later
 * processors. The recognizer may be the Edge RTC browser recognizer or a
 * test/dedicated recognizer supplied by a host.
 */
export function bindSpeechRecognitionToSession({
  session,
  recognition,
  segmentPrefix = 'dictation',
  onError,
  onFinal,
} = {}) {
  assertObject(session, 'session');
  assertFunction(session.frame, 'session.frame');
  assertFunction(session.dispatch, 'session.dispatch');
  assertObject(recognition, 'recognition');
  assertString(segmentPrefix, 'segmentPrefix');

  const revisions = new Map();
  const signatures = new Map();
  let bound = false;
  let unbind = [];

  const emitResult = event => {
    const results = event?.results;
    if (!results || !Number.isInteger(event.resultIndex)) return;

    for (let index = event.resultIndex; index < results.length; index += 1) {
      const result = results[index];
      const alternative = result?.[0];
      const text = typeof alternative?.transcript === 'string' ? alternative.transcript : '';
      if (!text.trim()) continue;
      const final = Boolean(result.isFinal);
      const signature = `${final ? 'final' : 'partial'}\0${text}`;
      if (signatures.get(index) === signature) continue;

      const revision = (revisions.get(index) ?? -1) + 1;
      revisions.set(index, revision);
      signatures.set(index, signature);

      const frame = session.frame(final ? 'transcript.final' : 'transcript.partial', {
        segmentId: `${segmentPrefix}-${index}`,
        revision,
        text,
      }, {
        direction: 'downstream',
        class: 'data',
        interruptible: !final,
      });
      dispatchFrame(session, frame, onError).catch(() => {});
      if (final) {
        try { onFinal?.({segmentId: `${segmentPrefix}-${index}`, revision, text}); } catch (error) {
          try { onError?.(error); } catch {}
        }
      }
    }
  };

  const bind = () => {
    if (bound) return;
    bound = true;
    unbind = [installHandler(recognition, 'result', emitResult)];
    const errorHandler = event => {
      const error = new Error(`Speech recognition error: ${event?.error ?? 'unknown'}`);
      try { onError?.(error, event); } catch {}
    };
    unbind.push(installHandler(recognition, 'error', errorHandler));
  };

  const unbindRecognition = () => {
    for (const remove of unbind.splice(0)) remove();
    bound = false;
  };

  const start = () => {
    bind();
    recognition.start?.();
  };

  const stop = ({abort = false} = {}) => {
    if (abort) recognition.abort?.();
    else recognition.stop?.();
    unbindRecognition();
  };

  return Object.freeze({
    bind,
    start,
    stop,
    unbind: unbindRecognition,
    get bound() { return bound; },
  });
}
