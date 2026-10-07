/* #REGION LeeWay Voice Fabric — isolated graphics qualification
 * TAG: LEEWAY-VOICE-STUDIO-VISUALIZER-BROWSER-TEST
 * WHO: LeeWay Industries / Agent Lee under Creator authorization.
 * WHAT: Real WebGL compilation, measured Web Audio input, context loss, recovery and screenshots.
 * WHEN: 2026-10-07. WHERE: A loopback fixture served from this repository.
 * WHY: Unit-test surfaces cannot prove actual browser shader execution.
 * HOW: Installed Playwright Chromium; muted 220 Hz test oscillator; no account or model use.
 * AUTHORIZED ROLES: Isolated test fixture only; does not qualify deployed devices or a live voice runtime.
 * LICENSE: Repository/owner terms apply; no additional license grant.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? pathToFileURL(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs')).href
  : 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const capture = process.env.VOICE_STUDIO_BROWSER_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'leeway-studio-visualizer-'));
fs.mkdirSync(capture, {recursive: true});
const html = `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<style>
body{margin:16px;background:#050c16;color:#dce8ff;font:14px system-ui}
.viewport{height:350px;position:relative;background:radial-gradient(ellipse at center,#102944,#07111f 70%);border:1px solid #263b53;border-radius:16px;overflow:hidden;max-width:900px}
.main{width:100%;height:100%;display:block}
footer{display:flex;max-width:900px;gap:16px;margin-top:12px}footer>div{width:50%;min-width:0}
footer canvas{width:100%;height:60px;background:#0b1827;display:block}
.hud{position:absolute;top:12px;left:16px;pointer-events:none}.hud span{color:#7ddcbd}
button{padding:9px;margin:12px 8px 12px 0}
</style>
<h2>LeeWay Voice Fabric · isolated visualizer verification</h2>
<div class="viewport"><canvas id="webglCanvas" class="main"></canvas><div class="hud">RENDERER <span id="mode"></span> · ORBIT <span id="orbit">0</span>°</div></div>
<footer><div>MICROPHONE · no input<canvas id="micSpectrum"></canvas></div><div>OUTPUT · measured test oscillator<canvas id="ttsSpectrum"></canvas></div></footer>
<button id="tone">Measure test tone</button><button id="stop">Stop test tone</button>
<script type="module">
import {createStudioVisualizer} from '/src/studio-visualizer.js';
let analyser,oscillator,context;const bins=new Uint8Array(512);window.modes=[];
const element=id=>document.getElementById(id);
window.visualizer=await createStudioVisualizer({canvas:element('webglCanvas'),inputCanvas:element('micSpectrum'),outputCanvas:element('ttsSpectrum'),
 sample:()=>{bins.fill(0);if(analyser)analyser.getByteFrequencyData(bins);window.peak=Math.max(...bins);return{input:new Uint8Array(512),output:bins}},
 onMode:value=>{element('mode').textContent=value;window.modes.push(value)},onOrbit:value=>element('orbit').textContent=value});
window.ready=true;
element('tone').onclick=async()=>{context=new AudioContext();await context.resume();analyser=context.createAnalyser();analyser.fftSize=1024;
 oscillator=context.createOscillator();oscillator.frequency.value=220;const silent=context.createGain();silent.gain.value=0;
 oscillator.connect(analyser);analyser.connect(silent);silent.connect(context.destination);oscillator.start();visualizer.setState('speaking');};
element('stop').onclick=()=>{oscillator?.stop();analyser=null;context?.close();visualizer.setState('idle');};
</script>`;
const server = http.createServer((request, response) => {
  const name = request.url.split('?')[0];
  if (name === '/test') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  const target = path.resolve(root, '.' + name);
  if (!target.startsWith(root + '/src/') || !fs.existsSync(target)) { response.statusCode = 404; response.end(); return; }
  response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 760}, deviceScaleFactor: 2});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/test`);
  await page.waitForFunction(() => window.ready && document.querySelector('#mode').textContent === '3D WebGL');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.peak), 0);
  await page.locator('#webglCanvas').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#orbit').textContent(), '5');
  await page.locator('#tone').click(); await page.waitForFunction(() => window.peak > 0);
  await page.waitForTimeout(150); await page.screenshot({path: path.join(capture, 'three-desktop.png')});
  assert.equal(await page.locator('#mode').textContent(), '3D WebGL', 'the shader must actually render after receiving audio');
  const measuredPeak = await page.evaluate(() => window.peak);
  assert.ok(measuredPeak > 0);
  const spectralPixels = await page.evaluate(() => {
    const count = id => {
      const canvas = document.getElementById(id), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height - 4).data;
      let drawn = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) drawn++; return drawn;
    };
    return {input: count('micSpectrum'), output: count('ttsSpectrum')};
  });
  assert.equal(spectralPixels.input, 0); assert.ok(spectralPixels.output > 0);
  await page.evaluate(() => {
    const canvas = document.querySelector('#webglCanvas');
    window.testGL = canvas.getContext('webgl2') || canvas.getContext('webgl');
    window.testLoss = testGL.getExtension('WEBGL_lose_context'); testLoss.loseContext();
  });
  await page.waitForFunction(() => document.querySelector('#mode').textContent === '2D fallback');
  await page.waitForTimeout(150); assert.ok(await page.evaluate(() => window.peak > 0));
  await page.screenshot({path: path.join(capture, 'fallback-desktop.png')});
  await page.evaluate(() => testLoss.restoreContext());
  await page.waitForFunction(() => document.querySelector('#mode').textContent === '3D WebGL');
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: 'reduce'}); await page.waitForTimeout(220);
  await page.screenshot({path: path.join(capture, 'three-phone-reduced-motion.png')});
  assert.equal(await page.locator('#mode').textContent(), '3D WebGL', 'restored WebGL must remain functional');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#stop').click(); await page.waitForFunction(() => window.peak === 0);
  await page.evaluate(() => visualizer.dispose());
  assert.equal(await page.locator('.studio-orb-fallback').count(), 0);
  assert.deepEqual(errors, []);
  const report = {
    result: 'PASS', scope: 'Isolated presentation fixture, not a deployed runtime/device qualification',
    renderer: 'Three.js 0.160.1 / Chromium software WebGL', measuredTestOscillatorPeak: measuredPeak,
    measuredSpectralPixels: spectralPixels,
    contextLossFallback: true, contextRestoration: true, keyboardOrbit: true,
    narrowViewportOverflow: false, cleanup: true, pageErrors: errors, screenshots: capture,
    modes: await page.evaluate(() => window.modes)
  };
  fs.writeFileSync(path.join(capture, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
/* #ENDREGION LeeWay Voice Fabric — isolated graphics qualification */
