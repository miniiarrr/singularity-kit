// The singularity landing animation, in three modes:
//
//   full    a galaxy spirals into its centre, the centre blows up, and a tiny
//           black hole is born where it was; the camera flies in until the
//           hole is three times the size of the anchor box; a surfer rides the
//           gas arcing over it
//   galaxy  the galaxy alone, turning slowly, for as long as the page is open
//   hole    the black hole alone, seen close up from its birth: the gas
//           condenses around it and the surfer gathers out of the gas
//
// The gas (and, in galaxy mode, the stars) back away from the pointer, and so
// does the surfer.
//
//   mount({ mode, anchor, clip, colors, from, at }) → { canvas, mode, destroy }
//
// The canvas always covers the viewport. It sits behind the page, clipped to
// `clip` (the page frame), except during the explosion, when it comes in
// front so debris flies over the page and past the viewer. The scene is
// projected so its centre lands on the centre of `anchor`, at a scale set by
// that element's width, so it follows every responsive layout. Whatever the
// anchor contains (a drawing) is the fallback: the `gl` class on <html> hides
// it while the scene runs, and any failure (no WebGL2, a module error,
// context loss) removes the class and brings it back.
//
// Every mode is a slice of the one timeline in timeline.js (MODES), so times
// mean the same in all of them: `at` / ?at=<seconds> freezes the scene at that
// moment (for screenshots and tests), `from` / ?from=<seconds> plays from
// there, ?mode= overrides the mode. The URL parameters win over the options.

import { WebGLRenderer, Scene, PerspectiveCamera, Mesh, InstancedBufferGeometry, Matrix4, Vector2, Vector3 } from 'three';
import { T, MODES, RS, FOCAL, REF_BOX, GAS_PERIOD, camAt, poseCamera, shakeAt, makeCoreTrack, smooth01, wakeFade } from './timeline.js';
import { rng, galaxyGeometry, coreGeometry, gasGeometry, shadowGeometry } from './particles.js';
import { dotMaterial, shadowMaterial, GALAXY_VERTEX, CORE_VERTEX, GAS_VERTEX, PUSH, STEADY, TRAIL } from './shaders.js';
import { makeSurfer } from './surfer.js';

export { T, MODES };

// The brand palette the dots are drawn in: ink dots and red accents on paper.
// `paper` is only used where he crosses the shadow; set it to the page background.
export const COLORS = { ink: '#17160F', red: '#C63A1C', paper: '#EAE6DA' };
const SHUTTER = 1 / 50;
const B_CRIT = 2.598076;
const PUSH_REACH = 0.13;  // pointer reach, as a fraction of the black hole's (or galaxy's) size on screen
const PUSH_DEPTH = 0.035; // how far the gas backs off, same unit
const WAKE = 0.6;         // seconds a mark in the pointer's wake lasts, fading in and out
const POINTER_SLOTS = 12; // push sources for the pointer; the rest are the surfer's

const hex = (s) => {
  let h = String(s).trim().replace(/^#/, '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`colour ${s} is not #rrggbb`);
  const n = parseInt(h, 16);
  return new Vector3((n >> 16) & 255, (n >> 8) & 255, n & 255).divideScalar(255);
};
const find = (x) => (typeof x === 'string' ? document.querySelector(x) : x) || null;

// options.mode    'full' (default), 'galaxy' or 'hole'; default the anchor's data-singularity-mode
// options.anchor  element or selector; default the element marked data-singularity
// options.clip    element, selector or null; default the element marked data-singularity-clip
// options.colors  { ink, red, paper } as #rrggbb; default the data-singularity-* attributes
//                 of the anchor, then COLORS
// options.from    scene time to start playing from, seconds (e.g. { mode: 'hole', from: 16.5 }
//                 skips the birth and starts with the surfer riding)
// options.at      scene time to freeze at, seconds
export function mount(options = {}) {
  const root = document.documentElement;
  const fallBack = () => root.classList.remove('gl');
  try {
    const anchor = find(options.anchor ?? '[data-singularity]');
    if (!anchor) throw new Error('no anchor: mark an element with data-singularity or pass { anchor }');
    const clip = find('clip' in options ? options.clip : '[data-singularity-clip]');
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode') || options.mode || anchor.getAttribute('data-singularity-mode') || 'full';
    if (!MODES[mode]) throw new Error(`mode ${mode} is not one of ${Object.keys(MODES).join(', ')}`);
    const pick = (k) => (options.colors && options.colors[k]) ?? anchor.getAttribute(`data-singularity-${k}`) ?? COLORS[k];
    const colors = { ink: hex(pick('ink')), red: hex(pick('red')), paper: hex(pick('paper')) };
    const seconds = (k) => { const n = parseFloat(params.has(k) ? params.get(k) : options[k]); return Number.isFinite(n) ? n : null; };
    anchor.setAttribute('data-singularity', ''); // so the stylesheet hides its content
    root.classList.add('gl');
    return start({ anchor, clip, colors, mode, at: seconds('at'), from: seconds('from') }, fallBack);
  } catch (err) {
    fallBack();
    console.warn('singularity:', err);
    return { canvas: null, mode: null, destroy() {} };
  }
}

function start({ anchor, clip, colors, mode: name, at, from }, fallBack) {
  const mode = MODES[name];
  const steady = !mode.hole; // no hole to fall into: the galaxy turns forever
  const canvas = document.createElement('canvas');
  canvas.className = 'cosmos';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  document.body.appendChild(canvas);

  // Scene time: the mode's slice of the one timeline. With `at` the loop still
  // runs (so the pointer works) but time stands still.
  const pinned = at === null ? null : Math.max(at, mode.start);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let t = pinned ?? (still.matches ? mode.still : Math.max(from ?? mode.start, mode.start));

  // Fly-bys head from the explosion towards the middle of the page.
  const a0 = anchor.getBoundingClientRect();
  const bx = innerWidth / 2 - (a0.left + a0.width / 2), by = innerHeight / 2 - (a0.top + a0.height / 2);
  const bias = { x: bx / (Math.hypot(bx, by) || 1), y: -by / (Math.hypot(bx, by) || 1) };

  const shared = {
    uPrevViewProj: { value: new Matrix4() },
    uViewport: { value: new Vector2(1, 1) },
    uFocal: { value: 1 },
    uFocus: { value: 1 },
    uNearFade: { value: 1 },
    uTime: { value: 0 },
    uShutter: { value: SHUTTER },
    uInk: { value: colors.ink },
    uRed: { value: colors.red },
  };
  const fade = { value: 1 };
  const core = { uCoreR: { value: 0 }, uCoreRPrev: { value: 0 }, uCoreSpin: { value: 0 }, uCoreSpinPrev: { value: 0 }, uCoreWobble: { value: 0 } };
  // Push sources (the pointer and its wake, the surfer's board and its wake), for every layer that parts for them.
  const push = { uTrail: { value: new Float32Array(TRAIL * 4) }, uTrailV: { value: new Float32Array(TRAIL * 2) }, uPushP: { value: 0 } };
  const gas = {
    uCamPos: { value: new Vector3() }, uGasTime: { value: 0 }, uGasAge: { value: 0 }, uBirth: { value: 0 },
    uShutter: { value: SHUTTER / 3 }, // rounder dots in the idle loop
  };
  const shadowR = { value: 0 };

  const scene = new Scene();
  const add = (geometry, material, order) => {
    const m = new Mesh(geometry, material);
    m.frustumCulled = false;
    m.renderOrder = order;
    scene.add(m);
    return m;
  };

  // Only the layers the mode has are built: the galaxy and its core, the
  // hole's shadow, gas and surfer. In galaxy mode the stars part for the
  // pointer like the gas does.
  let galaxy = null, coreAt = null, galaxyMesh = null, coreMesh = null;
  if (mode.galaxy) {
    galaxy = galaxyGeometry(rng(7), bias);
    coreAt = makeCoreTrack(galaxy.r2, steady);
    galaxyMesh = add(galaxy.geometry, dotMaterial(GALAXY_VERTEX, { ...shared, ...push, uCoreR: core.uCoreR, uFade: fade }, steady ? STEADY + PUSH : ''), 1);
    coreMesh = add(coreGeometry(rng(11)), dotMaterial(CORE_VERTEX, { ...shared, ...core, uFade: fade }, steady ? STEADY : ''), 2);
  }
  let gasFrontGeo = null, gasBackGeo = null, gasTotal = 0, shadow = null, gasBack = null, gasFront = null, surfer = null;
  if (mode.hole) {
    gasFrontGeo = gasGeometry(rng(23));
    gasBackGeo = new InstancedBufferGeometry();
    gasBackGeo.setIndex(gasFrontGeo.index);
    for (const [k, attr] of Object.entries(gasFrontGeo.attributes)) gasBackGeo.setAttribute(k, attr);
    gasTotal = gasFrontGeo.instanceCount;
    shadow = add(shadowGeometry(), shadowMaterial({ ...shared, uShadowR: shadowR }), 3);
    gasBack = add(gasBackGeo, dotMaterial(GAS_VERTEX, { ...shared, ...push, ...gas }, PUSH + '#define BACK_IMAGE\n'), 4);
    gasFront = add(gasFrontGeo, dotMaterial(GAS_VERTEX, { ...shared, ...push, ...gas }, PUSH), 5);
    surfer = makeSurfer({ ...shared, uCamPos: gas.uCamPos, uBirth: gas.uBirth }, colors.paper);
    add(surfer.geometry, surfer.halo, 6); // paper-coloured outline, then the ink on top
    add(surfer.geometry, surfer.ink, 7);
  }

  // Everything registered here is undone by destroy().
  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };

  // Pointer wake: slot 0 follows the pointer, smoothed just enough that
  // uneven pointer events don't jerk the gas, and tells the gas how it moves;
  // the other slots mark where it was, laid down on a clock (never more than
  // there are slots), fading in and then out to nothing before they are
  // dropped, so no dot ever snaps back.
  let pointer = null, presence = 0, wakeClock = performance.now() / 1000;
  const marks = []; // { x, y, at }, device px, y up; newest last
  const live = { x: 0, y: 0, vx: 0, vy: 0, on: false };
  const track = (e) => { pointer = [e.clientX, e.clientY]; };
  const release = (e) => { if (e.pointerType !== 'mouse') pointer = null; };
  on(window, 'pointermove', track, { passive: true });
  on(window, 'pointerdown', track, { passive: true });
  on(window, 'pointerup', release, { passive: true });
  on(window, 'pointercancel', release, { passive: true });
  on(document, 'pointerout', (e) => { if (!e.relatedTarget) pointer = null; });

  function updateWake(c, reach, sx, sy) {
    const now = performance.now() / 1000, dt = Math.min(now - wakeClock, 0.1);
    wakeClock = now;
    presence += ((pointer ? 1 : 0) - presence) * (1 - Math.exp(-dt / 0.12));
    if (pointer) {
      const x = (pointer[0] - c.left) * sx, y = (c.bottom - pointer[1]) * sy;
      if (!live.on) Object.assign(live, { x, y, vx: 0, vy: 0, on: true });
      else if (dt > 0) {
        const nx = live.x + (x - live.x) * (1 - Math.exp(-dt / 0.03)), ny = live.y + (y - live.y) * (1 - Math.exp(-dt / 0.03));
        const kv = 1 - Math.exp(-dt / 0.06);
        live.vx += ((nx - live.x) / dt - live.vx) * kv;
        live.vy += ((ny - live.y) / dt - live.vy) * kv;
        live.x = nx; live.y = ny;
      }
      const last = marks[marks.length - 1];
      if (!last || (now - last.at >= WAKE / (POINTER_SLOTS - 1) && Math.hypot(live.x - last.x, live.y - last.y) > 4 * sy)) {
        marks.push({ x: live.x, y: live.y, at: now });
      }
    } else {
      live.on = false; live.vx = live.vy = 0; // fades out where it was, standing still
    }
    while (marks.length && now - marks[0].at >= WAKE) marks.shift();
    const v = push.uTrail.value, vel = push.uTrailV.value, r = reach * sy;
    for (let i = 0; i < POINTER_SLOTS; i++) {
      const m = i ? marks[i - 1] : live;
      v[i * 4] = m ? m.x : 0; v[i * 4 + 1] = m ? m.y : 0; v[i * 4 + 3] = r;
      v[i * 4 + 2] = !m ? 0 : i ? 0.85 * wakeFade(now - m.at, WAKE) : presence;
      vel[i * 2] = i ? 0 : live.vx; vel[i * 2 + 1] = i ? 0 : live.vy; // marks stand still
    }
  }

  const camera = new PerspectiveCamera(40, 1, 0.005, 5000);
  const prevCamera = camera.clone();
  const now = {}, before = {}, shake = { x: 0, y: 0 }, coreNow = {}, corePrev = {};
  const buffer = new Vector2();
  let cssW = 1, cssH = 1;
  let ready = false, running = false, inView = true, raf = 0, last = -1, dead = false;

  // Off-axis projection: focal length FOCAL·S·zoom, scene centre on the anchor centre.
  function project(cam, state, cx, cy, S) {
    const f = FOCAL * S * state.zoom;
    cam.fov = (2 * Math.atan(cssH / 2 / f) * 180) / Math.PI;
    cam.aspect = cssW / cssH;
    cam.setViewOffset(cssW, cssH, cssW / 2 - cx, cssH / 2 - (cy + state.lift * S), cssW, cssH);
    poseCamera(cam, state);
  }

  function draw() {
    if (!ready) return;
    const a = anchor.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    const S = a.width || 1;
    if (mode.front) shakeAt(t, shake);
    const cx = a.left - c.left + a.width / 2 + shake.x * S;
    const cy = a.top - c.top + a.height / 2 + shake.y * S;
    project(camera, camAt(t, now, name), cx, cy, S);
    project(prevCamera, camAt(t - SHUTTER, before, name), cx, cy, S);

    renderer.getDrawingBufferSize(buffer);
    const sx = buffer.x / cssW, sy = buffer.y / cssH;
    shared.uPrevViewProj.value.multiplyMatrices(prevCamera.projectionMatrix, prevCamera.matrixWorldInverse);
    shared.uViewport.value.copy(buffer);
    shared.uFocal.value = FOCAL * S * now.zoom * sy;
    shared.uFocus.value = now.dist;
    shared.uNearFade.value = 0.011 * now.dist;
    shared.uTime.value = t;
    fade.value = smooth01(t / T.fadeIn);

    if (coreAt) {
      coreAt(t, coreNow);
      coreAt(t - Math.min(SHUTTER, 0.5 / coreNow.omega), corePrev);
      core.uCoreR.value = coreNow.r;
      core.uCoreRPrev.value = corePrev.r;
      core.uCoreSpin.value = coreNow.spin;
      core.uCoreSpinPrev.value = corePrev.spin;
      core.uCoreWobble.value = coreNow.wobble;
      galaxyMesh.visible = steady || t < T.bang + 4.2;
      coreMesh.visible = steady || t < T.bang + 1.7;
    }

    const big = S * now.zoom; // the black hole's (or the galaxy's) size on screen, css px
    push.uPushP.value = PUSH_DEPTH * big * sy;
    updateWake(c, PUSH_REACH * big, sx, sy);

    if (surfer) {
      const age = t - T.birth;
      const birth = smooth01(age / 1.8);
      gas.uBirth.value = birth;
      gas.uGasAge.value = Math.min(Math.max(age, 0), 30);
      gas.uGasTime.value = ((age % GAS_PERIOD) + GAS_PERIOD) % GAS_PERIOD;
      gas.uCamPos.value.copy(camera.position);
      shadowR.value = B_CRIT * RS * birth;
      surfer.update({
        t, camera, cssW, cssH, sx, sy,
        pointer: pointer ? [pointer[0] - c.left, pointer[1] - c.top] : null,
        interactive: running && pinned === null,
        trail: push.uTrail.value, trailV: push.uTrailV.value, slot0: POINTER_SLOTS, slots: TRAIL - POINTER_SLOTS,
      });
      shadow.visible = gasBack.visible = gasFront.visible = t >= T.birth;
    }

    // Behind the page and inside the clip element, except for the explosion.
    const behind = !mode.front || t < mode.front[0] || t >= mode.front[1];
    if (behind !== canvas.classList.contains('behind')) canvas.classList.toggle('behind', behind);
    renderer.setScissorTest(false);
    renderer.clear();
    if (behind && clip) {
      const f = clip.getBoundingClientRect(); // its padding box: inside the border
      renderer.setScissor(f.left + clip.clientLeft - c.left, c.bottom - (f.top + clip.clientTop + clip.clientHeight), clip.clientWidth, clip.clientHeight);
      renderer.setScissorTest(true);
    }
    renderer.render(scene, camera);
  }

  // Fewer dots on smaller boxes keeps the stipple density constant.
  function thin() {
    const k = Math.min(Math.max((anchor.getBoundingClientRect().width / REF_BOX) ** 2, 0.45), 1);
    if (galaxy) galaxy.geometry.instanceCount = galaxy.fixed + Math.round(galaxy.bulk * k);
    if (gasFrontGeo) {
      gasFrontGeo.instanceCount = Math.round(gasTotal * k);
      gasBackGeo.instanceCount = Math.round(gasTotal * k * 0.5);
    }
  }

  function resize() {
    if (dead) return;
    cssW = canvas.clientWidth || 1;
    cssH = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(cssW, cssH, false);
    thin();
    watch();
    if (!running) draw();
  }

  // The intro (up to the end of the explosion) plays on even when the scene is
  // scrolled out of view; afterwards drawing follows the anchor's visibility.
  const intro = () => !!mode.front && t < mode.front[1];

  function tick(ms) {
    raf = 0;
    if (dead) return;
    if (pinned === null && last >= 0) t += Math.min((ms - last) / 1000, 0.05);
    last = ms;
    draw();
    if (!inView && !intro()) running = false; // scrolled away during the intro: stop once it is over
    if (running) raf = requestAnimationFrame(tick);
  }

  function play() {
    running = ready && !dead && !still.matches && (inView || intro());
    if (running && !raf) { last = -1; raf = requestAnimationFrame(tick); }
    if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // Reduced motion switched on: jump to the still frame; off again: never
  // replay the explosion in front of the page.
  on(still, 'change', () => {
    t = Math.max(t, still.matches ? mode.still : mode.front ? mode.front[1] : t);
    play();
    if (!running) draw();
  });

  // After the intro, stop drawing while the scene is scrolled out of view: it
  // reaches about 1.5 anchor boxes from the anchor's centre, so the anchor is
  // watched with that much margin (rebuilt when its size changes).
  let io = null, ioBox = 0;
  function watch() {
    const box = anchor.getBoundingClientRect().width || 1;
    if (io && Math.abs(box - ioBox) < 0.25 * ioBox) return;
    if (io) io.disconnect();
    ioBox = box;
    io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; play(); }, { rootMargin: `${Math.ceil(1.5 * box)}px 0px` });
    io.observe(anchor);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  on(window, 'resize', resize);
  on(window, 'scroll', () => { if (!running) draw(); }, { passive: true });

  on(canvas, 'webglcontextlost', () => {
    dead = true;
    play();
    canvas.remove();
    fallBack();
  });

  // Takes the scene down again (single-page apps): stops the loop, frees the
  // GPU resources and the context, removes the canvas, shows the fallback.
  function destroy() {
    if (dead) return;
    dead = true;
    play();
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    if (io) io.disconnect();
    ro.disconnect();
    scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    fallBack();
  }

  // Compile every program up front (all meshes are still visible). Where the
  // GPU can compile in the background, wait for it without blocking the page.
  const compiled = renderer.extensions.has('KHR_parallel_shader_compile')
    ? renderer.compileAsync(scene, camera)
    : Promise.resolve(renderer.compile(scene, camera));
  compiled.then(() => {
    ready = true;
    resize(); // sizes the canvas and draws the first frame
    play();
  }, fallBack);

  return { canvas, mode: name, destroy };
}
