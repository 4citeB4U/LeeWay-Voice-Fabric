/* #REGION LeeWay Voice Fabric — visualization behavior
 * TAG: LEEWAY-VOICE-STUDIO-VISUALIZER-TEST
 * WHO: LeeWay Industries / Agent Lee under Creator authorization.
 * WHAT: Audio-truth, graceful graphics failure, interaction and resource lifecycle checks.
 * WHEN: 2026-10-07. WHERE: Existing Voice Fabric Node test suite.
 * WHY: A graphics failure or status string must never create apparent audio activity.
 * HOW: Execute the real module against bounded canvas/RAF surfaces; no source-text assertions.
 * AUTHORIZED ROLES: Tests observe isolated presentation behavior; no host/runtime mutations.
 * LICENSE: Repository/owner terms apply; no additional license grant.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
// A data: module has no relative vendor base: this exercises actual import failure/fallback.
const modulePromise = import('data:text/javascript;base64,' + fs.readFileSync(__dirname + '/../src/studio-visualizer.js').toString('base64'));

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, data = {}) { const event = {preventDefault() { this.prevented = true; }, ...data}; for (const fn of this.listeners.get(name) || []) fn(event); return event; }
  count() { return [...this.listeners.values()].reduce((total, values) => total + values.size, 0); }
}
class Context {
  constructor() { this.rects = []; this.transforms = []; }
  setTransform(...args) { this.transforms.push(args); }
  clearRect() { this.rects = []; }
  fillRect(x, y, width, height) { this.rects.push({x, y, width, height}); }
  createRadialGradient() { return {addColorStop() {}}; }
  beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} ellipse() {} fill() {} stroke() {}
}
class Canvas extends Events {
  constructor(document, width = 640, height = 280) {
    super(); this.ownerDocument = document; this.size = {width, height}; this.width = 300; this.height = 150;
    this.style = {opacity: '', touchAction: ''}; this.attrs = new Map(); this.context = new Context();
    this.offsetLeft = 0; this.offsetTop = 0; this.captured = new Set();
  }
  getContext(type) { return type === '2d' ? this.context : null; }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  removeAttribute(key) { this.attrs.delete(key); }
  getBoundingClientRect() { return this.size; }
  insertAdjacentElement(position, element) { this.fallback = element; }
  focus() { this.focused = true; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  remove() { this.removed = true; }
}
function fixture({reduced = false} = {}) {
  const document = new Events(), view = new Events(), motion = new Events(), scheduled = new Map();
  let next = 0;
  document.hidden = false; document.defaultView = view; document.createElement = () => new Canvas(document);
  view.devicePixelRatio = 3;
  motion.matches = reduced; view.matchMedia = () => motion;
  view.requestAnimationFrame = fn => { const id = ++next; scheduled.set(id, fn); return id; };
  view.cancelAnimationFrame = id => scheduled.delete(id);
  view.ResizeObserver = class {
    constructor(fn) { this.fn = fn; fixture.lastObserver = this; }
    observe() {} disconnect() { this.disconnected = true; }
  };
  const canvas = new Canvas(document), inputCanvas = new Canvas(document, 280, 40), outputCanvas = new Canvas(document, 280, 40);
  return {
    document, view, motion, scheduled, canvas, inputCanvas, outputCanvas,
    tick(time) { const callbacks = [...scheduled.values()]; scheduled.clear(); for (const fn of callbacks) fn(time); },
    bars(target) { return target.context.rects.filter(rect => rect.height > 1); }
  };
}

test('graphics import failure preserves a working fallback and never fabricates audio from phase', async () => {
  const f = fixture(), modes = []; let calls = 0;
  const visualizer = await (await modulePromise).createStudioVisualizer({...f, sample: () => { calls++; return {}; }, onMode: mode => modes.push(mode)});
  assert.deepEqual(modes, ['2D fallback']);
  f.tick(100);
  assert.equal(f.bars(f.inputCanvas).length, 0);
  assert.equal(f.bars(f.outputCanvas).length, 0);
  visualizer.setState('speaking'); f.tick(200);
  assert.equal(f.bars(f.outputCanvas).length, 0, 'speaking status is not FFT evidence');
  assert.equal(calls, 2);
  assert.equal(f.canvas.fallback.hidden, false);
  assert.equal(f.canvas.width, 300, 'failed graphics never grabs the main canvas context');
  assert.equal(f.inputCanvas.width, 560, 'DPR is capped at two');
  visualizer.dispose();
});

test('input/output spectra follow independent measured bytes and clear when samples disappear', async () => {
  const f = fixture(); let observed = {input: new Uint8Array(512).fill(128), output: new Uint8Array(512)};
  const visualizer = await (await modulePromise).createStudioVisualizer({...f, sample: () => observed});
  f.tick(100);
  assert.equal(f.bars(f.inputCanvas).length, 32);
  assert.equal(f.bars(f.outputCanvas).length, 0);
  assert.ok(f.bars(f.inputCanvas).every(rect => Math.abs(rect.height - 128 / 255 * 37) < .0001));
  observed = {input: new Uint8Array(512), output: new Uint8Array(512).fill(255)};
  f.tick(200);
  assert.equal(f.bars(f.inputCanvas).length, 0);
  assert.equal(f.bars(f.outputCanvas).length, 32);
  assert.ok(f.bars(f.outputCanvas).every(rect => rect.height === 37));
  observed = {}; f.tick(300);
  assert.equal(f.bars(f.outputCanvas).length, 0, 'stale bars disappear instead of masquerading as active audio');
  visualizer.dispose();
});

test('sample failures settle to silence while the next good sample still renders', async () => {
  const f = fixture(); let broken = true;
  const visualizer = await (await modulePromise).createStudioVisualizer({...f, sample: () => { if (broken) throw new Error('Audio device removed'); return {output: new Uint8Array(64).fill(220)}; }});
  f.tick(100); assert.equal(f.bars(f.outputCanvas).length, 0);
  broken = false; f.tick(200); assert.equal(f.bars(f.outputCanvas).length, 32);
  broken = true; f.tick(300); assert.equal(f.bars(f.outputCanvas).length, 0);
  visualizer.dispose();
});

test('keyboard and captured pointer orbit remain usable with no WebGL', async () => {
  const f = fixture(), orbits = [];
  const visualizer = await (await modulePromise).createStudioVisualizer({...f, onOrbit: angle => orbits.push(angle)});
  visualizer.setAppearance({orbit: 170});
  f.canvas.emit('pointerdown', {button: 0, pointerId: 4, clientX: 20});
  f.canvas.emit('pointermove', {pointerId: 4, clientX: 100});
  assert.deepEqual(orbits, [-150]);
  f.canvas.emit('pointercancel', {pointerId: 4});
  assert.equal(f.canvas.captured.size, 0);
  f.canvas.emit('pointermove', {pointerId: 4, clientX: 200});
  assert.equal(orbits.length, 1);
  assert.equal(f.canvas.emit('keydown', {key: 'Home'}).prevented, true);
  f.canvas.emit('keydown', {key: 'ArrowRight', shiftKey: true});
  f.canvas.emit('keydown', {key: 'End'});
  assert.deepEqual(orbits, [-150, 0, 15, 180]);
  visualizer.dispose();
});

test('visibility suspends work; reduced motion bounds refreshes; dispose removes owned resources', async () => {
  const f = fixture({reduced: true}); let reads = 0;
  f.canvas.setAttribute('aria-label', 'Existing studio label');
  const visualizer = await (await modulePromise).createStudioVisualizer({...f, sample: () => { reads++; return {}; }});
  f.tick(100); f.tick(150); assert.equal(reads, 1);
  f.tick(200); assert.equal(reads, 2);
  f.document.hidden = true; f.document.emit('visibilitychange');
  assert.equal(f.scheduled.size, 0);
  visualizer.setAppearance({theme: 'warm'}); assert.equal(f.scheduled.size, 0);
  f.document.hidden = false; f.document.emit('visibilitychange');
  f.tick(300); assert.equal(reads, 3);
  const fallback = f.canvas.fallback, observer = fixture.lastObserver;
  visualizer.dispose(); visualizer.dispose();
  assert.equal(f.scheduled.size, 0);
  assert.equal(f.canvas.count(), 0);
  assert.equal(f.document.count(), 0);
  assert.equal(f.motion.count(), 0);
  assert.equal(observer.disconnected, true);
  assert.equal(fallback.removed, true);
  assert.equal(f.canvas.style.opacity, '');
  assert.equal(f.canvas.style.touchAction, '');
  assert.equal(f.canvas.getAttribute('tabindex'), null);
  assert.equal(f.canvas.getAttribute('aria-label'), 'Existing studio label');
  visualizer.setAppearance({orbit: 90}); visualizer.setState('speaking');
  f.tick(400); assert.equal(reads, 3);
});

test('missing canvas returns a safe no-op without preventing voice controls from initializing', async () => {
  const modes = [];
  const visualizer = await (await modulePromise).createStudioVisualizer({onMode: mode => modes.push(mode)});
  assert.deepEqual(modes, ['3D unavailable']);
  visualizer.setAppearance({theme: 'cyber'}); visualizer.setState('idle'); visualizer.dispose();
});
/* #ENDREGION LeeWay Voice Fabric — visualization behavior */
