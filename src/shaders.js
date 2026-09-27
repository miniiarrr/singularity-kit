import { RawShaderMaterial, GLSL3, NormalBlending } from 'three';
import { T, SINK, CORE, RS, R_FEED, W_ISCO } from './timeline.js';

// Every particle is a round ink dot drawn as a screen-space capsule from where
// it was one shutter interval ago to where it is now, so fast motion smears
// into streaks. Positions are closed-form functions of time: no simulation
// state, any moment can be rendered directly.

const num = (v) => { const s = String(+v.toFixed(6)); return /[.e]/.test(s) ? s : s + '.0'; };

// Materials built with PUSH make their dots back away from push sources:
// the pointer and its wake, and the surfer's board and its wake.
export const TRAIL = 18;
export const PUSH = `#define PUSH\n#define TRAIL ${TRAIL}\n`;
// Galaxy and core built with STEADY never collapse or explode (galaxy mode):
// the opening motion, extended forever. Without it the programs are unchanged.
export const STEADY = '#define STEADY\n';

const HEADER = `precision highp float;
#define T_COLLAPSE ${num(T.collapse)}
#define T_IMPLODE ${num(T.implode)}
#define T_BANG ${num(T.bang)}
#define SINK_Q ${num(SINK.q)}
#define SINK_K ${num(SINK.k)}
#define SPIN_K ${num(SINK.spinK)}
#define WIND ${num(SINK.wind)}
#define CORE_BANG_R ${num(CORE.rBang)}
#define RS ${num(RS)}
#define R_ISCO ${num(3 * RS)}
#define R_FEED ${num(R_FEED * RS)}
#define W_ISCO ${num(W_ISCO)}
#define B_CRIT 2.598076
`;

const COMMON_VERTEX = `
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 uPrevViewProj;
uniform vec2 uViewport;   // drawing buffer, device px
uniform float uFocal;     // focal length, device px
uniform float uFocus;     // camera distance to the centre
uniform float uNearFade;  // closer than this to the lens, dots fade away
uniform float uTime;
uniform float uShutter;
uniform vec3 uInk;
uniform vec3 uRed;

in vec3 position;         // quad corner in [-1, 1]

out vec2 vUV;             // fragment position in dot radii
out float vHalf;          // half the streak length in dot radii
out float vEdge;          // edge softness in dot radii
out vec3 vColor;
out float vAlpha;

#ifdef PUSH
uniform vec4 uTrail[TRAIL];  // push sources: position (device px), strength, reach (device px)
uniform vec2 uTrailV[TRAIL]; // how each source moves, device px/s
uniform float uPushP;        // how far dots back off at full strength, device px
float pushScale = 1.0;       // per-dot variation, set before emit(): a ragged, gassy edge

// Dots part around each source rather than straight away from it: sideways,
// to whichever side of their own path past the source they are on (vDot is
// the dot's screen velocity). A dot keeps its side as it goes past, so none
// flips across the gap as the sources and the gas move, and the push fades
// to nothing along that path's centre line. Only dots moving with a source
// are pushed straight away from it, also fading to nothing at its centre.
// The whole field is continuous; the tanh caps overlapping sources. The few
// dots it leaves right at a source (moving them out would take a jump)
// dissolve instead; clear says how much.
vec2 pushed(vec2 s, vec2 vDot, out float clear) {
  vec2 off = vec2(0.0);
  for (int i = 0; i < TRAIL; i++) {
    vec4 src = uTrail[i];
    if (src.z <= 0.0) continue;
    vec2 d = s - src.xy;
    float l = length(d), reach = max(src.w, 1.0);
    float f = max(1.0 - l / reach, 0.0);
    if (f <= 0.0) continue;
    float e = 0.3 * reach;
    vec2 rel = vDot - uTrailV[i];
    float speed = length(rel);
    vec2 side = speed > 1e-3 ? vec2(-rel.y, rel.x) / speed : vec2(0.0);
    float y = dot(d, side);
    vec2 part = mix(d / max(l, e), side * (y / max(abs(y), e)), smoothstep(20.0, 80.0, speed));
    off += part * (src.z * f * f);
  }
  float m = length(off);
  vec2 moved = m > 1e-4 ? s + off * (uPushP * pushScale * 1.3 * tanh(m / 1.3) / m) : s;
  clear = 0.0;
  for (int i = 0; i < TRAIL; i++) {
    vec4 src = uTrail[i];
    if (src.z > 0.0) clear = max(clear, src.z * (1.0 - smoothstep(0.08 * src.w, 0.3 * src.w, length(moved - src.xy))));
  }
  clear = min(clear, 1.0);
  return moved;
}
#endif

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vUV = vec2(0.0); vHalf = 0.0; vEdge = 1.0; vColor = vec3(0.0); vAlpha = 0.0;
}

// A dot of radius rpx at sn (device px), smeared back to sp.
void emitPx(vec2 sn, vec2 sp, float rpx, vec3 color, float alpha, float soft) {
  if (alpha < 0.004) { hide(); return; }
  if (rpx < 0.7) { alpha *= rpx * rpx / 0.49; rpx = 0.7; }
  rpx = min(rpx, uViewport.y * 0.4);

  vec2 d = sn - sp;
  float len = length(d);
  float maxLen = uViewport.y * 0.25;
  if (len > maxLen) { d *= maxLen / len; len = maxLen; }
  vec2 ax = len > 0.001 ? d / len : vec2(1.0, 0.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float h = 0.5 * len;
  float edge = max(1.0 / rpx, soft);
  float ext = rpx * (1.0 + 0.5 * edge) + 1.0;
  vec2 px = sn - 0.5 * d + ax * (position.x * (h + ext)) + ay * (position.y * ext);

  vUV = vec2(position.x * (h + ext), position.y * ext) / rpx;
  vHalf = h / rpx;
  vEdge = edge;
  vColor = color;
  vAlpha = alpha / (1.0 + 0.35 * vHalf);
  gl_Position = vec4(px / uViewport * 2.0 - 1.0, 0.0, 1.0);
}

// A dot of the given world radius at now, smeared back to prev.
void emit(vec3 now, vec3 prev, float radius, vec3 color, float alpha, float soft) {
  vec4 cn = projectionMatrix * viewMatrix * vec4(now, 1.0);
  if (cn.w < uNearFade * 0.3 || alpha < 0.004) { hide(); return; }
  vec4 cp = uPrevViewProj * vec4(prev, 1.0);
  vec2 sn = (cn.xy / cn.w * 0.5 + 0.5) * uViewport;
  vec2 sp = cp.w > 0.01 ? (cp.xy / cp.w * 0.5 + 0.5) * uViewport : sn;
#ifdef PUSH
  vec2 vDot = (sn - sp) / max(uShutter, 1e-4); // how the dot moves on screen, px/s
  float clear, unused;
  sn = pushed(sn, vDot, clear);
  sp = pushed(sp, vDot, unused);
  alpha *= 1.0 - clear;
#endif
  // debris rushing at the lens goes out of focus, then fades before it hits
  soft = max(soft, 0.9 * clamp(1.0 - cn.w / (0.3 * uFocus), 0.0, 1.0));
  alpha *= smoothstep(uNearFade * 0.3, uNearFade, cn.w);
  emitPx(sn, sp, radius * uFocal / cn.w, color, alpha, soft);
}
`;

const DOT_FRAGMENT = `
in vec2 vUV;
in float vHalf;
in float vEdge;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  float d = length(vec2(max(abs(vUV.x) - vHalf, 0.0), vUV.y));
  float c = clamp((1.0 - d) / vEdge + 0.5, 0.0, 1.0);
  float a = vAlpha * c * c * (3.0 - 2.0 * c);
  if (a < 0.002) discard;
  outColor = vec4(vColor * a, a);
}
`;

// Stars, dust, planets, small black holes: they orbit, spiral into the
// centre, then fly out of it as debris (STEADY: they only orbit).
export const GALAXY_VERTEX = `
uniform float uCoreR;
uniform float uFade;

in vec4 aPos;    // initial position, angular speed
in vec4 aLocal;  // offset from the body centre (out, up, along the orbit), spin
in vec4 aLook;   // radius, alpha, redness, debris radius
in vec4 aBoom;   // explosion velocity, drag
in vec4 aBoom2;  // explosion start offset, lifetime

vec3 orbit(float t, out float vis) {
  vec3 p0 = aPos.xyz;
  float r0 = max(length(p0), 0.05);
  float rc2 = uCoreR * uCoreR;
#ifdef STEADY
  float rr = r0 * r0;
  vis = smoothstep(rc2, rc2 * 2.6, rr);
  float spin = aPos.w * t;
#else
  float tau = max(t - T_COLLAPSE, 0.0);
  float F = SINK_Q * ((exp(SINK_K * tau) - 1.0) / SINK_K - tau);
  float rr = r0 * r0 - 2.0 * F;
  vis = smoothstep(rc2, rc2 * 2.6, rr) * (1.0 - smoothstep(T_IMPLODE, T_IMPLODE + 0.12, t));
  float spin = aPos.w * (min(t, T_COLLAPSE) + (exp(SPIN_K * tau) - 1.0) / SPIN_K);
#endif
  float r = sqrt(max(rr, rc2 * 0.5));
  vec3 p = rotY(p0, spin + WIND * log(r0 / r)) * (r / r0);

  vec3 l = aLocal.xyz;
  if (dot(l, l) > 0.0) {
    // bodies are torn along their orbit as they fall
    float fall = 1.0 - r / r0;
    l = rotY(l, aLocal.w * t);
    l.x *= 1.0 - 0.5 * fall;
    l.z *= 1.0 + 3.0 * fall;
    vec2 e = normalize(p.xz + vec2(1e-5, 0.0));
    p += vec3(e.x * l.x - e.y * l.z, l.y, e.y * l.x + e.x * l.z);
  }
  return p;
}

vec3 boom(float s) {
  float k = aBoom.w > 0.001 ? (1.0 - exp(-aBoom.w * s)) / aBoom.w : s;
  return aBoom2.xyz + aBoom.xyz * k;
}

void main() {
  float t = uTime;
  vec3 base = mix(uInk, uRed, aLook.z);
#ifndef STEADY
  if (t >= T_BANG) {
    float s = t - T_BANG;
    float cool = 0.08 + 0.6 * fract(aBoom2.w * 13.37 + aLook.y * 7.1);
    vec3 col = mix(uRed, base, smoothstep(cool, cool + 0.08, s));
    float a = aLook.y * smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(aBoom2.w * 0.5, aBoom2.w, s));
    emit(boom(s), boom(max(s - uShutter, 0.0)), aLook.w, col, a, 0.0);
    return;
  }
#endif
  float vis, unused;
  vec3 now = orbit(t, vis);
  // shutter limited by angular speed, so fast swirls smear as arcs not chords
#ifdef STEADY
  float w = aPos.w;
#else
  float tau = max(t - T_COLLAPSE, 0.0);
  float r = max(length(now), uCoreR);
  float w = aPos.w * exp(SPIN_K * tau) + WIND * SINK_Q * (exp(SINK_K * tau) - 1.0) / (r * r);
#endif
  vec3 prev = orbit(t - min(uShutter, 0.5 / max(w, 1e-3)), unused);
  emit(now, prev, aLook.x, base, aLook.y * uFade * vis, 0.0);
}
`;

// The galaxy centre: a red stipple ball that grows, spins up and implodes,
// then becomes the fireball, the shock ring and the flash (STEADY: it only turns).
export const CORE_VERTEX = `
uniform float uCoreR;
uniform float uCoreRPrev;
uniform float uCoreSpin;
uniform float uCoreSpinPrev;
uniform float uCoreWobble;
uniform float uFade;

in vec4 aDir;   // direction; w = 0 core / fireball, 1 shock ring, 2 flash
in vec4 aLook;  // radius, alpha, redness, seed
in vec4 aBoom;  // speed, drag, lifetime, radial jitter

vec3 ball(float t, float r, float spin) {
  vec3 u = rotY(aDir.xyz, spin * (0.7 + 0.6 * aLook.w));
  float n = sin(dot(aDir.xyz, vec3(12.7, 7.3, 9.1)) + t * 23.0) * sin(dot(aDir.xyz, vec3(5.1, 13.3, 3.7)) - t * 17.0);
  return u * r * (1.0 + uCoreWobble * n);
}

float travel(float s) { return (1.0 - exp(-aBoom.y * s)) / aBoom.y; }

void main() {
  float t = uTime;
  vec3 col = mix(uInk, uRed, aLook.z);
#ifndef STEADY
  if (t >= T_BANG) {
    float s = t - T_BANG;
    float sp = max(s - uShutter, 0.0);
    if (aDir.w < 0.5) {
      float a = aLook.y * (1.0 - smoothstep(aBoom.z * 0.35, aBoom.z, s));
      emit(aDir.xyz * (CORE_BANG_R + aBoom.x * travel(s)), aDir.xyz * (CORE_BANG_R + aBoom.x * travel(sp)), aLook.x, col, a, 0.0);
    } else if (aDir.w < 1.5) {
      float a = aLook.y * smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(aBoom.z * 0.3, aBoom.z, s));
      emit(aDir.xyz * (aBoom.x * travel(s) + aBoom.w), aDir.xyz * (aBoom.x * travel(sp) + aBoom.w), aLook.x, col, a, 0.0);
    } else {
      float r = 0.3 + aBoom.x * travel(s);
      float a = aLook.y * exp(-s / aBoom.z) * smoothstep(0.0, 0.025, s);
      emit(vec3(0.0), vec3(0.0), r, col, a, 1.0);
    }
    return;
  }
#endif
  if (aDir.w > 0.5) { hide(); return; }
  emit(ball(t, uCoreR, uCoreSpin), ball(t - uShutter, uCoreRPrev, uCoreSpinPrev), aLook.x, col, aLook.y * uFade, 0.0);
}
`;

// Light bent around the newborn hole, for anything near it (the gas, the
// surfer): Beloborodov's approximation 1 − cos α = (1 − cos ψ)(1 − rs/r),
// with ψ the angle between the point and the camera as seen from the hole
// and α the angle the light leaves the point at. It lifts the far side of
// the disc into the arc over the shadow. Returns where p appears (on the
// sky plane through the hole) and, in k, the direction the light leaves p
// in to reach the camera, so surfaces can tell whether they face us.
export const LENS = `
uniform float uBirth;

vec3 lensed(vec3 p, vec3 o, out vec3 k) {
  float R = max(length(p), 1e-6);
  vec3 n = p / R;
  float c = clamp(dot(n, o), -1.0, 1.0);
  vec3 e = n - c * o;
  float le = length(e);
  e = le > 1e-5 ? e / le : normalize(cross(o, vec3(1.0, 0.0, 0.0)));
  float x = max(1.0 - RS / R, 0.05);
  float cosA = 1.0 - (1.0 - c) * x;
  float sinA = sqrt(max(1.0 - cosA * cosA, 0.0));
  vec3 t = o - c * n; // towards the camera, square to n
  float lt = length(t);
  t = lt > 1e-5 ? t / lt : normalize(cross(n, vec3(0.0, 1.0, 0.0)) + 1e-4);
  k = normalize(mix(o, cosA * n + sinA * t, uBirth));
  return mix(p, e * (R * sinA / sqrt(x)), uBirth);
}
`;

// Gas around the newborn black hole: Kepler orbits plus a feeding spiral,
// Doppler-boosted on the approaching side, bent by the hole (LENS). BACK_IMAGE
// draws the thin secondary image that hugs the shadow's edge.
export const GAS_VERTEX = LENS + `
uniform vec3 uCamPos;
uniform float uGasTime;
uniform float uGasAge;

in vec4 aDisk;  // radius, phase, height / radius, angular speed
in vec4 aFlow;  // inflow period (0 = stays on its orbit), inflow phase, wobble, wobble speed
in vec4 aLook;  // radius, alpha, redness, seed

vec3 gas(float tg, out float a) {
  float rad, phi;
  a = 1.0;
  if (aFlow.x > 0.0) {
    float u = fract(tg / aFlow.x + aFlow.y);
    float v = (R_FEED - R_ISCO) / aFlow.x;
    rad = mix(R_FEED, R_ISCO, u);
    phi = aDisk.y + 2.0 * W_ISCO * pow(R_ISCO, 1.5) / v * (inversesqrt(rad) - inversesqrt(R_FEED));
    a = smoothstep(0.0, 0.15, u) * (1.0 - smoothstep(0.82, 1.0, u));
  } else {
    rad = aDisk.x * (1.0 + aFlow.z * sin(aFlow.w * tg + aDisk.y * 3.0));
    phi = aDisk.y + aDisk.w * tg;
  }
  // newborn gas condenses out of a wider, slower swirl
  float e = clamp((uGasAge - aLook.w * 1.3) / 1.4, 0.0, 1.0);
  float ee = 1.0 - (1.0 - e) * (1.0 - e) * (1.0 - e);
  rad *= 1.0 + 3.0 * (1.0 - ee);
  phi -= 2.2 * (1.0 - ee);
  a *= e;
  return vec3(rad * cos(phi), aDisk.z * rad, rad * sin(phi));
}

vec3 lens(vec3 p, vec3 o) {
#ifdef BACK_IMAGE
  float R = max(length(p), 1e-6);
  vec3 n = p / R;
  vec3 e = n - dot(n, o) * o;
  float le = length(e);
  e = le > 1e-5 ? e / le : normalize(cross(o, vec3(1.0, 0.0, 0.0)));
  return -e * (B_CRIT * RS * (1.01 + 0.11 * clamp((R / RS - 3.0) / 9.0, 0.0, 1.0)));
#else
  vec3 k;
  return lensed(p, o, k);
#endif
}

void main() {
  if (uBirth <= 0.0) { hide(); return; }
  vec3 o = normalize(uCamPos);
  float a, unused;
  vec3 p = gas(uGasTime, a);
  vec3 q = gas(uGasTime - uShutter, unused);

  float rad = max(length(p.xz), RS);
#ifdef PUSH
  pushScale = 0.5 + aLook.w;
#endif
  vec3 v = normalize(vec3(-p.z, 0.0, p.x) + 1e-6);
  float beta = min(0.8 * sqrt(0.5 * RS / rad), 0.6);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(v, o));

  float alpha = aLook.y * a * uBirth * clamp(pow(g, 1.6), 0.45, 1.7);
  float radius = aLook.x * mix(1.0, g, 0.35);
#ifdef BACK_IMAGE
  alpha *= 0.7 * uBirth;
  radius *= 0.8;
#endif
  emit(lens(p, o), lens(q, o), radius, mix(uInk, uRed, aLook.z), alpha, 0.0);
}
`;

const SHADOW_VERTEX = `
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform float uShadowR;
uniform float uFocal;
in vec3 position;
out vec2 vUV;
out float vPx;

void main() {
  vec4 c = viewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ext = 1.2;
  gl_Position = projectionMatrix * (c + vec4(position.xy * uShadowR * ext, 0.0, 0.0));
  vUV = position.xy * ext;
  vPx = uShadowR * uFocal / max(-c.z, 1e-4);
}
`;

// Solid ink disc with a hairline red photon ring once it is big enough.
const SHADOW_FRAGMENT = `
uniform vec3 uInk;
uniform vec3 uRed;
in vec2 vUV;
in float vPx;
out vec4 outColor;

void main() {
  float d = length(vUV);
  float aa = 1.0 / max(vPx, 1.0);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  float w = max(0.018, 0.6 * aa);
  float ring = (1.0 - smoothstep(w - aa, w + aa, abs(d - 1.05))) * smoothstep(12.0, 30.0, vPx) * 0.9;
  vec4 c = vec4(uInk, 1.0) * disc + vec4(uRed, 1.0) * ring * (1.0 - disc);
  if (c.a < 0.002) discard;
  outColor = c;
}
`;

function material(vertexShader, fragmentShader, uniforms, defines = '') {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: HEADER + defines + vertexShader,
    fragmentShader: HEADER + fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
    premultipliedAlpha: true,
  });
}

export const dotMaterial = (body, uniforms, defines) => material(COMMON_VERTEX + body, DOT_FRAGMENT, uniforms, defines);
export const shadowMaterial = (uniforms) => material(SHADOW_VERTEX, SHADOW_FRAGMENT, uniforms);
