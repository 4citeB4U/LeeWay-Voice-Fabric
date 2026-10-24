const SYSTEM_CLASS = 'system';
const DATA_CLASS = 'data';
const CONTROL_CLASS = 'control';
const DOWNSTREAM = 'downstream';
const UPSTREAM = 'upstream';

const SYSTEM_KINDS = new Set([
  'session.start',
  'session.stop',
  'interruption',
  'vad.started',
  'vad.stopped',
  'turn.user.started',
  'turn.user.ended',
  'session.error',
]);

const NON_INTERRUPTIBLE_KINDS = new Set(['audio.input', 'transcript.final']);

const isRecord = value => value !== null && typeof value === 'object';
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const makeAbortError = message => {
  if (typeof globalThis.DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string.`);
}

function defaultClass(kind) {
  return SYSTEM_KINDS.has(kind) ? SYSTEM_CLASS : DATA_CLASS;
}

function priorityFor(frame) {
  if (frame.kind === 'interruption') return 0;
  return frame.class === SYSTEM_CLASS ? 1 : 2;
}

/**
 * Create a normalized frame for the LeeWay realtime voice bus.
 *
 * System frames and committed user input are deliberately protected from
 * interruption. This keeps cancellation scoped to assistant work.
 */
export function createLeeWayFrame({
  sessionId,
  turnId,
  kind,
  payload = {},
  id = makeId(),
  sequence,
  epoch = 0,
  monotonicMs = monotonicNow(),
  direction = DOWNSTREAM,
  class: frameClass,
  interruptible,
} = {}) {
  assertString(sessionId, 'sessionId');
  assertString(kind, 'kind');
  assertString(id, 'id');
  if (turnId !== undefined) assertString(turnId, 'turnId');
  if (!Number.isInteger(sequence) || sequence < 0) throw new TypeError('sequence must be a non-negative integer.');
  if (!Number.isInteger(epoch) || epoch < 0) throw new TypeError('epoch must be a non-negative integer.');
  if (!Number.isFinite(monotonicMs)) throw new TypeError('monotonicMs must be finite.');
  if (![DOWNSTREAM, UPSTREAM].includes(direction)) throw new TypeError('direction must be downstream or upstream.');
  if (!isRecord(payload)) throw new TypeError('payload must be an object.');

  const resolvedClass = kind === 'interruption' ? SYSTEM_CLASS : (frameClass ?? defaultClass(kind));
  if (![SYSTEM_CLASS, DATA_CLASS, CONTROL_CLASS].includes(resolvedClass)) {
    throw new TypeError('class must be system, data, or control.');
  }

  const resolvedInterruptible = resolvedClass === SYSTEM_CLASS || NON_INTERRUPTIBLE_KINDS.has(kind)
    ? false
    : interruptible ?? true;

  return {
    id,
    sessionId,
    ...(turnId === undefined ? {} : {turnId}),
    sequence,
    epoch,
    monotonicMs,
    direction,
    class: resolvedClass,
    interruptible: Boolean(resolvedInterruptible),
    kind,
    payload,
  };
}

export function validateLeeWayFrame(frame) {
  if (!isRecord(frame)) throw new TypeError('frame must be an object.');
  const normalized = createLeeWayFrame(frame);
  if (frame.class === SYSTEM_CLASS && frame.interruptible) throw new TypeError('system frames cannot be interruptible.');
  if (NON_INTERRUPTIBLE_KINDS.has(frame.kind) && frame.interruptible) {
    throw new TypeError(`${frame.kind} frames cannot be interruptible.`);
  }
  return normalized;
}

/** Reduce revision-producing ASR events into partial state and final commits. */
export class TranscriptReducer {
  constructor() {
    this.segments = new Map();
  }

  apply(frame) {
    if (!isRecord(frame) || !['transcript.partial', 'transcript.final'].includes(frame.kind)) {
      throw new TypeError('TranscriptReducer accepts transcript.partial or transcript.final frames.');
    }
    const payload = frame.payload;
    assertString(payload.segmentId, 'payload.segmentId');
    if (!Number.isInteger(payload.revision) || payload.revision < 0) {
      throw new TypeError('payload.revision must be a non-negative integer.');
    }
    if (typeof payload.text !== 'string') throw new TypeError('payload.text must be a string.');

    const previous = this.segments.get(payload.segmentId);
    if (previous && previous.final) return false;
    if (previous && payload.revision <= previous.revision) return false;

    this.segments.set(payload.segmentId, {
      segmentId: payload.segmentId,
      revision: payload.revision,
      text: payload.text.trim(),
      final: frame.kind === 'transcript.final',
    });
    return true;
  }

  renderedText() {
    return [...this.segments.values()].map(segment => segment.text).filter(Boolean).join(' ');
  }

  finalizedText() {
    return [...this.segments.values()].filter(segment => segment.final).map(segment => segment.text).filter(Boolean).join(' ');
  }

  snapshot() {
    return [...this.segments.values()].map(segment => ({...segment}));
  }

  reset() {
    this.segments.clear();
  }
}

/**
 * Sole owner for a LeeWay realtime voice session.
 *
 * System frames outrank ordinary data/control frames, while arrival order
 * remains stable within a priority tier. The queue is bounded so a fast
 * producer cannot grow memory without limit.
 */
export class RealtimeVoiceSession {
  constructor({sessionId = makeId(), processors = [], maxQueueSize = 256, maxProtectedQueueSize = maxQueueSize, onError} = {}) {
    assertString(sessionId, 'sessionId');
    if (!Number.isInteger(maxQueueSize) || maxQueueSize < 1) throw new TypeError('maxQueueSize must be a positive integer.');
    if (!Number.isInteger(maxProtectedQueueSize) || maxProtectedQueueSize < 1) throw new TypeError('maxProtectedQueueSize must be a positive integer.');
    for (const processor of processors) this.#assertProcessor(processor);

    this.sessionId = sessionId;
    this.processors = [...processors];
    this.maxQueueSize = maxQueueSize;
    this.maxProtectedQueueSize = maxProtectedQueueSize;
    this.onError = onError;
    this.sequence = 0;
    this.epoch = 0;
    this.inputOwner = null;
    this.inputClaims = 0;
    this.closed = false;
    this.processing = false;
    this.interruptionProcessing = false;
    this.pendingInterruption = null;
    this.lifetimeController = new AbortController();
    this.generationController = new AbortController();
    this.systemQueue = [];
    this.protectedQueue = [];
    this.queue = [];
  }

  #assertProcessor(processor) {
    if (!processor || typeof processor.handle !== 'function') {
      throw new TypeError('Each processor must expose an async handle(frame, context) method.');
    }
  }

  addProcessor(processor) {
    this.#assertProcessor(processor);
    if (this.closed) throw new Error('Cannot add a processor to a closed session.');
    this.processors.push(processor);
    return () => {
      const index = this.processors.indexOf(processor);
      if (index >= 0) this.processors.splice(index, 1);
    };
  }

  nextSequence() {
    return ++this.sequence;
  }

  nextEpoch() {
    return ++this.epoch;
  }

  frame(kind, payload = {}, options = {}) {
    return createLeeWayFrame({
      ...options,
      sessionId: this.sessionId,
      kind,
      payload,
      sequence: this.nextSequence(),
      epoch: options.epoch ?? this.epoch,
    });
  }

  claimInput(ownerId) {
    assertString(ownerId, 'ownerId');
    if (this.closed) throw new Error('Cannot claim input on a closed session.');
    if (this.inputOwner && this.inputOwner !== ownerId) throw new Error(`Input is already owned by ${this.inputOwner}.`);
    this.inputOwner = ownerId;
    this.inputClaims += 1;
    let released = false;
    return () => {
      if (!released && this.inputOwner === ownerId) {
        this.inputClaims -= 1;
        if (this.inputClaims === 0) this.inputOwner = null;
      }
      released = true;
    };
  }

  dispatch(frame) {
    try { return this.#enqueue(frame); }
    catch (error) { return Promise.reject(error); }
  }

  #enqueue(frame) {
    if (this.closed) throw new Error('Session is closed.');
    const normalized = validateLeeWayFrame(frame);
    if (normalized.sessionId !== this.sessionId) throw new Error('Frame belongs to another session.');
    if (normalized.epoch > this.epoch) throw new Error('Frame epoch is ahead of the session epoch.');
    if (this.#isStale(normalized)) throw makeAbortError('Frame belongs to an interrupted generation.');

    // The emergency lane never competes with ordinary system/data capacity.
    // While a notification is in flight, retain at most one pending notification
    // with the latest epoch/reason. Callers share its completion, not a waiter list.
    if (normalized.kind === 'interruption') {
      if (this.pendingInterruption) {
        this.pendingInterruption.frame = normalized;
        return this.pendingInterruption.completion;
      }
      const entry = {frame: normalized};
      entry.completion = new Promise((resolve, reject) => Object.assign(entry, {resolve, reject}));
      this.pendingInterruption = entry;
      void this.#drainInterruptions();
      return entry.completion;
    }

    const targetQueue = normalized.class === SYSTEM_CLASS
      ? this.systemQueue
      : (normalized.interruptible ? this.queue : this.protectedQueue);
    const queueLimit = normalized.class === SYSTEM_CLASS
      ? Math.max(1, Math.min(16, this.maxQueueSize))
      : (normalized.interruptible ? this.maxQueueSize : this.maxProtectedQueueSize);
    if (targetQueue.length >= queueLimit) throw new Error('Realtime voice frame queue is full.');

    return new Promise((resolve, reject) => {
      targetQueue.push({frame: normalized, resolve, reject, priority: priorityFor(normalized)});
      this.#scheduleDrain();
    });
  }

  async start() {
    return this.dispatch(this.frame('session.start', {}, {class: SYSTEM_CLASS}));
  }

  async interrupt(reason = 'barge-in', turnId) {
    if (this.closed) return Promise.reject(new Error('Session is closed.'));
    const epoch = this.nextEpoch();
    const previousGeneration = this.generationController;
    previousGeneration.abort(makeAbortError(`Generation interrupted: ${reason}.`));
    this.generationController = new AbortController();
    this.#rejectStaleQueuedFrames();
    return this.dispatch(this.frame('interruption', {reason}, {
      class: SYSTEM_CLASS,
      interruptible: false,
      epoch,
      ...(turnId === undefined ? {} : {turnId}),
    }));
  }

  async stop() {
    if (this.closed) return;
    // Close admission synchronously: shutdown must not wait behind a processor,
    // microphone permission, or a full system queue.
    this.closed = true;
    this.nextEpoch();
    const error = makeAbortError('Session stopped.');
    this.generationController.abort(error);
    this.lifetimeController.abort(error);
    this.inputOwner = null;
    this.inputClaims = 0;
    for (const queue of [this.systemQueue, this.protectedQueue, this.queue]) {
      for (const entry of queue.splice(0)) entry.reject(error);
    }
    this.pendingInterruption?.reject(error);
    this.pendingInterruption = null;
  }

  get signal() {
    return this.lifetimeController.signal;
  }

  async #drainInterruptions() {
    if (this.interruptionProcessing) return;
    this.interruptionProcessing = true;
    try {
      while (this.pendingInterruption && !this.closed) {
        const entry = this.pendingInterruption;
        this.pendingInterruption = null;
        try {
          await this.#process(entry.frame);
          entry.resolve(entry.frame);
        } catch (error) {
          entry.reject(error);
          try { this.onError?.(error, entry.frame); } catch {}
        }
      }
    } finally {
      this.interruptionProcessing = false;
    }
  }

  #scheduleDrain() {
    if (!this.processing) void this.#drain();
  }

  #takeNext() {
    if (this.systemQueue.length) {
      let selected = 0;
      for (let index = 1; index < this.systemQueue.length; index += 1) {
        const candidate = this.systemQueue[index];
        const current = this.systemQueue[selected];
        if (candidate.priority < current.priority ||
            (candidate.priority === current.priority && candidate.frame.sequence < current.frame.sequence)) selected = index;
      }
      return this.systemQueue.splice(selected, 1)[0];
    }
    if (this.protectedQueue.length) return this.protectedQueue.shift();
    return this.queue.shift();
  }

  #isStale(frame) {
    return frame.interruptible && frame.epoch < this.epoch;
  }

  #rejectStaleQueuedFrames() {
    const survivors = [];
    for (const entry of this.queue) {
      if (this.#isStale(entry.frame)) entry.reject(makeAbortError('Queued frame was cancelled by an interruption.'));
      else survivors.push(entry);
    }
    this.queue = survivors;
  }

  async #drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (!this.closed && (this.systemQueue.length || this.protectedQueue.length || this.queue.length)) {
        const entry = this.#takeNext();
        try {
          await this.#process(entry.frame);
          entry.resolve(entry.frame);
        } catch (error) {
          entry.reject(error);
          try { this.onError?.(error, entry.frame); } catch {}
        }
      }
    } finally {
      this.processing = false;
      if (!this.closed && (this.systemQueue.length || this.protectedQueue.length || this.queue.length)) this.#scheduleDrain();
    }
  }

  async #process(frame) {
    if (this.#isStale(frame)) throw makeAbortError('Frame was cancelled by an interruption.');
    const signal = frame.interruptible ? this.generationController.signal : this.lifetimeController.signal;
    const isCurrent = () => !this.closed && !signal.aborted && (!frame.interruptible || frame.epoch === this.epoch);
    const context = {
      session: this,
      signal,
      isCurrent,
      emit: emitted => {
        if (!isCurrent()) return Promise.reject(makeAbortError('Emitting processor is no longer current.'));
        try {
          // Enqueue validates admission synchronously. Awaiting completion in
          // this serial processor would deadlock; emit acknowledges admission
          // only, while processing failures flow through onError.
          this.#enqueue(emitted).catch(() => {});
          return Promise.resolve();
        } catch (error) { return Promise.reject(error); }
      },
    };
    for (const processor of this.processors) {
      if (!isCurrent()) throw makeAbortError('Frame was cancelled during processing.');
      await new Promise((resolve, reject) => {
        const cancelled = () => { cleanup(); reject(signal.reason ?? makeAbortError('Processing cancelled.')); };
        const cleanup = () => signal.removeEventListener('abort', cancelled);
        signal.addEventListener('abort', cancelled, {once: true});
        if (signal.aborted) { cancelled(); return; }
        // Observe the late settlement even when a provider ignores AbortSignal.
        // It cannot hold the bus or use this stale context to emit new work.
        Promise.resolve().then(() => {
          if (!isCurrent()) throw makeAbortError('Frame was cancelled before processing.');
          return processor.handle(frame, context);
        }).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      });
    }
    if (!isCurrent()) throw makeAbortError('Frame was cancelled during processing.');
  }
}

export const LeeWayFrame = Object.freeze({
  SYSTEM: SYSTEM_CLASS,
  DATA: DATA_CLASS,
  CONTROL: CONTROL_CLASS,
  DOWNSTREAM,
  UPSTREAM,
});
