const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../src/edge-rtc-audio-adapter.mjs');
}

async function loadSession() {
  return import('../src/realtime-voice-session.mjs');
}

test('Edge RTC AudioCapture callbacks become protected audio.input frames', async () => {
  const {createEdgeRtcAudioInput} = await loadModule();
  const {RealtimeVoiceSession} = await loadSession();
  const seen = [];
  let emit;
  class Capture {
    constructor(onChunk) { emit = onChunk; this.started = false; this.stopped = false; }
    async start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const session = new RealtimeVoiceSession({
    sessionId: 'edge-audio',
    processors: [{handle: async frame => { seen.push(frame); }}],
  });
  const input = createEdgeRtcAudioInput({session, AudioCapture: Capture});

  await input.start();
  const pcm = new Int16Array([1, -2, 3]).buffer;
  await emit(pcm);
  input.stop();

  assert.equal(input.capture.started, true);
  assert.equal(input.capture.stopped, true);
  assert.equal(seen.filter(frame => frame.kind === 'session.start').length, 1);
  const audio = seen.find(frame => frame.kind === 'audio.input');
  assert.ok(audio);
  assert.equal(audio.interruptible, false);
  assert.equal(audio.payload.pcm, pcm);
  assert.equal(audio.payload.sampleRate, 16000);
});

test('AudioCapture input claim prevents a second owner', async () => {
  const {createEdgeRtcAudioInput} = await loadModule();
  const {RealtimeVoiceSession} = await loadSession();
  class Capture {
    constructor() {}
    async start() {}
    stop() {}
  }
  const session = new RealtimeVoiceSession({sessionId: 'edge-owner'});
  const first = createEdgeRtcAudioInput({session, AudioCapture: Capture, ownerId: 'first'});
  const second = createEdgeRtcAudioInput({session, AudioCapture: Capture, ownerId: 'second'});
  await first.start();
  await assert.rejects(second.start(), /Input is already owned by first/);
  first.stop();
  await second.start();
  second.stop();
});

test('speech recognition revisions become partial and final transcript frames', async () => {
  const {bindSpeechRecognitionToSession} = await loadModule();
  const {RealtimeVoiceSession, TranscriptReducer} = await loadSession();
  const reducer = new TranscriptReducer();
  const session = new RealtimeVoiceSession({
    sessionId: 'edge-dictation',
    processors: [{
      handle: async frame => {
        if (frame.kind === 'transcript.partial' || frame.kind === 'transcript.final') reducer.apply(frame);
      },
    }],
  });
  const handlers = new Map();
  const recognition = {
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); },
    start() {},
    stop() {},
  };
  const bridge = bindSpeechRecognitionToSession({session, recognition});
  bridge.start();
  handlers.get('result')({resultIndex: 0, results: [{isFinal: false, 0: {transcript: 'hello'}}]});
  handlers.get('result')({resultIndex: 0, results: [{isFinal: false, 0: {transcript: 'hello world'}}]});
  handlers.get('result')({resultIndex: 0, results: [{isFinal: true, 0: {transcript: 'hello world'}}]});
  await new Promise(resolve => setImmediate(resolve));
  bridge.stop();

  assert.equal(reducer.renderedText(), 'hello world');
  assert.equal(reducer.finalizedText(), 'hello world');
  assert.equal(bridge.bound, false);
});

test('graceful recognition stop accepts its final result before the end event', async () => {
  const {bindSpeechRecognitionToSession} = await loadModule();
  const {RealtimeVoiceSession, TranscriptReducer} = await loadSession();
  const reducer = new TranscriptReducer();
  const handlers = new Map();
  const recognition = {
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); },
    start() {},
    stop() {},
  };
  const session = new RealtimeVoiceSession({
    sessionId: 'edge-graceful-stop',
    processors: [{handle: async frame => {
      if (frame.kind === 'transcript.partial' || frame.kind === 'transcript.final') reducer.apply(frame);
    }}],
  });
  const bridge = bindSpeechRecognitionToSession({session, recognition});
  bridge.start();
  bridge.stop();
  assert.equal(bridge.bound, false);
  assert.equal(typeof handlers.get('result'), 'function');
  handlers.get('result')({resultIndex: 0, results: [{isFinal: true, 0: {transcript: 'final while stopping'}}]});
  handlers.get('end')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reducer.finalizedText(), 'final while stopping');
});

test('recognition automatically restarts after browser end and abort ignores a late callback', async () => {
  const {bindSpeechRecognitionToSession} = await loadModule();
  const {RealtimeVoiceSession} = await loadSession();
  const seen = [];
  const handlers = new Map();
  const recognition = {
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); },
    start() {},
    stop() {},
    abort() {},
  };
  const session = new RealtimeVoiceSession({
    sessionId: 'edge-recognition-runs',
    processors: [{handle: async frame => {
      if (frame.kind === 'transcript.final') seen.push(frame.payload.segmentId);
    }}],
  });
  let recognitionStarts = 0;
  const errors = [];
  recognition.start = () => { recognitionStarts += 1; };
  const bridge = bindSpeechRecognitionToSession({session, recognition, restartDelayMs: 0, onError: error => errors.push(error)});
  bridge.start();
  handlers.get('error')({error: 'no-speech'});
  assert.deepEqual(errors, [], 'silence is not a fatal recognition error');
  handlers.get('result')({resultIndex: 0, results: [{isFinal: true, 0: {transcript: 'first'}}]});
  handlers.get('end')();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(recognitionStarts, 2, 'an unexpected browser end restarts recognition while listening is still requested');

  const late = handlers.get('result');
  handlers.get('result')({resultIndex: 0, results: [{isFinal: true, 0: {transcript: 'second'}}]});
  bridge.stop({abort: true});
  late({resultIndex: 1, results: [
    {isFinal: true, 0: {transcript: 'second'}},
    {isFinal: true, 0: {transcript: 'late'}},
  ]});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['dictation-1-0', 'dictation-2-0']);
});

test('speechstart is exposed immediately for an out-of-band barge-in decision', async () => {
  const {bindSpeechRecognitionToSession} = await loadModule();
  const {RealtimeVoiceSession} = await loadSession();
  const handlers = new Map();
  const recognition = {
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); },
    start() {},
    abort() {},
  };
  const session = new RealtimeVoiceSession({sessionId: 'edge-speechstart'});
  let starts = 0;
  const bridge = bindSpeechRecognitionToSession({
    session,
    recognition,
    onSpeechStart: () => { starts += 1; },
  });
  bridge.start();
  handlers.get('speechstart')({type: 'speechstart'});
  assert.equal(starts, 1);
  bridge.stop({abort: true});
  assert.equal(handlers.has('speechstart'), false);
});
