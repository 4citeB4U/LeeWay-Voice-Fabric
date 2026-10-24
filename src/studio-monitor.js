/* REGION: LeeWay Voice Fabric / studio audio monitoring
 * TAG: LEEWAY-VOICE-STUDIO-MONITOR-v1
 * WHO: Agent Lee, under Creator-authorized Voice Fabric UI implementation.
 * WHAT: Real input/output analysis and a bounded local listening mix.
 * WHY: The Studio visual must describe the audio that actually plays.
 * WHERE: Existing Voice Fabric browser Studio; no synthesis or identity owner.
 * WHEN: Created only after a user audio gesture; disposed with the page.
 * HOW: Web Audio media sources, gain, convolver, stereo panner and analysers.
 * ROLES: Creator selects devices; Voice Fabric owns speech; this module monitors.
 * LICENSE: Existing repository terms; no additional license grant.
 */

const bounded = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback;

export class StudioMonitor {
  constructor({mediaDevices = globalThis.navigator?.mediaDevices,
    Context = globalThis.AudioContext || globalThis.webkitAudioContext,
    onMicrophone = () => {}} = {}) {
    this.Context = Context;
    this.mediaDevices = mediaDevices;
    this.onMicrophone = onMicrophone;
    this.context = null;
    this.sources = new Map();
    this.options = {sampleRate: 0, latencyHint: 'interactive'};
    this.mix = {gain: .9, reverb: 0, orbit: 0};
    this.input = new Uint8Array(128);
    this.output = new Uint8Array(128);
    this.inputWave = new Float32Array(256);
    this.micEpoch = 0;
    this.outputEpoch = 0;
    this.disposed = false;
    this.silenced = false;
  }

  configure(options = {}) {
    if (this.context) throw new Error('The audio device is already open. Reload the Studio to change its sample rate or latency preference.');
    const rate = Number(options.sampleRate || 0);
    if (![0, 24000, 44100, 48000].includes(rate)) throw new Error('Unsupported monitoring sample rate.');
    if (!['interactive', 'balanced', 'playback'].includes(options.latencyHint || 'interactive')) throw new Error('Unsupported latency preference.');
    this.options = {sampleRate: rate, latencyHint: options.latencyHint || 'interactive'};
  }

  async ensure() {
    if (this.disposed) throw new Error('Studio audio monitor is closed.');
    if (!this.Context) throw new Error('Web Audio is unavailable in this browser.');
    if (!this.context) {
      const options = {latencyHint: this.options.latencyHint};
      if (this.options.sampleRate) options.sampleRate = this.options.sampleRate;
      const context = new this.Context(options);
      this.context = context;
      this.bus = context.createGain();
      this.dry = context.createGain();
      this.wet = context.createGain();
      this.master = context.createGain();
      this.panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : context.createGain();
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = .65;
      this.bus.connect(this.dry);
      this.dry.connect(this.panner);
      this.wet.connect(this.panner);
      this.panner.connect(this.master);
      this.master.connect(this.analyser);
      this.analyser.connect(context.destination);
      this.resetReverb();
      this.setMix(this.mix);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  resetReverb() {
    if (!this.context) return;
    if (this.convolver) {
      this.bus.disconnect(this.convolver);
      this.convolver.disconnect();
    }
    const context = this.context;
    this.convolver = context.createConvolver();
    // A deterministic room impulse is an audible effect, never a signal meter.
    if (!this.impulse) {
      const length = Math.floor(context.sampleRate * 1.25);
      this.impulse = context.createBuffer(2, length, context.sampleRate);
      let seed = 173;
      for (let channel = 0; channel < 2; channel++) {
        const data = this.impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / length, 3);
        }
      }
    }
    this.convolver.buffer = this.impulse;
    this.bus.connect(this.convolver);
    this.convolver.connect(this.wet);
  }

  async attach(element) {
    await this.ensure();
    if (!this.sources.has(element)) {
      const source = this.context.createMediaElementSource(element);
      source.connect(this.bus);
      this.sources.set(element, source);
    }
  }

  setMix(values = {}) {
    this.mix = {
      gain: bounded(values.gain ?? this.mix.gain, 0, 1, .9),
      reverb: bounded(values.reverb ?? this.mix.reverb, 0, 1, 0),
      orbit: bounded(values.orbit ?? this.mix.orbit, -180, 180, 0),
    };
    if (!this.context) return;
    const time = this.context.currentTime;
    this.master.gain.setValueAtTime(this.silenced ? 0 : this.mix.gain, time);
    this.dry.gain.setValueAtTime(1 - this.mix.reverb * .4, time);
    this.wet.gain.setValueAtTime(this.mix.reverb * .7, time);
    this.panner.pan?.setValueAtTime(Math.sin(this.mix.orbit * Math.PI / 180), time);
  }

  cut() {
    ++this.outputEpoch;
    this.silenced = true;
    if (this.master) this.master.gain.setValueAtTime(0, this.context.currentTime);
    for (const element of this.sources.keys()) element.pause();
    this.resetReverb();
    this.output.fill(0);
  }

  async activate(element) {
    const epoch = this.outputEpoch;
    await this.attach(element);
    if (epoch !== this.outputEpoch || this.disposed) throw new DOMException('Playback activation was interrupted', 'AbortError');
    this.silenced = false;
    this.setMix();
  }

  async startMicrophone(deviceId = '') {
    this.stopMicrophone();
    if (!this.mediaDevices?.getUserMedia) throw new Error('Microphone capture requires a secure browser context and microphone support.');
    const epoch = this.micEpoch;
    await this.ensure();
    if (epoch !== this.micEpoch || this.disposed) return false;
    const constraints = {echoCancellation: true, noiseSuppression: true, autoGainControl: true};
    if (deviceId) constraints.deviceId = {exact: deviceId};
    const stream = await this.mediaDevices.getUserMedia({audio: constraints, video: false});
    if (epoch !== this.micEpoch || this.disposed) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    this.stream = stream;
    try {
      this.micSource = this.context.createMediaStreamSource(stream);
      this.micAnalyser = this.context.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = .55;
      this.micSource.connect(this.micAnalyser);
      // No connection to the destination: microphone monitoring cannot feed back.
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (this.stream === stream) this.stopMicrophone();
      }, {once: true}));
      this.onMicrophone(true, stream.getAudioTracks()[0]?.getSettings?.() || {});
      return true;
    } catch (error) {
      this.stopMicrophone();
      throw error;
    }
  }

  stopMicrophone() {
    ++this.micEpoch;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.micSource?.disconnect();
    this.micAnalyser?.disconnect();
    this.micSource = this.micAnalyser = null;
    this.input.fill(0);
    this.inputWave.fill(0);
    this.onMicrophone(false, {});
  }

  sample() {
    this.input.fill(0);
    this.output.fill(0);
    let rms = 0;
    if (this.context?.state === 'running') {
      if (this.micAnalyser) {
        this.micAnalyser.getByteFrequencyData(this.input);
        this.micAnalyser.getFloatTimeDomainData(this.inputWave);
        rms = Math.sqrt(this.inputWave.reduce((sum, n) => sum + n * n, 0) / this.inputWave.length);
      }
      if (!this.silenced) this.analyser.getByteFrequencyData(this.output);
    }
    return {input: this.input, output: this.output, inputRms: rms};
  }

  metrics() {
    const context = this.context;
    return {
      state: context?.state || 'closed',
      sampleRate: context?.sampleRate ?? null,
      baseLatencyMs: Number.isFinite(context?.baseLatency) ? context.baseLatency * 1000 : null,
      outputLatencyMs: Number.isFinite(context?.outputLatency) ? context.outputLatency * 1000 : null,
      stereoPan: !!this.panner?.pan,
      microphoneActive: !!this.stream,
    };
  }

  async dispose() {
    this.disposed = true;
    this.stopMicrophone();
    this.cut();
    for (const node of this.sources.values()) node.disconnect();
    this.sources.clear();
    await this.context?.close();
  }
}
// END REGION: LeeWay Voice Fabric / studio audio monitoring
