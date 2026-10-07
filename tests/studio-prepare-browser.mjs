/* #REGION LeeWay Voice Fabric — browser preparation cancellation visibility
 * TAG: LEEWAY-STUDIO-PREPARE-BROWSER-TEST
 * WHO: LeeWay Industries / Agent Lee under Creator authorization.
 * WHAT: Cancel remains usable after runtime or speaker changes during preparation.
 * WHEN: 2026-10-07. WHERE: Isolated loopback Studio and headless browser.
 * WHY: Hiding browser-only settings must not hide an ongoing download's cancellation.
 * HOW: Actual controller and browser loader, held at its worker-request boundary.
 * AUTHORIZED ROLES: Isolated regression only; no model download, account or publication.
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
const sources = new Map(await Promise.all(['studio.html','index.html','src/studio.js','src/browser-voice.js']
  .map(async name => [name, await readFile(path.join(root, name))])));
assert.deepEqual(sources.get('studio.html'), sources.get('index.html'), 'Studio entry documents must be identical');
const report = {scope: 'ACTUAL_BROWSER_PREPARATION_CANCELLATION_WITH_HELD_WORKER_REQUEST',
  modelDownload: 'NOT_STARTED', providerExecution: 'NOT_EXECUTED',
  sourceSha256: Object.fromEntries([...sources].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')])),
  checks: [], pageErrors: [], blockedExternalRequests: []};
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.wav':'audio/wav'};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      const state = pathname === '/api/local/status' ? {kokoro:{ready:true,voices:['af_heart'],state:'FIXTURE'},xtts:{ready:true,state:'FIXTURE'}}
        : pathname === '/api/local/voices' ? {voices:[]} : {error:'PREPARATION_FIXTURE_HAS_NO_OWNER_OR_PROVIDER'};
      response.writeHead(pathname.startsWith('/api/local/') ? 200 : 503, {'Content-Type':'application/json'});
      response.end(JSON.stringify(state)); return;
    }
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'studio.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    const bytes = sources.get(relative) || await readFile(file);
    response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await playwright.chromium.launch({headless:true,
    ...(process.env.STUDIO_CHROMIUM_EXECUTABLE ? {executablePath:process.env.STUDIO_CHROMIUM_EXECUTABLE} : {}),
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for (const entry of ['studio.html','index.html']) {
    for (const change of ['runtime','profile']) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
      page.on('pageerror', error => report.pageErrors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (['http:','https:'].includes(url.protocol) && url.origin !== base) {
          report.blockedExternalRequests.push(url.origin + url.pathname); return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      await page.goto(`${base}/${entry}`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.LeeWayStudioControls && document.querySelector('#voiceList .voice-card'));
      await page.locator('#voiceList .voice-card').filter({hasText:'agent-lee-voice-one'}).click();
      await page.waitForFunction(() => LeeWayStudioControls.snapshot().hasTake);
      await page.locator('#refreshLocal').click();
      await page.waitForFunction(() => !document.querySelector('#runtime option[value="local"]').disabled);
      await page.locator('#runtime').selectOption('browser');
      await page.evaluate(() => {
        window.heldModelRequests = 0;
        // Keep actual load(), lifecycle abort and cancelLoad(); only hold the model-worker boundary.
        LeeWayBrowserVoice.prototype.request = function(type) {
          if (type !== 'load') throw new Error('Unexpected model request in preparation-only fixture');
          ++window.heldModelRequests;
          return new Promise(() => {});
        };
      });
      await page.locator('#prepare').click();
      await page.waitForFunction(() => LeeWayStudioControls.snapshot().preparing && heldModelRequests === 1);
      if (change === 'runtime') await page.locator('#runtime').selectOption('local');
      else await page.locator('#voiceList .voice-card').filter({hasText:'kokoro-af_heart'}).click();
      await page.waitForFunction(() => document.querySelector('.model-box').hidden);
      assert.equal(await page.locator('#cancelPrepare').isVisible(), true, `${entry}: cancellation must remain visible after ${change} switch`);
      await page.locator('#cancelPrepare').click();
      await page.waitForFunction(() => !LeeWayStudioControls.snapshot().preparing && document.querySelector('#cancelPrepare').hidden);
      assert.match(await page.locator('#modelState').textContent(), /preparation cancelled/i);
      const observed = await page.evaluate(() => ({phase:LeeWayStudioControls.snapshot().phase,
        preparing:LeeWayStudioControls.snapshot().preparing, runtime:LeeWayStudioControls.snapshot().runtime,
        selected:LeeWayStudioControls.snapshot().selected.id, modelRequests:heldModelRequests}));
      assert.equal(observed.preparing, false); assert.equal(observed.modelRequests, 1);
      report.checks.push({entry, change, status:'PASS', observed});
      await page.close();
    }
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedExternalRequests, []);
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.error = error.stack || String(error); process.exitCode = 1; }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  if (process.env.STUDIO_PREPARE_ARTIFACTS) {
    await mkdir(process.env.STUDIO_PREPARE_ARTIFACTS, {recursive:true});
    await writeFile(path.join(process.env.STUDIO_PREPARE_ARTIFACTS, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}
/* #ENDREGION LeeWay Voice Fabric — browser preparation cancellation visibility */
