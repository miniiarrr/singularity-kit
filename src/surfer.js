// A surfer riding the accretion disc: a 3D figure (ellipsoid body parts
// posed by a rig) made of the same ink dots as everything else, on a red
// board. He goes round the hole with the gas at his radius, carving in and
// out across the flow and banking into every turn, always facing the hole.
// His board goes through the same lens as the gas, so when he passes behind
// the hole he rides the arc the light bends over the top, exactly where the
// particles around him appear; his body follows it whole (lensing every dot
// would smear him along the arc). Crossing in front of the shadow, his dots
// turn paper-coloured so he stays visible.
//
// The riding is a closed function of time, so any moment can be drawn
// directly. The pointer adds maneuvers on top, the instant it comes near: he
// consolidates (crouches, his loose dots pull tight) and in the same moment
// carves hard across the flow or airs ahead to another spot, whichever lands
// him farther from it.

import { PerspectiveCamera, Vector3 } from 'three';
import { TAU, T, RS, W_ISCO, smooth01, wakeFade, camAt, poseCamera } from './timeline.js';
import { pack } from './particles.js';
import { dotMaterial } from './shaders.js';

const HEIGHT = 1.8 * RS;                    // his height, world units
const R_MID = 5.5, R_AMP = 1.15;            // his track across the disc, in RS
const CARVE = 3.2;                          // s per carve in and out across the flow
const ORBIT = W_ISCO * (R_MID / 3) ** -1.5; // rad/s: round the hole with the gas at his radius
const BANK_G = 10 * RS;                     // how hard turns lean him over, world units/s²
const REACT = 1.3;                          // pointer within this many of his heights makes him react
const LOOSE = 0.3;                          // how loosely his dots hold together when left alone
const WAKE = 0.7;                           // s a mark in his board's wake lasts, fading in and out
const SHIN = 0.25, THIGH = 0.25;            // leg bones, in his heights

// Body parts, each an ellipsoid (semi-axes, in his heights). The board comes
// first so he is drawn over it.
export const BONES = 14;
const PARTS = [
  [0.56, 0.022, 0.13],                                              // board
  [0.035, 0.02, 0.075], [0.035, 0.02, 0.075],                       // back, front foot
  [0.137, 0.04, 0.04], [0.141, 0.052, 0.052],                       // back shin, thigh
  [0.137, 0.04, 0.04], [0.141, 0.052, 0.052],                       // front shin, thigh
  [0.09, 0.075, 0.065], [0.105, 0.165, 0.07], [0.058, 0.07, 0.062], // pelvis, chest, head
  [0.087, 0.033, 0.033], [0.081, 0.028, 0.028],                     // back upper arm, forearm
  [0.087, 0.033, 0.033], [0.081, 0.028, 0.028],                     // front upper arm, forearm
];

const VERTEX = `
#define BONES ${BONES}
uniform vec4 uBoneM[BONES * 3]; // per part, rows of [axis a | axis b | axis c | centre], world units
uniform vec3 uCamPos;
uniform vec3 uShift;            // from where his board is to where the lens shows it
uniform float uBirth;           // how far the hole has formed (its shadow's size)
uniform vec3 uFwd;              // where he is heading, world
uniform float uFigH;            // his height, world units
uniform float uLoose;           // 0 consolidated … 1 loose
uniform float uAppear;          // 0 → 1 while he gathers out of the gas
uniform float uSpray;           // spray off the tail, 0 … 1
uniform vec3 uPaper;            // page colour

in vec4 aBone;  // part, point on the unit sphere
in vec4 aLook;  // dot radius (his heights), alpha, seed, kind: 0 body, 1 board, 2 spray

// A point of a part's ellipsoid, with the surface normal there.
vec3 part(int i, vec3 u, out vec3 nrm) {
  vec4 r0 = uBoneM[i * 3], r1 = uBoneM[i * 3 + 1], r2 = uBoneM[i * 3 + 2], u4 = vec4(u, 1.0);
  vec3 a = vec3(r0.x, r1.x, r2.x), b = vec3(r0.y, r1.y, r2.y), c = vec3(r0.z, r1.z, r2.z);
  nrm = normalize(a * (u.x / dot(a, a)) + b * (u.y / dot(b, b)) + c * (u.z / dot(c, c)));
  return vec3(dot(r0, u4), dot(r1, u4), dot(r2, u4));
}

void main() {
  float seed = aLook.z, kind = aLook.w, alpha = aLook.y;
  vec3 up = vec3(0.0, 1.0, 0.0), nrm;
  vec3 p = part(int(aBone.x + 0.5), aBone.yzw, nrm);

  if (kind > 1.5) {
#ifdef HALO
    hide(); return;
#endif
    // spray thrown back off the tail, arcing and falling
    vec3 tail = part(0, vec3(-0.9, 0.0, 0.0), nrm);
    float age = fract(uTime * (1.1 + 0.8 * fract(seed * 7.0)) + seed * 13.0);
    vec3 v = -uFwd * (0.7 + 0.9 * fract(seed * 17.0)) + up * (0.35 + 0.6 * fract(seed * 29.0))
           + normalize(cross(uFwd, up)) * (fract(seed * 5.0) - 0.5);
    p = tail + (v * age - up * (0.5 * age * age)) * uFigH;
    alpha *= (1.0 - age) * uSpray;
  } else {
    // loose, he shimmers and a few dots stream off behind him
    float w = uTime * (1.3 + 2.1 * seed) + seed * 60.0;
    p += vec3(sin(w), cos(w * 1.31), sin(w * 0.77 + 1.0)) * (0.012 * uLoose * uFigH);
    float drift = step(0.84, fract(seed * 17.0)) * fract(uTime * (0.6 + 0.5 * seed) + seed * 5.0) * uLoose;
    p += (up * 0.12 - uFwd * 0.6) * (drift * uFigH);
    alpha *= 1.0 - drift;
  }

  // entrance: his dots gather in out of the gas around him
  float g = clamp(uAppear * 1.5 - seed * 0.5, 0.0, 1.0);
  g = 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g);
  vec3 scatter = vec3(cos(seed * 91.0), 0.4 * sin(seed * 23.0), sin(seed * 57.0)) * (0.8 + 2.2 * fract(seed * 7.3));
  p = mix(p + scatter * uFigH, p, g);
  alpha *= g;

  // moved whole to where the lens shows his board, seen straight on from there
  vec3 app = p + uShift, k = normalize(uCamPos - app);
  bool dark = length(app - dot(app, normalize(uCamPos)) * normalize(uCamPos)) < B_CRIT * RS * 1.02 * uBirth; // over the shadow
  vec3 col;
#ifdef HALO
  col = dark ? uInk : uPaper;
  float radius = (aLook.x + 0.02) * uFigH;
  alpha = min(1.0, alpha * 1.4) * g * g; // the outline only once he has come together
#else
  // only the side facing us; the side facing the hole is lit by the hot inner disc
  if (kind < 1.5 && dot(nrm, k) < -0.05) { hide(); return; }
  float lit = max(dot(nrm, -normalize(p)), 0.0);
  col = kind > 1.5 ? (fract(seed * 41.0) < 0.35 ? uRed : uInk)
      : kind > 0.5 ? mix(uRed, uInk, 0.4 * (1.0 - lit))
      : mix(dark ? uPaper : uInk, uRed, 0.55 * pow(lit, 6.0)); // a thin warm rim, the body stays ink
  float radius = aLook.x * uFigH;
#endif
  emit(app, app, radius, col, alpha, 0.0);
}
`;

// Dots spread evenly over every part's surface; the board red; spray.
function surferGeometry(rand) {
  const list = [];
  const area = ([a, b, c]) => 4 * Math.PI * ((((a * b) ** 1.6075 + (a * c) ** 1.6075 + (b * c) ** 1.6075) / 3) ** (1 / 1.6075));
  PARTS.forEach(([a, b, c], part) => {
    const most = Math.max(b * c, a * c, a * b);
    for (let k = 0, n = Math.round(2000 * area([a, b, c])); k < n; ) {
      const z = rand() * 2 - 1, t = rand() * TAU, s = Math.sqrt(1 - z * z), x = s * Math.cos(t), y = s * Math.sin(t);
      // even on the ellipsoid: keep points in proportion to how much the scaling stretches the sphere there
      if (rand() * most > Math.hypot(b * c * x, a * c * y, a * b * z)) continue;
      const board = part === 0;
      list.push({ part, x, y, z, size: (board ? 0.011 : 0.012) * (0.85 + 0.3 * rand()), alpha: board ? 1 : 0.92, seed: rand(), kind: board ? 1 : 0 });
      k++;
    }
  });
  for (let i = 0; i < 110; i++) list.push({ part: 0, size: 0.009 + 0.006 * rand(), alpha: 0.85, seed: rand(), kind: 2 });
  return pack(list, { aBone: ['part', 'x', 'y', 'z'], aLook: ['size', 'alpha', 'seed', 'kind'] });
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const mix = (a, b, u) => a + (b - a) * u;

// Knee of a leg from hip to ankle, bent towards `hint`.
function knee(hip, ank, hint) {
  const d = sub(hip, ank), L = len(d), ax = mul(d, 1 / L);
  const Lm = Math.min(L, SHIN + THIGH - 1e-4);
  const a = (SHIN * SHIN - THIGH * THIGH + Lm * Lm) / (2 * Lm), h = Math.sqrt(Math.max(SHIN * SHIN - a * a, 0));
  return add(add(ank, mul(ax, a)), mul(unit(sub(hint, mul(ax, dot(hint, ax)))), h));
}

// The rig, in the board's frame (x to the nose, y up, z the side he faces)
// and his heights: every part as centre + three semi-axis vectors.
function pose(p, E) {
  const put = (i, c, a, b, d) => { E.set(c, i * 12); E.set(a, i * 12 + 3); E.set(b, i * 12 + 6); E.set(d, i * 12 + 9); };
  const limb = (i, from, to, r, hint) => {
    const d = sub(to, from), L = len(d), ax = mul(d, 1 / L);
    let u = cross(ax, hint);
    if (len(u) < 1e-3) u = cross(ax, [1, 0, 0]);
    u = unit(u);
    put(i, mul(add(from, to), 0.5), mul(ax, L / 2 + 0.3 * r), mul(u, r), mul(cross(ax, u), r));
  };
  const c = p.crouch;
  put(0, [0, 0, 0], [0.56, 0, 0], [0, 0.022, 0], [0, 0, 0.13]);
  // feet across the board, hips over them; crouching drops the hips and sits them back
  const ankB = [-0.21, 0.05, 0], ankF = [0.19, 0.05, 0];
  put(1, [-0.21, 0.035, 0.02], [0.035, 0, 0], [0, 0.02, 0], [0, 0, 0.075]);
  put(2, [0.19, 0.035, 0.02], [0.035, 0, 0], [0, 0.02, 0], [0, 0, 0.075]);
  const hip = [-0.01 + p.sway, 0.5 - 0.18 * c, -0.05 * c];
  const hipB = add(hip, [-0.065, 0, 0]), hipF = add(hip, [0.065, 0, 0]);
  const kneeB = knee(hipB, ankB, [0.2, 0, 1]), kneeF = knee(hipF, ankF, [-0.2, 0, 1]);
  limb(3, ankB, kneeB, 0.04, [0, 0, 1]); limb(4, kneeB, hipB, 0.052, [0, 0, 1]);
  limb(5, ankF, kneeF, 0.04, [0, 0, 1]); limb(6, kneeF, hipF, 0.052, [0, 0, 1]);
  put(7, add(hip, [0, 0.03, 0]), [0.09, 0, 0], [0, 0.075, 0], [0, 0, 0.065]);
  // spine bends towards the side he faces; the chest turns towards the nose
  const spine = [0, Math.cos(p.lean), Math.sin(p.lean)];
  const f0 = [Math.sin(p.twist), 0, Math.cos(p.twist)];
  const face = unit(sub(f0, mul(spine, dot(f0, spine))));
  const across = cross(spine, face); // towards the front shoulder
  put(8, add(hip, mul(spine, 0.2)), mul(across, 0.105), mul(spine, 0.165), mul(face, 0.07));
  const neck = add(hip, mul(spine, 0.37));
  put(9, add(add(neck, mul(spine, 0.08)), mul(face, 0.01)), mul(across, 0.058), mul(spine, 0.07), mul(face, 0.062));
  // arms out along the board for balance
  const arm = (i, side, lift, fwd, bend) => {
    const sh = add(sub(neck, mul(spine, 0.035)), mul(across, 0.1 * side));
    const dir = unit(add(add(mul(across, side * Math.cos(lift) * Math.cos(fwd)), [0, Math.sin(lift), 0]), mul(face, Math.cos(lift) * Math.sin(fwd))));
    const elbow = add(sh, mul(dir, 0.155));
    const hand = add(elbow, mul(unit(add(dir, add([0, 0.6 * bend, 0], mul(face, bend)))), 0.145));
    limb(i, sh, elbow, 0.033, face); limb(i + 1, elbow, hand, 0.028, face);
  };
  arm(10, -1, p.bLift, p.bFwd, p.bend);
  arm(12, 1, p.fLift, p.fFwd, p.bend);
}

export function makeSurfer(uniforms, paper) {
  const rand = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
  const u = {
    uBoneM: { value: new Float32Array(BONES * 12) },
    uShift: { value: new Vector3() },
    uFwd: { value: new Vector3(1, 0, 0) },
    uFigH: { value: HEIGHT },
    uLoose: { value: LOOSE },
    uAppear: { value: 0 },
    uSpray: { value: 0 },
    uPaper: { value: paper },
  };
  const geometry = surferGeometry(rand);
  const halo = dotMaterial(VERTEX, { ...uniforms, ...u }, '#define HALO\n');
  const ink = dotMaterial(VERTEX, { ...uniforms, ...u });

  // Maneuver state; everything else follows from the time.
  const st = { phi0: 0, k0: 0, mode: 'ride', t0: -1e9, dur: 1, hop: 0, offPhi: 0, offR: 0, cool: 0,
    loose: LOOSE, last: null, marks: [], board: null };
  const params = { crouch: 0, lean: 0, twist: 0, sway: 0, fLift: 0, fFwd: 0, bLift: 0, bFwd: 0, bend: 0 };
  const local = new Float32Array(BONES * 12);

  // On the frame shown under reduced motion he rides the crest of the arc
  // over the hole, just left of straight behind it: the one part of his orbit
  // in view on every layout (the frame crops the sides of the disc). His
  // entrance, one orbit and a bit earlier, lands near there too.
  {
    const cam = new PerspectiveCamera();
    poseCamera(cam, camAt(T.still));
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const far = Math.atan2(cam.position.z, cam.position.x) + Math.PI;
    const turn = Math.cos(far + 0.08) * right.x + Math.sin(far + 0.08) * right.z < 0 ? 0.08 : -0.08;
    st.phi0 = far + turn - ORBIT * T.still;
  }

  const moving = () => st.mode === 'carve' || st.mode === 'air';
  // maneuvers start at full speed and settle onto the new track
  const ease = (t) => (moving() ? 1 - (1 - Math.min(Math.max((t - st.t0) / st.dur, 0), 1)) ** 3 : 1);
  const airAt = (t) => (st.mode === 'air' ? Math.sin(Math.PI * Math.min(Math.max((t - st.t0) / st.dur, 0), 1)) : 0);
  // round the hole with the gas, carving in and out across the flow, bobbing as he pumps
  const where = (t) => {
    const k = (TAU * t) / CARVE + st.k0, e = 1 - ease(t);
    return { k, r: R_MID + R_AMP * Math.sin(k) + st.offR * e, phi: st.phi0 + ORBIT * t + st.offPhi * e,
      h: 0.05 * Math.sin((TAU * t) / 1.35) + st.hop * airAt(t) };
  };
  const place = (w, out) => out.set(w.r * RS * Math.cos(w.phi), w.h * HEIGHT, w.r * RS * Math.sin(w.phi));

  const P = new Vector3(), A = new Vector3(), B = new Vector3(), X = new Vector3(), Y = new Vector3(), Z = new Vector3();
  const X0 = new Vector3(), X1 = new Vector3(), UP = new Vector3(0, 1, 0), tmp = new Vector3();
  // direction of travel in the disc plane; leaves A, B at t ∓ 0.02 s
  const heading = (t, out) => { place(where(t - 0.02), A); place(where(t + 0.02), B); return out.subVectors(B, A).setY(0).normalize(); };

  // Where the lens shows a world point (on the sky plane through the hole),
  // and its screen position in canvas css px.
  const o = new Vector3(), n = new Vector3(), q = new Vector3();
  let camera = null, W = 1, H = 1;
  function lensed(p, out) {
    const R = Math.max(p.length(), 1e-6);
    n.copy(p).divideScalar(R);
    const c = Math.max(-1, Math.min(1, n.dot(o)));
    out.copy(n).addScaledVector(o, -c);
    const le = out.length();
    if (le > 1e-5) out.divideScalar(le); else out.set(0, 1, 0);
    const x = Math.max(1 - RS / R, 0.05), cosA = 1 - (1 - c) * x;
    return out.multiplyScalar((R * Math.sqrt(Math.max(1 - cosA * cosA, 0))) / Math.sqrt(x));
  }
  function project(p, out) {
    q.copy(p).project(camera);
    out[0] = ((q.x + 1) / 2) * W;
    out[1] = ((1 - q.y) / 2) * H;
    return out;
  }
  const screen = (p, out) => project(lensed(p, q), out);

  // Where the board would be at time t with the track shifted by dk, dphi.
  const landing = (t, dk, dphi, out) => {
    const r = R_MID + R_AMP * Math.sin((TAU * t) / CARVE + st.k0 + dk), phi = st.phi0 + dphi + ORBIT * t;
    return screen(tmp.set(r * RS * Math.cos(phi), 0, r * RS * Math.sin(phi)), out);
  };

  // Carve hard across the flow with a burst ahead, or air further ahead onto
  // the other side of his track, whichever lands him farther from the pointer.
  function maneuver(t, pointer) {
    const now = where(t);
    const moves = [{ mode: 'carve', dk: Math.PI, dphi: 0.3, dur: 0.55, hop: 0 },
                   { mode: 'air', dk: Math.PI, dphi: 0.9, dur: 0.75, hop: 1.2 }];
    let best = moves[0], far = -1;
    for (const m of moves) {
      const at = landing(t + m.dur, m.dk, m.dphi, [0, 0]);
      const d = (pointer ? Math.hypot(at[0] - pointer[0], at[1] - pointer[1]) : 0) + rand() * 20;
      if (d > far) { far = d; best = m; }
    }
    st.k0 += best.dk; st.phi0 += best.dphi;
    st.mode = best.mode; st.dur = best.dur; st.hop = best.hop; st.t0 = t;
    // start from where he is and ease onto the new track
    st.offR = now.r - (R_MID + R_AMP * Math.sin((TAU * t) / CARVE + st.k0));
    st.offPhi = now.phi - (st.phi0 + ORBIT * t);
  }

  const feet = [0, 0], head = [0, 0], mid = [0, 0];

  // ctx: { t, camera, cssW, cssH, sx, sy, pointer (canvas css px or null), interactive,
  //        trail / trailV (push sources: vec4 and velocity per slot), slot0, slots }.
  // Returns where he is on screen.
  function update(ctx) {
    const { t } = ctx;
    camera = ctx.camera; W = ctx.cssW; H = ctx.cssH;
    o.copy(camera.position).normalize();
    const appear = smooth01((t - T.surfer) / 1.4);
    const dt = st.last === null ? 0 : Math.max(0, Math.min(t - st.last, 0.1));
    st.last = t;

    if (moving() && t - st.t0 >= st.dur) { st.mode = 'ride'; st.offR = st.offPhi = st.hop = 0; st.cool = t + 0.05; }

    // the board: at his spot, pointing where he is going, banked into the turn
    place(where(t), P);
    heading(t - 0.06, X0);
    heading(t + 0.06, X1);
    heading(t, X);
    const speed = A.distanceTo(B) / 0.04;
    const turn = -tmp.copy(X0).cross(X1).y / 0.12; // rad/s, positive towards his right (the hole)
    const bank = Math.max(-0.9, Math.min(0.9, Math.atan((speed * turn) / BANK_G)));
    Z.crossVectors(X, UP);
    Y.copy(UP).multiplyScalar(Math.cos(bank)).addScaledVector(Z, Math.sin(bank));
    Z.crossVectors(X, Y);
    const air = airAt(t), s = st.mode === 'air' ? Math.min((t - st.t0) / st.dur, 1) : 0;
    const pitch = 0.35 * air * (1 - 2 * s); // nose up on take-off, down to land
    X.multiplyScalar(Math.cos(pitch)).addScaledVector(Y, Math.sin(pitch));
    Y.crossVectors(Z, X).normalize();

    // the lens shows his board here; the rest of him comes along
    const shift = lensed(P, u.uShift.value).sub(P);
    project(tmp.copy(P).add(shift), feet);
    project(tmp.copy(P).addScaledVector(Y, HEIGHT).add(shift), head);
    project(tmp.copy(P).addScaledVector(Y, 0.45 * HEIGHT).add(shift), mid);

    // the pointer comes close: react at once (from where he is, so no jump)
    const tall = Math.max(Math.hypot(head[0] - feet[0], head[1] - feet[1]), 20);
    if (ctx.interactive && st.mode === 'ride' && t > st.cool && appear >= 1 && ctx.pointer &&
        Math.hypot(ctx.pointer[0] - mid[0], ctx.pointer[1] - mid[1]) < REACT * tall) {
      maneuver(t, ctx.pointer);
    }

    // body: pumping, carving, balancing; gathered the instant he reacts, tucked in the air
    const brace = moving() ? 1 - smooth01((t - st.t0) / st.dur) : 0;
    const firm = st.mode === 'ride' ? 0 : 1;
    st.loose = dt > 0 ? st.loose + (LOOSE * (1 - firm) - st.loose) * (1 - Math.exp(-dt / (firm ? 0.03 : 1.2))) : LOOSE * (1 - firm);
    const load = Math.abs(bank) / 0.9, pump = Math.sin((TAU * t) / 1.35);
    params.crouch = Math.min(1, 0.28 + 0.1 * pump + 0.3 * load + 0.6 * brace + 0.55 * air);
    params.lean = 0.28 + 0.12 * load + 0.2 * brace;
    params.twist = mix(0.3 + 0.35 * bank, 0, brace);
    params.sway = 0.02 * Math.sin((TAU * t) / 2.1);
    params.fLift = mix(mix(-0.35 + 0.22 * Math.sin((TAU * t) / 2.4) - 0.35 * bank, -0.9, brace), 0.7, air);
    params.bLift = mix(mix(0.05 + 0.25 * Math.sin((TAU * t) / 1.9 + 1) + 0.35 * bank, -0.8, brace), 0.8, air);
    params.fFwd = mix(0.25, 0.9, brace);
    params.bFwd = mix(0.2, 0.9, brace);
    params.bend = mix(0.35, 1.1, brace);
    pose(params, local);

    // rig → world: every part's centre and axes through the board's frame,
    // stored as the rows of [axis a | axis b | axis c | centre]
    const m = u.uBoneM.value;
    for (let i = 0; i < BONES; i++) {
      for (let col = 0; col < 4; col++) {
        const src = i * 12 + col * 3, lx = local[src], ly = local[src + 1], lz = local[src + 2];
        const at = col === 0 ? 3 : col - 1, off = col === 0 ? 1 : 0;
        m[i * 12 + at] = (X.x * lx + Y.x * ly + Z.x * lz) * HEIGHT + P.x * off;
        m[i * 12 + 4 + at] = (X.y * lx + Y.y * ly + Z.y * lz) * HEIGHT + P.y * off;
        m[i * 12 + 8 + at] = (X.z * lx + Y.z * ly + Z.z * lz) * HEIGHT + P.z * off;
      }
    }
    u.uFwd.value.copy(X);
    u.uLoose.value = st.loose;
    u.uAppear.value = appear;
    u.uSpray.value = Math.min(1, appear * (1 - air) * (0.3 + 0.7 * load + 0.8 * brace));

    // his board parts the gas: the live source moves with him (the gas flows
    // round it, told how fast he goes); marks behind him are laid on a clock
    // and fade in and out to nothing, like the pointer's (see main.js)
    const { sx, sy, cssH } = ctx, bx = feet[0] * sx, by = (cssH - feet[1]) * sy; // device px, y up
    const b = st.board || (st.board = { x: bx, y: by, vx: 0, vy: 0 });
    if (dt > 0) {
      const kv = 1 - Math.exp(-dt / 0.05);
      b.vx += ((bx - b.x) / dt - b.vx) * kv;
      b.vy += ((by - b.y) / dt - b.vy) * kv;
    }
    b.x = bx; b.y = by;
    const last = st.marks[st.marks.length - 1];
    if (!last || (t - last.at >= WAKE / (ctx.slots - 1) && Math.hypot(bx - last.x, by - last.y) > 4 * sy)) st.marks.push({ x: bx, y: by, at: t });
    while (st.marks.length && t - st.marks[0].at >= WAKE) st.marks.shift();
    const tr = ctx.trail, vel = ctx.trailV, spread = 0.75 * tall * sy;
    for (let i = 0; i < ctx.slots; i++) {
      const m = i ? st.marks[i - 1] : b, j = ctx.slot0 + i;
      tr[j * 4] = m ? m.x : 0; tr[j * 4 + 1] = m ? m.y : 0; tr[j * 4 + 3] = spread;
      tr[j * 4 + 2] = !m ? 0 : appear * (i ? 0.3 * wakeFade(t - m.at, WAKE) : 0.35 * (1 - air));
      vel[j * 2] = i ? 0 : b.vx; vel[j * 2 + 1] = i ? 0 : b.vy; // marks stand still
    }

    halo.visible = ink.visible = t >= T.surfer;
    return { x: mid[0], y: mid[1], height: tall }; // on screen, canvas css px
  }

  return { geometry, halo, ink, update };
}
