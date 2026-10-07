/* REGION: LeeWay Voice Fabric / Studio owner verification
 * TAG: LEEWAY-STUDIO-OWNER-BROWSER-GATE-v1
 * WHO: Agent Lee under Creator-authorized Studio integration verification.
 * WHAT: Browser controls -> actual Python publisher -> temporary binding -> readback.
 * WHY: Local draft controls alone do not prove shared publication.
 * WHERE: Real checkout served on loopback; authority fixture in an owned temp dir.
 * WHEN: Before live staging or changes to publication controls.
 * HOW: Real cookies, CSRF, revision checks, atomic files and two browser tabs.
 * ROLES: TEST_FIXTURES_ONLY; provider readiness is stubbed; no live owner mutation.
 * LICENSE: Existing repository terms; no additional license grant.
 */

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdtemp, mkdir, readdir, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const artifacts = process.env.STUDIO_OWNER_BROWSER_ARTIFACTS;
const sourcePaths = ['adapters/studio-server.py', 'adapters/voice_selection_owner.py',
  'src/studio.js', 'src/studio-console.js', 'studio.html'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async file =>
  [file, sha256(await readFile(path.join(root, file)))])));
const evidence = {
  schemaVersion: 'leeway.studio-owner-browser-gate.v1',
  scope: 'REAL_FRONTEND_AND_PYTHON_PUBLISHER_WITH_TEMPORARY_AUTHORITY_FIXTURE',
  liveOwnerMutation: 'NOT_PERFORMED', providerReadiness: 'STUBBED_TRUE_FOR_FIXTURE',
  providerSynthesis: 'NOT_EXECUTED', formulaExecution: 'NOT_EXECUTED',
  deviceAcknowledgements: 'NOT_TESTED', speakerAudibility: 'NOT_MEASURED',
  learningLedger: 'NOT_UPDATED', checks: [], publications: [], requests: [],
};
const record = (name, details = {}) => {
  evidence.checks.push({name, status: 'PASS', ...details});
  console.log('PASS', name);
};

const pythonBootstrap = String.raw`
from functools import partial
import importlib.util
import json
import os
from pathlib import Path
import sys

source, fixture = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
assert source != fixture
assert (fixture / 'runtime/employee-voice-bindings.v1.json').is_file()
assert (fixture / 'voices/catalog.v1.json').is_file()
os.environ['LEEWAY_VOICE_RUNTIME_ROOT'] = str(fixture)
os.environ['LEEWAY_ALLOWED_ORIGINS'] = ''
os.environ['RESEMBLE_API_KEY'] = ''
spec = importlib.util.spec_from_file_location('studio_owner_browser_fixture', source / 'adapters/studio-server.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)
studio.shared_provider_ready = lambda _profile: True
studio.local_status = lambda: {
    'kokoro': {'ready': True, 'state': 'TEST_FIXTURE_NO_MODEL', 'voices': [item[0] for item in studio.LOCAL_VOICES]},
    'xtts': {'ready': True, 'state': 'TEST_FIXTURE_NO_MODEL'},
    'evidenceClass': 'PROVIDER_READINESS_STUB_ONLY',
}
def no_provider_execution(*_args, **_kwargs):
    raise RuntimeError('PROVIDER_EXECUTION_FORBIDDEN_IN_OWNER_BROWSER_GATE')
studio.local_request = no_provider_execution
studio.provider_request = no_provider_execution
server = studio.ThreadingHTTPServer(('127.0.0.1', 0), partial(studio.StudioHandler, directory=str(source)))
print(json.dumps({'port': server.server_port, 'fixtureRoot': str(fixture),
                  'handler': 'actual StudioHandler', 'publisher': 'actual voice_selection_owner'}), flush=True)
server.serve_forever()
`;

async function startPython(fixtureRoot) {
  const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
  const child = spawn(python, ['-u', '-c', pythonBootstrap, root, fixtureRoot], {
    cwd: root,
    env: {...process.env, LEEWAY_VOICE_RUNTIME_ROOT: fixtureRoot,
      LEEWAY_ALLOWED_ORIGINS: '', RESEMBLE_API_KEY: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = deferred();
  let buffer = '', stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    try { ready.resolve(JSON.parse(buffer.slice(0, newline))); }
    catch (error) { ready.reject(error); }
  });
  child.once('error', ready.reject);
  child.once('exit', code => ready.reject(new Error(`Python fixture server exited (${code}): ${stderr}`)));
  const deadline = setTimeout(() => ready.reject(new Error('Python fixture server readiness timed out. ' + stderr)), 15000);
  try { return {child, ready: await ready.promise, stderr: () => stderr}; }
  catch (error) { child.kill('SIGTERM'); throw error; }
  finally { clearTimeout(deadline); }
}

async function stopPython(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await ended; } finally { clearTimeout(deadline); }
}

const temp = await mkdtemp(path.join(tmpdir(), 'leeway-studio-owner-browser-'));
const bindingPath = path.join(temp, 'runtime/employee-voice-bindings.v1.json');
const publicationDir = path.join(temp, 'receipts/selection-publications');
const fixtureDocument = {
  schemaVersion: 'TEST_FIXTURE_NOT_A_LIVE_OWNER',
  authority: 'LEEWAY_VOICE_FABRIC',
  metadata: {fixtureOnly: true, retainedMarker: 'unrelated top-level data'},
  bindings: {
    'agent-lee': {agentId: 'agent-lee', voicePackageId: 'kokoro-am_michael',
      personaFamily: 'FIXTURE_PERSONA_FAMILY', personaArchetypeId: 'ELDER_MALE',
      identityEvidence: {retainedMarker: 'identity stays with Agent Lee'},
      permissions: ['fixture-only'], selectedBy: 'TEST_FIXTURE', publicationVersion: 4,
      tuning: {pace: 1, gain: 0}},
    'fixture-worker': {agentId: 'fixture-worker', voicePackageId: 'fixture-worker-voice',
      personaFamily: 'OTHER_FIXTURE_PERSONA', scope: ['must-stay-identical']},
  },
};
const fixtureCatalog = {
  authority: '4citeB4U/LeeWay-Voice-Fabric', fixtureOnly: true,
  packages: [
    {id: 'kokoro-am_michael', voiceId: 'am_michael', provider: 'kokoro', status: 'AVAILABLE'},
    {id: 'kokoro-af_heart', voiceId: 'af_heart', provider: 'kokoro', status: 'AVAILABLE'},
    {id: 'agent-lee-voice-one', provider: 'chatterbox', status: 'AVAILABLE'},
    {id: 'chatterbox-default', provider: 'chatterbox', status: 'AVAILABLE'},
  ],
};
const tuningKeys = ['pace', 'pitch', 'bass', 'warmth', 'presence', 'air',
  'highpass', 'deEss', 'noiseReduction', 'compression', 'gain'];
const preservedAgentFields = ['agentId', 'personaFamily', 'personaArchetypeId', 'identityEvidence', 'permissions'];
let browser, server, status = 'FAIL';
let releaseInitialSession, releaseHeldPost;

function observe(page, tab) {
  const info = {requests: [], errors: [], readbackResponses: 0};
  page.on('pageerror', error => info.errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/agent-lee/selection') return;
    const headers = request.headers();
    const entry = {tab, body: request.postDataJSON(), headers: {
      contentType: headers['content-type'], csrfPresent: !!headers['x-leeway-owner-csrf'],
      sameOrigin: headers.origin === new URL(request.url()).origin,
    }};
    info.requests.push(entry); evidence.requests.push(entry);
  });
  page.on('response', response => {
    if (response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/agent-lee/selection/session') {
      info.readbackResponses++;
    }
  });
  return info;
}

async function selectReady(page, id) {
  await page.locator('#voiceList .voice-card').filter({hasText: id}).click();
  await page.waitForFunction(voiceId => LeeWayStudioControls.snapshot().selected?.id === voiceId &&
    !document.querySelector('#playPause').disabled, id, {timeout: 30000});
}

async function tune(page, key, value) {
  await page.locator(`#${key}Number`).fill(String(value));
  await page.locator(`#${key}Number`).press('Tab');
  await page.waitForFunction(({key, value}) => LeeWayStudioControls.snapshot().tuning[key] === value,
    {key, value});
}

async function waitRevision(page, revision) {
  await page.waitForFunction(expected => document.querySelector('#sharedRevision').title === expected,
    revision, {timeout: 15000});
}

async function apply(page) {
  const response = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/agent-lee/selection', {timeout: 15000});
  await page.locator('#applyAgentLeeVoice').click();
  const actual = await response;
  return {status: actual.status(), body: await actual.json()};
}

async function verifyPublication(result, beforeBytes, expectedId) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const afterBytes = await readFile(bindingPath);
  const after = JSON.parse(afterBytes);
  assert.equal(result.body.recordRevision, sha256(afterBytes));
  assert.equal(result.body.binding.voicePackageId, expectedId);
  assert.equal(after.bindings['agent-lee'].voicePackageId, expectedId);
  assert.deepEqual(after.bindings['fixture-worker'], fixtureDocument.bindings['fixture-worker']);
  assert.deepEqual(after.metadata, fixtureDocument.metadata);
  for (const field of preservedAgentFields) {
    assert.deepEqual(after.bindings['agent-lee'][field], fixtureDocument.bindings['agent-lee'][field]);
  }
  const run = path.join(publicationDir, result.body.publicationReceipt);
  const receiptBytes = await readFile(path.join(run, 'publication-receipt.json'));
  const receipt = JSON.parse(receiptBytes);
  assert.deepEqual(await readFile(path.join(run, 'binding.before.json')), beforeBytes);
  assert.equal(result.body.receiptSha256, sha256(receiptBytes));
  assert.equal(receipt.beforeRevision, sha256(beforeBytes));
  assert.equal(receipt.afterRevision, sha256(afterBytes));
  assert.equal(receipt.formulaExecution, 'NOT_EXECUTED');
  assert.equal(receipt.learningLedger, 'NOT_UPDATED');
  assert.equal(receipt.speakerAudibility, 'NOT_MEASURED');
  assert.equal(result.body.deliveryState, 'DEVICE_ACKNOWLEDGEMENTS_NOT_YET_RECORDED');
  evidence.publications.push({state: result.body.state, beforeRevision: receipt.beforeRevision,
    afterRevision: receipt.afterRevision, voicePackageId: expectedId,
    publicationReceipt: result.body.publicationReceipt, receiptSha256: result.body.receiptSha256,
    exactBackupVerified: true, fixtureOnly: true});
  return {bytes: afterBytes, document: after};
}

try {
  evidence.sourceHashesBefore = await sourceHashes();
  await mkdir(path.join(temp, 'runtime'));
  await mkdir(path.join(temp, 'voices'));
  const initial = Buffer.from(JSON.stringify(fixtureDocument, null, 2) + '\n');
  await writeFile(bindingPath, initial);
  await writeFile(path.join(temp, 'voices/catalog.v1.json'), JSON.stringify(fixtureCatalog, null, 2) + '\n');
  evidence.initialRevision = sha256(initial);
  server = await startPython(temp);
  assert.equal(server.ready.fixtureRoot, temp);
  const origin = `http://127.0.0.1:${server.ready.port}`;
  browser = await playwright.chromium.launch({headless: true,
    ...(process.env.STUDIO_CHROMIUM_EXECUTABLE ? {executablePath: process.env.STUDIO_CHROMIUM_EXECUTABLE} : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    localStorage.setItem('leeway-studio-selected', JSON.stringify('kokoro-af_alloy'));
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const pageA = await context.newPage();
  const observedA = observe(pageA, 'A');
  const firstSessionSeen = deferred(), initialSessionGate = deferred();
  releaseInitialSession = initialSessionGate.resolve;
  let firstSession = true;
  await pageA.route('**/api/agent-lee/selection/session', async route => {
    if (firstSession) {
      firstSession = false; firstSessionSeen.resolve(); await initialSessionGate.promise;
    }
    await route.continue();
  });
  await pageA.goto(origin + '/studio.html', {waitUntil: 'domcontentloaded'});
  await firstSessionSeen.promise;
  await pageA.waitForFunction(() => !!globalThis.LeeWayStudioControls);
  assert.equal(await pageA.locator('#applyAgentLeeVoice').isEnabled(), false);
  assert.deepEqual(await readFile(bindingPath), initial);
  record('Apply remains disabled until the actual owner session is established');
  releaseInitialSession();
  await waitRevision(pageA, sha256(initial));
  await pageA.waitForFunction(() => LeeWayStudioControls.snapshot().selected?.id === 'kokoro-af_alloy');
  assert.equal(await pageA.locator('#applyAgentLeeVoice').isEnabled(), false);
  assert.match(await pageA.locator('#sharedCapabilities').textContent(), /audition-only/i);
  const cookie = (await context.cookies(origin + '/api/agent-lee/selection/session'))
    .find(cookie => cookie.name === 'leeway_voice_owner');
  assert.ok(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Strict');
  assert.equal(cookie.path, '/api/agent-lee/');
  evidence.sessionCookie = {httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, path: cookie.path};
  record('Actual HttpOnly owner session does not admit an unlisted audition profile');

  await selectReady(pageA, 'agent-lee-voice-one');
  await pageA.waitForFunction(() => !document.querySelector('#applyAgentLeeVoice').disabled);
  await tune(pageA, 'pace', 1.17);
  await tune(pageA, 'pitch', 1.5);
  await tune(pageA, 'gain', -3);
  await pageA.locator('#masterGain').focus();
  await pageA.locator('#masterGain').press('Home');
  await pageA.locator('#spatialReverb').focus();
  await pageA.locator('#spatialReverb').press('End');
  await pageA.locator('#environmentPreset').selectOption('warm');
  await pageA.locator('#runtime').selectOption('browser');
  await pageA.locator('#synthesisTab').click();
  await pageA.locator('#exaggerationNumber').fill('.75');
  await pageA.locator('#exaggerationNumber').press('Tab');
  await pageA.locator('#top_kNumber').fill('65');
  await pageA.locator('#top_kNumber').press('Tab');
  await pageA.locator('#acousticTab').click();
  await pageA.locator('#runtime').selectOption('local');
  await pageA.waitForFunction(() => !document.querySelector('#playPause').disabled);
  const firstDraft = await pageA.evaluate(() => LeeWayStudioControls.snapshot());
  assert.equal(firstDraft.tuning.pace, 1.17);
  assert.equal(firstDraft.tuning.pitch, 1.5);
  assert.equal(firstDraft.tuning.gain, -3);
  assert.equal(firstDraft.synthesis.exaggeration, .75);
  assert.equal(firstDraft.synthesis.top_k, 65);
  assert.deepEqual(await readFile(bindingPath), initial);
  assert.equal(observedA.requests.length, 0);
  record('Speaker, acoustic dials, synthesis settings and listening mix remain an unpublished draft');

  const readsBeforeFirstApply = observedA.readbackResponses;
  const firstResult = await apply(pageA);
  const firstPublication = await verifyPublication(firstResult, initial, 'agent-lee-voice-one');
  await waitRevision(pageA, firstResult.body.recordRevision);
  await pageA.waitForFunction(() => /Published and read back/.test(document.querySelector('#sharedVoiceState').textContent));
  assert.ok(observedA.readbackResponses > readsBeforeFirstApply);
  assert.equal(observedA.requests.length, 1);
  const firstRequest = observedA.requests[0];
  assert.deepEqual(Object.keys(firstRequest.body).sort(), ['approve', 'expectedRevision', 'tuning', 'voicePackageId']);
  assert.deepEqual(Object.keys(firstRequest.body.tuning).sort(), [...tuningKeys].sort());
  assert.deepEqual(firstRequest.body.tuning, firstDraft.tuning);
  assert.deepEqual(firstPublication.document.bindings['agent-lee'].tuning, firstDraft.tuning);
  assert.equal(firstRequest.body.approve, true);
  assert.equal(firstRequest.body.expectedRevision, sha256(initial));
  assert.equal(firstRequest.headers.contentType, 'application/json');
  assert.equal(firstRequest.headers.csrfPresent, true);
  assert.equal(firstRequest.headers.sameOrigin, true);
  assert.match(await pageA.locator('#sharedDelivery').textContent(), /Awaiting device acknowledgement/);
  record('Actual Apply publishes only admitted acoustic fields, atomically backs up and reads back the exact revision');
  record('Publication preserves persona, permissions, other employees and unrelated authority data');

  const pageB = await context.newPage();
  const observedB = observe(pageB, 'B');
  await pageB.goto(origin + '/studio.html', {waitUntil: 'domcontentloaded'});
  await waitRevision(pageB, firstResult.body.recordRevision);
  await selectReady(pageB, 'kokoro-af_heart');
  await tune(pageB, 'bass', 3);
  await tune(pageB, 'gain', -1);
  await pageB.waitForFunction(() => !document.querySelector('#playPause').disabled);
  // Preserve a different local draft in A. Hold its genuine POST until B has
  // changed the authority file; this deterministically exercises a stale CAS.
  await tune(pageA, 'pitch', 2.5);
  await tune(pageA, 'gain', -2);
  await pageA.waitForFunction(() => !document.querySelector('#playPause').disabled);
  const staleDraft = await pageA.evaluate(() => LeeWayStudioControls.snapshot());
  const heldPost = deferred(), heldSeen = deferred();
  releaseHeldPost = heldPost.resolve;
  let hold = true;
  await pageA.route('**/api/agent-lee/selection', async route => {
    if (hold && route.request().method() === 'POST') {
      hold = false; heldSeen.resolve(); await heldPost.promise;
    }
    await route.continue();
  });
  const staleResponse = pageA.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/agent-lee/selection', {timeout: 30000});
  await pageA.locator('#applyAgentLeeVoice').click();
  await heldSeen.promise;
  assert.equal(observedA.requests.at(-1).body.expectedRevision, firstResult.body.recordRevision);
  const secondResult = await apply(pageB);
  const secondPublication = await verifyPublication(secondResult, firstPublication.bytes, 'kokoro-af_heart');
  await waitRevision(pageB, secondResult.body.recordRevision);
  releaseHeldPost();
  const conflictResponse = await staleResponse;
  assert.equal(conflictResponse.status(), 409);
  assert.equal((await conflictResponse.json()).error, 'VOICE_SELECTION_CONFLICT_RELOAD');
  await pageA.waitForFunction(() => /VOICE_SELECTION_CONFLICT_RELOAD/.test(document.querySelector('#sharedVoiceState').textContent));
  assert.equal(await pageA.locator('#applyAgentLeeVoice').isEnabled(), false);
  assert.deepEqual(await readFile(bindingPath), secondPublication.bytes);
  assert.equal((await readdir(publicationDir)).length, 2, 'conflict cannot create a publication receipt');
  assert.equal(observedA.requests.length, 2);
  assert.equal(observedB.requests.length, 1);
  const afterConflict = await pageA.evaluate(() => LeeWayStudioControls.snapshot());
  assert.equal(afterConflict.selected.id, staleDraft.selected.id);
  assert.deepEqual(afterConflict.tuning, staleDraft.tuning);
  record('Two real tabs reject a stale revision with HTTP 409 without replacing the newer binding or retrying');

  await pageA.locator('#playPause').click();
  await pageA.waitForFunction(() => !document.querySelector('#outputPlayer').paused);
  const postsBeforeRefresh = evidence.requests.length;
  await pageA.locator('#refreshAgentLeeVoice').click();
  await waitRevision(pageA, secondResult.body.recordRevision);
  const afterRefresh = await pageA.evaluate(() => ({snapshot: LeeWayStudioControls.snapshot(),
    paused: document.querySelector('#outputPlayer').paused,
    zero: LeeWayStudioMonitor.sample().output.every(value => value === 0)}));
  assert.equal(afterRefresh.snapshot.selected.id, staleDraft.selected.id);
  assert.deepEqual(afterRefresh.snapshot.tuning, staleDraft.tuning);
  assert.equal(afterRefresh.paused, true);
  assert.equal(afterRefresh.zero, true);
  assert.equal(evidence.requests.length, postsBeforeRefresh);
  assert.deepEqual(await readFile(bindingPath), secondPublication.bytes);
  record('Explicit refresh reads the other tab revision, stops obsolete playback, preserves the local draft and sends no retry');

  await pageA.locator('#loadSharedVoice').click();
  await pageA.waitForFunction(() => LeeWayStudioControls.snapshot().selected?.id === 'kokoro-af_heart' &&
    !document.querySelector('#playPause').disabled);
  const loaded = await pageA.evaluate(() => LeeWayStudioControls.snapshot());
  assert.deepEqual(loaded.tuning, secondPublication.document.bindings['agent-lee'].tuning);
  assert.deepEqual(await readFile(bindingPath), secondPublication.bytes);
  assert.equal(evidence.requests.length, postsBeforeRefresh);
  record('Loading shared settings updates the audition explicitly without republishing');

  await selectReady(pageA, 'kokoro-af_alloy');
  await pageA.waitForFunction(() => /audition-only/.test(document.querySelector('#sharedCapabilities').textContent));
  assert.equal(await pageA.locator('#applyAgentLeeVoice').isEnabled(), false);
  assert.equal(await pageA.locator('#playPause').isEnabled(), true);
  assert.equal(await pageA.locator('#exportVoice').isEnabled(), true);
  assert.deepEqual(await readFile(bindingPath), secondPublication.bytes);
  assert.equal(evidence.requests.length, postsBeforeRefresh);
  assert.deepEqual(observedA.errors, []);
  assert.deepEqual(observedB.errors, []);
  record('A profile outside the owner catalog remains audition/export capable and cannot publish');

  evidence.finalRevision = sha256(secondPublication.bytes);
  evidence.finalFixtureBinding = secondPublication.document;
  evidence.browserErrors = {A: observedA.errors, B: observedB.errors};
  evidence.sourceHashesAfter = await sourceHashes();
  assert.deepEqual(evidence.sourceHashesAfter, evidence.sourceHashesBefore, 'source changed while the gate ran');
  record('Publisher and frontend source identities remained unchanged throughout verification');
  if (artifacts) {
    await mkdir(artifacts, {recursive: true});
    await writeFile(path.join(artifacts, 'fixture-binding.before.json'), initial);
    await writeFile(path.join(artifacts, 'fixture-binding.after.json'), secondPublication.bytes);
    for (const [index, publication] of evidence.publications.entries()) {
      const bytes = await readFile(path.join(publicationDir, publication.publicationReceipt, 'publication-receipt.json'));
      await writeFile(path.join(artifacts, `fixture-publication-${index + 1}.json`), bytes);
    }
  }
  status = 'PASS';
} catch (error) {
  evidence.failure = {message: error.message, stack: error.stack};
  console.error(error.stack || error);
} finally {
  releaseInitialSession?.();
  releaseHeldPost?.();
  await browser?.close();
  await stopPython(server?.child);
  await rm(temp, {recursive: true, force: true});
  evidence.status = status;
  evidence.temporaryAuthorityRemoved = true;
  if (artifacts) {
    await mkdir(artifacts, {recursive: true});
    await writeFile(path.join(artifacts, 'studio-owner-browser-gate.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
}
console.log('STUDIO_OWNER_BROWSER_GATE=' + status);
console.log(JSON.stringify(evidence, null, 2));
if (status !== 'PASS') process.exitCode = 1;

// END REGION: LeeWay Voice Fabric / Studio owner verification
