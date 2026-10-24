const test = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

// Independent release evidence: only public APIs, no microphone or services.
// Set LEEWAY_TEST_BASELINE_REF to a full commit SHA to run the identical tests
// against immutable sources, even while the parent edits the shared checkout.
const baselineRef = process.env.LEEWAY_TEST_BASELINE_REF;
if (baselineRef) assert.match(baselineRef, /^[a-f0-9]{40}$/i);
async function load(name) {
  if (!baselineRef) return import(`../src/${name}.mjs`);
  const source = execFileSync('git', ['show', `${baselineRef}:src/${name}.mjs`], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const modules = Promise.all([load('realtime-voice-session'), load('edge-rtc-audio-adapter')]);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
const observe = promise => Promise.resolve(promise).then(
  value => ({status: 'fulfilled', value}),
  reason => ({status: 'rejected', reason}),
);
// This is a deadlock watchdog, not a claimed real-world latency budget.
// All test ordering is driven by explicit deferred handshakes.
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve({status: 'pending'}), 250); }),
    ]);
  } finally { clearTimeout(timer); }
}
function fulfilled(result, label) {
  assert.equal(result.status, 'fulfilled', `${label}: ${result.status}${result.reason ? ` (${result.reason.message})` : ''}`);
}
function aborted(result, label) {
  assert.equal(result.status, 'rejected', `${label}: ${result.status}`);
  assert.equal(result.reason.name, 'AbortError', label);
}
function trackSession(t, session, releases = []) {
  const pending = [];
  t.after(async () => {
    for (const gate of releases) gate.resolve();
    await bounded(Promise.all(pending));
    await bounded(observe(session.stop()));
  });
  return promise => {
    const result = observe(promise);
    pending.push(result);
    return result;
  };
}
const audio = () => ({pcm: new Int16Array([1, -1]).buffer, sampleRate: 16000, channels: 1});

test('independent: protected PCM and final transcript survive barge-in and ordinary saturation', async t => {
  const [{RealtimeVoiceSession, TranscriptReducer}] = await modules;
  const entered = deferred();
  const release = deferred();
  const seen = [];
  const reducer = new TranscriptReducer();
  const session = new RealtimeVoiceSession({sessionId: 'independent-protected', maxQueueSize: 1, maxProtectedQueueSize: 2,
    processors: [{async handle(frame, context) {
      seen.push(frame.kind);
      if (frame.payload.text === 'held') {
        entered.resolve();
        await Promise.race([release.promise, new Promise(resolve => context.signal.addEventListener('abort', resolve, {once: true}))]);
      }
      if (frame.kind === 'transcript.final') reducer.apply(frame);
    }}],
  });
  const track = trackSession(t, session, [release]);
  const active = track(session.dispatch(session.frame('agent.text.delta', {text: 'held'})));
  await entered.promise;
  const queued = track(session.dispatch(session.frame('agent.text.delta', {text: 'obsolete'})));
  const pcm = track(session.dispatch(session.frame('audio.input', audio())));
  const final = track(session.dispatch(session.frame('transcript.final', {segmentId: 'user-1', revision: 1, text: 'keep my words'})));
  const interrupted = track(session.interrupt());
  fulfilled(await bounded(interrupted), 'interruption');
  aborted(await bounded(active), 'active assistant');
  aborted(await bounded(queued), 'queued assistant');
  fulfilled(await bounded(pcm), 'protected PCM');
  fulfilled(await bounded(final), 'protected final');
  assert.equal(reducer.finalizedText(), 'keep my words');
  assert.deepEqual(seen.filter(kind => kind === 'audio.input' || kind === 'transcript.final'), ['audio.input', 'transcript.final']);
});

for (const action of ['interrupt', 'stop']) {
  test(`independent: ${action} bypasses a full system lane`, async t => {
    const [{RealtimeVoiceSession}] = await modules;
    const entered = deferred();
    const release = deferred();
    const seen = [];
    const session = new RealtimeVoiceSession({sessionId: `independent-saturation-${action}`, maxQueueSize: 1,
      processors: [{async handle(frame, context) {
        seen.push(frame.kind);
        if (frame.payload.text === 'held') {
          entered.resolve();
          await Promise.race([release.promise, new Promise(resolve => context.signal.addEventListener('abort', resolve, {once: true}))]);
        }
      }}],
    });
    const track = trackSession(t, session, [release]);
    track(session.dispatch(session.frame('agent.text.delta', {text: 'held'})));
    await entered.promise;
    track(session.dispatch(session.frame('vad.started')));
    track(session.dispatch(session.frame('agent.text.delta', {text: 'queued'})));
    const result = await bounded(track(session[action]()));
    fulfilled(result, `${action} with queued system notification`);
    if (action === 'interrupt') assert.ok(seen.includes('interruption'));
    else assert.throws(() => session.claimInput('after-stop'), /closed|stop/i);
  });

  for (const kind of ['agent.text.delta', 'audio.input', 'session.start']) {
    test(`independent: ${action} bypasses a hung ${kind} handler`, async t => {
      const [{RealtimeVoiceSession}] = await modules;
      const entered = deferred();
      const release = deferred();
      const seen = [];
      const session = new RealtimeVoiceSession({sessionId: `independent-hung-${action}-${kind}`, maxQueueSize: 1,
        processors: [{async handle(frame) {
          seen.push(frame.kind);
          if (frame.payload.held) { entered.resolve(); await release.promise; }
        }}],
      });
      const track = trackSession(t, session, [release]);
      const active = track(session.dispatch(session.frame(kind, {...audio(), held: true})));
      await entered.promise;
      track(session.dispatch(session.frame('agent.text.delta', {text: 'queued'})));
      const result = await bounded(track(session[action]()));
      fulfilled(result, `${action} must settle before the held handler is released`);
      if (action === 'interrupt') {
        assert.ok(seen.includes('interruption'), 'interruption must reach processors');
        if (kind === 'agent.text.delta') aborted(await bounded(active), 'hung assistant dispatch');
        else {
          release.resolve();
          fulfilled(await bounded(active), 'protected handler must survive barge-in');
        }
      } else assert.throws(() => session.claimInput('after-stop'), /closed|stop/i);
    });
  }
}

test('independent: stop seals new admission before a hung interruption callback completes', async t => {
  const [{RealtimeVoiceSession}] = await modules;
  const entered = deferred();
  const release = deferred();
  const session = new RealtimeVoiceSession({sessionId: 'independent-close-admission', processors: [{async handle(frame) {
    if (frame.kind === 'interruption') { entered.resolve(); await release.promise; }
  }}]});
  const track = trackSession(t, session, [release]);
  track(session.stop());
  // Let a future implementation skip shutdown notification entirely, too.
  await Promise.race([entered.promise, new Promise(resolve => setImmediate(resolve))]);
  assert.throws(() => session.claimInput('too-late'), /closed|stop/i);
  const result = await bounded(track(session.dispatch(session.frame('audio.input', audio()))));
  assert.equal(result.status, 'rejected', 'new input must be rejected during shutdown');
});

test('independent: a saved stale callback cannot mint output in the new epoch', async t => {
  const [{RealtimeVoiceSession}] = await modules;
  let oldContext;
  const delivered = [];
  const session = new RealtimeVoiceSession({sessionId: 'independent-stale-origin', processors: [{async handle(frame, context) {
    if (frame.payload.text === 'origin') oldContext = context;
    if (frame.payload.text === 'late callback') delivered.push(frame);
  }}]});
  const track = trackSession(t, session);
  fulfilled(await bounded(track(session.dispatch(session.frame('agent.text.delta', {text: 'origin'})))), 'origin');
  fulfilled(await bounded(track(session.interrupt())), 'barge-in');
  assert.equal(oldContext.isCurrent(), false);
  assert.equal(oldContext.signal.aborted, true);
  const result = await bounded(observe(oldContext.emit(session.frame('agent.text.delta', {text: 'late callback'}))));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual({admission: result.status, delivered: delivered.length}, {admission: 'rejected', delivered: 0},
    'originating generation must control emit even if session.frame stamps the current epoch');
  aborted(result, 'stale callback');
});

test('independent: emit reports overflow rejection instead of false acceptance', async t => {
  const [{RealtimeVoiceSession}] = await modules;
  const entered = deferred();
  const release = deferred();
  const emission = deferred();
  const delivered = [];
  const session = new RealtimeVoiceSession({sessionId: 'independent-emit-overflow', maxQueueSize: 1,
    processors: [{async handle(frame, context) {
      delivered.push(frame.payload.text);
      if (frame.payload.text === 'producer') {
        entered.resolve();
        await release.promise;
        emission.resolve(await observe(context.emit(session.frame('agent.text.delta', {text: 'overflow'}))));
      }
    }}],
  });
  const track = trackSession(t, session, [release]);
  const producer = track(session.dispatch(session.frame('agent.text.delta', {text: 'producer'})));
  await entered.promise;
  const queued = track(session.dispatch(session.frame('agent.text.delta', {text: 'queued'})));
  release.resolve();
  fulfilled(await bounded(producer), 'producer');
  fulfilled(await bounded(queued), 'queued');
  const result = await bounded(emission.promise);
  assert.equal(result.status, 'rejected', 'context.emit must reject when no queue capacity was available');
  assert.match(result.reason.message, /full|capacity|overflow/i);
  assert.ok(!delivered.includes('overflow'));
});

test('independent: accepted emit can be awaited without waiting for its own drain', async t => {
  const [{RealtimeVoiceSession}] = await modules;
  const child = deferred();
  const session = new RealtimeVoiceSession({sessionId: 'independent-emit-accepted', processors: [{async handle(frame, context) {
    if (frame.payload.text === 'producer') await context.emit(session.frame('agent.text.delta', {text: 'child'}));
    if (frame.payload.text === 'child') child.resolve({status: 'fulfilled'});
  }}]});
  const track = trackSession(t, session);
  fulfilled(await bounded(track(session.dispatch(session.frame('agent.text.delta', {text: 'producer'})))), 'producer await emit');
  fulfilled(await bounded(child.promise), 'accepted follow-up');
});

for (const kind of ['agent.text.delta', 'audio.input', 'transcript.final']) {
  test(`independent: direct ${kind} admission rejects overflow honestly`, async t => {
    const [{RealtimeVoiceSession}] = await modules;
    const entered = deferred();
    const release = deferred();
    const session = new RealtimeVoiceSession({sessionId: `independent-direct-${kind}`, maxQueueSize: 1, maxProtectedQueueSize: 1,
      processors: [{async handle(frame) { if (frame.payload.held) { entered.resolve(); await release.promise; } }}],
    });
    const track = trackSession(t, session, [release]);
    track(session.dispatch(session.frame(kind, {held: true})));
    await entered.promise;
    const queued = track(session.dispatch(session.frame(kind, {})));
    const result = await bounded(track(session.dispatch(session.frame(kind, {}))));
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /full|capacity|overflow/i);
    release.resolve();
    fulfilled(await bounded(queued), 'admitted frame');
  });
}

for (const phase of ['session-start', 'capture-start']) {
  for (const check of ['prompt-cancel', 'late-completion']) {
    test(`independent: microphone ${phase} ${check} cannot undo stop`, async t => {
      const [{RealtimeVoiceSession}, {createEdgeRtcAudioInput}] = await modules;
      const entered = deferred();
      const release = deferred();
      let startCalls = 0;
      let active = false;
      class Capture {
        constructor(onChunk) { this.onChunk = onChunk; }
        async start() {
          startCalls += 1;
          if (phase === 'capture-start') { entered.resolve(); await release.promise; }
          active = true; // Models a late getUserMedia resolution, no actual media.
        }
        stop() { active = false; }
      }
      const session = new RealtimeVoiceSession({sessionId: `independent-mic-${phase}-${check}`, processors: [{async handle(frame) {
        if (phase === 'session-start' && frame.kind === 'session.start') { entered.resolve(); await release.promise; }
      }}]});
      const track = trackSession(t, session, [release]);
      const input = createEdgeRtcAudioInput({session, AudioCapture: Capture});
      const pending = track(input.start());
      t.after(() => input.stop());
      await entered.promise;
      input.stop();
      assert.equal(session.inputOwner, null, 'stop releases the input claim immediately');
      if (check === 'prompt-cancel') {
        aborted(await bounded(pending), 'pending start must cancel before its underlying work completes');
      } else {
        // A successor owns the session before the old asynchronous start resolves.
        const releaseSuccessor = session.claimInput('successor');
        t.after(releaseSuccessor);
        release.resolve();
        const result = await bounded(pending);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual({running: input.running, active, startCalls, owner: session.inputOwner},
          {running: false, active: false, startCalls: phase === 'session-start' ? 0 : 1, owner: 'successor'},
          'stopped startup must not acquire/reactivate capture or disturb its successor');
        aborted(result, 'cancelled start');
        aborted(await bounded(observe(input.emitPcm(new ArrayBuffer(2)))), 'PCM after stop');
      }
    });
  }
}
