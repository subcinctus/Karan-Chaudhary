// Motion Prompt #105 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#105
// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
//
// Focus study: a night exterior on a rooftop terrace, seen through a real lens.
// Numbers only from Motion Prompt (rebuilt, no code ported):
//   #105 Bokeh: f/16 → f/1.4 over 0.4–1.4 s (cubic in-out); disc opacity 100 % → 55 % as the iris
//        opens; practical lamps #FFC75A, distant lights #FFE3A3; a 1.2 px amber rim.
//   #033 Rack focus: a 1.6 s pull, cubic in-out, with corner brackets travelling between subjects.
//
// Optics are core/optics.js (thin lens, all mm): H = f²/(N·c) + f, near/far limits, blur disc
// b = f²·|d − s| / (N·d·(s − f)), projection with the frame width showing the full gate width.
//
// Scene (metric, camera 1.6 m high and level, WB 4300 K):
//   A 1.2 m  insert slate on a C-stand arm
//   B 3 m    actor stand-in, 1.75 m tall
//   C 7 m    practical floor lamp with a glowing drum shade (2900 K)
//   D 18 m   parapet + festoon string: 40 bulbs on a catenary (2700 K)
//   E 60 m   city facades with lit windows, distant street lights, sky
//
// Render, back to front. Each extended plane is drawn as vector shapes (in metres) into its own
// layer at the current projection; layers are rebuilt only when the size, format, focal length or
// seed change. Each layer is composited with a Gaussian blur σ = b_px / 4 (core/canvas blurLayer,
// pyramid fallback without ctx.filter). Point sources of that plane follow as n-gon bokeh
// (core/canvas nGonPath) composited 'lighter': diameter max(b_px, source size), energy-conserving
// alpha E·(2/d)² computed in linear light and encoded to sRGB, blade curvature that rounds the
// polygon within 1.5 stops of wide open, and cat's-eye clipping toward the frame centre.

import { P, eIO, clamp, lerp, smoothstep } from '../core/time.js';
import { loadFonts, nGonPath, blurLayer, makeCanvas } from '../core/canvas.js';
import { kelvinChip, mixHex, hexToRgb, srgbEncode } from '../core/color.js';
import { mulberry32 } from '../core/prng.js';
import { grainTiles, grainIndex, drawGrain } from '../core/grain.js';
import {
  FORMATS, DEFAULT_FORMAT, PRIMES, STOPS, FOCUS_RANGE, hyperfocal, nearLimit, farLimit, blurDisc,
  mmToPx, blurSigma, project, stopsBetween, nearestStop, formatDistance, M_TO_FT,
} from '../core/optics.js';

const TAU = Math.PI * 2;
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Camera: height (m) and white balance (K). */
export const CAM_H = 1.6;
export const WB = 4300;

/** Focus slider: log ring 0.45 m → 30 m, then an ∞ detent (any value ≥ FOCUS_INF reads as ∞). */
export const FOCUS_INF = 31;
export const FOCUS_SLIDER_MAX = 40;
export const isInfinity = s => !Number.isFinite(s) || s >= FOCUS_INF;

/** Lens-ring engravings for the focus slider and the ruler, per unit. */
export const RING_MARKS = {
  m: [0.5, 0.75, 1, 1.5, 2, 3, 5, 10, Infinity],
  ft: [2, 3, 4, 5, 7, 10, 15, 25, 50, Infinity].map(ft => (Number.isFinite(ft) ? ft / M_TO_FT : ft)),
};

/** The five subject planes. `anchor` is the world point (m) the focus brackets frame. */
export const SUBJECTS = [
  { id: 'A', key: 'slate', name: 'Slate', label: 'Slate on a C-stand arm', d: 1.2, anchor: [-0.215, 1.585] },
  { id: 'B', key: 'actor', name: 'Actor', label: 'Actor stand-in', d: 3, anchor: [0.225, 1.63] },
  { id: 'C', key: 'lamp', name: 'Lamp', label: 'Practical lamp', d: 7, anchor: [-0.55, 1.56] },
  { id: 'D', key: 'festoon', name: 'Festoon', label: 'Festoon string lights', d: 18, anchor: [0.6, 2.75] },
  { id: 'E', key: 'city', name: 'City', label: 'City windows', d: 60, anchor: [-2.5, 4.4] },
];

const fmtLabel = { s16: 'S16', s35: 'S35', ff: 'FF' };
const nominal = s => Number(s.label.slice(2));

/**
 * f-number used for the maths: the nominal marking when the value sits on a third-stop detent
 * (f/2.8, as a DP's calculator uses it), otherwise the exact continuous value (scripted iris pulls).
 */
export function effectiveN(N) {
  const s = nearestStop(N);
  return Math.abs(Math.log(N / s.N)) < 0.004 ? nominal(s) : N;
}

/** Optics for a params object: lens, DoF limits (mm) and per-subject blur discs. */
export function lensState(p = {}) {
  const fmt = FORMATS[p.format] ?? FORMATS[DEFAULT_FORMAT];
  const f = p.focal ?? 50, N = effectiveN(p.stop ?? 2.8), c = fmt.coc;
  const inf = isInfinity(p.focus ?? 3);
  const s = inf ? Infinity : Math.max(FOCUS_RANGE.min, p.focus ?? 3) * 1000;
  const sEff = inf ? 1e9 : s;   // focus at ∞ as a very distant plane: b → f²/(N·d)
  const H = hyperfocal(f, N, c);
  const near = inf ? H - f : nearLimit(s, f, H);
  const far = inf ? Infinity : farLimit(s, f, H);
  const subjects = SUBJECTS.map(o => {
    const b = blurDisc(f, N, sEff, o.d * 1000);
    return { ...o, b, ratio: b / c, sharp: b <= c };
  });
  return { fmt, f, N, stop: nearestStop(N), c, s, inf, H, near, far, total: far - near, subjects };
}

/**
 * Distance for readouts: core/optics formatDistance, plus inches under a foot and whole feet past
 * 100 ft ("0.6 in", "235 ft") so small depths of field never read "0 ft 0 in".
 */
export function formatDist(m, units = 'm') {
  if (!Number.isFinite(m)) return '∞';
  if (units === 'ft') {
    const ft = m * M_TO_FT;
    if (ft < 1) return `${(ft * 12).toFixed(1)} in`;
    if (ft >= 100) return `${Math.round(ft)} ft`;
  }
  return formatDistance(m, units);
}

/** Readout strings ("Near 2.77 m · Far 3.27 m · DoF 0.50 m · Hyperfocal 35.8 m"). */
export function readout(p = {}) {
  const L = lensState(p), u = p.units === 'ft' ? 'ft' : 'm';
  const d = mm => formatDist(mm / 1000, u);
  const r = {
    focus: L.inf ? '∞' : d(L.s), near: d(L.near), far: Number.isFinite(L.far) ? d(L.far) : '∞',
    dof: Number.isFinite(L.total) ? d(L.total) : '∞', hyperfocal: d(L.H),
    stop: L.stop.label, focal: `${L.f} mm`, format: fmtLabel[L.fmt.id] ?? L.fmt.id,
  };
  r.line = `Near ${r.near} · Far ${r.far} · DoF ${r.dof} · Hyperfocal ${r.hyperfocal}`;
  return { ...r, lens: L };
}

const spokenDistance = (m, units) => {
  if (isInfinity(m)) return 'infinity';
  if (units === 'ft') return formatDist(m, 'ft').replace(' ft', ' feet').replace(' in', ' inches').replace(/\b1 feet/, '1 foot').replace(/\b1 inches/, '1 inch').replace(/^1\.0 inches/, '1 inch');
  return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)} metres`;
};

export const meta = {
  id: 'focus',
  title: 'Focus',
  context: '2d',
  duration: 12,
  loop: true,
  posterTime: 5.5,
  aspect: { wide: 2.39, tall: 4 / 3 },
  interactive: true,
  budgetMs: 10,
  fonts: [`500 12px ${MONO}`, `400 12px ${MONO}`],
  params: [
    { key: 'format', label: 'Format', type: 'radio', value: DEFAULT_FORMAT, group: 'Camera',
      options: [{ value: 's16', label: 'S16' }, { value: 's35', label: 'S35' }, { value: 'ff', label: 'FF' }],
      hint: 'Gate width and circle of confusion: S16 0.015 mm, S35 0.025 mm, FF 0.030 mm.' },
    { key: 'focal', label: 'Focal length', type: 'range', values: PRIMES, value: 50, group: 'Lens',
      format: v => `${Math.round(v)} mm`, spoken: v => `${Math.round(v)} millimetre prime` },
    { key: 'stop', label: 'Aperture', type: 'range', values: STOPS.map(s => s.N), value: STOPS.find(s => s.label === 'f/2.8').N,
      group: 'Lens', format: v => nearestStop(v).label, spoken: v => nearestStop(v).label,
      hint: 'Third stops, f/1.4 to f/22.' },
    { key: 'focus', label: 'Focus distance', type: 'range', scale: 'log', min: FOCUS_RANGE.min, max: FOCUS_SLIDER_MAX,
      value: 3, group: 'Lens',
      format: (v, p) => (isInfinity(v) ? '∞' : formatDist(v, p?.units === 'ft' ? 'ft' : 'm')),
      spoken: (v, p) => spokenDistance(v, p?.units) },
    { key: 'blades', label: 'Iris blades', type: 'radio', value: 9, group: 'Lens',
      options: [5, 6, 7, 8, 9, 11].map(n => ({ value: n, label: String(n) })).concat([{ value: 0, label: 'Round' }]) },
    { key: 'units', label: 'Units', type: 'radio', value: 'm', group: 'Readout',
      options: [{ value: 'm', label: 'Metres' }, { value: 'ft', label: 'Feet' }] },
  ],
  record: { w: 1920, h: 804, fps: 30, subframes: 1, tune: 'film' },
  credits: ['#105 Bokeh', '#033 Rack focus'],
};

// --- Scripted demo ------------------------------------------------------------------------------

const F16 = 16, F14 = STOPS[0].N;
const logLerp = (a, b, u) => a * Math.pow(b / a, u);

/** Pure 12 s demo: open up (#105), rack A → B (#033 timing), B → C, then return to the start. */
export function demoParams(t) {
  const open = eIO(P(t, 0.4, 1.4)), back = eIO(P(t, 10, 12));
  const r1 = eIO(P(t, 3.0, 4.6)), r2 = eIO(P(t, 6.5, 8.1));
  const ls = Math.log(1.2) + r1 * Math.log(3 / 1.2) + r2 * Math.log(7 / 3);
  return {
    stop: logLerp(F16, F14, open * (1 - back)),
    focus: Math.exp(lerp(ls, Math.log(1.2), back)),
  };
}

// --- Scene description (world metres; built once per seed) ---------------------------------------

/** Catmull-Rom through points → cubic Béziers (a smooth outline from a short point list). */
function smoothPath(k, pts, closed = true) {
  const n = pts.length;
  k.beginPath();
  k.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    k.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) k.closePath();
}

// Actor stand-in, three-quarter toward camera-left (toward the lamp). Offsets from x = 0.27 m.
const ACTOR_X = 0.27;
const ACTOR = [
  [-0.305, 0.45], [-0.303, 0.95], [-0.293, 1.22], [-0.268, 1.338], [-0.222, 1.39], [-0.16, 1.417],
  [-0.10, 1.432], [-0.062, 1.446], [-0.049, 1.474], [-0.053, 1.503], [-0.066, 1.521], [-0.078, 1.531],
  [-0.083, 1.543], [-0.081, 1.553], [-0.0785, 1.559], [-0.0825, 1.567], [-0.083, 1.577], [-0.088, 1.583],
  [-0.0965, 1.590], [-0.093, 1.600], [-0.0865, 1.615], [-0.0815, 1.628], [-0.085, 1.641], [-0.0845, 1.66],
  [-0.079, 1.688], [-0.071, 1.708], [-0.068, 1.73], [-0.045, 1.756], [-0.005, 1.769], [0.04, 1.766],
  [0.078, 1.746], [0.102, 1.708], [0.109, 1.66], [0.103, 1.615], [0.088, 1.578], [0.07, 1.55],
  [0.057, 1.52], [0.053, 1.49], [0.076, 1.46],
  [0.13, 1.44], [0.19, 1.418], [0.236, 1.39], [0.268, 1.34], [0.285, 1.25], [0.295, 1.0], [0.3, 0.45],
  [0.0, 0.43],
].map(([x, y]) => [x + ACTOR_X, y]);

function buildScene(seed) {
  const rnd = mulberry32((seed >>> 0) * 2654435761 + 105);
  // E: facades across the plaza. Hand-placed massing so wider lenses find sky in the gaps.
  const blocks = [
    [-95, -62, 34], [-62, -41, 15], [-41, -27, 26], [-27, -14.5, 9.5], [-14.5, -3.5, 31],
    [-3.5, 4.5, 7.2], [4.5, 17, 19], [17, 26, 40], [26, 40, 12], [40, 58, 23], [58, 95, 30],
  ];
  const warm = [2400, 2700, 2700, 2900, 3000, 3000, 3200, 3400];
  const cool = [4000, 4600, 5200, 6000];
  const buildings = blocks.map(([x0, x1, h], i) => {
    const tone = 0.75 + rnd() * 0.5, bay = 2.0 + rnd() * 0.7, floor = 3.0 + rnd() * 0.4;
    const ww = 0.8 + rnd() * 0.3, wh = 1.15 + rnd() * 0.35;
    const windows = [];
    const officeFloor = rnd() < 0.4 ? Math.floor(rnd() * 3) : -1;
    for (let fy = 0, y = 4.0; y + wh < h - 0.6; fy++, y += floor) {
      for (let x = x0 + 0.8; x + ww < x1 - 0.6; x += bay) {
        const office = fy === officeFloor;
        if (!(office ? rnd() < 0.8 : rnd() < 0.42)) continue;
        const K = office ? cool[Math.floor(rnd() * cool.length)] : rnd() < 0.82 ? warm[Math.floor(rnd() * warm.length)] : cool[Math.floor(rnd() * cool.length)];
        windows.push({ x, y, w: ww, h: wh, K, a: (office ? 0.22 : 0.16) + rnd() * 0.42, blind: rnd() < 0.35 ? 0.2 + rnd() * 0.6 : 0 });
      }
    }
    // Ground floor: shopfronts, warm interiors behind dark mullions, a soft fascia above.
    const shops = [];
    for (let x = x0 + 0.6; x < x1 - 2; ) {
      const w = Math.min(x1 - 0.6 - x, 2.6 + rnd() * 3.4);
      if (w > 1.6 && rnd() < 0.7) shops.push({ x, w, K: rnd() < 0.8 ? warm[Math.floor(rnd() * warm.length)] : cool[Math.floor(rnd() * cool.length)], a: 0.2 + rnd() * 0.3, mull: 1.1 + rnd() * 0.6 });
      x += w + 0.5 + rnd() * 1.2;
    }
    return { x0, x1, h, tone, windows, shops, edge: i % 2 === 0 };
  });
  // E point sources: street, sign and car lights across the plaza (#105's "distant lights").
  const distant = [];
  for (let i = 0; i < 46; i++) {
    const x = -66 + i * 2.9 + rnd() * 2.0;
    const low = rnd() < 0.55;
    const y = low ? 0.4 + rnd() * 1.6 : 2.2 + rnd() * 6.2;
    const K = low ? [2000, 2200, 2700, 4000, 5000][Math.floor(rnd() * 5)] : [2700, 3000, 3200, 4300, 5600][Math.floor(rnd() * 5)];
    distant.push({ x, y, d: 60, K, E: 22 + rnd() * 40, size: 0.1, warm: K < 3500 });
  }
  // Keep the profile clean: no street light sits right behind the actor's face (at 60 m that is
  // X ≈ 1.6…6.5 m, Y ≈ −2…6 m), where a sharp one would read as a highlight on the lips or nose.
  for (let i = distant.length - 1; i >= 0; i--) {
    const s = distant[i];
    if (s.x > 1.6 && s.x < 6.5 && s.y > -2 && s.y < 6) distant.splice(i, 1);
  }
  // Traffic far across the plaza: a few tail-light and headlight pairs, low.
  for (const [x, red] of [[-23.5, true], [-6.2, false], [7.8, true], [16.4, true], [31, false]]) {
    for (const dx of [0, 1.45]) distant.push({ x: x + dx, y: 0.75, d: 60, K: red ? 0 : 3600, red, E: red ? 26 : 12, size: 0.09, warm: false });
  }
  // D: festoon string, 40 bulbs (2700 K, 5 cm globes hanging 7 cm below) on two catenary swags.
  const poles = [[-12.6, 3.12], [-3.3, 3.04], [9.6, 3.1]];
  const spans = [];
  for (let i = 0; i < poles.length - 1; i++) {
    const [X1, Y1] = poles[i], [X2, Y2] = poles[i + 1];
    const sag = 0.58 + 0.08 * i;
    const a = ((X2 - X1) ** 2) / (8 * sag);
    // Solve for the vertex so the curve passes through both pole tops: y = ym + a(cosh((x−xm)/a) − 1).
    let xm = (X1 + X2) / 2;
    for (let it = 0; it < 30; it++) {
      const f = a * (Math.cosh((X2 - xm) / a) - Math.cosh((X1 - xm) / a)) - (Y2 - Y1);
      const df = -(Math.sinh((X2 - xm) / a) - Math.sinh((X1 - xm) / a));
      xm -= f / df;
    }
    const ym = Y1 - a * (Math.cosh((X1 - xm) / a) - 1);
    spans.push({ X1, X2, y: x => ym + a * (Math.cosh((x - xm) / a) - 1) });
  }
  const wireY = x => (spans.find(s => x <= s.X2) ?? spans[spans.length - 1]).y(x);
  const X0 = poles[0][0], XN = poles[poles.length - 1][0];
  const bulbs = [];
  for (let i = 0; i < 40; i++) {
    const x = lerp(X0, XN, (i + 0.5) / 40);
    const dead = i === 27;   // one bulb out: it happens on every set
    bulbs.push({ x, y: wireY(x) - 0.07, d: 18, K: 2700 + Math.round((rnd() - 0.5) * 160), E: dead ? 0 : 150 + rnd() * 50, size: 0.05 });
  }
  return { buildings, distant, bulbs, wire: { poles, wireY, X0, XN } };
}

// --- Piece ------------------------------------------------------------------------------------

export async function create(canvas, opts) {
  const main = canvas.getContext('2d');
  // The optical frame (planes + bokeh) is drawn into `base`, then blitted 1:1 to the canvas; grain,
  // brackets and the report go on top. `base` is reused while its inputs (size, lens, stop, focus,
  // blades, dpr) are unchanged, so held frames of the demo cost one blit. Every frame takes the same
  // path (draw into base → blit), so a cache hit can never change a pixel.
  const base = { c: null, k: null, key: null };
  let ctx = main;
  let dpr = opts.dpr, layout = opts.layout ?? 'wide';
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);
  const scene = buildScene(seed);
  const tiles = grainTiles(4, 160, seed, { maxAlpha: 0.2 });

  // Colours: Kelvin through core/color at the camera WB, nudged toward #105's look.
  const chip = K => kelvinChip(K, WB);
  const BULB = mixHex(chip(2700), '#FFA94D', 0.5);        // festoon amber
  const LAMP_C = mixHex(chip(2900), '#FFC75A', 0.35);     // #105 lamps
  const FAR_WARM = '#FFE3A3';                             // #105 distant lights
  const RIM = '#FFC75A';
  const TAIL = '#FF4A3D';
  const distantSrc = scene.distant.map(s => ({ ...s, color: s.red ? TAIL : s.warm ? mixHex(chip(s.K), FAR_WARM, 0.4) : chip(s.K) }));
  const bulbSrc = scene.bulbs.map(s => ({ ...s, color: mixHex(chip(s.K), BULB, 0.7), warm: true }));
  const lampSrc = { x: -0.55, y: 1.56, d: 7, size: 0, E: 260, color: LAMP_C, warm: true, gain: 0 };

  // Layers: one per extended plane, cropped to its content plus a margin (so blurred edges sample
  // real content, not transparency, and transparent areas are not blurred at all).
  const layers = { E: null, D: null, C: null, B: null, A: null };
  const small = { rim: null };   // per-instance scratch targets
  let layerKey = '', margin = 0;

  function geom(p) {
    const fmt = FORMATS[p.format] ?? FORMATS[DEFAULT_FORMAT];
    return { PW: canvas.width, PH: canvas.height, fmt, f: p.focal ?? 50, sensorW: fmt.w };
  }
  const scaleAt = (g, d) => project({ X: 0, Y: 0, d }, { f: g.f, sensorW: g.sensorW, W: g.PW, H: g.PH, camH: CAM_H }).scale;
  /** World (m) at distance d → frame px. */
  const toScreen = (g, d, X, Y) => {
    const k = scaleAt(g, d);
    return { x: g.PW / 2 + X * k, y: g.PH / 2 - (Y - CAM_H) * k, k };
  };
  /** Frame-px rectangle of a world box at distance d. */
  const worldRect = (g, d, x0, y0, x1, y1) => {
    const a = toScreen(g, d, x0, y1), b = toScreen(g, d, x1, y0);
    return [a.x, a.y, b.x, b.y];
  };

  /** A layer canvas covering frame rect r (padded by the margin, clamped to the margin box). */
  function makeLayer(id, g, r) {
    const m = margin;
    const x0 = Math.floor(clamp(r[0] - m, -m, g.PW + m)), y0 = Math.floor(clamp(r[1] - m, -m, g.PH + m));
    const x1 = Math.ceil(clamp(r[2] + m, -m, g.PW + m)), y1 = Math.ceil(clamp(r[3] + m, -m, g.PH + m));
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    let L = layers[id];
    if (!L || L.c.width !== w || L.c.height !== h) L = layers[id] = { c: makeCanvas(w, h) };
    L.x = x0; L.y = y0; L.empty = x1 <= x0 || y1 <= y0;
    const k = L.c.getContext('2d');
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1; k.filter = 'none';
    k.clearRect(0, 0, w, h);
    k.translate(-x0, -y0);   // draw in frame px
    return k;
  }
  /** Set a world transform (metres, Y up) for plane d on a context already in frame px. */
  const world = (k, g, d, dx = 0, dy = 0) => {
    const s = scaleAt(g, d);
    k.transform(s, 0, 0, -s, g.PW / 2 + dx * s, g.PH / 2 + CAM_H * s + dy * s);
    return s;
  };

  function ensureLayers(p) {
    const g = geom(p);
    const key = `${g.PW}x${g.PH}:${g.fmt.id}:${g.f}:${layout}`;
    if (key === layerKey) return g;
    layerKey = key;
    margin = Math.round(Math.max(g.PW, g.PH) * 0.12);
    const full = [-margin, -margin, g.PW + margin, g.PH + margin];
    drawCity(makeLayer('E', g, full), g);
    drawTerrace(makeLayer('D', g, full), g);
    const yFloor = toScreen(g, 18, 0, 0).y;
    const lampR = worldRect(g, 7, lampSrc.x - 0.45, -0.1, lampSrc.x + 0.45, 1.8);
    const cR = yFloor < g.PH + margin ? [-margin, Math.min(yFloor, lampR[1]), g.PW + margin, g.PH + margin] : lampR;
    drawLamp(makeLayer('C', g, cR), g);
    drawActor(makeLayer('B', g, worldRect(g, 3, ACTOR_X - 0.33, 0.4, ACTOR_X + 0.33, 1.8)), g);
    drawSlate(makeLayer('A', g, worldRect(g, 1.2, -1.05, -0.05, -0.1, 1.65)), g);
    // Mip chain (½, ¼, ⅛), built once per layout: a blur on a smaller copy needs no per-frame downscale.
    for (const L of Object.values(layers)) {
      L.mip ??= {};
      let src = L.c;
      for (const sc of [0.5, 0.25, 0.125]) {
        const w = Math.max(1, Math.ceil(L.c.width * sc)), h = Math.max(1, Math.ceil(L.c.height * sc));
        if (!L.mip[sc] || L.mip[sc].width !== w || L.mip[sc].height !== h) L.mip[sc] = makeCanvas(w, h);
        const k = L.mip[sc].getContext('2d');
        k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, w, h);
        k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
        k.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
        src = L.mip[sc];
      }
    }
    for (const L of Object.values(layers)) for (const B of Object.values(L.blur ?? {})) B.key = null;
    finish.length = 0;
    base.key = null;
    return g;
  }

  // Vignette + grain, composited once per size and grain frame (source-over is associative, so one
  // draw of the pair equals the two draws in order).
  const finish = [];
  function finishLayer(g, i) {
    if (finish[i]) return finish[i];
    const c = makeCanvas(g.PW, g.PH), k = c.getContext('2d');
    const vg = k.createRadialGradient(g.PW / 2, g.PH / 2, Math.min(g.PW, g.PH) * 0.35, g.PW / 2, g.PH / 2, Math.hypot(g.PW, g.PH) * 0.56);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    k.fillStyle = vg; k.fillRect(0, 0, g.PW, g.PH);
    drawGrain(k, tiles[i], 0, 0, g.PW, g.PH, 0.4);
    return (finish[i] = c);
  }

  // E · 60 m: sky, facades, shopfronts, lit windows.
  function drawCity(k, g) {
    const m = margin, s = scaleAt(g, 60);
    const hz = g.PH / 2;   // horizon (camera height, level camera)
    const H = g.PH + 2 * m;
    const sky = k.createLinearGradient(0, -m, 0, g.PH + m);
    const u = y => clamp((y + m) / H);
    sky.addColorStop(0, '#04060B');
    sky.addColorStop(u(hz - 0.45 * H), '#080C14');
    sky.addColorStop(u(hz - 0.05 * H), '#141A25');
    sky.addColorStop(u(hz + 0.04 * H), '#1A1A20');
    sky.addColorStop(1, '#0E0F13');
    k.fillStyle = sky; k.fillRect(-m, -m, g.PW + 2 * m, H);

    k.save();
    world(k, g, 60);
    for (const b of scene.buildings) {
      const base = Math.round(12 + b.tone * 5);
      const wall = k.createLinearGradient(0, 0, 0, b.h);   // street light from below, fading up
      wall.addColorStop(0, `rgb(${base + 9},${base + 6},${base + 5})`);
      wall.addColorStop(0.3, `rgb(${base - 2},${base},${base + 5})`);
      wall.addColorStop(1, `rgb(${base - 4},${base - 2},${base + 3})`);
      k.fillStyle = wall;
      k.fillRect(b.x0, -6, b.x1 - b.x0, b.h + 6);
      if (b.edge) { k.fillStyle = 'rgba(120,130,150,0.08)'; k.fillRect(b.x0, b.h - 0.35, b.x1 - b.x0, 0.35); }
      for (const sh of b.shops) {
        const [r, gg, bb] = hexToRgb(chip(sh.K));
        const glass = k.createLinearGradient(0, 0.25, 0, 2.9);
        glass.addColorStop(0, `rgba(${r},${gg},${bb},${(sh.a * 1.15).toFixed(3)})`);
        glass.addColorStop(1, `rgba(${r},${gg},${bb},${(sh.a * 0.55).toFixed(3)})`);
        k.fillStyle = glass; k.fillRect(sh.x, 0.25, sh.w, 2.65);
        k.fillStyle = 'rgba(10,10,12,0.75)';
        for (let x = sh.x + sh.mull; x < sh.x + sh.w - 0.3; x += sh.mull) k.fillRect(x, 0.25, 0.08, 2.65);
        k.fillStyle = `rgba(${r},${gg},${bb},${(sh.a * 0.35).toFixed(3)})`;
        k.fillRect(sh.x, 3.1, sh.w, 0.45);
      }
    }
    for (const b of scene.buildings) {
      for (const w of b.windows) {
        const [r, gg, bb] = hexToRgb(chip(w.K));
        k.fillStyle = `rgba(${r},${gg},${bb},${w.a.toFixed(3)})`;
        k.fillRect(w.x, w.y, w.w, w.h);
        if (w.blind) {
          k.fillStyle = `rgba(8,9,12,${(0.6 * w.blind).toFixed(3)})`;
          k.fillRect(w.x, w.y + w.h * (1 - w.blind), w.w, w.h * w.blind);
        }
      }
    }
    k.restore();
  }

  // D · 18 m: parapet with the festoon's warm spill, poles and the wire (bulbs are point sources).
  function drawTerrace(k, g) {
    k.save();
    world(k, g, 18);
    const wall = k.createLinearGradient(0, -1, 0, 1.05);
    wall.addColorStop(0, '#08090B'); wall.addColorStop(1, '#141518');
    k.fillStyle = wall; k.fillRect(-90, -9, 180, 10.05);
    const cope = k.createLinearGradient(0, 0.98, 0, 1.1);
    cope.addColorStop(0, '#1E1C1B'); cope.addColorStop(1, '#3B3029');
    k.fillStyle = cope; k.fillRect(-90, 1.0, 180, 0.1);
    for (const b of scene.bulbs) {   // warm spill on the coping under each bulb
      if (!(b.E > 0)) continue;
      const gl = k.createRadialGradient(b.x, 1.08, 0, b.x, 1.08, 0.9);
      gl.addColorStop(0, 'rgba(255,170,90,0.07)'); gl.addColorStop(1, 'rgba(255,170,90,0)');
      k.fillStyle = gl; k.fillRect(b.x - 0.9, 0.2, 1.8, 1.8);
    }
    const { poles, wireY, X0, XN } = scene.wire;
    k.fillStyle = '#0A0B0D';
    for (const [x, y] of poles) k.fillRect(x - 0.035, 1.05, 0.07, y - 1.0);
    k.strokeStyle = 'rgba(14,14,16,0.95)';
    k.lineWidth = 0.014;
    k.beginPath();
    for (let i = 0; i <= 160; i++) { const x = lerp(X0, XN, i / 160); i ? k.lineTo(x, wireY(x)) : k.moveTo(x, wireY(x)); }
    k.stroke();
    k.fillStyle = '#101012';
    for (const b of scene.bulbs) k.fillRect(b.x - 0.011, b.y + 0.025, 0.022, 0.045);
    k.restore();
  }

  // C · 7 m: terrace floor (seen only on wide lenses), floor lamp, glowing shade, light pool.
  function drawLamp(k, g) {
    const m = margin, X = lampSrc.x;
    const yFar = toScreen(g, 18, 0, 0).y;
    if (yFar < g.PH + m) {
      const floor = k.createLinearGradient(0, yFar, 0, g.PH + m);
      floor.addColorStop(0, '#111114'); floor.addColorStop(1, '#070809');
      k.fillStyle = floor; k.fillRect(-m, yFar, g.PW + 2 * m, g.PH + m - yFar);
      const base = toScreen(g, 7, X, 0);
      k.save();
      k.translate(base.x, base.y); k.scale(1, 0.2);
      const pool = k.createRadialGradient(0, 0, 0, 0, 0, 2.2 * base.k);
      pool.addColorStop(0, 'rgba(255,186,110,0.2)'); pool.addColorStop(1, 'rgba(255,186,110,0)');
      k.fillStyle = pool; k.fillRect(-2.4 * base.k, -2.4 * base.k, 4.8 * base.k, 4.8 * base.k);
      k.restore();
    }
    k.save();
    world(k, g, 7);
    k.fillStyle = '#0D0D0F';
    k.beginPath(); k.ellipse(X, 0.02, 0.16, 0.03, 0, 0, TAU); k.fill();
    k.fillRect(X - 0.011, 0, 0.022, 1.44);
    // Shade: a tapered fabric drum lit from inside, brightest low where the bulb sits.
    const yb = 1.43, yt = 1.69, rb = 0.2, rt = 0.165;
    const drum = () => { k.beginPath(); k.moveTo(X - rb, yb); k.lineTo(X + rb, yb); k.lineTo(X + rt, yt); k.lineTo(X - rt, yt); k.closePath(); };
    const shade = k.createLinearGradient(0, yb, 0, yt);
    shade.addColorStop(0, '#FFDDA6'); shade.addColorStop(0.3, '#F7BE78'); shade.addColorStop(1, '#C27A38');
    k.fillStyle = shade; drum(); k.fill();
    const side = k.createLinearGradient(X - rb, 0, X + rb, 0);
    side.addColorStop(0, 'rgba(70,30,8,0.45)'); side.addColorStop(0.42, 'rgba(70,30,8,0)');
    side.addColorStop(0.62, 'rgba(70,30,8,0)'); side.addColorStop(1, 'rgba(70,30,8,0.4)');
    k.fillStyle = side; drum(); k.fill();
    k.fillStyle = 'rgba(90,45,15,0.5)';
    k.fillRect(X - rb, yb, rb * 2, 0.01);
    k.fillRect(X - rt, yt - 0.01, rt * 2, 0.01);
    k.restore();
  }

  // B · 3 m: the actor, mostly in shadow: a cool skyglow fill, a soft warm rim from the lamp.
  function drawActor(k, g) {
    const L = layers.B;
    k.save();
    const s = world(k, g, 3);
    smoothPath(k, ACTOR);
    const body = k.createLinearGradient(0, 1.77, 0, 0.9);
    body.addColorStop(0, '#16171B'); body.addColorStop(0.3, '#121318'); body.addColorStop(1, '#0B0C10');
    k.fillStyle = body; k.fill();
    k.save();
    smoothPath(k, ACTOR); k.clip();
    k.save();   // face plane: a low cool fill from the sky, falling off toward the ear
    k.translate(ACTOR_X - 0.04, 1.625); k.scale(0.75, 1);
    const face = k.createRadialGradient(0, 0, 0, 0, 0, 0.085);
    face.addColorStop(0, 'rgba(78,86,104,0.42)'); face.addColorStop(1, 'rgba(78,86,104,0)');
    k.fillStyle = face; k.fillRect(-0.1, -0.1, 0.2, 0.2);
    k.restore();
    const hair = k.createRadialGradient(ACTOR_X + 0.045, 1.71, 0, ACTOR_X + 0.045, 1.71, 0.085);
    hair.addColorStop(0, 'rgba(3,3,5,0.85)'); hair.addColorStop(0.7, 'rgba(3,3,5,0.6)'); hair.addColorStop(1, 'rgba(3,3,5,0)');
    k.fillStyle = hair; k.fillRect(ACTOR_X - 0.07, 1.56, 0.22, 0.24);
    const collar = k.createRadialGradient(ACTOR_X, 1.43, 0, ACTOR_X, 1.43, 0.07);
    collar.addColorStop(0, 'rgba(0,0,0,0.5)'); collar.addColorStop(1, 'rgba(0,0,0,0)');
    k.fillStyle = collar; k.fillRect(ACTOR_X - 0.08, 1.35, 0.16, 0.16);
    const kick = k.createRadialGradient(ACTOR_X - 0.078, 1.6, 0, ACTOR_X - 0.078, 1.6, 0.03);
    kick.addColorStop(0, 'rgba(230,150,90,0.2)'); kick.addColorStop(1, 'rgba(230,150,90,0)');
    k.fillStyle = kick; k.fillRect(ACTOR_X - 0.12, 1.55, 0.1, 0.1);
    k.restore();
    k.restore();

    // Rim: warm silhouette minus a blurred, offset silhouette → a soft sliver on the edges that face
    // the lamp (camera-left) and the festoons (above), fading down the body.
    const w = L.c.width, h = L.c.height;
    if (!small.rim || small.rim.width !== w || small.rim.height !== h) small.rim = makeCanvas(w, h);
    const r = small.rim.getContext('2d');
    r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.filter = 'none';
    r.clearRect(0, 0, w, h);
    r.translate(-L.x, -L.y);
    r.save(); world(r, g, 3);
    smoothPath(r, ACTOR);
    const warm = r.createLinearGradient(0, 1.77, 0, 0.95);
    warm.addColorStop(0, 'rgba(255,206,150,1)'); warm.addColorStop(0.3, 'rgba(244,170,100,0.9)');
    warm.addColorStop(0.6, 'rgba(220,140,80,0.35)'); warm.addColorStop(1, 'rgba(200,120,70,0)');
    r.fillStyle = warm; r.fill();
    r.restore();
    r.globalCompositeOperation = 'destination-out';
    r.filter = `blur(${Math.max(0.5, 0.0022 * s).toFixed(2)}px)`;
    r.save(); world(r, g, 3, 0.0042, -0.0026);
    smoothPath(r, ACTOR); r.fillStyle = '#000'; r.fill();
    r.restore();
    r.filter = 'none'; r.globalCompositeOperation = 'source-over';
    k.save();
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-atop';
    k.globalAlpha = 0.85;
    k.drawImage(small.rim, 0, 0);
    k.restore();
  }

  // A · 1.2 m: insert slate on a C-stand arm, lower left, in shadow.
  function drawSlate(k, g) {
    const X = -0.232, Yb = 1.4, w = 0.205, hb = 0.165, hs = 0.034;
    const x0 = X - w / 2;
    k.save();
    world(k, g, 1.2);
    // C-stand: riser and legs on the deck, gobo arm angled up to a knuckle behind the slate.
    const kx = X + 0.02, ky = Yb + 0.012, ang = 0.5, len = 0.7;
    const ax = kx - len * Math.cos(ang), ay = ky - len * Math.sin(ang);
    k.fillStyle = '#26282D';
    k.fillRect(ax - 0.011, 0, 0.022, ay + 0.03);
    k.strokeStyle = '#26282D'; k.lineWidth = 0.014;
    k.beginPath(); k.moveTo(ax, 0.3); k.lineTo(ax - 0.28, 0.0); k.moveTo(ax, 0.3); k.lineTo(ax + 0.22, 0.0); k.moveTo(ax, 0.3); k.lineTo(ax + 0.05, 0.0); k.stroke();
    k.save(); k.translate(kx, ky); k.rotate(ang); k.fillStyle = '#1E2024'; k.fillRect(-len - 0.03, -0.008, len + 0.03, 0.016); k.restore();
    k.fillStyle = '#1B1C20';
    k.beginPath(); k.arc(kx, ky, 0.018, 0, TAU); k.fill();
    k.beginPath(); k.arc(ax, ay, 0.02, 0, TAU); k.fill();
    k.fillStyle = '#131417'; k.fillRect(x0, Yb, w, hb);   // board
    k.fillStyle = '#202227'; k.fillRect(x0, Yb, w, 0.004); k.fillRect(x0, Yb + hb - 0.004, w, 0.004);
    k.fillStyle = 'rgba(160,154,144,0.28)';
    for (const fy of [0.56, 0.8]) k.fillRect(x0 + 0.008, Yb + hb * fy, w - 0.016, 0.0015);
    k.fillRect(x0 + 0.122, Yb + hb * 0.3, 0.0015, hb * 0.26);
    // Sticks: two hinged bars with 45° stripes, the top one opened a few degrees.
    const sticks = (yy, ang) => {
      k.save();
      k.translate(x0, yy); k.rotate(ang);
      k.fillStyle = '#0D0E10'; k.fillRect(0, 0, w, hs / 2);
      k.beginPath(); k.rect(0, 0, w, hs / 2); k.clip();
      k.fillStyle = '#4A4640';
      for (let i = -2; i < 12; i++) {
        const sx = i * 0.034;
        k.beginPath(); k.moveTo(sx, 0); k.lineTo(sx + 0.017, 0); k.lineTo(sx + 0.017 + hs / 2, hs / 2); k.lineTo(sx + hs / 2, hs / 2); k.closePath(); k.fill();
      }
      k.restore();
    };
    sticks(Yb + hb, 0);
    sticks(Yb + hb + hs / 2 + 0.002, 0.07);
    const text = (str, x, y, size, alpha, weight = 500) => {
      k.save();
      k.translate(x, y); k.scale(1 / 1000, -1 / 1000);
      k.font = `${weight} ${size * 1000}px ${MONO}`;
      k.fillStyle = `rgba(206,199,187,${alpha})`;
      k.textBaseline = 'alphabetic';
      k.fillText(str, 0, 0);
      k.restore();
    };
    // Text starts well inside the frame edge at 50 mm (the board's left end is out of shot), so the
    // slate reads cleanly when it is pulled sharp.
    const tx = x0 + 0.074;
    text('FOCUS STUDY', tx, Yb + hb * 0.85, 0.0115, 0.5);
    text('DP K. CHAUDHARY', tx, Yb + hb * 0.66, 0.0082, 0.38, 400);
    text('A012', tx, Yb + hb * 0.4, 0.011, 0.45);
    text('4 · 2', x0 + 0.13, Yb + hb * 0.4, 0.011, 0.45);
    k.restore();
  }

  // --- Bokeh ------------------------------------------------------------------------------

  /**
   * One point source: n-gon of diameter max(b, size), energy-conserving alpha in linear light,
   * curvature toward round near wide open, cat's-eye clip toward the frame centre.
   */
  function bokeh(g, src, bPx, look) {
    if (!(src.E > 0) || src.gain === 0) return;
    const pt = toScreen(g, src.d, src.x, src.y);
    const sizePx = src.size * pt.k;
    const minPx = 1.4 * dpr;
    const dPx = Math.max(bPx, sizePx, minPx);
    const r = dPx / 2;
    if (pt.x < -r || pt.x > g.PW + r || pt.y < -r || pt.y > g.PH + r) return;
    const dRef = (dPx * 1000) / g.PW;                      // resolution-independent diameter
    const dens = src.E * (2 / Math.max(dRef, 2)) ** 2;     // linear-light energy per unit area
    const gain = (src.gain ?? 1) * look.opacity;
    const alpha = clamp(srgbEncode(Math.min(1, dens)), 0.02, 1) * gain;
    const defocus = smoothstep(1.1, 2.6, bPx / Math.max(sizePx, minPx));   // 0 sharp → 1 a real disc
    // Cat's-eye: the barrel clips the disc from the side away from the centre. Offset 0.6·r_norm·(b/2),
    // fading out as the iris closes (mechanical vignetting needs a wide aperture).
    const cx = g.PW / 2, cy = g.PH / 2, vx = cx - pt.x, vy = cy - pt.y, dist = Math.hypot(vx, vy) || 1;
    const off = 0.6 * (dist / Math.hypot(cx, cy)) * r * look.vignetting * defocus;
    ctx.save();
    if (off > 0.75 && r > 2.5) {
      ctx.beginPath(); ctx.arc(pt.x + (vx / dist) * off, pt.y + (vy / dist) * off, r, 0, TAU); ctx.clip();
    }
    nGonPath(ctx, pt.x, pt.y, r, defocus > 0.05 ? look.blades : 0, look.rot, look.curvature);
    ctx.globalAlpha = alpha; ctx.fillStyle = src.color; ctx.fill();
    if (dens > 1) {   // overexposed: clipped highlights desaturate toward white
      ctx.globalAlpha = Math.min(0.5, (dens - 1) * 0.12) * gain;
      ctx.fillStyle = '#FFF0D8'; ctx.fill();
    }
    if (defocus > 0.3 && r > 3) {   // #105: a 1.2 px amber rim (the bright edge of spherical aberration)
      ctx.globalAlpha = Math.min(1, alpha * 0.8) * defocus;
      ctx.strokeStyle = src.warm ? RIM : src.color;
      ctx.lineWidth = 1.2 * dpr; ctx.stroke();
    }
    ctx.restore();
  }

  function drawPoints(g, L, list, look) {
    const sEff = L.inf ? 1e9 : L.s;
    for (const src of list) bokeh(g, src, mmToPx(blurDisc(L.f, L.N, sEff, src.d * 1000), g.PW, g.sensorW), look);
  }

  /**
   * Composite a plane layer blurred by σ (px) with core/canvas blurLayer. Under 0.4 px it is drawn
   * as is; above 1.2 px it is blurred into a ½ (σ > 5: ¼, σ > 14: ⅛) size target and scaled back
   * up — the same to the eye at that blur (σ stays ≥ 0.6 px in the small target), and 4–64× less
   * work on a CPU rasteriser.
   */
  function drawPlane(id, sigmaIn) {
    const L = layers[id];
    if (!L || L.empty) return;
    const LW = L.c.width, LH = L.c.height;
    if (sigmaIn < 0.4) { ctx.drawImage(L.c, L.x, L.y); return; }
    // σ is quantised to 1 % before use, so the frame is a pure function of the quantised value and
    // the per-plane cache below (hit while a plane's blur holds) never changes a pixel.
    const sigma = Math.exp(Math.round(Math.log(sigmaIn) * 100) / 100);
    const sc = sigma > 14 ? 0.125 : sigma > 5 ? 0.25 : sigma > 1.2 ? 0.5 : 1;
    const src = sc === 1 ? L.c : L.mip[sc], w = src.width, h = src.height;
    // One exactly-sized target per scale: a larger, reused canvas would let the upscale's bilinear
    // taps read blur that bled past the edge, making pixels depend on what was drawn before.
    L.blur ??= {};
    let B = L.blur[sc];
    if (!B || B.c.width !== w || B.c.height !== h) B = L.blur[sc] = { c: makeCanvas(w, h), key: null };
    if (B.key !== sigma) {
      const k = B.c.getContext('2d');
      k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over'; k.globalAlpha = 1;
      k.clearRect(0, 0, w, h);
      blurLayer(k, src, sigma * (w / LW), 0, 0, w, h);
      B.key = sigma;
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(B.c, 0, 0, w, h, L.x, L.y, LW, LH);
  }

  // --- HUD ------------------------------------------------------------------------------

  function hud(g, L, p) {
    const R = readout(p), Wc = g.PW / dpr, narrow = Wc < 620;
    const fs = Math.round(clamp(Wc * 0.0094, 10, 12.5) * dpr);
    const pad = Math.round(clamp(Wc * 0.022, 12, 26) * dpr);
    const lh = Math.round(fs * 1.65);
    const PAPER = '#ECE6DA', PAPER2 = '#B9B3A8', PAPER3 = '#8A857C', TUNG = '#F4B26A';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A scrim keeps the report legible over bright bokeh without a visible box.
    const th = pad + lh * 2 + pad * 1.6;
    const top = ctx.createLinearGradient(0, 0, 0, th);
    top.addColorStop(0, 'rgba(5,6,8,0.62)'); top.addColorStop(0.55, 'rgba(5,6,8,0.3)'); top.addColorStop(1, 'rgba(5,6,8,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, g.PW, th);

    ctx.font = `500 ${fs}px ${MONO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(fs * 0.08).toFixed(2)}px`;
    ctx.textBaseline = 'alphabetic';
    const y1 = pad + fs, y2 = y1 + lh;
    const seq = (parts, x, y) => {   // [[text, colour], …] left to right
      for (const [t, c] of parts) { ctx.fillStyle = c; ctx.fillText(t, x, y); x += ctx.measureText(t).width; }
      return x;
    };
    const dot = ' · ';
    ctx.textAlign = 'left';
    // Line 1: camera report, then the focus mark in tungsten. Line 2: the depth-of-field solution.
    seq([[`${narrow ? '' : 'A-CAM · '}${R.format} · ${L.f}MM · ${R.stop} · ${WB}K`, PAPER3], [dot, PAPER3], [`FOCUS ${R.focus.toUpperCase()}`, TUNG]], pad, y1);
    const pairs = narrow
      ? [['NEAR ', R.near], ['FAR ', R.far], ['DOF ', R.dof], ['H ', R.hyperfocal]]
      : [['NEAR ', R.near], ['FAR ', R.far], ['DOF ', R.dof], ['HYPERFOCAL ', R.hyperfocal]];
    seq(pairs.flatMap(([k, v], i) => [...(i ? [[dot, PAPER3]] : []), [k, PAPER3], [v.toUpperCase(), PAPER]]), pad, y2);

    // Subject chips, tungsten when the blur disc is within the circle of confusion: top-right on a
    // wide frame, bottom-left on a phone (bottom-right belongs to the player's chrome).
    const chip1 = (sbj, x, y, label) => {
      ctx.fillStyle = sbj.sharp ? TUNG : PAPER2;
      const r = fs * 0.22;
      ctx.beginPath(); ctx.arc(x + r, y - fs * 0.34, r, 0, TAU);
      if (sbj.sharp) ctx.fill(); else { ctx.strokeStyle = PAPER3; ctx.lineWidth = Math.max(1, dpr * 0.8); ctx.stroke(); }
      ctx.fillStyle = sbj.sharp ? TUNG : PAPER3;
      ctx.fillText(label, x + r * 2 + fs * 0.4, y);
      return x + r * 2 + fs * 0.4 + ctx.measureText(label).width;
    };
    if (!narrow) {
      const labels = L.subjects.map(sbj => `${sbj.id} ${sbj.name.toUpperCase()}`);
      const gap = fs * 1.3, r = fs * 0.22;
      const widths = labels.map(t => r * 2 + fs * 0.4 + ctx.measureText(t).width);
      let x = g.PW - pad - widths.reduce((a, b) => a + b, 0) - gap * (labels.length - 1);
      L.subjects.forEach((sbj, i) => { x = chip1(sbj, x, y1, labels[i]) + gap; });
    } else {
      const yb = g.PH - pad;
      const bot = ctx.createLinearGradient(0, g.PH - pad * 3, 0, g.PH);
      bot.addColorStop(0, 'rgba(5,6,8,0)'); bot.addColorStop(1, 'rgba(5,6,8,0.5)');
      ctx.fillStyle = bot; ctx.fillRect(0, g.PH - pad * 3, g.PW * 0.6, pad * 3);
      let x = pad;
      for (const sbj of L.subjects) x = chip1(sbj, x, yb, sbj.id) + fs * 0.9;
    }
    ctx.restore();
  }

  /** #033-style focus brackets: travel between subjects in log distance, like a puller's mark. */
  function brackets(g, L) {
    const s = L.inf ? 1e9 : L.s / 1000;
    const pts = SUBJECTS.map(o => ({ ...toScreen(g, o.d, o.anchor[0], o.anchor[1]), d: o.d }));
    let i = 0;
    while (i < pts.length - 2 && s > pts[i + 1].d) i++;
    const a = pts[i], b = pts[i + 1];
    const u = eIO(clamp(Math.log(s / a.d) / Math.log(b.d / a.d)));
    const size = Math.min(g.PW, g.PH);
    const x = clamp(lerp(a.x, b.x, u), size * 0.14, g.PW - size * 0.14);
    const y = clamp(lerp(a.y, b.y, u), size * 0.3, g.PH - size * 0.16);
    const r = lerp(0.085, 0.05, clamp(Math.log(s / 1.2) / Math.log(60 / 1.2))) * size;
    const arm = r * 0.3;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ECE6DA'; ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(x + sx * r, y + sy * r - sy * arm); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * r - sx * arm, y + sy * r);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- Frame --------------------------------------------------------------------------------

  function seek(t, p) {
    const g = ensureLayers(p);
    const L = lensState(p);
    const stopsDown = Math.max(0, stopsBetween(L.N, F14));   // 0 at f/1.4
    const look = {
      blades: p.blades ?? 9,
      rot: -Math.PI / 2 + 0.21,
      curvature: lerp(1, 0.08, clamp(stopsDown / 1.5)),    // rounded within 1.5 stops of wide open
      opacity: lerp(0.55, 1, clamp(stopsDown / 7)),        // #105: 100 % → 55 % as the iris opens
      vignetting: 1 - clamp(stopsDown / 2.5),              // the cat's-eye goes as the iris closes
    };
    if (!base.c || base.c.width !== g.PW || base.c.height !== g.PH) {
      base.c = makeCanvas(g.PW, g.PH); base.k = base.c.getContext('2d'); base.key = null;
    }
    const key = `${layerKey}|${dpr}|${L.N}|${L.s}|${look.blades}`;
    if (base.key !== key) {
      ctx = base.k;
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
        ctx.fillStyle = '#07080A';
        ctx.fillRect(0, 0, g.PW, g.PH);
        const sEff = L.inf ? 1e9 : L.s;
        const sigmaCap = margin / 2.4;
        const blurPx = d => mmToPx(blurDisc(L.f, L.N, sEff, d * 1000), g.PW, g.sensorW);
        const plane = (id, d) => drawPlane(id, Math.min(sigmaCap, blurSigma(blurPx(d))));
        const lighter = list => { ctx.globalCompositeOperation = 'lighter'; drawPoints(g, L, list, look); ctx.globalCompositeOperation = 'source-over'; };

        plane('E', 60); lighter(distantSrc);
        plane('D', 18); lighter(bulbSrc);
        plane('C', 7);
        // The shade as a source: it reads as a disc only once its blur outgrows the shade itself.
        lampSrc.gain = smoothstep(0.5, 1.4, blurPx(7) / (0.37 * scaleAt(g, 7)));
        lighter([lampSrc]);
        plane('B', 3);
        plane('A', 1.2);
        base.key = key;
      } finally { ctx = main; }
    }

    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = 1; main.globalCompositeOperation = 'source-over'; main.filter = 'none';
    main.imageSmoothingEnabled = false;
    main.drawImage(base.c, 0, 0);
    main.imageSmoothingEnabled = true;
    // Natural lens fall-off (gentle) and 24 fps grain.
    main.drawImage(finishLayer(g, grainIndex(t, tiles.length)), 0, 0);
    brackets(g, L);
    hud(g, L, p);
  }

  function describe(p) {
    const R = readout(p), L = R.lens;
    const lc = t => t[0].toLowerCase() + t.slice(1);   // "slate on a C-stand arm"
    const sharp = L.subjects.filter(o => o.sharp).map(o => lc(o.label));
    const soft = L.subjects.filter(o => !o.sharp).map(o => lc(o.label));
    const iris = p.blades ? `${p.blades}-blade iris` : 'round iris';
    return `Focus study, a night exterior on a rooftop: ${L.fmt.label}, ${L.f} mm at ${R.stop}, ${iris}, focused at ${R.focus}. ` +
      `${R.line}. Sharp: ${sharp.length ? sharp.join(', ') : 'nothing'}. Soft: ${soft.length ? soft.join(', ') : 'nothing'}.`;
  }

  return {
    seek,
    resize(w, h, d, o = {}) { dpr = d; if (o.layout) layout = o.layout; layerKey = ''; },
    dispose() {
      for (const id of Object.keys(layers)) {
        const L = layers[id];
        if (L) for (const c of [L.c, ...Object.values(L.blur ?? {}).map(B => B.c), ...Object.values(L.mip ?? {})]) c.width = c.height = 1;
        layers[id] = null;
      }
      for (const c of finish) if (c) c.width = c.height = 1;
      if (base.c) base.c.width = base.c.height = 1;
      base.c = base.k = base.key = null;
      finish.length = 0;
      for (const id of Object.keys(small)) { if (small[id]) small[id].width = small[id].height = 1; small[id] = null; }
      tiles.length = 0;
    },
    script: demoParams,
    describe,
  };
}
