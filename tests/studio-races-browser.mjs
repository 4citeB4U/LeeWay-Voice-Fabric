/* #REGION LeeWay Voice Fabric — cancellation and provider-rate regression
 * TAG: LEEWAY-STUDIO-RACES-BROWSER-TEST
 * WHO: LeeWay Industries / Agent Lee under Creator authorization.
 * WHAT: Stop during suspended device startup, monitor cut, reference/stream handoff and provider rate.
 * WHEN: 2026-10-07. WHERE: Isolated loopback Studio and headless browser.
 * WHY: An old asynchronous play request must not outlive Stop or preserve a blocked stream.
 * HOW: Actual Studio modules and AudioContext with an explicitly held resume boundary;
 *      labeled local/hosted HTTP fixtures return deterministic PCM, never model speech.
 * AUTHORIZED ROLES: Isolated browser regression; no user account, microphone, provider or shared publication.
 * LICENSE: Repository/owner terms apply; no additional license grant.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}
const sourceFiles = ['src/studio.js', 'src/studio-console.js', 'src/studio-monitor.js'];
const sources = new Map(await Promise.all(sourceFiles.map(async name => [name, await readFile(path.join(root, name))])));
const evidence = {
  scope: 'ACTUAL_BROWSER_CANCELLATION_WITH_EXPLICIT_HTTP_FIXTURES',
  providerModelExecution: 'NOT_EXECUTED', sharedPublication: 'NOT_REQUESTED', physicalAudioDevice: 'NOT_QUALIFIED',
  sourceSha256: Object.fromEntries([...sources].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')])),
  checks: [],
};
const artifacts = process.env.STUDIO_RACE_ARTIFACTS;
const checks = (name, observed) => {
  evidence.checks.push({name, status: 'PASS', observed});
  console.log('PASS', name);
};
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'};
const requests = [];

function fixtureWav(rate, seconds) {
  const frames = Math.round(rate * seconds), bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 4000), 44 + i * 2);
  return {audioContent: bytes.toString('base64'), sampleRate: rate, format: 'wav', evidenceClass: 'PCM_TEST_FIXTURE_NOT_PROVIDER_SYNTHESIS'};
}
const localFixture = fixtureWav(24000, 5), hostedFixture = fixtureWav(48000, .5);
const json = (response, value, status = 200) => {
  response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(value));
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'), pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/local/status') return json(response, {kokoro: {ready: true, voices: ['af_heart'], state: 'FIXTURE'}, xtts: {ready: true, state: 'FIXTURE'}});
    if (pathname === '/api/local/voices') return json(response, {voices: []});
    if (pathname === '/api/provider/status') return json(response, {resemble: {configured: true, evidenceClass: 'ISOLATED_FIXTURE_NO_ACCOUNT'}});
    if (pathname === '/api/resemble/voices') return json(response, {numPages: 1, voices: [{
      id: 'fixture-hosted-48k', name: 'Fixture hosted 48 kHz', provider: 'resemble', source: 'RESEMBLE_HOSTED', gender: 'female',
      voiceUuid: '00000000-0000-0000-0000-000000000048', description: 'Explicit HTTP contract fixture; no provider or account is connected.'
    }]});
    if (pathname === '/api/local/synthesize' || pathname === '/api/resemble/synthesize') {
      const parts = []; for await (const part of request) parts.push(part);
      requests.push({path: pathname, body: JSON.parse(Buffer.concat(parts).toString()), at: Date.now()});
      return json(response, pathname === '/api/local/synthesize' ? localFixture : hostedFixture);
    }
    if (pathname.startsWith('/api/')) return json(response, {error: 'RACE_FIXTURE_SHARED_OWNER_NOT_CONNECTED'}, 503);
    const relative = pathname === '/' ? 'studio.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    const bytes = sources.get(relative) || await readFile(target);
    response.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    response.end(bytes);
  } catch (error) { response.writeHead(404); response.end('Fixture route unavailable'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const pageErrors = [], blockedRequests = [];

async function holdResume() {
  await page.evaluate(async () => {
    const context = LeeWayStudioMonitor.context;
    if (!context) throw new Error('Warm up the real browser audio context first.');
    const nativeResume = context.resume.bind(context);
    await context.suspend();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const hold = window.resumeHold = {entered: false, resumed: false, release,
      restore: () => { context.resume = nativeResume; }};
    context.resume = async () => { hold.entered = true; await gate; await nativeResume(); hold.resumed = true; };
  });
}
async function releaseResume() {
  await page.evaluate(() => resumeHold.release());
  await page.waitForFunction(() => resumeHold.resumed, null, {timeout: 5000});
  await page.evaluate(() => resumeHold.restore());
  // Let continuations and one activity update settle before checking a negative condition.
  await page.waitForTimeout(200);
}
async function snapshot() {
  return page.evaluate(() => ({phase: LeeWayStudioControls.snapshot().phase, epoch: LeeWayStudioControls.snapshot().epoch,
    busy: LeeWayStudioControls.snapshot().busy, paused: document.querySelector('#outputPlayer').paused,
    referencePaused: document.querySelector('#referencePlayer').paused, silenced: LeeWayStudioMonitor.silenced,
    masterGain: LeeWayStudioMonitor.master?.gain.value, runtime: LeeWayStudioControls.snapshot().runtime,
    selected: LeeWayStudioControls.snapshot().selected?.id, ready: LeeWayStudioControls.snapshot().ready,
    runtimeMessage: document.querySelector('#runtimeState').textContent}));
}

try {
  browser = await playwright.chromium.launch({headless: true,
    ...(process.env.STUDIO_CHROMIUM_EXECUTABLE ? {executablePath: process.env.STUDIO_CHROMIUM_EXECUTABLE} : {}),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
      blockedRequests.push({origin: url.origin, path: url.pathname}); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.goto(`${base}/studio.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#voiceList .voice-card');
  await page.locator('#voiceList .voice-card').filter({hasText: 'kokoro-af_heart'}).click();
  await page.waitForFunction(() => window.LeeWayStudioControls?.snapshot().hasTake && window.LeeWayStudioMonitor);
  await page.locator('#refreshLocal').click();
  await page.waitForFunction(() => LeeWayStudioControls.snapshot().ready);
  await page.locator('#monitorSampleRate').selectOption('24000');
  await page.locator('#playPause').click();
  await page.waitForFunction(() => !document.querySelector('#outputPlayer').paused);
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#outputPlayer').paused);

  // This holds the real resume boundary; synthesis, media and controller code remain unchanged.
  await holdResume();
  await page.locator('#playPause').click(); await page.waitForFunction(() => resumeHold.entered);
  await page.locator('#stop').click(); const stoppedReplay = await snapshot();
  await releaseResume(); const afterReplay = await snapshot();
  assert.equal(afterReplay.epoch, stoppedReplay.epoch);
  assert.equal(afterReplay.phase, 'interrupted'); assert.equal(afterReplay.paused, true);
  assert.equal(afterReplay.silenced, true); assert.equal(afterReplay.masterGain, 0);
  checks('Stop during ordinary replay device resume prevents late playback and unmute', afterReplay);

  await holdResume();
  const requestsBefore = requests.length;
  await page.waitForFunction(() => !document.querySelector('#speakStream').disabled);
  await page.locator('#speakStream').click(); await page.waitForFunction(() => resumeHold.entered);
  await page.locator('#stop').click(); const stoppedIngress = await snapshot();
  await releaseResume(); const afterIngress = await snapshot();
  assert.equal(requests.length, requestsBefore, 'a stopped pending Speak click must never reach a provider');
  assert.equal(afterIngress.epoch, stoppedIngress.epoch);
  assert.equal(afterIngress.phase, 'interrupted'); assert.equal(afterIngress.busy, false); assert.equal(afterIngress.paused, true);
  checks('Stop during Speak device resume prevents delayed synthesis ingress', {...afterIngress, newSynthesisRequests: 0});

  await holdResume();
  await page.evaluate(() => {
    window.monitorActivationResult = 'pending';
    LeeWayStudioMonitor.activate(document.querySelector('#outputPlayer')).then(
      () => { window.monitorActivationResult = 'fulfilled'; },
      error => { window.monitorActivationResult = error.name; });
  });
  await page.waitForFunction(() => resumeHold.entered);
  await page.evaluate(() => LeeWayStudioMonitor.cut());
  await releaseResume();
  const activation = await page.evaluate(() => ({result: monitorActivationResult, silenced: LeeWayStudioMonitor.silenced,
    masterGain: LeeWayStudioMonitor.master.gain.value, paused: document.querySelector('#outputPlayer').paused}));
  assert.deepEqual(activation, {result: 'AbortError', silenced: true, masterGain: 0, paused: true});
  checks('Monitor cut independently rejects a pending activation after resume', activation);

  const text = 'First complete sentence contains enough words to keep the first fixture segment separate from the second request. '
    + 'Second complete sentence must never be requested after the reference control interrupts the first stream segment.';
  await page.locator('#speechText').fill(text);
  const beforeStreamRequests = requests.length;
  await page.locator('#speakStream').click();
  await page.waitForFunction(() => LeeWayStudioControls.snapshot().phase === 'streaming' && !document.querySelector('#outputPlayer').paused);
  await page.evaluate(() => { document.querySelector('#referencePlayer').play().catch(() => {}); });
  await page.waitForFunction(() => !LeeWayStudioControls.snapshot().busy && document.querySelector('#outputPlayer').paused,
    null, {timeout: 3000});
  await page.waitForFunction(() => !document.querySelector('#referencePlayer').paused, null, {timeout: 3000});
  const handoff = await snapshot();
  assert.equal(handoff.busy, false); assert.equal(handoff.paused, true); assert.equal(handoff.referencePaused, false);
  assert.equal(requests.length - beforeStreamRequests, 1, 'reference handoff must discard remaining stream requests');
  checks('Reference playback interrupts a stream without leaving it busy or overlapping output', handoff);
  await page.locator('#stop').click();

  // The hosted service is an explicitly labeled loopback fixture, never a connected account.
  await page.evaluate(() => { document.querySelector('#refreshHosted').closest('details').open = true; });
  await page.locator('#refreshHosted').click();
  await page.locator('#voiceList .voice-card').filter({hasText: 'fixture-hosted-48k'}).click();
  await page.locator('#speechText').fill('A short hosted sample-rate contract fixture.');
  await page.locator('#generate').click();
  await page.waitForFunction(() => LeeWayStudioControls.snapshot().hasTake && !LeeWayStudioControls.snapshot().busy);
  const sourceRate = await page.evaluate(async () => {
    const bytes = await (await fetch(document.querySelector('#outputPlayer').src)).arrayBuffer();
    return {wavSampleRate: new DataView(bytes).getUint32(24, true), renderState: document.querySelector('#renderState').textContent,
      monitorSampleRate: LeeWayStudioMonitor.context.sampleRate};
  });
  assert.equal(sourceRate.wavSampleRate, 48000, 'a 48 kHz provider response must not be silently decoded at 24 kHz');
  assert.equal(sourceRate.monitorSampleRate, 24000, 'the monitor rate is deliberately different from the provider rate');
  assert.match(sourceRate.renderState, /48,000 Hz/);
  assert.equal(requests.at(-1).path, '/api/resemble/synthesize');
  checks('Hosted 48 kHz source rate survives decoding and rendered WAV independently of the monitor', sourceRate);

  assert.deepEqual(pageErrors, []);
  evidence.pageErrors = pageErrors; evidence.blockedExternalRequests = blockedRequests; evidence.result = 'PASS';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.result = 'FAIL'; evidence.error = error.stack || String(error); evidence.pageErrors = pageErrors;
  if (page) { try { evidence.finalState = await snapshot(); } catch {} }
  console.error(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
} finally {
  if (artifacts) {
    await mkdir(artifacts, {recursive: true});
    await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
/* #ENDREGION LeeWay Voice Fabric — cancellation and provider-rate regression */
