const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../src/realtime-voice-session.mjs');
}

test('system frames overtake queued user input while preserving input order', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  const seen = [];
  let releaseFirst;
  const firstDataStarted = new Promise(resolve => { releaseFirst = resolve; });
  const processor = {
    async handle(frame) {
      seen.push(frame.kind);
      if (frame.kind === 'audio.input' && seen.filter(kind => kind === 'audio.input').length === 1) await firstDataStarted;
    },
  };
  const session = new RealtimeVoiceSession({sessionId: 'priority-test', processors: [processor], maxQueueSize: 8});
  const audio = {pcm16: new ArrayBuffer(0), sampleRate: 16000, channels: 1};
  const first = session.dispatch(session.frame('audio.input', audio));
  await new Promise(resolve => setImmediate(resolve));
  const second = session.dispatch(session.frame('audio.input', audio));
  const interruption = session.interrupt('barge-in');
  const third = session.dispatch(session.frame('audio.input', audio));
  releaseFirst();
  await Promise.all([first, second, interruption, third]);
  assert.deepEqual(seen, ['audio.input', 'interruption', 'audio.input', 'audio.input']);
});

test('interruption survives ordinary saturation and cancels stale assistant work', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  const seen = [];
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const session = new RealtimeVoiceSession({
    sessionId: 'cancel-test',
    maxQueueSize: 1,
    processors: [{
      async handle(frame, context) {
        seen.push(frame.kind);
        if (frame.kind === 'agent.text.delta') {
          started();
          await new Promise((resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason), {once: true});
          });
        }
      },
    }],
  });
  const inFlight = session.dispatch(session.frame('agent.text.delta', {text: 'first'}));
  await startedPromise;
  const queued = session.dispatch(session.frame('agent.text.delta', {text: 'stale'}));
  const interruption = session.interrupt('barge-in');
  await assert.rejects(inFlight, {name: 'AbortError'});
  await assert.rejects(queued, {name: 'AbortError'});
  await interruption;
  assert.deepEqual(seen, ['agent.text.delta', 'interruption']);
});

test('queued final user input survives assistant cancellation', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  const seen = [];
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const session = new RealtimeVoiceSession({
    sessionId: 'protected-input-test',
    maxQueueSize: 1,
    maxProtectedQueueSize: 2,
    processors: [{
      async handle(frame, context) {
        seen.push(frame.kind);
        if (frame.kind === 'agent.text.delta') {
          started();
          await new Promise((resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason), {once: true});
          });
        }
      },
    }],
  });
  const inFlight = session.dispatch(session.frame('agent.text.delta', {text: 'cancel me'}));
  await startedPromise;
  const stale = session.dispatch(session.frame('agent.text.delta', {text: 'stale output'}));
  const audio = session.dispatch(session.frame('audio.input', {pcm16: new ArrayBuffer(0), sampleRate: 16000, channels: 1}));
  const final = session.dispatch(session.frame('transcript.final', {
    segmentId: 'segment-1',
    revision: 1,
    text: 'The committed user turn',
  }));
  const interruption = session.interrupt('barge-in');
  await assert.rejects(inFlight, {name: 'AbortError'});
  await assert.rejects(stale, {name: 'AbortError'});
  await interruption;
  await Promise.all([audio, final]);
  assert.deepEqual(seen, ['agent.text.delta', 'interruption', 'audio.input', 'transcript.final']);
});

test('a processor may await emission without deadlocking the session drain', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  const seen = [];
  const session = new RealtimeVoiceSession({
    sessionId: 'emit-test',
    processors: [{
      async handle(frame, context) {
        seen.push(frame.kind);
        if (frame.kind === 'agent.text.delta') {
          await context.emit(session.frame('agent.text.final', {}));
        }
      },
    }],
  });
  await session.dispatch(session.frame('agent.text.delta', {text: 'hello'}));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['agent.text.delta', 'agent.text.final']);
});

test('the queue is bounded and rejects excess ordinary work', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const session = new RealtimeVoiceSession({
    sessionId: 'bound-test',
    maxQueueSize: 1,
    processors: [{async handle(frame) { if (frame.payload.text === 'hold') await hold; }}],
  });
  const first = session.dispatch(session.frame('agent.text.delta', {text: 'hold'}));
  await new Promise(resolve => setImmediate(resolve));
  const queued = session.dispatch(session.frame('agent.text.delta', {text: 'queued'}));
  await assert.rejects(session.dispatch(session.frame('agent.text.delta', {text: 'overflow'})), /queue is full/);
  release();
  await Promise.all([first, queued]);
});

test('only one input owner may claim the session at a time', async () => {
  const {RealtimeVoiceSession} = await loadModule();
  const session = new RealtimeVoiceSession({sessionId: 'owner-test'});
  const release = session.claimInput('microphone-1');
  const releaseReentrant = session.claimInput('microphone-1');
  assert.equal(session.inputOwner, 'microphone-1');
  assert.throws(() => session.claimInput('microphone-2'), /already owned/);
  release();
  assert.equal(session.inputOwner, 'microphone-1');
  releaseReentrant();
  assert.equal(session.inputOwner, null);
  const releaseSecond = session.claimInput('microphone-2');
  assert.equal(session.inputOwner, 'microphone-2');
  releaseSecond();
  assert.equal(session.inputOwner, null);
});

test('transcript revisions replace partial text and commit a final exactly once', async () => {
  const {TranscriptReducer, createLeeWayFrame} = await loadModule();
  const reducer = new TranscriptReducer();
  const base = {sessionId: 'transcript-test', sequence: 1, epoch: 0};
  const partial = value => createLeeWayFrame({
    ...base,
    kind: 'transcript.partial',
    payload: {segmentId: 'segment-1', revision: value.revision, text: value.text},
  });
  assert.equal(reducer.apply(partial({revision: 1, text: 'Agent'})), true);
  assert.equal(reducer.apply(partial({revision: 2, text: 'Agent Lee'})), true);
  assert.equal(reducer.renderedText(), 'Agent Lee');
  const final = createLeeWayFrame({
    ...base,
    kind: 'transcript.final',
    payload: {segmentId: 'segment-1', revision: 3, text: 'Agent Lee open diagnostics'},
  });
  assert.equal(final.interruptible, false);
  assert.equal(reducer.apply(final), true);
  assert.equal(reducer.apply(final), false);
  assert.equal(reducer.apply(partial({revision: 4, text: 'late revision'})), false);
  assert.equal(reducer.finalizedText(), 'Agent Lee open diagnostics');
  assert.deepEqual(reducer.snapshot(), [{segmentId: 'segment-1', revision: 3, text: 'Agent Lee open diagnostics', final: true}]);
});

test('frame defaults enforce cancellation boundaries', async () => {
  const {createLeeWayFrame} = await loadModule();
  const frame = values => createLeeWayFrame({sessionId: 'contract-test', sequence: 1, epoch: 0, ...values});
  assert.equal(frame({kind: 'audio.input'}).interruptible, false);
  assert.equal(frame({kind: 'transcript.final'}).interruptible, false);
  assert.equal(frame({kind: 'agent.text.delta'}).interruptible, true);
  assert.equal(frame({kind: 'interruption', class: 'data'}).class, 'system');
});
