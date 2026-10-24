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
