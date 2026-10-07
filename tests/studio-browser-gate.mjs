/* REGION: LeeWay Voice Fabric / Studio browser verification
 * TAG: LEEWAY-STUDIO-BROWSER-BEHAVIOR-GATE-v1
 * WHO: Agent Lee under Creator-authorized Studio implementation.
 * WHAT: Actual Chromium Web Audio playback and responsive control checks.
 * WHY: A successful DOM build does not prove playable audio or reachable controls.
 * WHERE: Local repository server, or explicit VOICE_STUDIO_URL for the UI.
 * WHEN: Run after the Studio controller and markup are ready.
 * HOW: Play the real bundled WAV, independently sample the output graph, then stop.
 * ROLES: Gate observes browser behavior; never changes an active shared voice.
 * LICENSE: Existing repository terms; no additional license grant.
 * EVIDENCE: Headless playback proves a browser graph, not microphone hardware,
 * physical speakers, human hearing, provider synthesis or phone deployment.
 */

import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}

const evidence = {
  scope: 'HEADLESS_CHROMIUM_WEB_AUDIO_AND_STUDIO_UI',
  formula: 'NOT_EXECUTED',
  physicalMicrophone: 'NOT_TESTED',
  physicalSpeakerOrHumanHearing: 'NOT_TESTED',
  providerSynthesis: 'NOT_TESTED',
  sharedVoiceMutation: 'NOT_REQUESTED',
  measurements: {},
  checks: [],
};
const record = (name, detail = {}) => {
  evidence.checks.push({name, status: 'PASS', ...detail});
  console.log('PASS', name);
};
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};

// A bounded local static host supplies the exact repository source and WAV.
// It does not fabricate a synthesis service or shared publisher.
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__monitor_gate__') {
      response.writeHead(200, {'Content-Type': mime['.html'], 'Cache-Control': 'no-store'});
      response.end('<!doctype html><html><title>Studio Monitor Gate</title><body><button id="begin">Play bundled reference fixture</button><audio id="fixturePlayer" src="/voices/agent-lee-preview.wav" preload="auto"></audio></body></html>');
      return;
    }
    if (pathname.startsWith('/api/')) {
      response.writeHead(503, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify({error: 'STATIC_BROWSER_GATE_NO_PROVIDER_OR_PUBLISHER'}));
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root) || relative.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    const bytes = await readFile(target);
    response.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': 'no-store'});
    response.end(bytes);
  } catch {
    response.writeHead(404, {'Content-Type': 'text/plain'}); response.end('Not found');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const fixtureBase = `http://127.0.0.1:${server.address().port}/`;
const studioURL = process.env.VOICE_STUDIO_URL || new URL('studio.html', fixtureBase).href;
const artifacts = process.env.STUDIO_BROWSER_ARTIFACTS;
let browser;
let failed = false;

async function monitorGate() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('__monitor_gate__', fixtureBase).href);
  const fixture = await readFile(path.join(root, 'voices/agent-lee-preview.wav'));
  evidence.measurements.fixture = {path: 'voices/agent-lee-preview.wav', bytes: fixture.length,
    sha256: createHash('sha256').update(fixture).digest('hex')};
  await page.evaluate(async () => {
    const {StudioMonitor} = await import('/src/studio-monitor.js');
    const monitor = new StudioMonitor();
    const player = document.querySelector('#fixturePlayer');
    const state = globalThis.monitorGate = {monitor, player, ready: false, error: null};
    state.probeRms = () => {
      if (!state.probe) return 0;
      const waveform = new Float32Array(state.probe.fftSize);
      state.probe.getFloatTimeDomainData(waveform);
      return Math.sqrt(waveform.reduce((sum, n) => sum + n * n, 0) / waveform.length);
    };
    document.querySelector('#begin').onclick = async () => {
      try {
        monitor.configure({sampleRate: 24000, latencyHint: 'interactive'});
        monitor.setMix({gain: .6, reverb: .35, orbit: 30});
        await monitor.activate(player);
        // This independent analyser samples the graph even when monitor.sample()
        // deliberately masks a stopped meter. It detects real residual output.
        state.probe = monitor.context.createAnalyser();
        state.probe.fftSize = 2048;
        state.probe.smoothingTimeConstant = 0;
        monitor.master.connect(state.probe);
        await player.play();
        state.ready = true;
      } catch (error) { state.error = error.message; }
    };
  });
  const idle = await page.evaluate(() => {
    const sample = monitorGate.monitor.sample();
    return {inputZero: sample.input.every(n => n === 0),
      outputZero: sample.output.every(n => n === 0), inputRms: sample.inputRms,
      context: monitorGate.monitor.metrics().state};
  });
  assert.deepEqual(idle, {inputZero: true, outputZero: true, inputRms: 0, context: 'closed'});
  record('Unopened browser monitor reports silence without microphone access');
  await page.locator('#begin').click();
  await page.waitForFunction(() => monitorGate.ready || monitorGate.error, null, {timeout: 15000});
  assert.equal(await page.evaluate(() => monitorGate.error), null);
  await page.waitForFunction(() => monitorGate.monitor.sample().output.some(n => n > 0) &&
    monitorGate.probeRms() > .000001, null, {timeout: 10000});
  const playing = await page.evaluate(() => ({
    paused: monitorGate.player.paused,
    mediaTime: monitorGate.player.currentTime,
    durationSeconds: monitorGate.player.duration,
    independentOutputRms: monitorGate.probeRms(),
    largestFrequencyBin: Math.max(...monitorGate.monitor.sample().output),
    inputRms: monitorGate.monitor.sample().inputRms,
    metrics: monitorGate.monitor.metrics(),
  }));
  assert.equal(playing.paused, false);
  assert.equal(playing.inputRms, 0);
  assert.ok(playing.largestFrequencyBin > 0);
  evidence.measurements.browserPlayback = playing;
  record('Bundled WAV produces nonzero independent Web Audio output and spectrum', playing);
  await page.evaluate(async () => {
    await monitorGate.monitor.attach(monitorGate.player);
    await monitorGate.monitor.activate(monitorGate.player);
    monitorGate.monitor.setMix({gain: 0});
  });
  await page.waitForFunction(() => monitorGate.probeRms() < .0000001, null, {timeout: 3000});
  const gainMuted = await page.evaluate(() => ({rms: monitorGate.probeRms(),
    paused: monitorGate.player.paused, sources: monitorGate.monitor.sources.size}));
  assert.equal(gainMuted.paused, false, 'gain must affect the graph while media keeps playing');
  assert.equal(gainMuted.sources, 1, 'replay must not create duplicate media sources');
  record('Master gain silences the actual graph without duplicating its media source', gainMuted);
  await page.evaluate(async () => {
    monitorGate.player.currentTime = 0;
    monitorGate.monitor.setMix({gain: .6});
    await monitorGate.player.play();
  });
  await page.waitForFunction(() => monitorGate.probeRms() > .000001, null, {timeout: 10000});
  await page.evaluate(() => monitorGate.monitor.cut());
  await page.waitForFunction(() => monitorGate.probeRms() < .0000001, null, {timeout: 3000});
  const stopped = await page.evaluate(() => ({rms: monitorGate.probeRms(),
    paused: monitorGate.player.paused,
    spectrumZero: monitorGate.monitor.sample().output.every(n => n === 0)}));
  assert.equal(stopped.paused, true);
  assert.equal(stopped.spectrumZero, true);
  record('Interrupt pauses media, clears meters and silences independent graph probe', stopped);
  await page.evaluate(() => monitorGate.monitor.dispose());
  assert.equal(await page.evaluate(() => monitorGate.monitor.metrics().state), 'closed');
  assert.deepEqual(errors, []);
  await page.close();
}

async function reachable(page, selector) {
  const control = page.locator(selector);
  assert.equal(await control.count(), 1, `${selector} resolves to one control`);
  await control.evaluate(element => element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'}));
  assert.equal(await control.isVisible(), true, `${selector} is visible`);
  const geometry = await control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(innerWidth - 1, Math.max(0, rect.x + rect.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, rect.y + rect.height / 2));
    const top = document.elementFromPoint(x, y);
    return {width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
      unobstructed: top === element || element.contains(top)};
  });
  assert.ok(geometry.width > 0 && geometry.height > 0, `${selector} has a usable box`);
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1,
    `${selector} is not horizontally clipped: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.top < geometry.viewportHeight && geometry.bottom > 0,
    `${selector} can be brought into view`);
  assert.equal(geometry.unobstructed, true, `${selector} is covered by another element`);
}

async function uiGate(viewport) {
  const context = await browser.newContext({viewport, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [], forbiddenRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  // Browser verification never downloads a model or charges a hosted provider.
  // All third-party connections are recorded and blocked in this gate.
  const permittedOrigin = new URL(studioURL).origin;
  await page.route('**/*', route => {
    const requestURL = new URL(route.request().url());
    if (requestURL.protocol === 'http:' || requestURL.protocol === 'https:') {
      if (requestURL.origin !== permittedOrigin) {
        forbiddenRequests.push({origin: requestURL.origin, pathname: requestURL.pathname});
        return route.abort('blockedbyclient');
      }
    }
    return route.continue();
  });
  await page.goto(studioURL, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.waitForSelector('#voiceList .voice-card', {timeout: 30000});
  const labels = await page.locator('#voiceList .voice-card').allTextContents();
  assert.ok(labels.some(label => /Agent Lee.*Voice One/.test(label)));
  assert.equal(labels.filter(label => label.includes('Kokoro')).length, 28);
  const initialWidth = await page.evaluate(() => ({page: document.documentElement.scrollWidth,
    viewport: innerWidth}));
  assert.ok(initialWidth.page <= initialWidth.viewport + 1,
    `Page overflows at ${viewport.width}px: ${JSON.stringify(initialWidth)}`);
  record(`Voice One and 28 Kokoro profiles render at ${viewport.width}px without page overflow`);

  await page.locator('#voiceList .voice-card').filter({hasText: 'agent-lee-voice-one'}).click();
  await page.waitForFunction(() => !document.querySelector('#playPause').disabled, null, {timeout: 30000});
  assert.match(await page.locator('#selectedTitle').textContent(), /Voice One/);
  await page.locator('#monitorSampleRate').selectOption('24000');
  await page.locator('#latencyPreference').selectOption('balanced');
  await page.locator('#playPause').click();
  await page.waitForFunction(() => !document.querySelector('#outputPlayer').paused, null, {timeout: 10000});
  await page.waitForFunction(() => document.querySelector('#monitorSampleRate').disabled &&
    document.querySelector('#latencyPreference').disabled, null, {timeout: 10000});
  await page.waitForFunction(() => {
    const label = document.querySelector('#outputLevel').textContent.trim();
    return label !== '' && !/^(silent|off|0(?:\.0)?%?)$/i.test(label);
  }, null, {timeout: 10000});
  const playback = await page.locator('#outputPlayer').evaluate(player => ({paused: player.paused,
    duration: player.duration, currentTime: player.currentTime}));
  record(`UI preview plays and negotiated monitor controls lock at ${viewport.width}px`, playback);
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#outputPlayer').paused &&
    /^(silent|0(?:\.0)?%?)$/i.test(document.querySelector('#outputLevel').textContent.trim()),
  null, {timeout: 10000});
  record(`UI interruption returns playback and output meter to silence at ${viewport.width}px`);

  // The optional preparation control is shown only for its browser runtime.
  // Selecting that runtime is reversible and does not prepare/download a model.
  await page.locator('#runtime').selectOption('browser');

  for (const selector of ['#search', '#speechText', '#speakStream', '#stop', '#toggleLight',
    '#masterGain', '#spatialReverb', '#meshDeform', '#micOrbit', '#environmentPreset',
    '#runtime', '#refreshLocal', '#prepare', '#microphoneDevice', '#toggleMic',
    '#monitorSampleRate', '#latencyPreference', '#refreshAgentLeeVoice', '#applyAgentLeeVoice',
    '#playPause', '#restartPlayback', '#seek', '#reset', '#acousticTab', '#synthesisTab']) {
    await reachable(page, selector);
  }
  record(`Studio controls are reachable and unobstructed at ${viewport.width}px`);

  const lightsBefore = await page.locator('#toggleLight').getAttribute('aria-pressed');
  await page.locator('#toggleLight').click();
  assert.notEqual(await page.locator('#toggleLight').getAttribute('aria-pressed'), lightsBefore);
  await page.locator('#environmentPreset').selectOption('warm');
  assert.equal(await page.locator('body').getAttribute('data-theme'), 'warm');
  await page.locator('#environmentPreset').selectOption('cyber');
  await page.locator('#masterGain').focus();
  await page.locator('#masterGain').press('Home');
  assert.match(await page.locator('#masterGainValue').textContent(), /^0%$/);
  await page.locator('#masterGain').press('End');
  assert.match(await page.locator('#masterGainValue').textContent(), /^100%$/);
  await page.locator('#spatialReverb').focus();
  await page.locator('#spatialReverb').press('End');
  assert.match(await page.locator('#spatialReverbValue').textContent(), /^100%$/);
  await page.locator('#spatialReverb').press('Home');
  await page.locator('#synthesisTab').click();
  assert.equal(await page.locator('#synthesisTab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#synthesisPanel').isVisible(), true);
  await page.locator('#acousticTab').click();
  assert.equal(await page.locator('#dspPanel').isVisible(), true);
  record(`Light, environment, audio sliders and tuning tabs respond at ${viewport.width}px`);

  await page.locator('#search').fill('kokoro-af_heart');
  assert.equal(await page.locator('#voiceList .voice-card').count(), 1);
  await page.locator('#search').fill('');
  assert.equal(await page.locator('#voiceList .voice-card').count(), labels.length);
  assert.deepEqual(errors, [], `Uncaught browser errors at ${viewport.width}px`);
  evidence.measurements[`ui_${viewport.width}`] = {viewport, runtimeErrors: errors,
    blockedExternalRequests: forbiddenRequests,
    sharedPublisherState: await page.locator('#sharedVoiceState').textContent(),
    applyEnabled: await page.locator('#applyAgentLeeVoice').isEnabled()};
  if (artifacts) {
    await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
    await page.screenshot({path: path.join(artifacts, `studio-${viewport.width}.png`), fullPage: true});
  }
  await context.close();
}

async function streamingFixtureGate() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [], requests = [];
  const fixture = await readFile(path.join(root, 'voices/kokoro-previews/af_heart.wav'));
  const response = {audioContent: fixture.toString('base64'), sampleRate: 24000,
    engine: 'TEST_FIXTURE_RECORDED_KOKORO_PREVIEW', evidenceClass: 'HTTP_CONTRACT_FIXTURE_NOT_MODEL_SYNTHESIS'};
  let holdNext = false, lateGate = null, releaseLate = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.fixtureEvents = [];
    document.addEventListener('leeway:studio', event => {
      fixtureEvents.push({at: performance.now(), ...event.detail});
    });
    document.addEventListener('ended', event => {
      if (event.target.id === 'outputPlayer') fixtureEvents.push({type: 'media-ended', at: performance.now()});
    }, true);
    const browserFetch = fetch.bind(globalThis);
    globalThis.ignoreFixtureAbort = false;
    globalThis.fixtureResponsesConsumed = 0;
    globalThis.fetch = (input, options) => {
      // A controlled late-response test models a provider that ignores cancel.
      // Production fetch and all other request paths retain their AbortSignal.
      const requestURL = new URL(typeof input === 'string' ? input : input.url, location.href);
      const isSynthesis = requestURL.pathname === '/api/local/synthesize';
      let pending;
      if (ignoreFixtureAbort && isSynthesis) {
        const {signal: _ignoredOnlyInThisFixture, ...uncancellable} = options || {};
        pending = browserFetch(input, uncancellable);
      } else pending = browserFetch(input, options);
      if (!isSynthesis) return pending;
      return pending.then(response => {
        const readJSON = response.json.bind(response);
        response.json = async () => {
          const data = await readJSON();
          fixtureResponsesConsumed++;
          return data;
        };
        return response;
      });
    };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== new URL(fixtureBase).origin) {
      await route.abort('blockedbyclient'); return;
    }
    if (url.pathname === '/api/local/status') {
      await route.fulfill({json: {kokoro: {ready: true, state: 'HTTP_CONTRACT_FIXTURE', voices: ['af_heart']},
        xtts: {ready: false, state: 'NOT_TESTED'}, evidenceClass: 'FIXTURE_ONLY'}}); return;
    }
    if (url.pathname === '/api/local/voices') {
      await route.fulfill({json: {voices: [], evidenceClass: 'USE_EXISTING_REPOSITORY_CATALOG'}}); return;
    }
    if (url.pathname === '/api/local/synthesize') {
      const body = route.request().postDataJSON();
      requests.push({body, at: Date.now()});
      if (holdNext) { holdNext = false; await lateGate; }
      await route.fulfill({json: response}); return;
    }
    await route.continue();
  });
  await page.goto(new URL('studio.html', fixtureBase).href, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#voiceList .voice-card', {timeout: 30000});
  await page.locator('#voiceList .voice-card').filter({hasText: 'kokoro-af_heart'}).click();
  await page.waitForFunction(() => !document.querySelector('#playPause').disabled, null, {timeout: 30000});
  await page.locator('#refreshLocal').click();
  await page.waitForFunction(() => !document.querySelector('#speakStream').disabled, null, {timeout: 10000});
  const sentences = [
    'First complete sentence carries enough words to prove that one segment is played before the next segment is requested.',
    'Second complete sentence carries different words so the ordered request bodies can be checked independently.',
  ];
  await page.locator('#speechText').fill(sentences.join(' '));
  await page.evaluate(() => { fixtureEvents.length = 0; });
  await page.locator('#speakStream').click();
  await page.waitForFunction(() => fixtureEvents.some(event => event.type === 'stream-playback-start'),
    null, {timeout: 15000});
  assert.equal(requests.length, 1, 'first segment plays before the second segment is synthesized');
  assert.equal(requests[0].body.voicePackageId, 'kokoro-af_heart');
  await page.waitForFunction(() => fixtureEvents.some(event => event.type === 'stream-complete'),
    null, {timeout: 45000});
  const completed = await page.evaluate(() => ({
    events: fixtureEvents.map(event => ({type: event.type, segments: event.segments, at: event.at})),
    snapshot: LeeWayStudioControls.snapshot(),
    paused: document.querySelector('#outputPlayer').paused,
  }));
  assert.deepEqual(requests.map(request => request.body.text), sentences);
  assert.equal(completed.events.filter(event => event.type === 'stream-playback-start').length, 2);
  assert.equal(completed.events.filter(event => event.type === 'media-ended').length, 2);
  assert.equal(completed.events.find(event => event.type === 'stream-complete').segments, 2);
  assert.equal(completed.snapshot.hasTake, true);
  assert.equal(completed.snapshot.busy, false);
  assert.equal(completed.paused, true);
  record('Fixture HTTP stream plays two clauses in request order and keeps a replayable complete take', {
    evidenceClass: 'HTTP_CONTRACT_FIXTURE_NOT_MODEL_SYNTHESIS',
    requestCount: requests.length, playedSegments: 2,
  });

  lateGate = new Promise(resolve => { releaseLate = resolve; });
  holdNext = true;
  await page.evaluate(() => { ignoreFixtureAbort = true; fixtureEvents.length = 0; });
  const lateRequested = page.waitForRequest(request => new URL(request.url()).pathname === '/api/local/synthesize');
  await page.locator('#speakStream').click();
  await lateRequested;
  await page.locator('#stop').click();
  const stoppedEpoch = await page.evaluate(() => LeeWayStudioControls.snapshot().epoch);
  assert.equal(await page.locator('#outputPlayer').evaluate(player => player.paused), true);
  const lateReturned = page.waitForResponse(response => new URL(response.url()).pathname === '/api/local/synthesize');
  releaseLate();
  await (await lateReturned).finished();
  await page.waitForFunction(() => fixtureResponsesConsumed === 3, null, {timeout: 10000});
  const afterLate = await page.evaluate(() => ({snapshot: LeeWayStudioControls.snapshot(),
    paused: document.querySelector('#outputPlayer').paused,
    starts: fixtureEvents.filter(event => event.type === 'stream-playback-start').length,
    completed: fixtureEvents.filter(event => event.type === 'stream-complete').length,
    zero: LeeWayStudioMonitor.sample().output.every(value => value === 0)}));
  assert.equal(afterLate.snapshot.epoch, stoppedEpoch);
  assert.equal(afterLate.snapshot.phase, 'interrupted');
  assert.equal(afterLate.snapshot.busy, false);
  assert.equal(afterLate.snapshot.hasTake, false, 'late response cannot reinstate an obsolete take');
  assert.equal(afterLate.paused, true);
  assert.equal(afterLate.starts, 0);
  assert.equal(afterLate.completed, 0);
  assert.equal(afterLate.zero, true);
  assert.deepEqual(errors, []);
  record('Stop rejects a late fixture response even when its transport ignores AbortSignal', {
    evidenceClass: 'CONTROLLED_UNCANCELLABLE_HTTP_FIXTURE', stoppedEpoch,
    postStopPlaybackStarts: afterLate.starts, postStopStreamCompletions: afterLate.completed,
  });
  evidence.measurements.streamingFixture = {
    scope: 'HTTP_CONTRACT_AND_BROWSER_PLAYBACK_ONLY',
    modelExecution: 'NOT_EXECUTED', requestedTextMatchesRecordedSpeech: 'NOT_CLAIMED',
    fixture: {path: 'voices/kokoro-previews/af_heart.wav', bytes: fixture.length,
      sha256: createHash('sha256').update(fixture).digest('hex')},
    requestedSegments: requests.map(request => request.body),
    lateResponseRejected: true,
  };
  await context.close();
}

try {
  if (artifacts) await mkdir(artifacts, {recursive: true});
  browser = await playwright.chromium.launch({headless: true,
    ...(process.env.STUDIO_CHROMIUM_EXECUTABLE ? {executablePath: process.env.STUDIO_CHROMIUM_EXECUTABLE} : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  await monitorGate();
  if (!process.argv.includes('--monitor-only')) {
    await uiGate({width: 1440, height: 1000});
    await uiGate({width: 390, height: 844});
    await streamingFixtureGate();
  }
  evidence.status = 'PASS';
} catch (error) {
  failed = true;
  evidence.status = 'FAIL';
  evidence.failure = {message: error.message, stack: error.stack};
  console.error(error.stack || error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  if (artifacts) await writeFile(path.join(artifacts, 'studio-browser-gate.json'),
    JSON.stringify(evidence, null, 2) + '\n');
}
console.log('STUDIO_BROWSER_GATE=' + evidence.status);
console.log(JSON.stringify(evidence, null, 2));
if (failed) process.exitCode = 1;

// END REGION: LeeWay Voice Fabric / Studio browser verification
