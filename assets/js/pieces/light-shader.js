// Motion Prompt #097 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#097
// (#097's veil — 22 % of #FFE3A3 — reaches this shader as a uniform from core/presets.js.)
//
// Light study, GPU side: the plaster bust as a signed-distance table, the GLSL generated from it,
// and the two fragment shaders (scene raymarch → render target, composite → canvas).
//
// The BUST table is the single source for the shader and for previs/bust.md (the Unreal grey-box
// sheet quotes the same numbers in centimetres). Units are metres; origin at the head centre,
// y up, +z toward the camera. The camera looks down −z, so +x is screen right (the subject's own
// left) and a light at azimuth +θ (camera-left, core/presets.js) sits at −x.
//
// Primitives (iq's bound forms): ellipsoid, sphere, capsule, round cone, vertical capped cylinder,
// rounded box. Ops: base, smin (smooth union), ssub (smooth subtraction), union, plus an optional
// cut that removes everything below a height. `mirror: true` parts are evaluated once on |x| and
// count as two primitives. `maquette: true` marks the lighting maquette (cranium, face/jaw,
// chin, brow pair, nose, neck, shoulders: 8 primitives counting the brow twice).

export const BUST = [
  // --- head (domain-rotated by the head yaw, bounded by HEAD_BOUND) ---
  { id: 'cranium', label: 'Cranium', group: 'head', prim: 'ellipsoid', c: [0, 0.035, -0.015], r: [0.074, 0.088, 0.094], op: 'base', maquette: true },
  { id: 'face', label: 'Face / jaw', group: 'head', prim: 'ellipsoid', c: [0, -0.025, 0.02], r: [0.062, 0.075, 0.072], op: 'smin', k: 0.035, maquette: true },
  { id: 'chin', label: 'Chin', group: 'head', prim: 'ellipsoid', c: [0, -0.088, 0.058], r: [0.026, 0.02, 0.022], op: 'smin', k: 0.02, maquette: true },
  { id: 'cheek', label: 'Cheekbones', group: 'head', prim: 'ellipsoid', mirror: true, c: [0.042, 0.002, 0.058], r: [0.024, 0.018, 0.02], op: 'smin', k: 0.02 },
  { id: 'brow', label: 'Brow ridge', group: 'head', prim: 'capsule', mirror: true, a: [0, 0.04, 0.074], b: [0.046, 0.035, 0.054], r: 0.009, op: 'smin', k: 0.015, maquette: true },
  { id: 'socket', label: 'Eye sockets', group: 'head', prim: 'ellipsoid', mirror: true, c: [0.03, 0.02, 0.083], r: [0.02, 0.012, 0.01], op: 'ssub', k: 0.012 },
  { id: 'eye', label: 'Eyeballs', group: 'head', prim: 'sphere', mirror: true, c: [0.03, 0.017, 0.064], r: 0.012, op: 'smin', k: 0.006 },
  { id: 'nose', label: 'Nose (bridge → tip)', group: 'head', prim: 'roundCone', a: [0, 0.028, 0.084], r1: 0.008, b: [0, -0.013, 0.107], r2: 0.0115, op: 'smin', k: 0.01, maquette: true },
  { id: 'alae', label: 'Nostril wings (alae)', group: 'head', prim: 'sphere', mirror: true, c: [0.0105, -0.016, 0.098], r: 0.0075, op: 'smin', k: 0.009 },
  { id: 'maxilla', label: 'Upper jaw (maxilla)', group: 'head', prim: 'ellipsoid', c: [0, -0.036, 0.068], r: [0.03, 0.024, 0.022], op: 'smin', k: 0.02 },
  { id: 'lipU', label: 'Upper lip', group: 'head', prim: 'ellipsoid', c: [0, -0.04, 0.0905], r: [0.021, 0.006, 0.008], op: 'smin', k: 0.01 },
  { id: 'lipL', label: 'Lower lip', group: 'head', prim: 'ellipsoid', c: [0, -0.0515, 0.0875], r: [0.018, 0.0065, 0.008], op: 'smin', k: 0.01 },
  { id: 'mouth', label: 'Mouth line', group: 'head', prim: 'capsule', mirror: true, a: [0, -0.0458, 0.0955], b: [0.02, -0.0438, 0.0875], r: 0.0014, op: 'ssub', k: 0.004 },
  { id: 'ear', label: 'Ears', group: 'head', prim: 'ellipsoid', mirror: true, c: [0.071, 0.006, -0.012], r: [0.008, 0.027, 0.017], op: 'smin', k: 0.012 },
  // --- body (not rotated) ---
  { id: 'neck', label: 'Neck', group: 'body', prim: 'cylinderY', c: [0, 0, -0.012], y0: -0.17, y1: -0.06, r: 0.052, op: 'smin', k: 0.03, maquette: true },
  { id: 'shoulders', label: 'Shoulders / chest', group: 'body', prim: 'ellipsoid', c: [0, -0.235, -0.01], r: [0.19, 0.075, 0.1], cutBelow: -0.27, op: 'smin', k: 0.04, maquette: true },
  // Out of frame in the study (rays never reach it), kept for the previs grey-box.
  { id: 'plinth', label: 'Plinth', group: 'body', prim: 'roundBox', c: [0, -0.3, -0.01], b: [0.12, 0.03, 0.09], rr: 0.005, op: 'union', render: false },
];

/** Primitive count, mirrored parts counted twice (bust 24 including the plinth, maquette 8). */
export const primitiveCount = (model = 'bust') =>
  BUST.filter(p => model === 'bust' || p.maquette).reduce((n, p) => n + (p.mirror ? 2 : 1), 0);

/** Bounding sphere of the head parts (head space) and of the whole rendered bust. */
export const HEAD_BOUND = { c: [0, 0.005, 0.01], r: 0.135 };
export const BOUND = { c: [0, -0.07, 0], r: 0.27 };
/** Backdrop: vertical plane behind every light in the presets (rims and backlight sit at z ≈ −0.9). */
export const BACKDROP = { z: -1.6, albedo: 0.18, pool: [0.0, 0.02], poolSigma: 0.5 };
export const PLASTER_ALBEDO = 0.8;
/** Linear in-scatter gain of the #097 veil (its 22 % amount × this, before exposure). */
export const VEIL_GAIN = 1.4;

// --- GLSL generation ----------------------------------------------------------

const fx = n => {
  const s = (Math.round(n * 1e5) / 1e5).toString();
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const v3 = a => `vec3(${a.map(fx).join(', ')})`;

function primExpr(part, P) {
  switch (part.prim) {
    case 'ellipsoid': return `sdEllipsoid(${P} - ${v3(part.c)}, ${v3(part.r)})`;
    case 'sphere': return `(length(${P} - ${v3(part.c)}) - ${fx(part.r)})`;
    case 'capsule': return `sdCapsule(${P}, ${v3(part.a)}, ${v3(part.b)}, ${fx(part.r)})`;
    case 'roundCone': return `sdRoundCone(${P}, ${v3(part.a)}, ${v3(part.b)}, ${fx(part.r1)}, ${fx(part.r2)})`;
    case 'cylinderY': return `sdCylY(${P}, ${v3(part.c)}, ${fx(part.y0)}, ${fx(part.y1)}, ${fx(part.r)})`;
    case 'roundBox': return `sdRoundBox(${P} - ${v3(part.c)}, ${v3(part.b)}, ${fx(part.rr)})`;
    default: throw new Error(`unknown primitive ${part.prim}`);
  }
}

function partLines(parts, first) {
  const out = [];
  parts.forEach((part, i) => {
    const P = part.mirror ? 'q' : 'p';
    let e = primExpr(part, P);
    if (part.cutBelow != null) e = `max(${e}, ${fx(part.cutBelow)} - p.y)`;
    const tag = `  // ${part.label}`;
    if (first && i === 0) { out.push(`  float d = ${e};${tag}`); return; }
    switch (part.op) {
      case 'smin': out.push(`  d = smin(d, ${e}, ${fx(part.k)});${tag}`); break;
      case 'ssub': out.push(`  d = smax(d, -(${e}), ${fx(part.k)});${tag}`); break;
      default: out.push(`  d = min(d, ${e});${tag}`);
    }
  });
  return out.join('\n');
}

/** GLSL for mapHead(p) and map(p) for the bust or the maquette. */
export function mapGLSL(model = 'bust') {
  const parts = BUST.filter(p => p.render !== false && (model === 'bust' || p.maquette));
  const head = parts.filter(p => p.group === 'head'), body = parts.filter(p => p.group === 'body');
  return `
float mapHead(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
${partLines(head, true)}
  return d;
}
float map(vec3 P) {
  // Head parts live in head space (yaw about the neck axis) behind a bounding-sphere early-out:
  // the sphere distance is a lower bound, and smin is monotonic, so the field stays conservative.
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 hp = vec3(cy * P.x + sy * P.z, P.y, -sy * P.x + cy * P.z);
  float hb = length(hp - ${v3(HEAD_BOUND.c)}) - ${fx(HEAD_BOUND.r)};
  float d = hb > 0.04 ? hb : mapHead(hp);
  vec3 p = P;
  vec3 q = vec3(abs(p.x), p.y, p.z);
${partLines(body, false)}
  return d;
}`;
}

// --- Shaders ------------------------------------------------------------------

const COMMON = `
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdCylY(vec3 p, vec3 c, float y0, float y1, float r) {
  vec2 d = vec2(length(p.xz - c.xz) - r, abs(p.y - 0.5 * (y0 + y1)) - 0.5 * (y1 - y0));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
`;

/**
 * Scene fragment shader: raymarch the bust inside its bounding sphere, shade plaster with soft
 * shadows (iq improved, k from source size) and 5-tap AO; backdrop analytic. Output is display
 * referred: exposure → ACES fit → sRGB OETF → ±0.5/255 hash dither (+ optional veil).
 */
export function sceneFS(model = 'bust') {
  return `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uCamPos, uFwd, uRight, uUp;
uniform vec2 uTan;            // tan(half FOV): x horizontal, y vertical
uniform float uYaw;
uniform vec3 uLPos[3];        // light positions (m)
uniform vec3 uLCol[3];        // linear colour × intensity at the head (0 = off)
uniform vec3 uLAim[3];        // unit vector from the light toward the head
uniform float uLK[3];         // soft-shadow sharpness k = clamp(2·dist/size, 2, 64)
uniform float uLWrap[3];      // terminator wrap from source size
uniform float uLD[3];         // nominal distance (inverse-square reference)
uniform float uLAO[3];        // how much local occlusion darkens this light (large sources more)
uniform vec3 uAmbient;
uniform vec3 uBgCol;          // background light colour × gain (2^stops)
uniform float uBgSpill;       // spill of the set lights onto the backdrop × gain
uniform vec4 uVeil;           // rgb (linear), amount: haze lit by light 0 (the backlight)
uniform float uExposure;
uniform int uShadowSteps;
uniform float uVignette;

const vec3 BOUND_C = ${v3(BOUND.c)};
const float BOUND_R = ${fx(BOUND.r)};
const float BACK_Z = ${fx(BACKDROP.z)};
const float BACK_ALBEDO = ${fx(BACKDROP.albedo)};
const vec2 POOL_C = vec2(${fx(BACKDROP.pool[0])}, ${fx(BACKDROP.pool[1])});
const float POOL_S = ${fx(BACKDROP.poolSigma)};
const float ALBEDO = ${fx(PLASTER_ALBEDO)};
const float VEIL_GAIN = ${fx(VEIL_GAIN)};
${COMMON}
${mapGLSL(model)}

vec2 sphereHit(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r * r; float h = b * b - cc;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}

vec3 calcNormal(vec3 p) {
  const float e = 5e-4; const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.004 + 0.036 * float(i) / 4.0;
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.8;
  }
  return clamp(1.0 - 8.0 * occ, 0.0, 1.0);
}

// iq's improved soft shadow; k larger = harder edge.
float gJitter = 0.0;   // per-pixel hash in [0, 1): turns step banding in wide penumbrae into fine grain
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin + gJitter * 0.006, ph = 1e10;
  for (int i = 0; i < 40; i++) {
    if (i >= uShadowSteps) break;
    float h = map(ro + rd * t);
    // iq's improved estimate assumes the field shrinks from step to step; where it grows (leaving the
    // head's bounding sphere, or past a smooth blend) fall back to the classic h/t, or it reads a
    // false occluder and leaves black specks.
    float y = h < ph ? h * h / (2.0 * ph) : 0.0;
    float d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, k * d / max(0.0, t - y));
    ph = h;
    t += clamp(h, 0.003, 0.03);
    if (res < 0.002 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

vec3 shadeBust(vec3 p) {
  vec3 n = calcNormal(p);
  float ao = calcAO(p, n);
  vec3 sum = uAmbient * ao;
  for (int i = 0; i < 3; i++) {
    vec3 c = uLCol[i];
    if (max(c.r, max(c.g, c.b)) < 1e-5) continue;
    vec3 lv = uLPos[i] - p; float dist = length(lv); vec3 l = lv / dist;
    float w = uLWrap[i];
    float nl = dot(n, l);
    float ndl = (nl + w) / (1.0 + w);
    if (ndl <= 0.0) continue;
    // The wrap (an area source reaching a little past the terminator) must not reach into creases:
    // there the shadow ray starts beyond the crease's far wall and would leak a bright line.
    if (nl < 0.0) ndl *= ao * ao;
    vec2 sb = sphereHit(p, l, BOUND_C, BOUND_R);
    float tmax = min(dist, max(sb.y, 0.0));
    float sh = softShadow(p + n * 0.003, l, 0.003, tmax, uLK[i]);
    float fall = (uLD[i] * uLD[i]) / (dist * dist);
    sum += c * ndl * sh * fall * mix(1.0, ao, uLAO[i]);
  }
  return ALBEDO * sum;
}

vec3 shadeBackdrop(vec3 ro, vec3 rd) {
  float t = (BACK_Z - ro.z) / rd.z;
  vec3 p = ro + rd * t;
  vec3 spill = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 c = uLCol[i];
    if (max(c.r, max(c.g, c.b)) < 1e-5) continue;
    vec3 lv = uLPos[i] - p; float dist = length(lv); vec3 l = lv / dist;
    float ndl = max(l.z, 0.0);
    float emit = smoothstep(0.0, 0.25, dot(uLAim[i], -l));   // one-sided source facing the head
    spill += c * ndl * emit * (uLD[i] * uLD[i]) / (dist * dist);
  }
  vec2 dp = p.xy - POOL_C;
  float pool = 0.25 + 0.75 * exp(-dot(dp, dp) / (2.0 * POOL_S * POOL_S));
  return BACK_ALBEDO * (uBgCol * pool + uBgSpill * spill + uAmbient);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 x) {
  return mix(12.92 * x, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}

float hash12(uvec2 c) {
  uint h = c.x * 1973u + c.y * 9277u + 26699u;
  h = (h ^ (h >> 13u)) * 0x5bd1e995u; h ^= h >> 15u;
  return float(h & 0xffffu) / 65536.0;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  gJitter = hash12(uvec2(gl_FragCoord.xy) + uvec2(7u, 131u));
  vec3 ro = uCamPos;
  vec3 rd = normalize(uFwd + ndc.x * uTan.x * uRight + ndc.y * uTan.y * uUp);

  vec3 col;
  bool hit = false;
  float t = 0.0;
  vec2 tb = sphereHit(ro, rd, BOUND_C, BOUND_R);
  if (tb.y > 0.0) {
    t = max(tb.x, 0.0);
    for (int i = 0; i < 96; i++) {
      float d = map(ro + rd * t);
      if (d < 4e-4 * t) { hit = true; break; }
      t += 0.9 * d;
      if (t > tb.y) break;
    }
  }
  col = hit ? shadeBust(ro + rd * t) : shadeBackdrop(ro, rd);

  // Veil (#097): a thin haze between the lens and the backdrop scatters the source behind the head
  // toward the camera (Henyey-Greenstein, forward). Added in linear light, so it lifts the frame
  // into a warm glow strongest toward the source, rather than greying it; the bust sits in front of
  // most of the haze, so it takes less of it (in-scatter ∝ path length).
  if (uVeil.a > 0.0) {
    vec3 sd = normalize(uLPos[0] - ro);
    const float G = 0.85;
    float ph = (1.0 - G * G) / pow(1.0 + G * G - 2.0 * G * dot(rd, sd), 1.5);
    float phMax = (1.0 + G) / ((1.0 - G) * (1.0 - G));
    float path = hit ? t / ((BACK_Z - ro.z) / rd.z) : 1.0;
    col += uVeil.rgb * uVeil.a * VEIL_GAIN * path * (0.08 + 0.92 * ph / phMax);
  }

  // Gentle natural falloff toward the corners (cos⁴-like), no stylised vignette.
  float r2 = dot(ndc * vec2(0.8, 1.0), ndc * vec2(0.8, 1.0));
  col *= 1.0 - uVignette * r2 * r2;

  vec3 enc = srgb(aces(col * uExposure));

  // Hash dither, ±0.5/255, from pixel coordinates (no time term: a held frame stays identical).
  enc += (hash12(uvec2(gl_FragCoord.xy)) - 0.5) / 255.0;
  outColor = vec4(enc, 1.0);
}`;
}

/** Composite: upsample the scene target (bilinear) and lay the premultiplied slate overlay on top. */
export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uOverlay;
uniform float uOverlayOn;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec4 o = texture(uOverlay, vUv) * uOverlayOn;
  outColor = vec4(c * (1.0 - o.a) + o.rgb, 1.0);
}`;
