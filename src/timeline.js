// Timeline, camera path and the CPU-side mirror of the shader physics.
// Times are seconds since the first rendered frame; lengths are world units.

export const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const T = {
  fadeIn: 0.6,    // galaxy fades in
  collapse: 1.0,  // everything starts spiralling into the centre
  implode: 4.0,   // last matter swallowed, the core contracts
  front: 4.15,    // canvas comes in front of the page for the explosion
  bang: 4.3,      // the core blows up
  birth: 4.9,     // a tiny black hole forms where the core was
  flyStart: 5.0,  // camera starts closing in on it
  settle: 7.2,    // debris gone: the canvas goes back behind the page
  flyEnd: 8.6,    // camera arrives
  surfer: 8.9,    // a surfer gathers out of the gas and starts riding
  still: 16.5,    // frame shown under prefers-reduced-motion (the surfer on the crest)
};

// The three animations the kit plays, each a slice of the one timeline above:
// where the clock starts, the frame shown under prefers-reduced-motion, when
// the canvas comes in front of the page (the explosion), and which layers
// exist: the galaxy with its core, the hole with its gas and the surfer. With
// no hole to fall into (`galaxy`) the galaxy turns steadily forever; `hole`
// starts at the birth with the camera already arrived. Because scene time is
// shared, ?at=16.5 is the same frame in `full` and `hole`.
export const MODES = {
  full:   { start: 0,       still: T.still,    front: [T.front, T.settle], galaxy: true,  hole: true  },
  galaxy: { start: 0,       still: T.collapse, front: null,                galaxy: true,  hole: false },
  hole:   { start: T.birth, still: T.still,    front: null,                galaxy: false, hole: true  },
};

// Infall law, evaluated per particle in the vertex shader:
//   r² = r0² − 2F(τ),  F(τ) = q·((e^{kτ} − 1)/k − τ)
// The sink starts at zero and grows exponentially, so matter drifts at first
// and then rushes in; the outermost stars (r0 ≈ 12) are gone by τ ≈ 3.
// Rotation speeds up as e^{spinK·τ} on top of the winding from falling in.
export const SINK = { q: 0.55, k: 1.9, spinK: 2.2, wind: 2.5 };

export const GALAXY_R = 10;
export const RS = 0.02;           // Schwarzschild radius of the newborn hole
export const R_FEED = 11;         // gas feeding in starts at this radius, in RS
export const W_ISCO = 2.2;        // gas angular speed at the innermost orbit, rad/s
export const GAS_PERIOD = 600;    // every gas motion repeats exactly after this, s
export const FOCAL = 3;           // focal length as a multiple of the anchor box
export const REF_BOX = 380;       // anchor box size the dot sizes are tuned for, px
export const GALAXY_ZOOM = 3;     // galaxy size relative to the anchor box
export const HOLE_ZOOM = 3;       // black hole size relative to the anchor box

export const D0 = 2 * FOCAL * GALAXY_R;       // galaxy radius → half the box
const D_BANG = 0.8 * D0;
export const D1 = 2 * FOCAL * 12.5 * RS;      // black hole and its gas → fill the box (× HOLE_ZOOM)

export const CORE = { r0: 0.45, rMax: 1.55, rBang: 0.07 };

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth01 = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;

// Strength of a wake mark `age` seconds old: fades in over 0.1 s, then out to
// nothing by `life`, so marks can be dropped without the gas snapping back.
export const wakeFade = (age, life) => {
  const i = clamp01(age / 0.1), o = Math.max(1 - age / life, 0);
  return i * i * (3 - 2 * i) * o * o;
};
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

export function sinkF(tau) {
  return SINK.q * ((Math.exp(SINK.k * tau) - 1) / SINK.k - tau);
}

// Camera in spherical coordinates around the centre, plus `zoom` (image
// scale with the perspective unchanged: the galaxy is GALAXY_ZOOM× the box,
// the explosion 1×, the black hole HOLE_ZOOM×; it drops at the bang, when
// only a pinpoint is on screen) and `lift`: how far the scene centre sits
// below the anchor centre (fraction of the box), so the black hole *with*
// its lensed halo ends up optically centred.
//
// `galaxy` mode keeps the opening pose and starts swaying where the collapse
// would have begun; `hole` mode holds the arrived pose until the sway begins
// at T.flyEnd. So each is the full animation's own frames, extended: galaxy
// mode up to T.collapse, hole mode from T.flyEnd on.
export function camAt(t, out = {}, mode = 'full') {
  if (mode === 'hole') return camAt(Math.max(t, T.flyEnd), out);
  const steady = mode === 'galaxy';
  const push = steady ? 0 : smooth01((t - T.collapse) / (T.bang - T.collapse));
  let dist = lerp(D0, D_BANG, push);
  let el = 32 * DEG, az = 0, roll = -18 * DEG, lift = 0, zoom = steady || t < T.bang ? GALAXY_ZOOM : 1;

  const fly = steady ? 0 : clamp01((t - T.flyStart) / (T.flyEnd - T.flyStart));
  if (fly > 0) {
    const e = easeInOutCubic(fly);
    dist = Math.exp(lerp(Math.log(D_BANG), Math.log(D1), e));
    el = lerp(32, 15, e) * DEG;
    az = lerp(0, -32, e) * DEG;
    roll = lerp(-18, -8, e) * DEG;
    zoom = lerp(1, HOLE_ZOOM, e);
    lift = 0.07 * e * zoom;
  }

  const idle = t - (steady ? T.collapse : T.flyEnd);
  if (idle > 0) {
    const ramp = smooth01(idle / 4);
    el += 2.4 * DEG * Math.sin((idle * TAU) / 26) * ramp;
    az += 6 * DEG * Math.sin((idle * TAU) / 41) * ramp;
  }

  out.dist = dist; out.el = el; out.az = az; out.roll = roll; out.lift = lift; out.zoom = zoom;
  return out;
}

export function poseCamera(cam, s) {
  const ce = Math.cos(s.el);
  cam.position.set(s.dist * ce * Math.sin(s.az), s.dist * Math.sin(s.el), s.dist * ce * Math.cos(s.az));
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.rotateZ(s.roll);
  cam.updateMatrixWorld(true);
}

// Screen shake after the bang, as a fraction of the anchor box.
export function shakeAt(t, out) {
  const s = t - T.bang;
  const amp = s > 0 ? 0.022 * Math.exp(-s / 0.16) : 0;
  out.x = amp * Math.sin(s * 91 + 1.7);
  out.y = amp * Math.sin(s * 73 + 0.4);
  return out;
}

// The centre grows with the fraction of matter it has swallowed (stars that
// start inside CORE.r0 count from the first frame, so it starts at its full
// size, no jump when the collapse begins), swells once, then implodes to a
// point just before the bang. `r2` is every galaxy particle's initial squared
// radius, sorted ascending. `steady` (galaxy mode): no collapse ever comes,
// the centre keeps its opening size and turns at its opening speed.
export function makeCoreTrack(r2, steady = false) {
  const n = r2.length;
  const swallowed = (x) => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (r2[m] < x) lo = m + 1; else hi = m; }
    return lo / n;
  };
  const grown = (t) =>
    CORE.r0 + (CORE.rMax - CORE.r0) * Math.sqrt(swallowed(2 * sinkF(Math.max(t - T.collapse, 0)) + CORE.r0 ** 2));
  const rImplode = grown(T.implode);
  const rSteady = grown(0);

  return function coreAt(t, out) {
    if (steady) {
      out.r = rSteady; out.spin = 0.8 * t; out.omega = 1.25; out.wobble = 0;
      return out;
    }
    let r;
    if (t < T.implode) r = grown(t);
    else if (t < T.bang) {
      const u = (t - T.implode) / (T.bang - T.implode);
      r = CORE.rBang + (rImplode * (1 + 0.25 * Math.sin(Math.PI * u)) - CORE.rBang) * (1 - u * u * u);
    } else r = CORE.rBang;

    const tau = Math.max(t - T.collapse, 0);
    out.r = r;
    out.spin = 0.8 * t + (0.45 * (Math.exp(1.7 * tau) - 1)) / 1.7;
    out.omega = 0.8 + 0.45 * Math.exp(1.7 * tau);
    out.wobble = t < T.bang ? 0.16 * smooth01((t - (T.implode - 0.7)) / 0.7) : 0;
    return out;
  };
}
