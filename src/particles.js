import { BufferGeometry, InstancedBufferGeometry, InstancedBufferAttribute, BufferAttribute, PerspectiveCamera, Vector3 } from 'three';
import { TAU, T, RS, R_FEED, W_ISCO, GAS_PERIOD, FOCAL, REF_BOX, D0, D1, camAt, poseCamera, clamp01 } from './timeline.js';

// Seeded so every visitor sees the same galaxy.
export function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    return u * m;
  };
}

function unit(rand) {
  const z = rand() * 2 - 1, a = rand() * TAU, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

// Exponential distribution with scale h, truncated to [lo, hi].
function expRadius(rand, h, lo, hi) {
  return lo - h * Math.log(1 - rand() * (1 - Math.exp(-(hi - lo) / h)));
}

function shuffle(rand, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const QUAD = new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3);

// Packs records into a quad geometry with one vec4 instance attribute per
// entry of `layout` ({ attributeName: [four record keys] }).
export function pack(list, layout) {
  const geo = new InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('position', QUAD);
  for (const [name, keys] of Object.entries(layout)) {
    const arr = new Float32Array(list.length * 4);
    list.forEach((p, i) => { for (let k = 0; k < 4; k++) arr[i * 4 + k] = p[keys[k]] || 0; });
    geo.setAttribute(name, new InstancedBufferAttribute(arr, 4));
  }
  geo.instanceCount = list.length;
  return geo;
}

// Dot radius of `n` px (at the reference box size) seen from distance `d`.
const sizer = (d) => (n) => (n * d) / (FOCAL * REF_BOX);

const PLANETS = [
  { r: 3.3, a: 0.6, R: 0.42 },
  { r: 4.8, a: 2.9, R: 0.55, ring: true },
  { r: 6.2, a: 4.4, R: 0.6 },
  { r: 7.6, a: 1.7, R: 0.38 },
  { r: 9.0, a: 5.6, R: 0.5 },
];
const HOLES = [{ r: 5.3, a: 3.6 }, { r: 8.1, a: 0.9 }, { r: 3.9, a: 5.1 }];
const CLUMPS = 14;      // fly-by swarms
const CLUMP_DOTS = 22;

// Galaxy: spiral arms, disc, bulge, halo, bright stars, red star-forming
// knots, globular clusters, planets and small black holes. Every particle also
// carries the velocity it will leave the explosion with; a few swarms are
// aimed to pass just by the camera. `bias` is the on-screen direction (camera
// right/up) from the explosion towards the middle of the page, where they go.
export function galaxyGeometry(rand, bias) {
  const g = gaussian(rand);
  const px = sizer(D0);
  const spinAt = (rho) => 0.5 / Math.sqrt(rho * rho + 0.36);
  const dot = (x, y, z, size, alpha, red = 0) =>
    ({ x, y, z, w: spinAt(Math.hypot(x, z)), size: px(size), alpha, red, boomSize: px(Math.max(size, 0.6) * 1.15) });
  const inDisc = (r, a, y, size, alpha, red) => dot(r * Math.cos(a), y, r * Math.sin(a), size, alpha, red);

  const special = [];
  const bulk = [];

  // Trailing log-spiral arms: two major, two minor.
  const cot = 1 / Math.tan((17 * Math.PI) / 180);
  const arms = [[0, 1], [Math.PI, 1], [0.5 * Math.PI + 0.5, 0.45], [1.5 * Math.PI + 0.5, 0.45]];
  const armWeight = arms.reduce((s, a) => s + a[1], 0);
  const armAngle = (a0, r) => a0 - Math.log(r / 1.1) * cot;
  const pickArm = () => {
    let x = rand() * armWeight;
    for (const a of arms) { if ((x -= a[1]) <= 0) return a; }
    return arms[0];
  };

  for (let i = 0; i < 10000; i++) {
    const arm = pickArm();
    const r = expRadius(rand, 3.3, 1.1, 11.5);
    const a = armAngle(arm[0], r) + (g() * (0.3 + 0.045 * r)) / r;
    bulk.push(inDisc(r + g() * 0.25, a, g() * (0.08 + 0.012 * r), 0.45 + 0.35 * rand() ** 2, 0.45 + 0.5 * rand()));
  }
  for (let i = 0; i < 6000; i++) {
    const r = expRadius(rand, 3.6, 0.5, 12.5);
    bulk.push(inDisc(r, rand() * TAU, g() * (0.1 + 0.015 * r), 0.45 + 0.3 * rand() ** 2, 0.3 + 0.5 * rand()));
  }
  for (let i = 0; i < 4500; i++) {
    const [ux, uy, uz] = unit(rand);
    const r = expRadius(rand, 0.8, 0.03, 3.2);
    bulk.push(dot(ux * r, uy * r * 0.6, uz * r, 0.5 + 0.3 * rand(), 0.5 + 0.4 * rand()));
  }
  for (let i = 0; i < 1200; i++) {
    const [ux, uy, uz] = unit(rand);
    const r = 3.5 * (12 / 3.5) ** rand();
    bulk.push(dot(ux * r, uy * r, uz * r, 0.45, 0.25 + 0.3 * rand()));
  }

  const bright = [];
  for (let i = 0; i < 110; i++) {
    const r = 1.5 + 9.5 * rand() ** 0.8;
    bright.push(inDisc(r, rand() * TAU, g() * 0.1, 1.1 + 0.7 * rand(), 0.9));
  }

  // Red star-forming knots along the major arms.
  for (let k = 0; k < 18; k++) {
    const r = 2.5 + 6.5 * rand();
    const a = armAngle(arms[k % 2][0], r);
    const cx = r * Math.cos(a), cz = r * Math.sin(a);
    const n = 18 + Math.floor(rand() * 9);
    for (let i = 0; i < n; i++) special.push(dot(cx + g() * 0.22, g() * 0.06, cz + g() * 0.22, 0.55 + 0.25 * rand(), 0.85, 1));
  }

  // Globular clusters above and below the disc.
  for (let k = 0; k < 5; k++) {
    const r = 6 + 5 * rand(), a = rand() * TAU, y = (rand() < 0.5 ? -1 : 1) * (1.2 + 2.3 * rand());
    for (let i = 0; i < 45; i++) {
      special.push(dot(r * Math.cos(a) + g() * 0.28, y + g() * 0.28, r * Math.sin(a) + g() * 0.28, 0.45 + 0.15 * rand(), 0.8));
    }
  }

  // Planets: stipple spheres shaded away from the galactic centre, like the
  // planets of the old solar-system drawing. Local frame: x out, y up, z along.
  const light = [-1, 0.35, 0.25].map((v, _, l) => v / Math.hypot(...l));
  for (const p of PLANETS) {
    const center = inDisc(p.r, p.a, 0, 0.45, 0.95);
    const tries = Math.round(700 * p.R * p.R);
    for (let i = 0; i < tries; i++) {
      const n = unit(rand);
      const lit = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      if (rand() > (1 - lit) ** 0.8) continue;
      special.push({ ...center, lx: n[0] * p.R, ly: n[1] * p.R, lz: n[2] * p.R, size: px(0.42 + 0.1 * rand()) });
    }
    if (p.ring) {
      const tilt = 0.45;
      for (const [k, s] of [[1.85, 90], [1.55, 70]]) {
        for (let i = 0; i < s; i++) {
          const a = (i / s) * TAU;
          const x = Math.cos(a) * k * p.R, z0 = Math.sin(a) * k * p.R;
          special.push({ ...center, lx: x, ly: z0 * Math.sin(tilt), lz: z0 * Math.cos(tilt), size: px(0.5) });
        }
      }
    }
  }

  // Small black holes: an ink disc with a fast red swirl around it.
  for (const h of HOLES) {
    const center = inDisc(h.r, h.a, 0, 3.0, 1);
    special.push(center);
    for (let i = 0; i < 36; i++) {
      const a = rand() * TAU, k = 0.42 * (1 + 0.1 * g());
      special.push({ ...center, lx: Math.cos(a) * k, ly: g() * 0.02, lz: Math.sin(a) * k, spin: 4.5, size: px(0.55), alpha: 0.9, red: 1, boomSize: px(0.7) });
    }
    for (let i = 0; i < 18; i++) {
      const a = rand() * TAU, k = 0.6 + 0.15 * rand();
      special.push({ ...center, lx: Math.cos(a) * k, ly: g() * 0.03, lz: Math.sin(a) * k, spin: 2.2, size: px(0.5), alpha: 0.7, boomSize: px(0.7) });
    }
  }

  // Explosion: a fast shell plus a swirling sheet in the galactic plane. One
  // grain in seven is fine dust that drifts out slowly, too small to see
  // from afar; the camera streaks through it on the way in.
  const boom = (p) => {
    const [jx, jy, jz] = unit(rand), jr = 0.12 * Math.cbrt(rand());
    p.jx = jx * jr; p.jy = jy * jr; p.jz = jz * jr;
    let v;
    if (rand() < 0.14) {
      const stop = 2.6 + 3.4 * rand();
      p.drag = 1.1 + 0.5 * rand();
      v = unit(rand).map((c) => c * stop * p.drag);
      p.life = 3.5 + 0.4 * rand();
      p.boomSize = 0.004 + 0.008 * rand();
    } else {
      const speed = Math.max(10, 24 * Math.exp(0.35 * g()));
      if (rand() < 0.4) {
        const a = rand() * TAU, lift = 0.12 * g();
        v = [(Math.cos(a) - 0.3 * Math.sin(a)) * speed, lift * speed, (Math.sin(a) + 0.3 * Math.cos(a)) * speed];
      } else v = unit(rand).map((c) => c * speed);
      p.drag = 0.3 + 0.4 * rand();
      p.life = rand() < 0.35 ? 0.35 + 0.25 * rand() : 1.3 + 1.5 * rand(); // a third burns out in the flash
    }
    [p.vx, p.vy, p.vz] = v;
  };

  // Fly-bys: swarms of grains shot straight at points just beside the lens,
  // arriving 0.4–1.7 s after the bang; the first few come within a hair.
  const fly = bulk.splice(0, CLUMPS * CLUMP_DOTS);
  const cam = new PerspectiveCamera();
  const right = new Vector3(), up = new Vector3(), target = new Vector3();
  for (let c = 0; c < CLUMPS; c++) {
    const ta = 0.4 + 1.3 * ((c + rand()) / CLUMPS) ** 1.3;
    poseCamera(cam, camAt(T.bang + ta));
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    const dist = cam.position.length();
    const miss = dist * (c < 3 ? 0.004 + 0.006 * rand() : 0.015 + 0.05 * rand() ** 1.5);
    const ang = rand() < 0.7 ? Math.atan2(bias.y, bias.x) + 0.7 * g() : rand() * TAU;
    for (let i = 0; i < CLUMP_DOTS; i++) {
      const p = fly[c * CLUMP_DOTS + i];
      const spread = dist * 0.006, pace = (1 + 0.05 * g()) / ta;
      target.copy(cam.position)
        .addScaledVector(right, Math.cos(ang) * miss + g() * spread)
        .addScaledVector(up, Math.sin(ang) * miss + g() * spread);
      p.jx = p.jy = p.jz = 0;
      p.vx = target.x * pace; p.vy = target.y * pace; p.vz = target.z * pace;
      p.drag = 0;
      p.life = 2 * ta + 0.4; // debris fades over its second half: stay solid until past the lens
      p.boomSize = 0.006 + 0.014 * rand();
    }
  }

  special.forEach(boom);
  bright.forEach(boom);
  bulk.forEach(boom);

  // Everything that must survive thinning on small screens goes first; the
  // shuffled bulk after it can be cut to any length.
  const list = [...bright, ...special, ...fly, ...shuffle(rand, bulk)];
  const r2 = Float32Array.from(list, (p) => p.x * p.x + p.y * p.y + p.z * p.z).sort();

  const geometry = pack(list, {
    aPos: ['x', 'y', 'z', 'w'],
    aLocal: ['lx', 'ly', 'lz', 'spin'],
    aLook: ['size', 'alpha', 'red', 'boomSize'],
    aBoom: ['vx', 'vy', 'vz', 'drag'],
    aBoom2: ['jx', 'jy', 'jz', 'life'],
  });
  return { geometry, fixed: bright.length + special.length + fly.length, bulk: bulk.length, r2 };
}

// Galaxy centre → fireball shell, shock ring in the galactic plane, flash.
export function coreGeometry(rand) {
  const g = gaussian(rand);
  const px = sizer(D0);
  const list = [];
  for (let i = 0; i < 1100; i++) {
    let [x, y, z] = unit(rand);
    if (rand() < 0.2) { const k = Math.cbrt(rand()); x *= k; y *= k; z *= k; }
    list.push({ x, y, z, kind: 0, size: px(0.4 + 0.25 * rand()), alpha: 0.55 + 0.4 * rand(), red: 1, seed: rand(),
      speed: 22 + 22 * rand(), drag: 1.6 + 0.8 * rand(), life: 0.35 + 0.4 * rand() });
  }
  for (let i = 0; i < 1100; i++) {
    const a = rand() * TAU;
    list.push({ x: Math.cos(a), y: g() * 0.04, z: Math.sin(a), kind: 1, size: px(0.6 + 0.4 * rand()), alpha: 0.75 + 0.25 * rand(),
      red: rand() < 0.25 ? 1 : 0, seed: rand(), speed: 40 + 10 * rand(), drag: 1.2 + 0.3 * rand(), life: 1.0 + 0.6 * rand(), jitter: g() * 0.3 });
  }
  [[0.3, 16, 6, 0.12], [0.2, 26, 5, 0.18], [0.12, 38, 4, 0.26]].forEach(([alpha, speed, drag, life]) =>
    list.push({ kind: 2, alpha, red: 1, speed, drag, life }));

  return pack(list, {
    aDir: ['x', 'y', 'z', 'kind'],
    aLook: ['size', 'alpha', 'red', 'seed'],
    aBoom: ['speed', 'drag', 'life', 'jitter'],
  });
}

// Accretion disc of the newborn hole, radii in units of RS: dense disc from
// the innermost stable orbit (3) outwards, a feeding spiral from R_FEED, and
// a faint outer halo. Speeds are quantised so the loop repeats seamlessly.
export function gasGeometry(rand) {
  const g = gaussian(rand);
  const px = sizer(D1);
  const q = (w) => (Math.round((w * GAS_PERIOD) / TAU) * TAU) / GAS_PERIOD;
  const qPeriod = (p) => GAS_PERIOD / Math.round(GAS_PERIOD / p);
  const list = [];
  for (let i = 0; i < 15000; i++) {
    const u = rand();
    let r, flow = 0;
    if (u < 0.7) r = 3 + 7 * rand() ** 1.6;
    else if (u < 0.88) { r = R_FEED; flow = qPeriod(7 + 8 * rand()); }
    else r = 9 + 2.5 * rand();
    const halo = r >= 9 && !flow;
    list.push({
      r: r * RS, phase: rand() * TAU, h: g() * (0.03 + 0.03 * clamp01((r - 3) / 8)), w: q(W_ISCO * (r / 3) ** -1.5),
      flow, fphase: rand(), wobble: 0.015 + 0.035 * rand(), wobbleW: q(0.25 + 0.7 * rand()),
      size: px(halo ? 0.45 + 0.2 * rand() : 0.5 + 0.5 * rand() ** 2),
      alpha: halo ? 0.4 + 0.35 * rand() : 0.55 + 0.45 * rand(),
      red: rand() < 0.92 - 0.84 * clamp01((r - 3.5) / 5.5) ? 1 : 0,
      seed: rand(),
    });
  }
  return pack(list, {
    aDisk: ['r', 'phase', 'h', 'w'],
    aFlow: ['flow', 'fphase', 'wobble', 'wobbleW'],
    aLook: ['size', 'alpha', 'red', 'seed'],
  });
}

export function shadowGeometry() {
  const geo = new BufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('position', QUAD);
  return geo;
}
