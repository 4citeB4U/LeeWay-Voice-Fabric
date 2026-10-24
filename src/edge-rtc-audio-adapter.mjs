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
  let generation = 0;
  let cancelStart = null;

  const dispatchPcm = pcm => {
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
    return session.dispatch(frame);
  };

  const emitPcm = pcm => {
    if (!running) return Promise.reject(makeAbortError('Audio input is not running.'));
    try { return dispatchPcm(pcm); }
    catch (error) { return Promise.reject(error); }
  };

  const start = () => {
    if (running) return Promise.resolve();
    if (startPromise) return startPromise;
    const token = ++generation;
    let capturing = false;
    let localRelease = null;
    let localCapture;
    const isCurrent = () => token === generation && !session.signal?.aborted;
    const cleanLocal = () => {
      capturing = false;
      try { localCapture?.stop?.(); } catch {}
      localRelease?.();
      if (releaseInput === localRelease) releaseInput = null;
    };
    const cancelled = new Promise((resolve, reject) => {
      cancelStart = () => reject(makeAbortError('Audio input start was cancelled.'));
    });
    const work = (async () => {
      try {
        localRelease = session.claimInput(ownerId);
        releaseInput = localRelease;
        localCapture = new AudioCapture(pcm => {
          if (!isCurrent() || !capturing) return;
          const failed = error => {
            if (!isCurrent()) return;
            try { stop(); } catch {}
            try { onError?.(error); } catch {}
          };
          try {
            void dispatchPcm(pcm).catch(failed);
          } catch (error) { failed(error); }
        });
        capture = localCapture;
        if (startSession) await session.start();
        if (!isCurrent()) throw makeAbortError('Audio input start was cancelled.');
        capturing = true;
        await localCapture.start();
        if (!isCurrent()) throw makeAbortError('Audio input start was cancelled.');
        running = true;
      } catch (error) {
        // A late permission grant belongs to this attempt, never a newer one.
        cleanLocal();
        throw error;
      }
    })();
    const pending = Promise.race([work, cancelled]);
    startPromise = pending;
    const clear = () => {
      if (startPromise === pending) { startPromise = null; cancelStart = null; }
    };
    pending.then(
      clear,
      clear,
    );
    return pending;
  };

  const stop = () => {
    generation += 1;
    running = false;
    cancelStart?.();
    cancelStart = null;
    startPromise = null;
    try { capture?.stop?.(); } finally {
      releaseInput?.();
      releaseInput = null;
    }
  };

  session.signal?.addEventListener('abort', () => {
    try { stop(); } catch (error) { try { onError?.(error); } catch {} }
  }, {once: true});

  return Object.freeze({
    get capture() { return capture; },
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
  restartDelayMs = 250,
  onError,
  onFinal,
  onSpeechStart,
} = {}) {
  assertObject(session, 'session');
  assertFunction(session.frame, 'session.frame');
  assertFunction(session.dispatch, 'session.dispatch');
  assertObject(recognition, 'recognition');
  assertString(segmentPrefix, 'segmentPrefix');
  if (!Number.isFinite(restartDelayMs) || restartDelayMs < 0 || restartDelayMs > 5_000) {
    throw new TypeError('restartDelayMs must be between 0 and 5000 milliseconds.');
  }

  const revisions = new Map();
  const signatures = new Map();
  const finals = new Set();
  let run = 0;
  let activeRun = null;
  let installed = false;
  let started = false;
  let stopping = false;
  let wantRunning = false;
  let restartTimer = null;
  let restartAttempts = 0;
  let unbind = [];

  const emitResult = (event, state) => {
    if (!installed || state !== activeRun || state.aborted) return;
    const results = event?.results;
    if (!results || !Number.isInteger(event.resultIndex)) return;

    for (let index = event.resultIndex; index < results.length; index += 1) {
      if (finals.has(index)) continue;
      const result = results[index];
      const alternative = result?.[0];
      const text = typeof alternative?.transcript === 'string' ? alternative.transcript : '';
      if (!text.trim()) continue;
      restartAttempts = 0;
      const final = Boolean(result.isFinal);
      const signature = `${final ? 'final' : 'partial'}\0${text}`;
      if (signatures.get(index) === signature) continue;

      const revision = (revisions.get(index) ?? -1) + 1;
      revisions.set(index, revision);
      signatures.set(index, signature);
      if (final) finals.add(index);

      const segmentId = `${segmentPrefix}-${state.id}-${index}`;
      const frame = session.frame(final ? 'transcript.final' : 'transcript.partial', {
        segmentId,
        revision,
        text,
      }, {
        direction: 'downstream',
        class: 'data',
        interruptible: !final,
      });
      dispatchFrame(session, frame, onError).then(() => {
        // A final callback is evidence of successful bus processing, not merely
        // a recognizer event. Aborted runs cannot initiate downstream work.
        if (final && !state.aborted) {
          try { onFinal?.({segmentId, revision, text}); } catch (error) {
            try { onError?.(error); } catch {}
          }
        }
      }, () => {
        if (state === activeRun && signatures.get(index) === signature) {
          signatures.delete(index);
          finals.delete(index);
        }
      });
    }
  };

  const bind = () => {
    if (installed) return;
    activeRun = {id: ++run, aborted: false};
    const state = activeRun;
    revisions.clear();
    signatures.clear();
    finals.clear();
    installed = true;
    unbind = [installHandler(recognition, 'result', event => emitResult(event, state))];
    unbind.push(installHandler(recognition, 'speechstart', event => {
      if (!installed || state !== activeRun || state.aborted) return;
      try { onSpeechStart?.(event); } catch (error) {
        try { onError?.(error, event); } catch {}
      }
    }));
    const errorHandler = event => {
      if (event?.error === 'no-speech') return;
      const error = new Error(`Speech recognition error: ${event?.error ?? 'unknown'}`);
      try { onError?.(error, event); } catch {}
    };
    unbind.push(installHandler(recognition, 'error', errorHandler));
    unbind.push(installHandler(recognition, 'end', () => {
      if (state !== activeRun) return;
      const restart = started && !stopping && wantRunning;
      unbindRecognition();
      if (restart) {
        const delay = Math.min(restartDelayMs * (2 ** Math.min(restartAttempts, 4)), 4_000);
        restartAttempts += 1;
        restartTimer = setTimeout(() => {
          restartTimer = null;
          if (!wantRunning) return;
          try { start(); } catch (error) {
            wantRunning = false;
            try { onError?.(error); } catch {}
          }
        }, delay);
      }
    }));
  };

  const unbindRecognition = () => {
    for (const remove of unbind.splice(0)) remove();
    installed = false;
    started = false;
    stopping = false;
  };

  const start = () => {
    if (stopping) throw new Error('Speech recognition is still stopping; wait for its end event.');
    if (started) return;
    wantRunning = true;
    clearTimeout(restartTimer);
    restartTimer = null;
    bind();
    try { recognition.start?.(); started = true; }
    catch (error) { wantRunning = false; unbindRecognition(); throw error; }
  };

  const stop = ({abort = false} = {}) => {
    wantRunning = false;
    clearTimeout(restartTimer);
    restartTimer = null;
    if (!installed) return;
    if (abort) {
      activeRun.aborted = true;
      unbindRecognition();
      recognition.abort?.();
    } else {
      // Keep result listeners through the final result emitted by stop().
      stopping = true;
      started = false;
      try { recognition.stop?.(); }
      catch (error) { unbindRecognition(); throw error; }
    }
  };

  return Object.freeze({
    bind,
    start,
    stop,
    unbind: () => { wantRunning = false; clearTimeout(restartTimer); restartTimer = null; if (activeRun) activeRun.aborted = true; unbindRecognition(); },
    get bound() { return started && !stopping; },
  });
}
