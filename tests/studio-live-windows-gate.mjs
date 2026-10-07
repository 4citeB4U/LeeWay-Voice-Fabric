/* REGION: LEEWAY.VOICE.QUALIFICATION; TAG: EXISTING_PROVIDER_ACTUAL_BROWSER_GATE
 * 5WH: WHO=Creator-authorized qualifier; WHAT=exercise the candidate Studio;
 * WHY=prove real synthesis and output graph before live promotion;
 * WHERE=isolated loopback Studio and a fresh headless Chrome profile;
 * WHEN=after exact candidate checkout; HOW=existing Puppeteer/Chrome/Kokoro.
 * AUTHORIZED ROLES: QUALIFICATION_ONLY. Shared selection is dry-run only.
 * LICENSE: Existing repository terms. No model downloads or provider fixtures.
 * Physical speakers are muted. Graph output is not human audibility evidence.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const text = 'Creator, this is a live LeeWay Voice Studio qualification. The selected local voice is connected, and the audio controls are being measured.';
const allowedArguments = new Set(['base-url', 'chrome', 'puppeteer-module', 'evidence-dir',
  'profile-dir', 'manifest', 'candidate-sha', 'voice-package-id', 'live-record-sha256']);

function parseArguments(input) {
  const args = {};
  for (let i = 0; i < input.length; i += 2) {
    const key = input[i]?.replace(/^--/, '');
    if (!input[i]?.startsWith('--') || !allowedArguments.has(key) || !input[i + 1] || Object.hasOwn(args, key)) {
      throw new Error('Expected the documented, unique qualification arguments.');
    }
    args[key] = input[i + 1];
  }
  for (const key of allowedArguments) if (!args[key]) throw new Error(`Missing --${key}.`);
  const url = new URL(args['base-url']);
  assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/');
  assert.match(args['candidate-sha'], /^[a-f0-9]{40}$/);
  assert.match(args['live-record-sha256'], /^[a-f0-9]{64}$/);
  assert.match(args['voice-package-id'], /^kokoro-[a-z0-9_]+$/);
  return args;
}

function requestDecision(url, method, body, origin, expectedSynthesis) {
  if (url.startsWith('blob:') || url.startsWith('data:') || url === 'about:blank') return 'allow';
  const parsed = new URL(url);
  if (parsed.origin !== origin || parsed.username || parsed.password) return 'external-request-blocked';
  if (method === 'POST' && parsed.pathname === '/api/agent-lee/selection') {
    let payload;
    try { payload = JSON.parse(body); } catch { return 'invalid-publication-body-blocked'; }
    if (payload?.dryRun !== true || payload?.approve !== false) return 'live-publication-blocked';
    if (Object.keys(payload).some(key => !['dryRun', 'approve', 'expectedRevision', 'voicePackageId', 'tuning'].includes(key))) return 'unknown-publication-fields-blocked';
    return 'allow';
  }
  if (method === 'POST' && parsed.pathname === '/api/local/synthesize') {
    let payload;
    try { payload = JSON.parse(body); } catch { return 'invalid-synthesis-body-blocked'; }
    if (!expectedSynthesis || payload?.voicePackageId !== expectedSynthesis.voicePackageId || payload?.text !== expectedSynthesis.text) return 'unreviewed-synthesis-blocked';
    if (Object.keys(payload).some(key => !['voicePackageId', 'text'].includes(key))) return 'unknown-synthesis-fields-blocked';
    return 'allow';
  }
  if (method === 'POST' && parsed.pathname !== '/api/local/synthesize') return 'unapproved-post-blocked';
  if (!['GET', 'HEAD', 'POST'].includes(method)) return 'unapproved-method-blocked';
  return 'allow';
}

function assetPath(root, relative) {
  assert.ok(relative && !relative.includes('\\') && !relative.startsWith('/') && !relative.split('/').some(part => !part || part === '..' || part === '.'));
  const target = path.resolve(root, relative);
  assert.ok(target.startsWith(path.resolve(root) + path.sep));
  return target;
}

function pcm16Wave(bytes) {
  assert.ok(bytes.length >= 44 && bytes.length <= 24000000);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + length;
    assert.ok(end <= bytes.length, 'WAV chunk exceeds the actual response.');
    if (name === 'fmt ') {
      assert.ok(length >= 16 && !format);
      format = {encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4), blockAlign: bytes.readUInt16LE(start + 12), bits: bytes.readUInt16LE(start + 14)};
    }
    if (name === 'data') {assert.equal(data, undefined); data = {length};}
    offset = end + length % 2;
  }
  assert.equal(format?.encoding, 1); assert.equal(format?.channels, 1);
  assert.equal(format?.bits, 16); assert.equal(format?.blockAlign, 2);
  assert.ok(data?.length > 0 && data.length % 2 === 0);
  return {frames: data.length / 2, sampleRate: format.sampleRate, channels: format.channels};
}

if (process.argv.slice(2).join(' ') === '--self-test') {
  const origin = 'http://127.0.0.1:12345';
  assert.equal(requestDecision(origin + '/api/agent-lee/selection', 'POST', '{"approve":true}', origin), 'live-publication-blocked');
  assert.equal(requestDecision(origin + '/api/agent-lee/selection', 'POST', '{"dryRun":true,"approve":false}', origin), 'allow');
  assert.equal(requestDecision(origin + '/api/agent-lee/selection', 'POST', '{"dryRun":true,"approve":true}', origin), 'live-publication-blocked');
  assert.equal(requestDecision(origin + '/api/resemble/synthesize', 'POST', '{}', origin), 'unapproved-post-blocked');
  assert.equal(requestDecision('https://example.invalid/model.onnx', 'GET', undefined, origin), 'external-request-blocked');
  const expected = {voicePackageId: 'kokoro-am_michael', text};
  assert.equal(requestDecision(origin + '/api/local/synthesize', 'POST', JSON.stringify(expected), origin, expected), 'allow');
  assert.equal(requestDecision(origin + '/api/local/synthesize', 'POST', JSON.stringify({...expected, voicePackageId: 'agent-lee-voice-one'}), origin, expected), 'unreviewed-synthesis-blocked');
  assert.equal(requestDecision(origin + '/api/local/synthesize', 'POST', JSON.stringify({...expected, extra: true}), origin, expected), 'unknown-synthesis-fields-blocked');
  assert.throws(() => assetPath(process.cwd(), '../private'));
  assert.throws(() => parseArguments([]));
  console.log('PASS: qualification request boundaries and path validation; no browser or provider executed.');
  process.exit(0);
}

const args = parseArguments(process.argv.slice(2));
const base = new URL(args['base-url']);
const evidenceDir = path.resolve(args['evidence-dir']);
const profileDir = path.resolve(args['profile-dir']);
assert.notEqual(evidenceDir, profileDir);
await mkdir(evidenceDir, {recursive: true});
const evidence = {
  schemaVersion: 'leeway.voice-studio-live-browser-qualification.v1', status: 'RUNNING',
  startedAt: new Date().toISOString(), candidateSha: args['candidate-sha'],
  scope: 'REAL_EXISTING_KOKORO_AND_HEADLESS_CHROME_GRAPH',
  sourceFixtures: 'NONE', providerReadinessStubbed: false, synthesisStubbed: false,
  liveOwnerMutation: 'FORBIDDEN', ownerAction: 'DRY_RUN_ONLY',
  physicalSpeaker: 'MUTED_HEADLESS_BROWSER_NOT_TESTED', microphone: 'NOT_REQUESTED',
  phoneDeployment: 'NOT_TESTED', deviceAcknowledgements: 'NOT_TESTED',
  formulaExecution: 'NOT_EXECUTED', learningLedger: 'NOT_UPDATED',
  checks: [], blockedRequests: [], browserErrors: [], measurements: {}, artifacts: [],
};
let browser, page;
const record = (name, details = {}) => {
  evidence.checks.push({name, state: 'PASS', ...details});
  console.log(`PASS ${name}`);
};

async function saveArtifact(name, bytes) {
  await writeFile(path.join(evidenceDir, name), bytes);
  evidence.artifacts.push({path: name, bytes: bytes.length, sha256: sha256(bytes)});
}

try {
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  assert.equal(manifest.candidateSha, args['candidate-sha']);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 10);
  const sourceRoot = path.resolve(manifest.worktree);
  const upstream = new URL(manifest.liveAuthority.kokoroUrl);
  assert.equal(upstream.protocol, 'http:');
  assert.equal(upstream.hostname, '127.0.0.1');
  assert.ok(!upstream.username && !upstream.password && !upstream.search && !upstream.hash && upstream.pathname === '/');
  assert.match(manifest.liveAuthority.kokoroSourceSha256, /^[a-f0-9]{64}$/);
  evidence.measurements.providerSource = manifest.liveAuthority;
  let servedCount = 0;
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const local = await readFile(assetPath(sourceRoot, file.path));
    assert.equal(local.length, file.bytes, file.path);
    assert.equal(sha256(local), file.sha256, file.path);
    if (!file.http) continue;
    const response = await fetch(new URL(file.path, base), {signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error'});
    assert.equal(response.status, 200, file.path);
    const served = Buffer.from(await response.arrayBuffer());
    assert.equal(sha256(served), file.sha256, `Served bytes: ${file.path}`);
    if (/\.(m?js)$/.test(file.path)) assert.match(response.headers.get('content-type') || '', /javascript/, file.path);
    if (/\.css$/.test(file.path)) assert.match(response.headers.get('content-type') || '', /text\/css/, file.path);
    servedCount++;
  }
  record('Candidate Git assets match SHA-256 on disk and over actual Studio HTTP', {files: manifest.files.length, servedCount});

  const require = createRequire(import.meta.url);
  const puppeteer = require(path.resolve(args['puppeteer-module']));
  assert.equal(typeof puppeteer.launch, 'function');
  assert.ok((await stat(args.chrome)).isFile());
  browser = await puppeteer.launch({
    executablePath: path.resolve(args.chrome), userDataDir: profileDir, headless: true,
    args: ['--mute-audio', '--disable-background-networking', '--disable-component-update',
      '--no-first-run', '--disable-default-apps', '--autoplay-policy=no-user-gesture-required'],
  });
  const browserPid = browser.process()?.pid;
  await writeFile(path.join(evidenceDir, 'browser-process.json'), JSON.stringify({pid: browserPid,
    profileDir, executable: path.resolve(args.chrome), createdAt: new Date().toISOString()}, null, 2));
  evidence.measurements.browser = {version: await browser.version(), pid: browserPid,
    executable: path.resolve(args.chrome), profile: 'FRESH_QUALIFICATION_ONLY'};
  page = await browser.newPage();
  await page.setViewport({width: 1440, height: 1100, deviceScaleFactor: 1});
  page.on('pageerror', error => evidence.browserErrors.push(error.message));
  await page.setRequestInterception(true);
  let synthesisRequests = 0;
  page.on('request', request => {
    let decision = requestDecision(request.url(), request.method(), request.postData(), base.origin,
      {voicePackageId: args['voice-package-id'], text});
    if (decision === 'allow' && request.method() === 'POST' && new URL(request.url()).pathname === '/api/local/synthesize') {
      if (++synthesisRequests > 1) decision = 'repeat-synthesis-blocked';
    }
    if (decision !== 'allow') {
      evidence.blockedRequests.push({reason: decision, method: request.method(), path: new URL(request.url()).pathname});
      request.abort('blockedbyclient').catch(() => {});
    } else request.continue().catch(() => {});
  });
  await page.goto(new URL('studio.html', base).href, {waitUntil: 'domcontentloaded', timeout: 20000});
  await page.waitForFunction(() => !!globalThis.LeeWayStudioControls && !!globalThis.LeeWayStudioMonitor && document.querySelectorAll('#voiceList .voice-card').length > 0, {timeout: 20000});
  await page.waitForFunction(() => document.querySelector('#sharedVoice')?.dataset.connected === 'true', {timeout: 20000});
  await page.$eval('#search', (element, value) => {element.value = value; element.dispatchEvent(new Event('input', {bubbles: true}));}, args['voice-package-id']);
  await page.waitForFunction(id => [...document.querySelectorAll('#voiceList .voice-card small')].some(item => item.textContent.endsWith('\n' + id)), {timeout: 10000}, args['voice-package-id']);
  await page.evaluate(id => {
    const matches = [...document.querySelectorAll('#voiceList .voice-card')].filter(button => button.querySelector('small')?.textContent.endsWith('\n' + id));
    if (matches.length !== 1) throw new Error('The requested voice is not uniquely available in the actual Studio.');
    matches[0].click();
  }, args['voice-package-id']);
  await page.waitForFunction(id => globalThis.LeeWayStudioControls.snapshot().selected?.id === id && globalThis.LeeWayStudioControls.snapshot().ready, {timeout: 20000}, args['voice-package-id']);
  const initial = await page.evaluate(async () => {
    const response = await fetch('/api/local/status', {cache: 'no-store'});
    const state = await response.json();
    return {http: response.status, ready: state.kokoro?.ready, engineState: state.kokoro?.state,
      voiceCount: state.kokoro?.voices?.length, runtime: LeeWayStudioControls.snapshot().runtime,
      sharedSpeaker: document.querySelector('#sharedSpeaker').textContent,
      sharedRevision: document.querySelector('#sharedRevision').title};
  });
  assert.equal(initial.http, 200);
  assert.equal(initial.ready, true);
  assert.equal(initial.runtime, 'local');
  assert.equal(initial.sharedRevision, args['live-record-sha256']);
  evidence.measurements.initial = initial;
  record('Actual Studio discovers the existing ready Kokoro adapter and unchanged owner record', initial);

  for (const [id, value, event] of [['speechText', text, 'input'], ['paceNumber', '1.1', 'change'],
    ['gainNumber', '-2', 'change'], ['masterGain', '.6', 'input'], ['spatialReverb', '.35', 'input'], ['micOrbit', '30', 'input']]) {
    await page.$eval('#' + id, (element, values) => {element.value = values.value; element.dispatchEvent(new Event(values.event, {bubbles: true}));}, {value, event});
  }
  const selectedForGeneration = await page.evaluate(() => ({id: LeeWayStudioControls.snapshot().selected?.id, runtime: LeeWayStudioControls.snapshot().runtime}));
  assert.equal(selectedForGeneration.id, args['voice-package-id']);
  assert.equal(selectedForGeneration.runtime, 'local');
  const [response] = await Promise.all([
    page.waitForResponse(result => new URL(result.url()).pathname === '/api/local/synthesize' && result.request().method() === 'POST', {timeout: 180000}),
    page.click('#generate'),
  ]);
  assert.equal(response.status(), 200, 'Actual synthesis HTTP response');
  const requestBody = JSON.parse(response.request().postData());
  assert.equal(requestBody.voicePackageId, args['voice-package-id']);
  assert.equal(requestBody.text, text);
  const generated = await response.json();
  // The real adapter reports its engine and audio. Speaker/provider attribution
  // comes from the exact UI request and the source-mapped existing Kokoro route;
  // it is not invented response metadata or an acoustic identity measurement.
  assert.equal(generated.engine, 'kokoro-82m-q8-cpu');
  assert.equal(generated.format, 'wav');
  assert.equal(generated.sampleRate, 24000);
  const wav = Buffer.from(generated.audioContent, 'base64');
  const sourceWave = pcm16Wave(wav);
  assert.equal(sourceWave.sampleRate, generated.sampleRate);
  await saveArtifact('synthesized-source.wav', wav);
  evidence.measurements.synthesis = {requestedVoicePackageId: requestBody.voicePackageId,
    selectedRuntime: selectedForGeneration.runtime, requestRoute: new URL(response.url()).pathname,
    providerAttribution: 'KOKORO_INFERRED_FROM_REVIEWED_ROUTE_AND_EXISTING_SOURCE_PROCESS',
    upstreamRoute: new URL('synthesize', upstream).href, acousticSpeakerIdentity: 'NOT_MEASURED',
    engine: generated.engine, sampleRate: generated.sampleRate, bytes: wav.length,
    audioSha256: sha256(wav), generationMs: generated.metrics?.generationMs ?? null};
  await page.waitForFunction(() => LeeWayStudioControls.snapshot().hasTake && !LeeWayStudioControls.snapshot().busy && !document.querySelector('#playPause').disabled, {timeout: 30000});
  const tunedBytes = Buffer.from(await page.$eval('#outputPlayer', async element => Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer()))));
  const tunedWave = pcm16Wave(tunedBytes);
  assert.equal(tunedWave.sampleRate, sourceWave.sampleRate);
  assert.equal(tunedWave.frames, Math.round(sourceWave.frames / 1.1), 'Pace 1.1 must change the actual WAV frame count.');
  assert.notEqual(sha256(tunedBytes), sha256(wav), 'The requested acoustic tuning must render a new waveform.');
  evidence.measurements.acousticProcessing = {source: sourceWave, rendered: tunedWave, requestedPace: 1.1,
    durationRatio: tunedWave.frames / sourceWave.frames, waveformSha256Changed: true};
  await saveArtifact('rendered-audition.wav', tunedBytes);
  record('UI Generate executes actual Kokoro synthesis and actual Studio acoustic processing', evidence.measurements.synthesis);

  await page.click('#playPause');
  await page.waitForFunction(() => LeeWayStudioMonitor.context?.state === 'running' && !document.querySelector('#outputPlayer').paused, {timeout: 15000});
  await page.evaluate(() => {
    const monitor = LeeWayStudioMonitor;
    const probe = monitor.context.createAnalyser();
    probe.fftSize = 2048; probe.smoothingTimeConstant = 0;
    monitor.master.connect(probe);
    globalThis.__leewayQualificationProbe = {probe, rms() {
      const wave = new Float32Array(probe.fftSize); probe.getFloatTimeDomainData(wave);
      return Math.sqrt(wave.reduce((sum, value) => sum + value * value, 0) / wave.length);
    }};
  });
  await page.waitForFunction(() => __leewayQualificationProbe.rms() > .000001 && LeeWayStudioMonitor.sample().output.some(value => value > 0), {timeout: 10000});
  const playing = await page.evaluate(() => ({independentOutputRms: __leewayQualificationProbe.rms(),
    outputFrequencyPeak: Math.max(...LeeWayStudioMonitor.sample().output),
    playerTime: document.querySelector('#outputPlayer').currentTime,
    paused: document.querySelector('#outputPlayer').paused, mix: {...LeeWayStudioMonitor.mix},
    monitor: LeeWayStudioMonitor.metrics(), phase: LeeWayStudioControls.snapshot().phase,
    renderer: document.querySelector('#rendererState').textContent}));
  assert.equal(playing.paused, false);
  assert.equal(playing.monitor.microphoneActive, false);
  evidence.measurements.playing = playing;
  record('Generated audio produces a nonzero independent graph measurement and live spectrum', playing);
  await page.screenshot({path: path.join(evidenceDir, 'studio-playing.png'), fullPage: true});
  const interruptedAt = Date.now();
  const immediatelyBeforeInterrupt = await page.evaluate(() => {
    const player = document.querySelector('#outputPlayer');
    const observed = {rms: __leewayQualificationProbe.rms(), paused: player.paused,
      ended: player.ended, remainingSeconds: player.duration - player.currentTime};
    if (observed.rms <= .000001 || observed.paused || observed.ended || observed.remainingSeconds <= .5) {
      throw new Error('The take must still be actively producing audio immediately before Interrupt.');
    }
    document.querySelector('#stop').click();
    return observed;
  });
  await page.waitForFunction(() => __leewayQualificationProbe.rms() < .0000001 && document.querySelector('#outputPlayer').paused && LeeWayStudioMonitor.sample().output.every(value => value === 0), {timeout: 5000});
  await pause(300);
  const interrupted = await page.evaluate(() => ({independentOutputRms: __leewayQualificationProbe.rms(),
    paused: document.querySelector('#outputPlayer').paused, meterZero: LeeWayStudioMonitor.sample().output.every(value => value === 0),
    phase: LeeWayStudioControls.snapshot().phase, masterGain: LeeWayStudioMonitor.master.gain.value}));
  assert.ok(interrupted.independentOutputRms < .0000001);
  assert.equal(interrupted.phase, 'interrupted');
  assert.equal(interrupted.masterGain, 0);
  evidence.measurements.interrupted = {...interrupted, immediatelyBeforeInterrupt, observedWithinMs: Date.now() - interruptedAt};
  record('Interrupt pauses the media and silences the independent output graph, including the reverb tail', evidence.measurements.interrupted);

  const validation = await page.evaluate(async () => {
    const sessionResponse = await fetch('/api/agent-lee/selection/session', {credentials: 'same-origin', cache: 'no-store'});
    const session = await sessionResponse.json();
    if (!sessionResponse.ok || !session.csrf) throw new Error('Existing owner session unavailable for dry-run.');
    const draft = LeeWayStudioControls.snapshot();
    const payload = {expectedRevision: session.recordRevision, voicePackageId: draft.selected.id,
      tuning: draft.tuning, dryRun: true, approve: false};
    const response = await fetch('/api/agent-lee/selection', {method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', 'X-LeeWay-Owner-CSRF': session.csrf}, body: JSON.stringify(payload)});
    const result = await response.json();
    const readback = await (await fetch('/api/agent-lee/selection/session', {credentials: 'same-origin', cache: 'no-store'})).json();
    return {http: response.status, state: result.state, candidate: result.candidate,
      beforeRevision: session.recordRevision, afterRevision: readback.recordRevision,
      deliveryState: readback.deliveryState, renderingState: readback.renderingState};
  });
  assert.equal(validation.http, 200);
  assert.equal(validation.state, 'VALIDATED_NOT_PUBLISHED');
  assert.equal(validation.candidate.voicePackageId, args['voice-package-id']);
  assert.equal(validation.candidate.tuning.pace, 1.1);
  assert.equal(validation.candidate.tuning.gain, -2);
  assert.equal(validation.beforeRevision, args['live-record-sha256']);
  assert.equal(validation.afterRevision, validation.beforeRevision);
  evidence.measurements.ownerDryRun = validation;
  record('Actual owner publisher validates the draft without changing the live record revision', validation);
  await page.screenshot({path: path.join(evidenceDir, 'studio-qualified.png'), fullPage: true});
  assert.deepEqual(evidence.blockedRequests, [], 'The Studio attempted an unapproved network request.');
  assert.equal(synthesisRequests, 1, 'The bounded gate must make exactly one synthesis request.');
  assert.deepEqual(evidence.browserErrors, [], 'The actual browser reported a JavaScript error.');
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.failure = {message: error.message, stack: error.stack?.slice(0, 8000)};
  if (page) await page.screenshot({path: path.join(evidenceDir, 'studio-failure.png'), fullPage: true}).catch(() => {});
  console.error('FAIL', error.message);
  process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => {globalThis.LeeWayStudioControls?.stop('Qualification finished.'); return globalThis.LeeWayStudioMonitor?.dispose();}).catch(() => {});
  if (browser) {
    const timer = setTimeout(() => browser.process()?.kill('SIGKILL'), 10000);
    try { await browser.close(); } catch {} finally { clearTimeout(timer); }
  }
  evidence.completedAt = new Date().toISOString();
  for (const name of ['studio-playing.png', 'studio-qualified.png', 'studio-failure.png']) {
    try {const bytes = await readFile(path.join(evidenceDir, name)); evidence.artifacts.push({path: name, bytes: bytes.length, sha256: sha256(bytes)});} catch {}
  }
  await writeFile(path.join(evidenceDir, 'browser-qualification.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({state: evidence.status, receipt: path.join(evidenceDir, 'browser-qualification.json')}));
}
