const test = require('node:test');
const assert = require('node:assert/strict');

async function modules() {
  const [session, conversation] = await Promise.all([
    import('../src/realtime-voice-session.mjs'),
    import('../src/realtime-conversation-pipeline.mjs'),
  ]);
  return {...session, ...conversation};
}

async function waitFor(predicate, message = 'condition') {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${message}.`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function finalFrame(session, segmentId, text) {
  return session.frame('transcript.final', {segmentId, revision: 1, text}, {
    direction: 'downstream', class: 'data', interruptible: false,
  });
}

test('a committed transcript crosses both governance gates before selected voice playout', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  const calls = [];
  const output = {
    async speak({text, turnId}) { calls.push(['speak', text, turnId]); return {renderedText: text}; },
    async stop() { calls.push(['stop']); },
  };
  const processor = createGovernedConversationProcessor({
    authorizeInput: async ({text}) => { calls.push(['input-gate', text]); return {allowed: true}; },
    generateResponse: async ({text, history}) => {
      calls.push(['generate', text, history.map(item => item.role).join(',')]);
      return `Agent Lee heard: ${text}`;
    },
    authorizeResponse: async ({response}) => { calls.push(['response-gate', response]); return true; },
    output,
  });
  const session = new RealtimeVoiceSession({sessionId: 'governed-turn', processors: [processor]});
  await session.dispatch(finalFrame(session, 'segment-1', 'Hello Lee'));
  await waitFor(() => calls.some(call => call[0] === 'speak'), 'voice playout');
  assert.deepEqual(calls, [
    ['input-gate', 'Hello Lee'],
    ['generate', 'Hello Lee', 'user'],
    ['response-gate', 'Agent Lee heard: Hello Lee'],
    ['speak', 'Agent Lee heard: Hello Lee', 'turn-segment-1'],
  ]);
  assert.deepEqual(processor.history().map(({role, content, evidence}) => ({role, content, evidence})), [
    {role: 'user', content: 'Hello Lee', evidence: 'transcript.final'},
    {role: 'assistant', content: 'Agent Lee heard: Hello Lee', evidence: 'audio.rendered'},
  ]);
});

test('wake phrases activate a bounded hands-free turn and unrelated speech stays gated', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  const inputs = [];
  const events = [];
  const processor = createGovernedConversationProcessor({
    wakeWords: ['agent lee', 'yo agent'],
    wakeTimeoutMs: 1_000,
    authorizeInput: async ({text}) => { inputs.push(text); return true; },
    generateResponse: async ({text}) => `heard ${text}`,
    authorizeResponse: async () => true,
    output: {speak: async () => ({}), stop: async () => {}},
    onEvent: event => events.push(event),
  });
  const session = new RealtimeVoiceSession({sessionId: 'wake-word', processors: [processor]});
  await session.dispatch(finalFrame(session, 'ambient', 'what time is it'));
  await session.dispatch(finalFrame(session, 'wake', "Hey what's up Agent Lee, what time is it?"));
  await waitFor(() => inputs.length === 1, 'wake-gated turn');
  assert.deepEqual(inputs, ["Hey what's up, what time is it?"]);
  assert.ok(events.some(event => event.type === 'conversation.wake_word.ignored'));
  assert.ok(events.some(event => event.type === 'conversation.wake_word.heard' && event.phrase === 'agent lee'));
  processor.dispose();
});

test('transcript matching active Agent Lee playout is suppressed as speaker echo', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  let playing = false;
  const inputs = [];
  const events = [];
  const processor = createGovernedConversationProcessor({
    authorizeInput: async ({text}) => { inputs.push(text); return true; },
    generateResponse: async () => 'The Agent status is live in the system panel.',
    authorizeResponse: async () => true,
    output: {
      get playing() { return playing; },
      async speak() { playing = true; await new Promise(resolve => setTimeout(resolve, 25)); playing = false; return {}; },
      async stop() {},
    },
    onEvent: event => events.push(event),
  });
  const session = new RealtimeVoiceSession({sessionId: 'playback-echo', processors: [processor]});
  await session.dispatch(finalFrame(session, 'first', 'hello'));
  await waitFor(() => playing, 'Agent Lee playback');
  await session.dispatch(finalFrame(session, 'echo', 'the agent status is live'));
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.deepEqual(inputs, ['hello']);
  assert.ok(events.some(event => event.type === 'conversation.transcript.echo_suppressed'));
});

test('response governance can reject generated text without invoking voice output', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  let spoken = 0;
  const events = [];
  const processor = createGovernedConversationProcessor({
    authorizeInput: async () => true,
    generateResponse: async () => 'unapproved response',
    authorizeResponse: async () => ({allowed: false, reason: 'policy'}),
    output: {speak: async () => { spoken += 1; }, stop: async () => {}},
    onEvent: event => events.push(event),
  });
  const session = new RealtimeVoiceSession({sessionId: 'blocked-response', processors: [processor]});
  await session.dispatch(finalFrame(session, 'segment-1', 'request'));
  await waitFor(() => events.some(event => event.type === 'conversation.response.blocked'), 'governance rejection');
  assert.equal(spoken, 0);
  assert.deepEqual(processor.history().map(item => item.role), ['user']);
});

test('barge-in aborts generation and suppresses stale response output', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  let generationStarted = false;
  let spoken = 0;
  let stops = 0;
  const processor = createGovernedConversationProcessor({
    authorizeInput: async () => true,
    generateResponse: async ({signal}) => {
      generationStarted = true;
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      });
      return 'stale';
    },
    authorizeResponse: async () => true,
    output: {speak: async () => { spoken += 1; }, stop: async () => { stops += 1; }},
  });
  const session = new RealtimeVoiceSession({sessionId: 'generation-barge-in', processors: [processor]});
  await session.dispatch(finalFrame(session, 'segment-1', 'long request'));
  await waitFor(() => generationStarted, 'generation start');
  await session.interrupt('speechstart');
  await waitFor(() => stops === 1, 'output stop');
  assert.equal(spoken, 0);
  assert.equal(processor.history().some(item => item.role === 'assistant'), false);
});

test('barge-in during playout does not commit unheard assistant text and a new turn recovers', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  const spoken = [];
  let firstSignal;
  let stops = 0;
  const output = {
    async speak({text, signal}) {
      spoken.push(text);
      if (spoken.length > 1) return {renderedText: text};
      firstSignal = signal;
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    },
    async stop() { stops += 1; },
  };
  const processor = createGovernedConversationProcessor({
    authorizeInput: async () => true,
    generateResponse: async ({text}) => `reply:${text}`,
    authorizeResponse: async () => true,
    output,
  });
  const session = new RealtimeVoiceSession({sessionId: 'playout-barge-in', processors: [processor]});
  await session.dispatch(finalFrame(session, 'segment-1', 'first'));
  await waitFor(() => firstSignal, 'first playout');
  await session.interrupt('speechstart');
  await waitFor(() => stops === 1, 'playout stop');
  await session.dispatch(finalFrame(session, 'segment-2', 'second'));
  await waitFor(() => spoken.length === 2 && processor.history().some(item => item.content === 'reply:second'), 'recovered turn');
  assert.deepEqual(spoken, ['reply:first', 'reply:second']);
  assert.equal(processor.history().some(item => item.content === 'reply:first'), false);
  assert.equal(processor.history().some(item => item.content === 'reply:second' && item.evidence === 'audio.rendered'), true);
});

test('slow voice preparation and playout never hold the realtime media frame drain', async () => {
  const {RealtimeVoiceSession, createGovernedConversationProcessor} = await modules();
  let speechStarted;
  const speaking = new Promise(resolve => { speechStarted = resolve; });
  let audioFrames = 0;
  let stopped = 0;
  const processor = createGovernedConversationProcessor({
    authorizeInput: async () => true,
    generateResponse: async () => 'Agent Lee response',
    authorizeResponse: async () => true,
    output: {
      async speak({signal}) {
        speechStarted();
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {once: true});
        });
        return {renderedText: 'unreachable'};
      },
      async stop() { stopped += 1; },
    },
  });
  const session = new RealtimeVoiceSession({sessionId: 'slow-playout-media-drain', maxQueueSize: 4, processors: [{
    async handle(frame, context) {
      await processor.handle(frame, context);
      if (frame.kind === 'audio.input') audioFrames += 1;
    },
  }]});
  await session.dispatch(finalFrame(session, 'segment-1', 'speak while listening'));
  await speaking;
  assert.equal(processor.responding, true);
  for (let index = 0; index < 40; index += 1) {
    await session.dispatch(session.frame('audio.input', {pcm: new ArrayBuffer(1024), sampleRate: 16000, channels: 1}, {
      direction: 'downstream', class: 'data', interruptible: false,
    }));
  }
  assert.equal(audioFrames, 40);
  await session.interrupt('speechstart');
  await waitFor(() => stopped === 1, 'interrupted output stop');
  await waitFor(() => !processor.responding, 'interrupted task cleanup');
});

test('Voice SDK output rejects an unapproved fallback before speech', async () => {
  const {createVoiceSdkOutput} = await modules();
  let speaks = 0;
  const client = {
    async connect() {},
    async selectVoice() { return {selectedVoiceId: 'agent-lee-voice-one'}; },
    async prepare() { return {selectedVoiceId: 'kokoro-am_michael'}; },
    async status() { return {ready: true, selectedVoiceId: 'kokoro-am_michael', provider: 'kokoro'}; },
    async speak() { speaks += 1; },
    async stop() {},
  };
  const output = createVoiceSdkOutput({client, voicePackageId: 'agent-lee-voice-one', provider: 'chatterbox'});
  await assert.rejects(output.prepare(), /instead of required/);
  assert.equal(speaks, 0);
});


