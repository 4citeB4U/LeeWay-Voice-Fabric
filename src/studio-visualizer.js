/* #REGION LeeWay Voice Fabric — studio presentation
 * TAG: LEEWAY-VOICE-STUDIO-VISUALIZER
 * WHO: LeeWay Industries; Agent Lee implementation under Creator authorization.
 * WHAT: Measured microphone/output spectra and the supplied spatial audio orb.
 * WHEN: 2026-10-07; runtime phase and FFT samples are supplied by the controller.
 * WHERE: The existing LeeWay-Voice-Fabric studio; no additional voice runtime.
 * WHY: Present real audio activity while keeping audio controls usable without WebGL.
 * HOW: Pinned local Three.js shaders, a 2D fallback, and bounded browser resources.
 * AUTHORIZED ROLES: Controller owns audio/state; this module renders and requests orbit changes.
 * LICENSE: Repository/owner terms apply; this file makes no additional license grant.
 * Third-party Three.js retains its MIT license in vendor/three-0.160.1/LICENSE.
 */

const BAND_COUNT = 32;
const PHASES = new Set(['idle', 'preparing', 'generating', 'streaming', 'speaking', 'paused', 'interrupted', 'error']);
const PALETTES = {
  cyber: {core: '#167ce9', edge: '#80dfff', input: '#56cfee', output: '#50e3a4', particle: '#62deb7'},
  dark: {core: '#485a85', edge: '#a5b9e3', input: '#a5b9e3', output: '#9bafd4', particle: '#b1c3df'},
  warm: {core: '#d97720', edge: '#f5d77f', input: '#ffb969', output: '#f0d17e', particle: '#e49869'}
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapOrbit = value => {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
};
const average = (values, start = 0, end = values.length) => {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i];
  return sum / Math.max(1, end - start);
};

// No synthesized spectrum, timeout-derived latency, or guessed runtime activity.
function readBands(bytes, target) {
  target.fill(0);
  if (!bytes || !ArrayBuffer.isView(bytes) || !bytes.length) return;
  const extent = Math.log(bytes.length + 1);
  for (let band = 0; band < target.length; band++) {
    const first = Math.floor(Math.expm1(extent * band / target.length));
    const end = Math.min(bytes.length, Math.max(first + 1, Math.floor(Math.expm1(extent * (band + 1) / target.length))));
    let sum = 0;
    for (let i = first; i < end; i++) sum += Number.isFinite(bytes[i]) ? clamp(bytes[i], 0, 255) / 255 : 0;
    target[band] = sum / Math.max(1, end - first);
  }
}

const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uDeform;
  uniform vec3 uAudio;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vSignal;
  void main() {
    vec3 direction = normalize(position);
    float low = sin(direction.x * 5.0 + direction.y * 3.0 + uTime * 2.3) * uAudio.x;
    float mid = sin(direction.y * 9.0 - direction.z * 4.0 - uTime * 3.1) * uAudio.y;
    float high = sin(direction.z * 14.0 + direction.x * 6.0 + uTime * 4.0) * uAudio.z;
    float displacement = (low * 0.19 + mid * 0.10 + high * 0.055) * uDeform;
    vec3 transformed = position * (1.0 + displacement);
    vec4 view = modelViewMatrix * vec4(transformed, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-view.xyz);
    vSignal = dot(uAudio, vec3(0.45, 0.35, 0.20));
    gl_Position = projectionMatrix * view;
  }
`;
const CORE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uLighting;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vSignal;
  void main() {
    vec3 normal = normalize(vNormal);
    float key = max(dot(normal, normalize(vec3(-0.6, 0.7, 1.0))), 0.0);
    float rim = pow(1.0 - max(dot(normal, vView), 0.0), 2.4);
    float specular = pow(max(dot(reflect(-normalize(vec3(-0.6, 0.7, 1.0)), normal), vView), 0.0), 28.0);
    vec3 color = uColor * (0.15 + key * 0.68) * uLighting;
    color += uEdge * (rim * (0.65 + vSignal * 0.6) + specular * 0.38);
    gl_FragColor = vec4(color, 0.93);
  }
`;
const WIRE_FRAGMENT_SHADER = `
  uniform vec3 uEdge;
  varying float vSignal;
  void main() { gl_FragColor = vec4(uEdge, 0.16 + vSignal * 0.25); }
`;

/** Create only presentation resources. Audio/model/network authority stays in the caller. */
export async function createStudioVisualizer({canvas, inputCanvas, outputCanvas, sample = () => ({}), onOrbit, onMode} = {}) {
  const notify = value => { try { onMode?.(value); } catch { /* UI callback cannot stop audio presentation. */ } };
  const empty = {setAppearance() {}, setState() {}, dispose() {}};
  if (!canvas?.ownerDocument) { notify('3D unavailable'); return empty; }

  const document = canvas.ownerDocument;
  const view = document.defaultView || globalThis;
  const inputBands = new Float32Array(BAND_COUNT);
  const outputBands = new Float32Array(BAND_COUNT);
  const combinedBands = new Float32Array(BAND_COUNT);
  const appearance = {deform: 1.2, theme: 'cyber', lighting: false, orbit: 0};
  const listeners = [];
  const surfaces = new Map();
  const original = {opacity: canvas.style.opacity, touchAction: canvas.style.touchAction, tabIndex: canvas.getAttribute('tabindex'), label: canvas.getAttribute('aria-label')};
  let phase = 'idle', disposed = false, hidden = !!document.hidden, frameId = null;
  let lastFrame = -Infinity, lastDpr = 0, dirtySize = true, drag = null;
  let scene3D = null, use3D = false, lostContext = false, mode = '';
  const motionQuery = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = !!motionQuery?.matches;

  const listen = (target, event, handler, options) => {
    target?.addEventListener?.(event, handler, options);
    listeners.push(() => target?.removeEventListener?.(event, handler, options));
  };
  const context2D = target => { try { return target?.getContext('2d') || null; } catch { return null; } };
  const fallback = document.createElement('canvas');
  fallback.className = 'studio-orb-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  Object.assign(fallback.style, {position: 'absolute', pointerEvents: 'none', left: '0', top: '0'});
  canvas.insertAdjacentElement('afterend', fallback);
  const fallbackContext = context2D(fallback);
  const inputContext = context2D(inputCanvas), outputContext = context2D(outputCanvas);
  canvas.style.touchAction = 'pan-y';
  if (original.tabIndex === null) canvas.setAttribute('tabindex', '0');
  if (original.label === null) canvas.setAttribute('aria-label', 'Audio orb. Drag horizontally or use left and right arrow keys to change spatial orbit.');

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    fallback.hidden = use3D;
    canvas.style.opacity = use3D ? original.opacity : '0';
    notify(next);
  }
  setMode(fallbackContext ? '2D fallback' : '3D unavailable');

  function dimensions(target, dpr, reference = target) {
    if (!target || !reference) return null;
    const rect = reference.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    if (!width || !height) return null;
    const scale = Math.min(dpr, 4096 / width, 4096 / height);
    const entry = {width, height, scale};
    const pixelWidth = Math.max(1, Math.round(width * scale)), pixelHeight = Math.max(1, Math.round(height * scale));
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    surfaces.set(target, entry);
    return entry;
  }
  function resize() {
    const dpr = clamp(Number(view.devicePixelRatio) || 1, 1, 2);
    if (!dirtySize && dpr === lastDpr) return;
    lastDpr = dpr;
    dirtySize = false;
    const rect = canvas.getBoundingClientRect();
    Object.assign(fallback.style, {left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${rect.width}px`, height: `${rect.height}px`});
    dimensions(fallback, dpr, canvas);
    dimensions(inputCanvas, dpr);
    dimensions(outputCanvas, dpr);
    if (scene3D && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(dpr, 4096 / rect.width, 4096 / rect.height);
      scene3D.renderer.setPixelRatio(scale);
      scene3D.renderer.setSize(rect.width, rect.height, false);
      scene3D.camera.aspect = rect.width / rect.height;
      // Keep the orb and its orbit node inside narrow phone viewports.
      scene3D.camera.position.z = Math.max(4.8, 3.8 / scene3D.camera.aspect);
      scene3D.camera.updateProjectionMatrix();
    }
  }
  function spectrum(target, context, bands, color) {
    const size = surfaces.get(target);
    if (!size || !context) return;
    const {width, height, scale} = size;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(161,185,214,0.16)';
    context.fillRect(0, height - 1, width, 1);
    context.fillStyle = color;
    const step = width / BAND_COUNT;
    for (let i = 0; i < BAND_COUNT; i++) {
      const barHeight = bands[i] * Math.max(0, height - 3);
      if (barHeight > 0) context.fillRect(i * step + 1, height - barHeight - 1, Math.max(1, step - 2), barHeight);
    }
  }
  function drawFallback(time, signal) {
    const size = surfaces.get(fallback);
    if (!fallbackContext || !size) return;
    const ctx = fallbackContext, {width, height, scale} = size, palette = PALETTES[appearance.theme];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const x = width / 2, y = height / 2, radius = Math.min(width * 0.24, height * 0.33);
    const breath = reducedMotion ? 1 : 1 + Math.sin(time * 0.7) * 0.006;
    const gradient = ctx.createRadialGradient(x - radius * .3, y - radius * .3, radius * .1, x, y, radius * breath);
    gradient.addColorStop(0, palette.core);
    gradient.addColorStop(.65, appearance.lighting ? '#245077' : '#102d50');
    gradient.addColorStop(1, appearance.lighting ? '#10273b' : '#061322');
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const angle = i / 96 * Math.PI * 2;
      const deform = reducedMotion ? 0 : Math.sin(angle * 7 + time * 2) * signal * appearance.deform * .13;
      const r = radius * (breath + deform), px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = palette.edge; ctx.globalAlpha = .65; ctx.lineWidth = 1; ctx.stroke();
    const turn = reducedMotion ? 0 : time * .07;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.ellipse(x, y, radius * (0.18 + i * .15), radius * 1.04, turn, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = .23;
    for (let i = 1; i <= 4; i++) {
      const offset = (i - 2.5) * radius * .4;
      ctx.beginPath(); ctx.ellipse(x, y + offset, Math.sqrt(Math.max(0, radius ** 2 - offset ** 2)), radius * .18, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = .6; ctx.fillStyle = palette.particle;
    for (let i = 0; i < 30; i++) {
      const angle = i * 2.399963 + turn, distance = radius * (1.4 + (i % 5) * .12);
      ctx.beginPath(); ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * .8, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const angle = appearance.orbit * Math.PI / 180;
    ctx.fillStyle = phase === 'error' || phase === 'interrupted' ? '#ff687c' : '#50e3a4';
    ctx.beginPath(); ctx.arc(x + Math.sin(angle) * radius * 1.5, y + Math.cos(angle) * radius * .25, 4, 0, Math.PI * 2); ctx.fill();
  }
  function sampleAudio() {
    try {
      const measured = sample() || {};
      readBands(measured.input, inputBands);
      readBands(measured.output, outputBands);
    } catch { inputBands.fill(0); outputBands.fill(0); }
    for (let i = 0; i < BAND_COUNT; i++) combinedBands[i] = Math.max(inputBands[i], outputBands[i]);
  }
  function schedule() {
    if (!disposed && !hidden && frameId === null && view.requestAnimationFrame) frameId = view.requestAnimationFrame(frame);
  }
  function frame(timestamp) {
    frameId = null;
    if (disposed || hidden) return;
    const interval = reducedMotion ? 100 : (phase === 'streaming' || phase === 'speaking') ? 16 : 32;
    if (timestamp - lastFrame < interval) { schedule(); return; }
    lastFrame = timestamp;
    resize(); sampleAudio();
    const time = reducedMotion ? 0 : timestamp * .001, signal = average(combinedBands);
    const palette = PALETTES[appearance.theme];
    spectrum(inputCanvas, inputContext, inputBands, palette.input);
    spectrum(outputCanvas, outputContext, outputBands, palette.output);
    if (use3D && !lostContext) {
      try { scene3D.draw(time, signal, reducedMotion); }
      catch { use3D = false; setMode(fallbackContext ? '2D fallback' : '3D unavailable'); }
    }
    if (!use3D || lostContext) drawFallback(time, signal);
    schedule();
  }
  function repaint() { lastFrame = -Infinity; schedule(); }
  function changeOrbit(value) {
    appearance.orbit = Math.round(wrapOrbit(value));
    try { onOrbit?.(appearance.orbit); } catch { /* Caller owns its control error reporting. */ }
    repaint();
  }
  listen(canvas, 'pointerdown', event => {
    if (disposed || event.button !== 0 || event.isPrimary === false) return;
    drag = {id: event.pointerId, x: event.clientX, orbit: appearance.orbit};
    canvas.focus({preventScroll: true});
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Keyboard/slider remains available. */ }
  });
  listen(canvas, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    changeOrbit(drag.orbit + (event.clientX - drag.x) * .5);
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const id = drag.id; drag = null;
    try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { /* Already released. */ }
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, event, endDrag);
  listen(canvas, 'keydown', event => {
    const step = event.shiftKey ? 15 : 5;
    const delta = {ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -30, PageUp: 30}[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    changeOrbit(event.key === 'Home' ? 0 : event.key === 'End' ? 180 : appearance.orbit + delta);
  });
  listen(document, 'visibilitychange', () => {
    hidden = !!document.hidden;
    if (hidden && frameId !== null) { view.cancelAnimationFrame?.(frameId); frameId = null; }
    if (!hidden) { dirtySize = true; repaint(); }
  });
  const changeMotion = event => { reducedMotion = !!event.matches; repaint(); };
  if (motionQuery?.addEventListener) listen(motionQuery, 'change', changeMotion);
  else if (motionQuery?.addListener) { motionQuery.addListener(changeMotion); listeners.push(() => motionQuery.removeListener(changeMotion)); }
  let resizeObserver;
  if (view.ResizeObserver) {
    resizeObserver = new view.ResizeObserver(() => { dirtySize = true; repaint(); });
    for (const target of [canvas, inputCanvas, outputCanvas]) if (target) resizeObserver.observe(target);
  } else listen(view, 'resize', () => { dirtySize = true; repaint(); });
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault(); lostContext = true; use3D = false;
    setMode(fallbackContext ? '2D fallback' : '3D unavailable'); repaint();
  });
  listen(canvas, 'webglcontextrestored', () => {
    if (disposed || !scene3D) return;
    lostContext = false; use3D = true; dirtySize = true; setMode('3D WebGL'); repaint();
  });

  const instance = {
    setAppearance(next = {}) {
      if (disposed) return;
      if (Number.isFinite(next.deform)) appearance.deform = clamp(next.deform, .1, 3);
      if (Object.hasOwn(PALETTES, next.theme)) appearance.theme = next.theme;
      if (typeof next.lighting === 'boolean') appearance.lighting = next.lighting;
      if (Number.isFinite(next.orbit)) appearance.orbit = clamp(next.orbit, -180, 180);
      repaint();
    },
    setState(next) { if (!disposed) { phase = PHASES.has(next) ? next : 'idle'; repaint(); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) view.cancelAnimationFrame?.(frameId);
      frameId = null; drag = null;
      listeners.splice(0).forEach(remove => remove());
      resizeObserver?.disconnect();
      scene3D?.dispose();
      fallback.remove();
      canvas.style.opacity = original.opacity;
      canvas.style.touchAction = original.touchAction;
      for (const [name, value] of [['tabindex', original.tabIndex], ['aria-label', original.label]]) {
        if (value === null) canvas.removeAttribute(name); else canvas.setAttribute(name, value);
      }
      for (const [target, context] of [[inputCanvas, inputContext], [outputCanvas, outputContext]]) {
        if (context && target) { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, target.width, target.height); }
      }
      surfaces.clear();
    }
  };
  schedule();

  try {
    const THREE = await import('./vendor/three-0.160.1/three.module.min.js');
    if (disposed) return instance;
    const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
    renderer.debug.onShaderError = () => { throw new Error('Voice studio shader compilation failed.'); };
    renderer.setClearColor(0x06101d, 0);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 50);
    camera.position.set(0, 0, 4.8);
    const uniforms = {uTime: {value: 0}, uDeform: {value: 1.2}, uAudio: {value: new THREE.Vector3()}, uColor: {value: new THREE.Color()}, uEdge: {value: new THREE.Color()}, uLighting: {value: 1}};
    const geometry = new THREE.IcosahedronGeometry(1.12, 3);
    const coreMaterial = new THREE.ShaderMaterial({uniforms, vertexShader: VERTEX_SHADER, fragmentShader: CORE_FRAGMENT_SHADER, transparent: true});
    const wireMaterial = new THREE.ShaderMaterial({uniforms, vertexShader: VERTEX_SHADER, fragmentShader: WIRE_FRAGMENT_SHADER, transparent: true, wireframe: true, depthWrite: false});
    const core = new THREE.Mesh(geometry, coreMaterial), wire = new THREE.Mesh(geometry, wireMaterial), group = new THREE.Group();
    wire.scale.setScalar(1.065); group.add(core, wire); scene.add(group);
    const pointGeometry = new THREE.BufferGeometry(), positions = new Float32Array(120 * 3);
    // Deterministic decorative cloud; never used as audio or runtime evidence.
    for (let i = 0; i < 120; i++) {
      const y = 1 - 2 * (i + .5) / 120, angle = i * 2.3999632297, radius = 1.9 + (i % 9) * .09;
      const radial = Math.sqrt(1 - y * y);
      positions.set([Math.cos(angle) * radial * radius, y * radius, Math.sin(angle) * radial * radius], i * 3);
    }
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointMaterial = new THREE.PointsMaterial({color: PALETTES.cyber.particle, size: .023, transparent: true, opacity: .64, depthWrite: false});
    const particles = new THREE.Points(pointGeometry, pointMaterial); scene.add(particles);
    const nodeGeometry = new THREE.SphereGeometry(.055, 12, 8), nodeMaterial = new THREE.MeshBasicMaterial({color: '#50e3a4'});
    const node = new THREE.Mesh(nodeGeometry, nodeMaterial); scene.add(node);
    scene3D = {
      renderer, camera,
      draw(time, signal, still) {
        const palette = PALETTES[appearance.theme];
        uniforms.uTime.value = time;
        uniforms.uDeform.value = still ? 0 : appearance.deform;
        uniforms.uAudio.value.set(average(combinedBands, 0, 10), average(combinedBands, 10, 23), average(combinedBands, 23, 32));
        uniforms.uColor.value.set(palette.core);
        uniforms.uEdge.value.set(phase === 'error' || phase === 'interrupted' ? '#ff687c' : phase === 'paused' ? '#f0cd83' : palette.edge);
        uniforms.uLighting.value = appearance.lighting ? 1.5 : 1;
        group.rotation.y = still ? 0 : time * .10;
        group.rotation.x = still ? 0 : Math.sin(time * .15) * .08;
        // A subtle visual idle breath is distinct from the measured spectral input.
        group.scale.setScalar(still ? 1 : 1 + Math.sin(time * .7) * .006);
        particles.rotation.y = still ? 0 : -time * .025;
        pointMaterial.color.set(palette.particle); pointMaterial.opacity = .45 + signal * .45;
        nodeMaterial.color.set(phase === 'error' || phase === 'interrupted' ? '#ff687c' : palette.output);
        const angle = appearance.orbit * Math.PI / 180;
        node.position.set(Math.sin(angle) * 1.65, -.10, Math.cos(angle) * 1.65);
        renderer.render(scene, camera);
      },
      dispose() {
        for (const resource of [geometry, coreMaterial, wireMaterial, pointGeometry, pointMaterial, nodeGeometry, nodeMaterial]) resource.dispose();
        renderer.dispose();
      }
    };
    use3D = true; lostContext = false; dirtySize = true; setMode('3D WebGL'); repaint();
  } catch {
    use3D = false;
    setMode(fallbackContext ? '2D fallback' : '3D unavailable');
  }
  return instance;
}

/* #ENDREGION LeeWay Voice Fabric — studio presentation */
