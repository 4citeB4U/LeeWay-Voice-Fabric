/* REGION: LeeWay Voice Fabric / Studio verification
 * TAG: LEEWAY-STUDIO-MONITOR-BEHAVIOR-GATE-v1
 * WHO: Agent Lee under Creator-authorized Studio implementation.
 * WHAT: Deterministic lifecycle and Web Audio graph contract tests.
 * WHY: Reject invented meter activity, stale capture and duplicate playback.
 * WHERE: Node test runner; injected browser interfaces, never physical hardware.
 * WHEN: Before Studio promotion; after monitor changes.
 * HOW: Execute the actual module with explicit audio and device test doubles.
 * ROLES: Tests observe behavior; production module retains audio ownership.
 * LICENSE: Existing repository terms; no additional license grant.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = import('data:text/javascript;base64,' +
  fs.readFileSync(__dirname + '/../src/studio-monitor.js').toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

class Parameter {
  constructor(value = 1) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push({value, time}); }
}

class AudioNode {
  constructor(kind) {
    this.kind = kind;
    this.outputs = new Set();
    this.connectCalls = 0;
    this.disconnectCalls = 0;
  }
  connect(target) { this.connectCalls++; this.outputs.add(target); return target; }
  disconnect(target) {
    this.disconnectCalls++;
    if (target) this.outputs.delete(target);
    else this.outputs.clear();
  }
}

class Analyser extends AudioNode {
  constructor() {
    super('analyser');
    this.frequency = new Uint8Array(128);
    this.wave = new Float32Array(256);
    this.frequencyReads = 0;
    this.waveReads = 0;
  }
  getByteFrequencyData(target) {
    this.frequencyReads++;
    target.fill(0);
    target.set(this.frequency.subarray(0, target.length));
  }
  getFloatTimeDomainData(target) {
    this.waveReads++;
    target.fill(0);
    target.set(this.wave.subarray(0, target.length));
  }
}

function reaches(source, destination, visited = new Set()) {
  if (source === destination) return true;
  if (visited.has(source)) return false;
  visited.add(source);
  return [...source.outputs].some(node => reaches(node, destination, visited));
}

function microphoneStream() {
  const listeners = new Map();
  const track = {
    stopCalls: 0,
    readyState: 'live',
    stop() { this.stopCalls++; this.readyState = 'ended'; },
    getSettings() { return {deviceId: 'fixture-input', sampleRate: 48000}; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    end() { this.readyState = 'ended'; listeners.get('ended')?.(); },
  };
  return {track, getTracks: () => [track], getAudioTracks: () => [track]};
}

async function harness({getUserMedia, stereoPan = true, resume} = {}) {
  const {StudioMonitor} = await api;
  const contexts = [], captureRequests = [], microphoneEvents = [];
  const suppliedStream = microphoneStream();
  class Context {
    constructor(options) {
      this.options = options;
      this.sampleRate = options.sampleRate || 48000;
      this.currentTime = 2.5;
      this.baseLatency = .012;
      this.outputLatency = .021;
      this.state = 'suspended';
      this.destination = new AudioNode('destination');
      this.nodes = [];
      this.mediaSources = [];
      this.streamSources = [];
      this.resumeCalls = 0;
      this.closeCalls = 0;
      if (!stereoPan) this.createStereoPanner = undefined;
      contexts.push(this);
    }
    node(kind) { const node = new AudioNode(kind); this.nodes.push(node); return node; }
    createGain() { const node = this.node('gain'); node.gain = new Parameter(); return node; }
    createStereoPanner() { const node = this.node('panner'); node.pan = new Parameter(0); return node; }
    createAnalyser() { const node = new Analyser(); this.nodes.push(node); return node; }
    createConvolver() { return this.node('convolver'); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({length: channels}, () => new Float32Array(length));
      return {numberOfChannels: channels, length, sampleRate, getChannelData: i => data[i]};
    }
    createMediaElementSource(element) {
      if (this.mediaSources.some(node => node.element === element)) {
        throw new Error('A media element may have only one MediaElementAudioSourceNode.');
      }
      const node = this.node('media-element');
      node.element = element;
      this.mediaSources.push(node);
      return node;
    }
    createMediaStreamSource(stream) {
      const node = this.node('media-stream');
      node.stream = stream;
      this.streamSources.push(node);
      return node;
    }
    async resume() { this.resumeCalls++; await resume?.(); this.state = 'running'; }
    async close() { this.closeCalls++; this.state = 'closed'; }
  }
  const monitor = new StudioMonitor({
    Context,
    mediaDevices: {getUserMedia: async constraints => {
      captureRequests.push(constraints);
      return getUserMedia ? getUserMedia(constraints) : suppliedStream;
    }},
    onMicrophone: (active, settings) => microphoneEvents.push({active, settings}),
  });
  return {monitor, contexts, captureRequests, microphoneEvents, suppliedStream};
}

const mediaElement = () => ({paused: false, pauseCalls: 0,
  pause() { this.paused = true; this.pauseCalls++; }});
const allZero = values => [...values].every(value => value === 0);

test('idle meters contain no invented activity and do not request a device', async () => {
  const h = await harness();
  for (let i = 0; i < 4; i++) {
    const sample = h.monitor.sample();
    assert.ok(allZero(sample.input));
    assert.ok(allZero(sample.output));
    assert.equal(sample.inputRms, 0);
  }
  assert.equal(h.contexts.length, 0);
  assert.equal(h.captureRequests.length, 0);
  assert.deepEqual(h.monitor.metrics(), {state: 'closed', sampleRate: null,
    baseLatencyMs: null, outputLatencyMs: null, stereoPan: false, microphoneActive: false});
  await h.monitor.ensure();
  assert.ok(allZero(h.monitor.sample().output));
  assert.equal(h.captureRequests.length, 0);
  await h.monitor.dispose();
});

test('input/output samples preserve their independent analyser data and microphone has no audible loop', async () => {
  const h = await harness();
  assert.equal(await h.monitor.startMicrophone('selected-input'), true);
  assert.deepEqual(h.captureRequests, [{audio: {echoCancellation: true,
    noiseSuppression: true, autoGainControl: true, deviceId: {exact: 'selected-input'}}, video: false}]);
  const context = h.contexts[0];
  const [output, input] = context.nodes.filter(node => node.kind === 'analyser');
  input.frequency.set([7, 91, 3]);
  input.wave.fill(.25);
  output.frequency.set([1, 2, 135]);
  const sample = h.monitor.sample();
  assert.deepEqual([...sample.input.slice(0, 4)], [7, 91, 3, 0]);
  assert.deepEqual([...sample.output.slice(0, 4)], [1, 2, 135, 0]);
  assert.equal(sample.inputRms, .25);
  assert.equal(input.frequencyReads, 1);
  assert.equal(input.waveReads, 1);
  assert.equal(reaches(context.streamSources[0], context.destination), false);
  assert.deepEqual(h.microphoneEvents.at(-1), {active: true,
    settings: {deviceId: 'fixture-input', sampleRate: 48000}});
  await h.monitor.dispose();
});

test('stopping microphone releases tracks and erases stale meter samples', async () => {
  const h = await harness();
  await h.monitor.startMicrophone();
  const context = h.contexts[0];
  const input = context.nodes.filter(node => node.kind === 'analyser')[1];
  input.frequency.fill(211); input.wave.fill(.5);
  assert.equal(h.monitor.sample().inputRms, .5);
  h.monitor.stopMicrophone();
  const sample = h.monitor.sample();
  assert.ok(allZero(sample.input));
  assert.equal(sample.inputRms, 0);
  assert.equal(h.suppliedStream.track.stopCalls, 1);
  assert.equal(context.streamSources[0].outputs.size, 0);
  assert.equal(input.outputs.size, 0);
  assert.equal(h.monitor.metrics().microphoneActive, false);
  h.monitor.stopMicrophone();
  assert.equal(h.suppliedStream.track.stopCalls, 1, 'repeat stop must not retain a track');
  assert.equal(h.microphoneEvents.at(-1).active, false);
  await h.monitor.dispose();
});

test('a late microphone grant after stop is stopped without activation', async () => {
  const grant = deferred();
  const h = await harness({getUserMedia: () => grant.promise});
  const starting = h.monitor.startMicrophone();
  await tick();
  assert.equal(h.captureRequests.length, 1);
  h.monitor.stopMicrophone();
  const late = microphoneStream();
  grant.resolve(late);
  assert.equal(await starting, false);
  assert.equal(late.track.stopCalls, 1);
  assert.equal(h.contexts[0].streamSources.length, 0);
  assert.equal(h.microphoneEvents.some(event => event.active), false);
  assert.ok(allZero(h.monitor.sample().input));
  await h.monitor.dispose();
});

test('changing input during permission requests discards only the superseded stream', async () => {
  const older = deferred(), newer = deferred();
  const h = await harness({getUserMedia: constraints =>
    constraints.audio.deviceId.exact === 'older' ? older.promise : newer.promise});
  const first = h.monitor.startMicrophone('older');
  await tick();
  const second = h.monitor.startMicrophone('newer');
  await tick();
  const active = microphoneStream(); newer.resolve(active);
  assert.equal(await second, true);
  const obsolete = microphoneStream(); older.resolve(obsolete);
  assert.equal(await first, false);
  assert.equal(obsolete.track.stopCalls, 1);
  assert.equal(active.track.stopCalls, 0);
  assert.equal(h.contexts[0].streamSources.length, 1);
  assert.equal(h.contexts[0].streamSources[0].stream, active);
  await h.monitor.dispose();
  assert.equal(active.track.stopCalls, 1);
});

test('cancellation while AudioContext resumes avoids even opening a microphone request', async () => {
  const resumed = deferred();
  const h = await harness({resume: () => resumed.promise});
  const starting = h.monitor.startMicrophone();
  h.monitor.stopMicrophone();
  resumed.resolve();
  assert.equal(await starting, false);
  assert.equal(h.captureRequests.length, 0);
  await h.monitor.dispose();
});

test('microphone permission rejection and externally ended tracks leave visible inactive state', async () => {
  const denied = await harness({getUserMedia: () => Promise.reject(new Error('Permission denied'))});
  await assert.rejects(denied.monitor.startMicrophone(), /Permission denied/);
  assert.equal(denied.monitor.metrics().microphoneActive, false);
  assert.ok(allZero(denied.monitor.sample().input));
  assert.equal(denied.microphoneEvents.some(event => event.active), false);
  await denied.monitor.dispose();
  const h = await harness();
  await h.monitor.startMicrophone();
  h.suppliedStream.track.end();
  assert.equal(h.monitor.metrics().microphoneActive, false);
  assert.equal(h.microphoneEvents.at(-1).active, false);
  assert.equal(h.suppliedStream.track.stopCalls, 1);
  await h.monitor.dispose();
});

test('reattaching and replaying one media element reuse its only audio source', async () => {
  const h = await harness();
  const player = mediaElement();
  await Promise.all([h.monitor.attach(player), h.monitor.attach(player)]);
  h.monitor.cut();
  await h.monitor.activate(player);
  const context = h.contexts[0];
  assert.equal(h.contexts.length, 1);
  assert.equal(context.mediaSources.length, 1);
  assert.equal(context.mediaSources[0].connectCalls, 1);
  assert.equal(context.mediaSources[0].outputs.size, 1);
  assert.ok(reaches(context.mediaSources[0], context.destination));
  assert.equal(context.mediaSources[0].outputs.has(context.destination), false,
    'source must not bypass the controlled listening graph');
  await h.monitor.dispose();
});

test('gain, stereo placement and wet mix control the connected audio graph', async () => {
  const h = await harness();
  const player = mediaElement();
  await h.monitor.activate(player);
  const context = h.contexts[0];
  const destinationInputs = context.nodes.filter(node => node.outputs.has(context.destination));
  assert.equal(destinationInputs.length, 1, 'one audible graph terminates at destination');
  const analyser = destinationInputs[0];
  const master = context.nodes.find(node => node.outputs.has(analyser));
  const panner = context.nodes.find(node => node.kind === 'panner');
  const convolver = context.nodes.find(node => node.kind === 'convolver');
  const wet = [...convolver.outputs][0];
  assert.ok(reaches(convolver, context.destination));
  assert.ok(reaches(panner, master));
  assert.equal(wet.gain.value, 0);
  h.monitor.setMix({gain: .3, reverb: .5, orbit: 90});
  assert.equal(master.gain.value, .3);
  assert.equal(panner.pan.value, 1);
  assert.ok(wet.gain.value > 0 && wet.gain.value < 1);
  assert.ok(convolver.buffer.getChannelData(0).some(value => value !== 0));
  assert.ok([...convolver.buffer.getChannelData(0)].every(Number.isFinite));
  assert.equal(convolver.buffer.sampleRate, context.sampleRate);
  h.monitor.setMix({gain: 100, reverb: -1, orbit: -90});
  assert.equal(master.gain.value, 1);
  assert.equal(wet.gain.value, 0);
  assert.equal(panner.pan.value, -1);
  await h.monitor.dispose();
});

test('cut immediately mutes output, pauses attached players and removes a ringing reverb tail', async () => {
  const h = await harness();
  const first = mediaElement(), second = mediaElement();
  await h.monitor.activate(first); await h.monitor.attach(second);
  h.monitor.setMix({gain: .75, reverb: 1});
  const context = h.contexts[0];
  const output = context.nodes.find(node => node.kind === 'analyser');
  const master = context.nodes.find(node => node.outputs.has(output));
  const ringingRoom = context.nodes.find(node => node.kind === 'convolver');
  output.frequency.fill(200);
  assert.ok(h.monitor.sample().output.some(value => value > 0));
  h.monitor.cut();
  assert.equal(master.gain.value, 0);
  assert.equal(first.pauseCalls, 1); assert.equal(second.pauseCalls, 1);
  assert.equal(ringingRoom.outputs.size, 0);
  assert.equal(context.nodes.some(node => node.outputs.has(ringingRoom)), false);
  assert.ok(allZero(h.monitor.sample().output), 'smoothing history is not live sound after cut');
  h.monitor.setMix({gain: .2});
  assert.equal(master.gain.value, 0, 'moving gain while stopped must not unmute a tail');
  await h.monitor.activate(first);
  assert.equal(master.gain.value, .2);
  assert.equal(context.mediaSources.length, 2);
  await h.monitor.dispose();
});

test('sample-rate and latency preferences reach the device once then lock', async () => {
  const h = await harness();
  assert.throws(() => h.monitor.configure({sampleRate: 96000}), /sample rate/i);
  assert.throws(() => h.monitor.configure({latencyHint: 'invented'}), /latency/i);
  h.monitor.configure({sampleRate: 24000, latencyHint: 'balanced'});
  await h.monitor.ensure();
  assert.deepEqual(h.contexts[0].options, {sampleRate: 24000, latencyHint: 'balanced'});
  assert.throws(() => h.monitor.configure({sampleRate: 48000}), /already open/i);
  assert.deepEqual(h.monitor.metrics(), {state: 'running', sampleRate: 24000,
    baseLatencyMs: 12, outputLatencyMs: 21, stereoPan: true, microphoneActive: false});
  delete h.contexts[0].outputLatency;
  assert.equal(h.monitor.metrics().outputLatencyMs, null, 'unsupported latency must stay unknown');
  await h.monitor.dispose();
});

test('lack of stereo panning is reported without falsely claiming a spatial control', async () => {
  const h = await harness({stereoPan: false});
  await h.monitor.ensure();
  assert.equal(h.monitor.metrics().stereoPan, false);
  assert.doesNotThrow(() => h.monitor.setMix({orbit: 90}));
  assert.equal(h.contexts[0].nodes.some(node => node.kind === 'panner'), false);
  await h.monitor.dispose();
});

test('suspension reports zero input and output rather than replaying stale analyser values', async () => {
  const h = await harness();
  await h.monitor.startMicrophone();
  for (const analyser of h.contexts[0].nodes.filter(node => node.kind === 'analyser')) {
    analyser.frequency.fill(150); analyser.wave.fill(.25);
  }
  assert.equal(h.monitor.sample().inputRms, .25);
  h.contexts[0].state = 'suspended';
  const sample = h.monitor.sample();
  assert.ok(allZero(sample.input)); assert.ok(allZero(sample.output));
  assert.equal(sample.inputRms, 0);
  await h.monitor.ensure();
  assert.equal(h.contexts[0].state, 'running');
  await h.monitor.dispose();
});

test('disposal releases capture, playback and context and rejects new audio work', async () => {
  const h = await harness();
  const player = mediaElement();
  await h.monitor.activate(player); await h.monitor.startMicrophone();
  const context = h.contexts[0], source = context.mediaSources[0];
  await h.monitor.dispose();
  assert.equal(h.suppliedStream.track.stopCalls, 1);
  assert.equal(player.paused, true);
  assert.equal(source.outputs.size, 0);
  assert.equal(context.closeCalls, 1);
  assert.equal(h.monitor.metrics().state, 'closed');
  assert.ok(allZero(h.monitor.sample().input)); assert.ok(allZero(h.monitor.sample().output));
  await assert.rejects(h.monitor.activate(player), /closed/i);
  await assert.rejects(h.monitor.startMicrophone(), /closed/i);
  assert.equal(h.captureRequests.length, 1);
});

test('a microphone granted after disposal is immediately released', async () => {
  const pending = deferred();
  const h = await harness({getUserMedia: () => pending.promise});
  const starting = h.monitor.startMicrophone();
  await tick();
  await h.monitor.dispose();
  const late = microphoneStream(); pending.resolve(late);
  assert.equal(await starting, false);
  assert.equal(late.track.stopCalls, 1);
  assert.equal(h.contexts[0].streamSources.length, 0);
  assert.equal(h.monitor.metrics().state, 'closed');
});

// END REGION: LeeWay Voice Fabric / Studio verification
