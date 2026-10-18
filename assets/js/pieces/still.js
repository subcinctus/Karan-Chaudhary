// Procedural placeholder still: a composed "frame grab" painted from a film's palette, aspect and
// seed, used wherever a film has no real stills yet. Static (duration 0): renderStill() returns an
// object URL for an <img>; the piece form (meta/create/seek) serves studies/still.html and ?record.
//
// Kinds (rule-of-thirds compositions):
//   wide-ext            horizon on the lower third, layered hills in haze, a low sun, a figure
//   interior-practical  a lampshade practical on the right third, a soft foreground profile facing it
//   close-silhouette    a profile on the left third against a backlit window and out-of-focus lights
//   insert              a glass on a table, side light, a long shadow with a warm caustic
//   night-street        one sodium streetlight, its pool and cone, a figure, wet reflections
//   window-shaft        a hard window shaft through haze onto the floor, a figure facing it
// Every value comes from (palette, aspect, seed, kind): no unseeded randomness, no clocks.
//
// Motion Prompt #105 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#105
//   numbers only: out-of-focus lights as discs with a brighter rim, drawn additively, behind a
//   sharp subject; the iris shape (9 curved blades) comes from core/canvas.js nGonPath.
// Motion Prompt #112 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#112
//   numbers only: ellipse clear to 45 % of a 0.62·W radius, vertical radius × (H/W) × 1.35,
//   rgb(32,35,43) to 70 %, composited with 'multiply'.
// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
//   numbers only: static dark #3A3530 55 % / white 45 % speckle (core/grain.js); the grain does not move.

import { clamp, lerp, smoothstep } from '../core/time.js';
import { mulberry32, fbm, hashString } from '../core/prng.js';
import { hexToRgb } from '../core/color.js';
import { nGonPath, blurLayer, loadFonts, makeCanvas, resetCtx, containFit } from '../core/canvas.js';
import { grainTile } from '../core/grain.js';

export const STILL_KINDS = ['wide-ext', 'interior-practical', 'close-silhouette', 'insert', 'night-street', 'window-shaft'];
const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
const CAPTION = 'PLACEHOLDER STILL · replace in data/portfolio.js';
const DEFAULT_PALETTE = ['#07080A', '#1E2127', '#F4B26A', '#B9B3A8', '#ECE6DA'];
const TAU = Math.PI * 2;
const MAX_PAINT = 1280;   // px: widest scene painted at full resolution (see paintStill)

// --- Palette ---------------------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
const lum = hex => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const chroma = hex => { const c = hexToRgb(hex); return Math.max(...c) - Math.min(...c); };
/** Five valid hex colours, darkest → lightest (pads from the site palette). */
export function normPalette(palette) {
  const p = (Array.isArray(palette) ? palette : []).filter(c => HEX.test(c));
  const full = p.length >= 5 ? p.slice(0, 5) : [...p, ...DEFAULT_PALETTE.slice(p.length)];
  return full.slice().sort((a, b) => lum(a) - lum(b));
}
/** The accent: the most chromatic of the three middle tones (ties → the middle one). */
export function pickAccent(pal) {
  const mids = [pal[2], pal[1], pal[3]];
  return mids.reduce((best, c) => (chroma(c) > chroma(best) + 6 ? c : best), mids[0]);
}

// Colours are [r, g, b] 0..255 arrays; css() turns one into a fillStyle with alpha.
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+clamp(a).toFixed(4)})`;

/** Lighting roles derived from a film palette. */
function roles(palette) {
  const pal = normPalette(palette);
  const [d0, d1, mid, l1, l0] = pal.map(hexToRgb), acc = hexToRgb(pickAccent(pal));
  return {
    d0, d1, mid, l1, l0, acc,
    black: mix(d0, [4, 5, 7], 0.5),
    lamp: mix(acc, l0, 0.35),              // a practical / sun: the accent, lifted
    hot: mix(l0, acc, 0.18),               // the core of a source
    sky: mix(mix(d1, l1, 0.4), acc, 0.12),
    cool: mix(mix(d1, l1, 0.32), [120, 150, 190], 0.18),   // night window, a touch toward daylight
  };
}

// --- Drawing helpers (pixel space, identity transform) -------------------------------------------------

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c, a] of stops) g.addColorStop(o, css(c, a));
  return g;
}
function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c, a] of stops) g.addColorStop(o, css(c, a));
  return g;
}
/** Soft light falloff (about inverse-square near the source). */
function glow(ctx, x, y, r, c, a, mode = 'screen', sy = 1) {
  if (r <= 0 || a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.translate(x, y); ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, css(c, a)); g.addColorStop(0.18, css(c, a * 0.55)); g.addColorStop(0.45, css(c, a * 0.18));
  g.addColorStop(0.75, css(c, a * 0.04)); g.addColorStop(1, css(c, 0));
  // Fill only where the light square meets the frame (big glows otherwise cost several frames of fill).
  const W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform();
  const ox = m.e, oy = m.f, s = Math.abs(m.a) || 1, sy0 = Math.abs(m.d) || 1;
  const xa = Math.max(-r, -ox / s - 1), xb = Math.min(r, (W - ox) / s + 1);
  const ya = Math.max(-r, -oy / sy0 - 1), yb = Math.min(r, (H - oy) / sy0 + 1);
  ctx.fillStyle = g;
  if (m.a < 0) ctx.fillRect(-r, ya, 2 * r, yb - ya);   // mirrored frame: keep it simple
  else if (xb > xa && yb > ya) ctx.fillRect(xa, ya, xb - xa, yb - ya);
  ctx.restore();
}
/** An out-of-focus point source: 9-blade curved iris, slightly brighter rim (#105 look). */
function bokeh(ctx, x, y, r, c, a, rot = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(c, a * 0.7)); g.addColorStop(0.82, css(c, a * 0.85)); g.addColorStop(1, css(c, a));
  ctx.fillStyle = g;
  nGonPath(ctx, x, y, r, 9, rot, 0.55);
  ctx.fill();
  ctx.restore();
}
/** Low-frequency fbm texture, upscaled smoothly: painterly mottling for skies, walls, tabletops. */
function mottle(ctx, x, y, w, h, seed, c, a, { sx = 1, cells = 6, mode = 'screen' } = {}) {
  const gw = 48, gh = Math.max(4, Math.round(48 * h / w));
  const t = layer('mottle-src', gw, gh), k = t.getContext('2d');
  const img = k.createImageData(gw, gh), d = img.data;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const n = fbm((i / gw) * cells / sx, (j / gh) * cells * (h / w), { octaves: 4, seed });
    const q = (j * gw + i) * 4;
    d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2];
    d[q + 3] = Math.round(clamp((n - 0.35) * 2.2) * a * 255);
  }
  k.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(t, x, y, w, h);
  ctx.restore();
}

// Reusable layers keyed by name only (resized in place), so many still sizes do not pile up canvases.
const layers = new Map();
function layer(name, w, h) {
  let c = layers.get(name);
  if (!c) { c = makeCanvas(w, h); layers.set(name, c); }
  const k = c.getContext('2d');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, w, h); }
  resetCtx(k, 1);
  return c;
}
/**
 * Draw fn (in frame pixels) into a small layer covering `rect` (+3σ), blur it there at reduced
 * resolution for large σ, then composite it scaled back up. Cost scales with the rect, not the frame.
 */
function soft(ctx, W, H, sigma, fn, { name = 'soft', mode = 'source-over', alpha = 1, rect = null } = {}) {
  const m = Math.ceil(3 * sigma) + 2;
  const [x0, y0, x1, y1] = rect ? [rect[0] - m, rect[1] - m, rect[0] + rect[2] + m, rect[1] + rect[3] + m] : [-m, -m, W + m, H + m];
  const rx = Math.max(-m, Math.floor(x0)), ry = Math.max(-m, Math.floor(y0));
  const rw = Math.min(W + m, Math.ceil(x1)) - rx, rh = Math.min(H + m, Math.ceil(y1)) - ry;
  if (rw <= 0 || rh <= 0) return;
  const f = sigma >= 8 ? 0.25 : sigma >= 3 ? 0.5 : 1;
  const lw = Math.max(1, Math.ceil(rw * f)), lh = Math.max(1, Math.ceil(rh * f));
  const a = layer(name, lw, lh), k = a.getContext('2d');
  k.setTransform(f, 0, 0, f, -rx * f, -ry * f);
  fn(k);
  let src = a;
  if (sigma * f > 0.05) {
    src = layer(`${name}:b`, lw, lh);
    blurLayer(src.getContext('2d'), a, sigma * f, 0, 0, lw, lh);
  }
  ctx.save();
  ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, lw, lh, rx, ry, lw / f, lh / f);
  ctx.restore();
}

// --- Figures --------------------------------------------------------------------------------------

/** A standing adult in a long coat (≈7.5 heads), feet at (x, feet), height H, facing ±1. */
function figurePath(k, x, feet, H, facing = 1) {
  const hh = H / 7.5, top = feet - H, sw = hh * 0.92, f = facing;
  const ny = top + hh * 1.0, sy = top + hh * 1.45, hem = feet - H * 0.27, crotch = feet - H * 0.25;
  k.beginPath();
  k.ellipse(x + f * hh * 0.05, top + hh * 0.5, hh * 0.36, hh * 0.5, f * 0.08, 0, TAU);
  k.moveTo(x - hh * 0.15, ny - hh * 0.12);
  k.lineTo(x + hh * 0.15, ny - hh * 0.12);
  k.bezierCurveTo(x + hh * 0.2, sy - hh * 0.3, x + sw * 0.7, sy - hh * 0.2, x + sw, sy + hh * 0.05);
  k.bezierCurveTo(x + sw * 1.06, sy + hh * 1.3, x + sw * 0.8, hem - hh * 0.8, x + sw * 0.66, hem);
  k.lineTo(x + hh * 0.32, hem + hh * 0.02);
  k.lineTo(x + hh * 0.3, feet - hh * 0.05);
  k.quadraticCurveTo(x + hh * 0.3 + f * hh * 0.2, feet, x + hh * 0.22, feet);
  k.lineTo(x + hh * 0.06, feet);
  k.lineTo(x + hh * 0.01, crotch);
  k.lineTo(x - hh * 0.01, crotch);
  k.lineTo(x - hh * 0.06, feet);
  k.lineTo(x - hh * 0.22, feet);
  k.quadraticCurveTo(x - hh * 0.3 + f * hh * 0.2, feet, x - hh * 0.3, feet - hh * 0.05);
  k.lineTo(x - hh * 0.32, hem + hh * 0.02);
  k.lineTo(x - sw * 0.66, hem);
  k.bezierCurveTo(x - sw * 0.8, hem - hh * 0.8, x - sw * 1.06, sy + hh * 1.3, x - sw, sy + hh * 0.05);
  k.bezierCurveTo(x - sw * 0.7, sy - hh * 0.2, x - hh * 0.2, sy - hh * 0.3, x - hh * 0.15, ny - hh * 0.12);
  k.closePath();
}
const figureRect = (x, feet, H) => [x - H * 0.17, feet - H, H * 0.34, H];

// Head-and-shoulders profile facing +x; unit = crown-to-chin height. Smoothed with Catmull–Rom.
const PROFILE = [
  [-0.66, 2.3], [-0.6, 1.5], [-0.42, 1.2], [-0.37, 0.99], [-0.47, 0.72], [-0.45, 0.38], [-0.3, 0.1], [-0.06, -0.02],
  [0.2, 0.04], [0.34, 0.22], [0.375, 0.37], [0.35, 0.45], [0.4, 0.56], [0.475, 0.665], [0.405, 0.705], [0.41, 0.75],
  [0.385, 0.78], [0.4, 0.81], [0.365, 0.86], [0.39, 0.93], [0.3, 1.0], [0.18, 1.04], [0.17, 1.18], [0.26, 1.4],
  [0.74, 1.62], [0.92, 2.3],
];
function profilePath(k, x, y, unit, facing = 1) {
  const P = PROFILE.map(([px, py]) => [x + px * unit * facing, y + py * unit]);
  k.beginPath();
  k.moveTo(P[0][0], P[0][1]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    k.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  k.closePath();
}
const profileRect = (x, y, unit) => [x - 0.7 * unit, y - 0.05 * unit, 1.65 * unit, 2.4 * unit];

/**
 * (A generator: callers `yield*` it, one step per layer.) A silhouette with rim light: fill `path` in `fill`, then add the crescent the shape loses when it
 * is shifted away from the light by `edge` px (blurred, additive). (dx, dy) points toward the light.
 */
function* rimmed(ctx, W, H, path, fill, rimCol, { dx = 1, dy = 0, edge = 2, wrap = 0, a = 0.9, blur = 0, rect = null } = {}) {
  soft(ctx, W, H, blur, k => { k.fillStyle = css(fill); path(k); k.fill(); }, { name: 'sil', rect });
  yield;
  const crescent = (k, off) => {
    k.fillStyle = css(rimCol); path(k); k.fill();
    k.globalCompositeOperation = 'destination-out';
    k.translate(-dx * off, -dy * off); path(k); k.fill();
  };
  soft(ctx, W, H, Math.max(0.6, edge * 0.45) + blur, k => crescent(k, edge), { name: 'rim', mode: 'lighter', alpha: a, rect });
  yield;
  if (wrap > 0) soft(ctx, W, H, wrap * 0.6 + blur, k => crescent(k, wrap), { name: 'rim', mode: 'screen', alpha: a * 0.28, rect });
}

// --- Compositions ---------------------------------------------------------------------------------
// Each paints the full W×H frame (pixels). r() is the seeded stream; c = roles(palette).
// Each is a generator: a bare `yield` marks a stage boundary where renderStill may hand the main
// thread back. The seeded stream is consumed in the same order either way, so the pixels are the same.

function* wideExt(ctx, W, H, c, r, seed) {
  const water = r() < 0.5;
  const hy = H * lerp(0.6, 0.67, r());
  const sunX = W * lerp(0.62, 0.74, r()), sunY = hy - H * lerp(0.02, 0.07, r());
  // Sky: deep at the top, warming toward a low sun, with slow cloud mottling.
  ctx.fillStyle = vgrad(ctx, 0, hy, [[0, mix(c.d0, c.d1, 0.55), 1], [0.5, mix(c.d1, c.sky, 0.55), 1], [0.86, c.sky, 1], [1, mix(c.sky, c.lamp, 0.35), 1]]);
  ctx.fillRect(0, 0, W, hy + 1);
  mottle(ctx, 0, 0, W, hy, seed + 3, mix(c.sky, c.l1, 0.4), 0.18, { sx: 3.5, cells: 5 });
  glow(ctx, sunX, sunY, H * 1.2, c.lamp, 0.45);
  glow(ctx, sunX, sunY, H * 0.14, c.hot, 0.7);
  yield;
  // Hills: three ridges, nearer = darker (aerial perspective); over water they are a headland.
  const horizonCol = mix(c.sky, c.lamp, 0.2);
  for (let j = 0; j < 3; j++) {
    const amp = H * (0.035 + 0.06 * j), col = mix(horizonCol, c.black, 0.32 + 0.25 * j), off = r() * 50;
    const from = water ? (j === 2 ? -0.2 : 0) : 0;
    soft(ctx, W, H, H * (0.004 * (2 - j) + 0.0008), k => {
      k.fillStyle = css(col);
      k.beginPath(); k.moveTo(0, hy + 1);
      for (let i = 0; i <= 80; i++) {
        const u = i / 80, x = u * W, env = water ? 1 - smoothstep(0.25 + from, 0.55 + 0.1 * j, u) : 1;
        k.lineTo(x, hy - amp * env * (0.25 + 1.1 * fbm(u * (2.4 + 1.3 * j) + off, j * 3.1, { octaves: 5, seed })));
      }
      k.lineTo(W, hy + 1); k.closePath(); k.fill();
    }, { name: 'ridge', rect: [0, hy - amp * 1.5, W, amp * 1.5 + 2] });
    yield;
  }
  const shoreY = H * lerp(0.86, 0.9, r());
  const shoreAt = u => shoreY - H * 0.07 * (1 - u) + H * 0.016 * (fbm(u * 5.7, 7.7, { seed }) - 0.5);
  if (water) {
    ctx.fillStyle = vgrad(ctx, hy, H, [[0, mix(horizonCol, c.d1, 0.3), 1], [0.35, mix(c.d0, c.d1, 0.75), 1], [1, c.d0, 1]]);
    ctx.fillRect(0, hy, W, H - hy);
    // The sun's path on the water: broken strokes that widen, shorten and dim toward the shore.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 140; i++) {
      const q = Math.pow(i / 140, 1.4), y = hy + 1 + q * (shoreY - hy);
      const spread = W * (0.02 + 0.13 * q), x = sunX + (r() + r() - 1) * spread;
      const len = W * (0.006 + 0.035 * r()) * (1 - 0.4 * q);
      ctx.fillStyle = css(c.hot, (0.85 - 0.6 * q) * (0.3 + 0.7 * r()));
      ctx.fillRect(x - len / 2, y, len, Math.max(1, H * 0.0022));
    }
    ctx.restore();
    ctx.fillStyle = hgrad(ctx, 0, W, [[0, c.hot, 0], [sunX / W, c.hot, 0.45], [1, c.hot, 0]]);
    ctx.fillRect(0, hy, W, Math.max(1, H * 0.0025));
    // Foreground shore, rising toward the figure's side.
    const shore = k => { k.beginPath(); k.moveTo(0, H); for (let i = 0; i <= 40; i++) k.lineTo((i / 40) * W, shoreAt(i / 40)); k.lineTo(W, H); k.closePath(); };
    glow(ctx, W * 0.5, shoreY, W * 0.6, mix(c.sky, c.lamp, 0.3), 0.2, 'screen', 0.08);
    ctx.strokeStyle = css(c.lamp, 0.55); ctx.lineWidth = Math.max(1.5, H * 0.004); shore(ctx); ctx.stroke();
    ctx.fillStyle = vgrad(ctx, shoreY - H * 0.07, H, [[0, mix(c.d0, c.d1, 0.45), 1], [1, c.black, 1]]); shore(ctx); ctx.fill();
    ctx.save(); shore(ctx); ctx.clip(); mottle(ctx, 0, shoreY - H * 0.08, W, H - shoreY + H * 0.08, seed + 11, c.black, 0.6, { sx: 4, cells: 9, mode: 'source-over' }); ctx.restore();
  } else {
    // Land: dark, clumped, a little warmer than the sky; a pale track leading in to the figure.
    ctx.fillStyle = vgrad(ctx, hy, H, [[0, mix(mix(c.d0, c.d1, 0.4), c.lamp, 0.1), 1], [0.2, mix(c.d0, c.d1, 0.22), 1], [1, c.black, 1]]);
    ctx.fillRect(0, hy, W, H - hy);
    mottle(ctx, 0, hy, W, H - hy, seed + 9, c.black, 0.75, { sx: 2.5, cells: 14, mode: 'source-over' });
    glow(ctx, sunX, hy, W * 0.4, c.lamp, 0.2, 'screen', 0.12);
  }
  yield;
  // A figure on the far third, small against the land, edged by the low sun.
  const fx = W * (sunX > W / 2 ? 0.31 : 0.69), feet = water ? shoreAt(fx / W) + H * 0.012 : hy + H * 0.11;
  const fh = H * (water ? 0.15 : 0.12);
  if (!water) {
    soft(ctx, W, H, H * 0.004, k => {
      k.fillStyle = vgrad(k, feet, H, [[0, mix(c.sky, c.lamp, 0.3), 0.22], [1, c.sky, 0.05]]);
      k.beginPath(); k.moveTo(fx - H * 0.01, feet); k.lineTo(fx + H * 0.012, feet);
      k.quadraticCurveTo(fx + W * 0.05, H * 0.92, fx + W * 0.14, H); k.lineTo(fx - W * 0.02, H);
      k.quadraticCurveTo(fx + W * 0.0, H * 0.9, fx - H * 0.01, feet); k.fill();
    }, { name: 'track', mode: 'screen', rect: [fx - W * 0.05, feet, W * 0.22, H - feet] });
    yield;
  }
  yield* rimmed(ctx, W, H, k => figurePath(k, fx, feet, fh, sunX > fx ? 1 : -1), c.black, c.lamp,
    { dx: Math.sign(sunX - fx), dy: -0.3, edge: Math.max(1, H * 0.0028), a: 0.75, blur: H * 0.0008, rect: figureRect(fx, feet, fh) });
}

function* nightStreet(ctx, W, H, c, r, seed, flip) {
  const hy = H * lerp(0.5, 0.55, r()), vpx = W * lerp(0.4, 0.48, r());
  const sodium = mix(c.lamp, [255, 170, 80], 0.25);
  ctx.fillStyle = vgrad(ctx, 0, hy, [[0, c.black, 1], [0.7, mix(c.d0, c.d1, 0.6), 1], [1, mix(c.d1, sodium, 0.2), 1]]);
  ctx.fillRect(0, 0, W, hy + 1);
  // Buildings: a far soft row and a nearer darker one either side of the street, a few lit windows.
  for (const [row, dark, sig] of [[0, 0.5, 0.007], [1, 0.82, 0.004]]) {
    soft(ctx, W, H, H * sig, k => {
      let x = -W * 0.02;
      while (x < W) {
        const bw = W * lerp(0.04, 0.12, r()), d = Math.abs(x + bw / 2 - vpx) / W;
        const bh = H * lerp(0.06, row ? 0.32 : 0.18, r()) * (row ? smoothstep(0.03, 0.3, d) : 1);
        if (bh > H * 0.02) {
          k.fillStyle = css(mix(c.d1, c.black, dark));
          k.fillRect(x, hy - bh, bw + 1, bh + 2);
          if (r() < 0.25) k.fillRect(x + bw * 0.3, hy - bh - H * 0.03, bw * 0.08, H * 0.03);
          for (let wy = hy - bh + H * 0.02; wy < hy - H * 0.02; wy += H * 0.032) {
            for (let wx = x + bw * 0.12; wx < x + bw * 0.85; wx += bw * 0.2) {
              const q = r();
              if (q < 0.1) { k.fillStyle = css(q < 0.025 ? c.cool : sodium, 0.18 + 0.3 * r()); k.fillRect(wx, wy, bw * 0.09, H * 0.013); }
            }
          }
        }
        x += bw + W * 0.003;
      }
    }, { name: 'street', rect: [0, hy - H * 0.38, W, H * 0.4] });
    yield;
  }
  // Road: wet asphalt, kerbs converging on the vanishing point.
  ctx.fillStyle = vgrad(ctx, hy, H, [[0, mix(c.d0, c.d1, 0.55), 1], [1, c.black, 1]]);
  ctx.fillRect(0, hy, W, H - hy);
  mottle(ctx, 0, hy, W, H - hy, seed + 6, c.d1, 0.3, { sx: 6, cells: 10, mode: 'source-over' });
  ctx.strokeStyle = css(c.l1, 0.07); ctx.lineWidth = Math.max(1, H * 0.002);
  ctx.beginPath(); ctx.moveTo(vpx, hy); ctx.lineTo(-W * 0.15, H); ctx.moveTo(vpx, hy); ctx.lineTo(W * 1.2, H); ctx.stroke();
  yield;
  // Streetlights down the far kerb, nearer = higher and larger; out of focus, with long reflections.
  for (let i = 0; i < 5; i++) {
    const s = 0.1 + i * 0.13 + r() * 0.02;
    const x = lerp(vpx, -W * 0.08, s), ground = lerp(hy, H, s), head = ground - H * 1.1 * s;
    if (x < W * 0.01 || head < -H * 0.05) continue;
    const br = H * (0.012 + 0.03 * s), a = 0.34 - 0.03 * i;
    bokeh(ctx, x, head, br, sodium, a, r() * TAU);
    glow(ctx, x, head, br * 5, sodium, 0.12);
    const len = (H - ground) * 0.95;
    soft(ctx, W, H, H * 0.006, k => {
      k.fillStyle = vgrad(k, ground, ground + len, [[0, sodium, a * 0.55], [1, sodium, 0]]);
      k.fillRect(x - br * 0.35, ground, br * 0.7, len);
    }, { name: 'refl', mode: 'screen', rect: [x - br, ground, br * 2, len] });
    yield;
  }
  // The hero lamp on the right third: pole, head, haze cone, pool on the ground.
  const lx = W * (2 / 3), headY = H * 0.15, ground = H * 0.86;
  ctx.fillStyle = css(mix(c.black, c.d1, 0.3));
  ctx.fillRect(lx + H * 0.035, headY - H * 0.01, Math.max(2, H * 0.008), ground - headY + H * 0.01);
  ctx.fillRect(lx - H * 0.01, headY - H * 0.014, H * 0.055, Math.max(2, H * 0.008));
  soft(ctx, W, H, H * 0.03, k => {
    k.fillStyle = vgrad(k, headY, ground, [[0, sodium, 0.42], [0.55, sodium, 0.14], [1, sodium, 0.08]]);
    k.beginPath(); k.moveTo(lx - H * 0.015, headY); k.lineTo(lx + H * 0.03, headY);
    k.lineTo(lx + W * 0.13, ground); k.lineTo(lx - W * 0.13, ground); k.closePath(); k.fill();
  }, { name: 'cone', mode: 'screen', rect: [lx - W * 0.14, headY, W * 0.28, ground - headY] });
  yield;
  glow(ctx, lx, ground, W * 0.2, sodium, 0.62, 'screen', 0.2);
  glow(ctx, lx, ground, W * 0.07, c.hot, 0.25, 'screen', 0.25);
  glow(ctx, lx + H * 0.01, headY + H * 0.01, H * 0.75, sodium, 0.3);
  glow(ctx, lx + H * 0.01, headY + H * 0.004, H * 0.045, c.hot, 1);
  yield;
  // Figure in the pool, top-lit: a rim on head and shoulders.
  const fx = lx - W * 0.04, fh = H * 0.38, feet = ground + H * 0.005;
  yield* rimmed(ctx, W, H, k => figurePath(k, fx, feet, fh, flip ? -1 : 1), c.black, sodium,
    { dx: 0.35, dy: -1, edge: Math.max(1.2, H * 0.004), wrap: H * 0.012, a: 0.85, blur: H * 0.0008, rect: figureRect(fx, feet, fh) });
  yield;
  // The figure's reflection, broken by the wet road.
  soft(ctx, W, H, H * 0.008, k => {
    k.save(); k.translate(0, 2 * feet); k.scale(1, -1);
    k.fillStyle = css(c.black, 0.55); figurePath(k, fx, feet, fh, flip ? -1 : 1); k.fill(); k.restore();
    k.globalCompositeOperation = 'destination-in';
    k.fillStyle = vgrad(k, feet, H, [[0, c.black, 1], [1, c.black, 0]]); k.fillRect(0, feet, W, H - feet);
  }, { name: 'figrefl', rect: [fx - fh * 0.2, feet, fh * 0.4, H - feet] });
}

function* interiorPractical(ctx, W, H, c, r, seed) {
  const fy = H * 0.8, lx = W * (2 / 3) + W * 0.02 * (r() - 0.5), sy = H * lerp(0.36, 0.42, r());
  const wall = mix(c.d0, c.d1, 0.55);
  ctx.fillStyle = vgrad(ctx, 0, fy, [[0, c.black, 1], [0.55, wall, 1], [1, mix(wall, c.d0, 0.4), 1]]);
  ctx.fillRect(0, 0, W, fy);
  mottle(ctx, 0, 0, W, fy, seed + 5, c.d1, 0.35, { cells: 5, mode: 'source-over' });
  yield;
  // A night window on the back wall, left: cool, soft, a few far lights.
  const wx = W * 0.06, wy = H * 0.14, ww = H * 0.32, wh = H * 0.42;
  soft(ctx, W, H, H * 0.004, k => {
    k.fillStyle = vgrad(k, wy, wy + wh, [[0, c.cool, 0.22], [1, mix(c.cool, c.d1, 0.6), 0.14]]);
    k.fillRect(wx, wy, ww, wh);
    k.save(); k.beginPath(); k.rect(wx, wy, ww, wh); k.clip();
    for (let i = 0; i < 6; i++) bokeh(k, wx + ww * r(), wy + wh * lerp(0.5, 0.95, r()), H * lerp(0.008, 0.015, r()), r() < 0.6 ? c.lamp : c.cool, 0.25, r());
    k.restore();
    k.fillStyle = css(mix(c.black, c.d1, 0.4));
    k.fillRect(wx + ww / 2 - H * 0.006, wy, H * 0.012, wh); k.fillRect(wx, wy + wh * 0.42, ww, H * 0.012);
    k.strokeStyle = css(mix(c.black, c.d1, 0.4)); k.lineWidth = H * 0.016; k.strokeRect(wx, wy, ww, wh);
  }, { name: 'window', rect: [wx - H * 0.02, wy - H * 0.02, ww + H * 0.04, wh + H * 0.04] });
  yield;
  // Floor.
  ctx.fillStyle = vgrad(ctx, fy, H, [[0, mix(c.d0, c.d1, 0.45), 1], [1, c.black, 1]]);
  ctx.fillRect(0, fy, W, H - fy);
  ctx.fillStyle = css(c.black, 0.6); ctx.fillRect(0, fy - H * 0.006, W, H * 0.008);
  // The practical's light on the wall: a broad pool, brighter scallops above and below the shade.
  glow(ctx, lx, sy, H * 1.3, c.lamp, 0.4);
  glow(ctx, lx, sy - H * 0.2, H * 0.28, c.lamp, 0.35, 'screen', 1.7);
  glow(ctx, lx, fy, W * 0.25, c.lamp, 0.22, 'screen', 0.2);
  yield;
  // A small round side table, its top edge catching the light.
  const ty = H * 0.62, tw = H * 0.34;
  ctx.fillStyle = css(c.black);
  ctx.beginPath(); ctx.ellipse(lx, ty, tw / 2, H * 0.03, 0, 0, TAU); ctx.fill();
  ctx.fillRect(lx - H * 0.012, ty, H * 0.024, fy - ty - H * 0.01);
  ctx.beginPath(); ctx.ellipse(lx, fy - H * 0.008, H * 0.08, H * 0.012, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = css(c.lamp, 0.55); ctx.beginPath(); ctx.ellipse(lx, ty - H * 0.004, tw / 2, H * 0.028, 0, Math.PI, 0); ctx.ellipse(lx, ty - H * 0.001, tw / 2, H * 0.025, 0, 0, Math.PI, true); ctx.fill();
  // The open bottom of the shade throws a pool straight down onto the tabletop, brightest under the bulb.
  ctx.save(); ctx.beginPath(); ctx.ellipse(lx, ty, tw / 2, H * 0.03, 0, 0, TAU); ctx.clip();
  ctx.translate(lx, ty); ctx.scale(1, 0.16);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, tw * 0.5);
  pool.addColorStop(0, css(c.hot, 0.55)); pool.addColorStop(0.45, css(c.lamp, 0.28)); pool.addColorStop(1, css(c.lamp, 0));
  ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = pool; ctx.fillRect(-tw, -tw, tw * 2, tw * 2);
  ctx.restore();
  // The lamp: a pale shade, glowing from inside.
  const sh = H * 0.16, topW = H * 0.12, botW = H * 0.22, s0 = sy - sh / 2, s1 = sy + sh / 2;
  ctx.fillStyle = css(mix(c.black, c.d1, 0.3));
  ctx.fillRect(lx - H * 0.006, s1, H * 0.012, ty - s1 - H * 0.02);
  ctx.beginPath(); ctx.ellipse(lx, ty - H * 0.03, H * 0.04, H * 0.01, 0, 0, TAU); ctx.fill();
  const shade = k => { k.beginPath(); k.moveTo(lx - topW / 2, s0); k.lineTo(lx + topW / 2, s0); k.lineTo(lx + botW / 2, s1); k.lineTo(lx - botW / 2, s1); k.closePath(); };
  ctx.save(); shade(ctx);
  const g = ctx.createRadialGradient(lx, sy + sh * 0.15, 0, lx, sy, botW * 0.75);
  g.addColorStop(0, css(c.hot)); g.addColorStop(0.55, css(mix(c.hot, c.lamp, 0.55))); g.addColorStop(1, css(mix(c.lamp, c.acc, 0.55)));
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  glow(ctx, lx, sy, H * 0.25, c.hot, 0.32);
  yield;
  // Foreground: a soft profile on the left third, turned to the lamp, rim-lit.
  const unit = H * 0.44, px = W * (1 / 3) - unit * 0.12, py = H * 0.38;
  yield* rimmed(ctx, W, H, k => profilePath(k, px, py, unit, 1), mix(c.black, c.d0, 0.3), c.lamp,
    { dx: 1, dy: -0.15, edge: H * 0.004, wrap: H * 0.02, a: 0.8, blur: H * 0.006, rect: profileRect(px, py, unit) });
}

function* closeSilhouette(ctx, W, H, c, r, seed) {
  const light = mix(c.l1, c.lamp, 0.35);
  ctx.fillStyle = hgrad(ctx, 0, W, [[0, c.black, 1], [0.35, mix(c.d0, c.d1, 0.8), 1], [1, mix(c.d1, c.l1, 0.35), 1]]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.8, H * 0.38, H * 1.3, light, 0.5);
  mottle(ctx, W * 0.3, 0, W * 0.7, H, seed + 1, c.l1, 0.1, { cells: 4 });
  yield;
  // Background practicals, far out of focus.
  soft(ctx, W, H, H * 0.004, k => {
    for (let i = 0; i < 11; i++) {
      const x = W * lerp(0.42, 1.02, r()), y = H * lerp(0.08, 0.75, r()), rad = H * lerp(0.04, 0.1, r());
      const col = [c.lamp, c.hot, c.acc, c.l1][Math.floor(r() * 4)];
      bokeh(k, x, y, rad, col, lerp(0.12, 0.3, r()), r() * TAU);
    }
  }, { name: 'bokeh', mode: 'screen', rect: [W * 0.36, 0, W * 0.64, H * 0.9] });
  yield;
  // The profile: eye on the upper-third line, looking into the light with room ahead.
  const unit = H * 0.66, eyeY = H / 3, px = W * 0.3 - unit * 0.1, py = eyeY - 0.43 * unit;
  yield* rimmed(ctx, W, H, k => profilePath(k, px, py, unit, 1), c.black, c.hot,
    { dx: 1, dy: -0.25, edge: H * 0.0045, wrap: H * 0.022, a: 0.95, blur: H * 0.0012, rect: profileRect(px, py, unit) });
}

function* insert(ctx, W, H, c, r, seed) {
  const ty = H * lerp(0.56, 0.6, r());
  ctx.fillStyle = vgrad(ctx, 0, ty, [[0, c.black, 1], [1, mix(c.d0, c.d1, 0.75), 1]]);
  ctx.fillRect(0, 0, W, ty);
  glow(ctx, -W * 0.05, ty * 0.55, W * 0.75, c.lamp, 0.24);
  soft(ctx, W, H, H * 0.012, k => {
    for (let i = 0; i < 5; i++) bokeh(k, W * lerp(0.6, 0.98, r()), ty * lerp(0.15, 0.75, r()), H * lerp(0.06, 0.13, r()), r() < 0.5 ? c.lamp : c.l1, lerp(0.07, 0.16, r()), r() * TAU);
  }, { name: 'bokeh', mode: 'screen', rect: [W * 0.5, 0, W * 0.5, ty] });
  yield;
  // Tabletop: wood grain streaks; window light rakes across it from the left.
  const table = mix(mix(c.d1, c.mid, 0.55), c.acc, 0.12);
  ctx.fillStyle = vgrad(ctx, ty, H, [[0, mix(table, c.black, 0.2), 1], [1, c.black, 1]]);
  ctx.fillRect(0, ty, W, H - ty);
  mottle(ctx, 0, ty, W, H - ty, seed + 4, mix(table, c.black, 0.65), 0.55, { sx: 12, cells: 10, mode: 'source-over' });
  const gx = W * (2 / 3) - H * 0.02, base = H * 0.84, gh = H * 0.42, rt = H * 0.115, rb = H * 0.095, top = base - gh, ey = H * 0.024;
  glow(ctx, gx - W * 0.35, base - H * 0.06, W * 0.9, c.lamp, 0.7, 'screen', 0.3);
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hgrad(ctx, 0, W, [[0, [255, 255, 255], 1], [0.6, [215, 215, 215], 1], [1, mix(c.mid, c.black, 0.35), 1]]);
  ctx.fillRect(0, ty, W, H - ty); ctx.restore();
  ctx.fillStyle = vgrad(ctx, ty - H * 0.03, ty + H * 0.01, [[0, c.black, 0], [0.75, c.lamp, 0.1], [1, c.black, 0]]); ctx.fillRect(0, ty - H * 0.03, W, H * 0.04);
  yield;
  // Long shadow away from the light, with the warm caustic the liquid throws into it.
  const shadow = k => { k.beginPath(); k.moveTo(gx - rb, base + ey * 0.2); k.lineTo(gx + rb * 0.6, base + ey * 0.8); k.lineTo(gx + H * 0.66, base - H * 0.02); k.lineTo(gx + H * 0.6, base - H * 0.075); k.lineTo(gx + rb * 0.4, base - ey); k.closePath(); };
  soft(ctx, W, H, H * 0.016, k => { k.fillStyle = css(c.black, 0.85); shadow(k); k.fill(); },
    { name: 'shadow', rect: [gx - rb, base - H * 0.1, H * 0.75, H * 0.14] });
  yield;
  soft(ctx, W, H, H * 0.01, k => {
    k.save(); k.translate(gx + H * 0.24, base - H * 0.035); k.scale(1, 0.22);
    const g = k.createRadialGradient(0, 0, 0, 0, 0, H * 0.12);
    g.addColorStop(0, css(c.hot, 1)); g.addColorStop(0.45, css(mix(c.acc, c.hot, 0.4), 0.6)); g.addColorStop(1, css(c.acc, 0));
    k.fillStyle = g; k.fillRect(-H * 0.12, -H * 0.12, H * 0.24, H * 0.24); k.restore();
  }, { name: 'caustic', mode: 'lighter', rect: [gx + H * 0.1, base - H * 0.07, H * 0.3, H * 0.07] });
  yield;
  const body = k => { k.beginPath(); k.moveTo(gx - rt, top); k.lineTo(gx - rb, base); k.ellipse(gx, base, rb, ey, 0, Math.PI, 0, true); k.lineTo(gx + rt, top); k.closePath(); };
  // Glass: the table seen through it, darker toward the walls (refraction); liquid shaded as a cylinder.
  const lq = top + gh * 0.52, lr = lerp(rb, rt, 0.48);
  ctx.save(); body(ctx); ctx.clip();
  ctx.fillStyle = hgrad(ctx, gx - rt, gx + rt, [[0, c.black, 0.45], [0.18, c.black, 0.08], [0.82, c.black, 0.12], [1, c.black, 0.55]]);
  ctx.fillRect(gx - rt, top, rt * 2, gh + ey);
  ctx.fillStyle = hgrad(ctx, gx - lr, gx + lr, [[0, mix(c.acc, c.lamp, 0.5), 0.95], [0.3, c.acc, 0.92], [0.75, mix(c.acc, c.black, 0.45), 0.95], [1, mix(c.acc, c.black, 0.75), 0.95]]);
  ctx.fillRect(gx - rt, lq, rt * 2, base - lq + ey);
  ctx.fillStyle = css(c.black, 0.35); ctx.fillRect(gx - rt, base - ey * 0.6, rt * 2, ey * 2);
  ctx.restore();
  ctx.fillStyle = css(mix(c.acc, c.hot, 0.45), 0.75);
  ctx.beginPath(); ctx.ellipse(gx, lq, lr, ey * 0.85, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(1, H * 0.0025);
  ctx.strokeStyle = css(c.l1, 0.2); body(ctx); ctx.stroke();
  ctx.strokeStyle = css(c.l0, 0.42); ctx.beginPath(); ctx.ellipse(gx, top, rt, ey, 0, 0, TAU); ctx.stroke();
  soft(ctx, W, H, H * 0.003, k => {
    k.fillStyle = vgrad(k, top, base, [[0, c.l0, 0.8], [0.5, c.l0, 0.3], [1, c.l0, 0.65]]);
    k.beginPath(); k.moveTo(gx - rt * 0.8, top + ey); k.lineTo(gx - rt * 0.66, top + ey); k.lineTo(gx - rb * 0.62, base - ey); k.lineTo(gx - rb * 0.76, base - ey); k.closePath(); k.fill();
    k.fillStyle = css(c.hot, 0.45); k.fillRect(gx + lr * 0.5, lq + ey, H * 0.006, gh * 0.3);
  }, { name: 'spec', mode: 'screen', rect: [gx - rt, top - ey, rt * 2, gh + ey * 2] });
  yield;
  // An out-of-focus foreground edge (a page), bottom left.
  soft(ctx, W, H, H * 0.03, k => {
    k.save(); k.translate(W * 0.08, H * 1.0); k.rotate(-0.18);
    k.fillStyle = css(mix(c.l1, c.mid, 0.4), 0.45); k.fillRect(-W * 0.2, -H * 0.12, W * 0.38, H * 0.3); k.restore();
  }, { name: 'fg', rect: [0, H * 0.8, W * 0.35, H * 0.2] });
}

function* windowShaft(ctx, W, H, c, r, seed) {
  const fy = H * lerp(0.72, 0.76, r());
  const day = mix(c.l0, c.lamp, 0.3);
  ctx.fillStyle = vgrad(ctx, 0, fy, [[0, c.black, 1], [1, mix(c.d0, c.d1, 0.7), 1]]);
  ctx.fillRect(0, 0, W, fy);
  mottle(ctx, 0, 0, W, fy, seed + 2, c.d1, 0.4, { cells: 5, mode: 'source-over' });
  yield;
  ctx.fillStyle = vgrad(ctx, fy, H, [[0, mix(c.d0, c.d1, 0.5), 1], [1, c.black, 1]]);
  ctx.fillRect(0, fy, W, H - fy);
  // Window: left third, four panes; a halo where it burns out.
  const ww = H * 0.3, wh = H * 0.44, wx = W / 3 - ww * 0.9, wy = H * 0.14, bar = H * 0.014;
  glow(ctx, wx + ww / 2, wy + wh / 2, H * 0.75, day, 0.28);
  ctx.fillStyle = css(c.hot); ctx.fillRect(wx, wy, ww, wh);
  glow(ctx, wx + ww / 2, wy + wh / 2, H * 0.32, c.hot, 0.35);
  ctx.fillStyle = css(mix(c.black, c.d1, 0.3));
  ctx.fillRect(wx + ww / 2 - bar / 2, wy, bar, wh); ctx.fillRect(wx, wy + wh / 2 - bar / 2, ww, bar);
  ctx.strokeStyle = css(mix(c.black, c.d1, 0.3)); ctx.lineWidth = bar * 1.4; ctx.strokeRect(wx, wy, ww, wh);
  yield;
  // Where the shaft lands: the window sheared onto the floor.
  const sx = H * 0.5, sk = H * 0.32, py0 = fy + H * 0.04, py1 = Math.min(H * 0.98, fy + (H - fy) * 0.85);
  const P = (u, v) => [wx + sx + u * ww * 1.15 + v * sk, lerp(py0, py1, v)];
  const quad = (k, u0, v0, u1, v1) => { const a = P(u0, v0), b = P(u1, v0), d = P(u1, v1), e = P(u0, v1); k.beginPath(); k.moveTo(...a); k.lineTo(...b); k.lineTo(...d); k.lineTo(...e); k.closePath(); };
  // Beam through haze: from the window to the patch, brightest at the glass.
  const [bx1, by1] = P(1, 1);
  soft(ctx, W, H, H * 0.03, k => {
    const [ax, ay] = P(0, 0);
    const g = k.createLinearGradient(wx + ww / 2, wy + wh / 2, (ax + bx1) / 2, (ay + by1) / 2);
    g.addColorStop(0, css(day, 0.26)); g.addColorStop(1, css(day, 0.06));
    k.fillStyle = g;
    k.beginPath(); k.moveTo(wx + ww, wy); k.lineTo(...P(1, 0)); k.lineTo(...P(1, 1)); k.lineTo(...P(0, 1)); k.lineTo(wx, wy + wh); k.lineTo(wx, wy); k.closePath(); k.fill();
  }, { name: 'beam', mode: 'screen', rect: [wx, wy, bx1 - wx, by1 - wy] });
  yield;
  soft(ctx, W, H, H * 0.004, k => {
    k.fillStyle = css(day, 0.6);
    const gap = 0.025;
    quad(k, 0, 0, 0.5 - gap, 0.5 - gap); k.fill(); quad(k, 0.5 + gap, 0, 1, 0.5 - gap); k.fill();
    quad(k, 0, 0.5 + gap, 0.5 - gap, 1); k.fill(); quad(k, 0.5 + gap, 0.5 + gap, 1, 1); k.fill();
  }, { name: 'patch', mode: 'screen', rect: [P(0, 0)[0], py0, bx1 - P(0, 0)[0], py1 - py0] });
  glow(ctx, ...P(0.5, 0.5), H * 0.5, day, 0.14, 'screen', 0.4);
  yield;
  // A figure on the right third, facing the window: the window side carries the light.
  const fx = W * (2 / 3) + W * 0.02 * (r() - 0.5), feet = fy + H * 0.17, fh = H * 0.66;
  // The figure stands in the light, so it blocks it. A vertical figure's shadow runs along the floor in
  // the light's horizontal direction: the window's sill (height hs above the floor) lands at the
  // patch's near edge, offset (sx, py0 − fy) on screen, so each unit of height throws (sx, py0 − fy)/hs
  // of shadow. The light comes mostly from the side, so the shadow's breadth is the body's depth seen
  // from the window, foreshortened into screen y. Only the part inside the lit patch shows; it is
  // painted as the unlit floor.
  {
    const hs = Math.max(fy - (wy + wh), H * 0.05);
    const ax = sx / hs, ay = (py0 - fy) / hs;
    const at = (h, o) => [fx + ax * h, feet + ay * h + o];   // height h above the feet, depth offset o
    const leg = fh * 0.022, coat = fh * 0.05;
    soft(ctx, W, H, H * 0.005, k => {
      k.save();
      k.beginPath();
      for (const [u0, v0, u1, v1] of [[0, 0, 0.475, 0.475], [0.525, 0, 1, 0.475], [0, 0.525, 0.475, 1], [0.525, 0.525, 1, 1]]) {
        const a = P(u0, v0), b = P(u1, v0), d = P(u1, v1), e = P(u0, v1);
        k.moveTo(...a); k.lineTo(...b); k.lineTo(...d); k.lineTo(...e); k.closePath();
      }
      k.clip();
      k.fillStyle = css(mix(c.d0, c.d1, 0.5), 0.9);
      k.beginPath();
      k.moveTo(...at(0, -leg)); k.lineTo(...at(fh * 0.27, -leg)); k.lineTo(...at(fh * 0.3, -coat)); k.lineTo(...at(fh * 0.82, -coat * 0.9));
      k.lineTo(...at(fh * 0.86, -coat * 0.35)); k.lineTo(...at(fh, -coat * 0.3)); k.lineTo(...at(fh, coat * 0.3)); k.lineTo(...at(fh * 0.86, coat * 0.35));
      k.lineTo(...at(fh * 0.82, coat * 0.9)); k.lineTo(...at(fh * 0.3, coat)); k.lineTo(...at(fh * 0.27, leg)); k.lineTo(...at(0, leg));
      k.closePath(); k.fill();
      k.restore();
    }, { name: 'cast', rect: [P(0, 0)[0], py0, bx1 - P(0, 0)[0], py1 - py0] });
  }
  yield;
  yield* rimmed(ctx, W, H, k => figurePath(k, fx, feet, fh, -1), c.black, day,
    { dx: -1, dy: -0.2, edge: H * 0.004, wrap: H * 0.02, a: 0.65, blur: H * 0.001, rect: figureRect(fx, feet, fh) });
}

const KINDS = {
  'wide-ext': wideExt, 'interior-practical': interiorPractical, 'close-silhouette': closeSilhouette,
  insert, 'night-street': nightStreet, 'window-shaft': windowShaft,
};

// --- Finishing ------------------------------------------------------------------------------------

const grainCache = new Map();
function grainFor(seed) {
  let t = grainCache.get(seed);
  if (!t) { t = grainTile(128, seed, { maxAlpha: 0.34 }); grainCache.set(seed, t); if (grainCache.size > 8) grainCache.delete(grainCache.keys().next().value); }
  return t;
}

/** #112 vignette (numbers only), multiplied. */
function vignette(ctx, W, H) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.translate(W / 2, H / 2); ctx.scale(1, (H / W) * 1.35);
  const R = W * 0.62, g = ctx.createRadialGradient(0, 0, R * 0.45, 0, 0, R);
  g.addColorStop(0, 'rgba(32,35,43,0)'); g.addColorStop(1, 'rgba(32,35,43,0.7)');
  ctx.fillStyle = g; ctx.fillRect(-W, -W, 2 * W, 2 * W);
  ctx.restore();
}

/**
 * Paint a still into ctx (identity transform) at W×H pixels. Pure in (palette, seed, kind, W, H).
 * `scale` is the CSS-pixel ratio, used only for the grain and caption size.
 */
export function paintStill(ctx, W, H, opts = {}) {
  const steps = stillSteps(ctx, W, H, opts);
  while (!steps.next().done);
}

/** paintStill as a generator: the composition's stages, then the upscale, finish and caption. */
function* stillSteps(ctx, W, H, { palette, seed = 1, kind = 'wide-ext', caption = true, scale = 1, maxPaint = MAX_PAINT } = {}) {
  const k = KINDS[kind] ? kind : 'wide-ext';
  const c = roles(palette);
  const s = (hashString(k) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  const r = mulberry32(s);
  const flip = r() < 0.5 && (k === 'wide-ext' || k === 'night-street' || k === 'window-shaft' || k === 'insert');
  // The scene is soft by nature: above maxPaint pixels wide it is painted smaller and scaled up,
  // which bounds the cost of big hero frames. Grain and caption are always drawn at full size.
  const down = W > maxPaint ? maxPaint / W : 1;
  const sw = Math.round(W * down), sh = Math.round(H * down);
  const target = down < 1 ? layer('scene', sw, sh) : null, sc = target ? target.getContext('2d') : ctx;
  resetCtx(sc, 1);
  sc.fillStyle = css(c.black); sc.fillRect(0, 0, sw, sh);
  sc.save();
  if (flip) { sc.translate(sw, 0); sc.scale(-1, 1); }
  for (const stages = KINDS[k](sc, sw, sh, c, r, s, flip); !stages.next().done;) yield sc;
  sc.restore();
  resetCtx(ctx, 1);
  if (target) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(target, 0, 0, sw, sh, 0, 0, W, H);
  }
  yield ctx;
  vignette(ctx, W, H);
  ctx.save(); ctx.scale(scale, scale);
  const pat = ctx.createPattern(grainFor(s % 997 + 1), 'repeat');
  ctx.globalAlpha = 0.24; ctx.fillStyle = pat; ctx.fillRect(0, 0, W / scale, H / scale);
  ctx.restore();
  if (caption) {
    const h = H / scale, fs = Math.round(clamp(h * 0.03, 8, 12)) * scale, pad = Math.max(10 * scale, H * 0.045);
    ctx.font = `500 ${fs}px ${MONO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(fs * 0.08).toFixed(2)}px`;
    // Bottom right: pages put their own "Placeholder still" badge bottom left.
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(236,230,218,0.6)';
    // A soft dark halo keeps the caption legible where it crosses a lit floor or a bright sky.
    ctx.shadowColor = 'rgba(7,8,10,0.85)'; ctx.shadowBlur = 3 * scale; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillText(CAPTION, W - pad, H - pad);
    ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
}

// --- Piece ----------------------------------------------------------------------------------------

export const meta = {
  id: 'still',
  title: 'Procedural still',
  context: '2d',
  duration: 0,
  loop: false,
  posterTime: 0,
  aspect: { wide: 2.39, tall: 4 / 3 },
  interactive: false,
  budgetMs: 30,
  fonts: [`500 12px ${MONO}`],
  params: [
    { key: 'kind', label: 'Composition', type: 'select', value: 'wide-ext', group: 'Frame',
      options: STILL_KINDS.map(k => ({ value: k, label: k.replace(/-/g, ' ') })) },
    { key: 'aspect', label: 'Delivery aspect', type: 'select', value: 0, group: 'Frame',
      options: [0, 2.76, 2.39, 1.85, 1.78, 1.33].map(v => ({ value: v, label: v ? `${v.toFixed(2)}:1` : 'Fill' })) },
    { key: 'caption', label: 'Caption', type: 'toggle', value: true, group: 'Frame' },
  ],
  record: { w: 1280, h: 536, fps: 1, subframes: 1, tune: 'stillimage' },
  credits: ['#105', '#112', '#118'],
};

export async function create(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let W = opts.width, H = opts.height, dpr = opts.dpr;
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);
  const buf = makeCanvas(1, 1);
  let key = '';

  function seek(t, p = {}) {
    const aspect = Number(p.aspect) || W / H;
    const box = containFit(aspect, 1, W, H), bw = box.s * aspect, bh = box.s;
    const pw = Math.max(1, Math.round(bw * dpr)), ph = Math.max(1, Math.round(bh * dpr));
    const k = [p.kind, normPalette(p.palette).join(), seed, pw, ph, dpr, p.caption !== false].join('|');
    if (k !== key) {   // cache keyed by every input: the paint is pure, so a repeat seek is a copy
      if (buf.width !== pw || buf.height !== ph) { buf.width = pw; buf.height = ph; }
      paintStill(buf.getContext('2d'), pw, ph, { palette: p.palette, seed, kind: p.kind, caption: p.caption !== false, scale: dpr });
      key = k;
    }
    resetCtx(ctx, 1);
    ctx.fillStyle = '#07080A'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, Math.round(box.x * dpr), Math.round(box.y * dpr));
  }

  return {
    seek,
    resize(w, h, d) { W = w; H = h; dpr = d; },
    dispose() { buf.width = buf.height = 1; },
    describe(p = {}) { return `Placeholder still, ${String(p.kind ?? 'wide-ext').replace(/-/g, ' ')} composition, painted from the film's palette.`; },
  };
}

// --- renderStill: cached, serialised, painted in steps ----------------------------------------------

/**
 * Pixel width for a still: the frame's CSS width × min(dpr, 1.5). Beyond 1.5× the soft scene and the
 * grain gain nothing visible, and the paint cost grows with the area. Callers that pass only `width`
 * compute it as CSS width × min(2, devicePixelRatio) (site/main.js, site/project.js, studies/still.html),
 * so the CSS width is recovered from it; `cssWidth` (with `dpr`) says it directly.
 */
export function stillWidth({ width = 1280, cssWidth, dpr } = {}) {
  const d = Number(dpr) > 0 ? Number(dpr) : globalThis.devicePixelRatio || 1;
  const css = Number(cssWidth) > 0 ? Number(cssWidth) : (Number(width) || 1280) / Math.min(2, Math.max(1, d));
  return Math.max(64, Math.min(2560, Math.round(css * Math.min(1.5, Math.max(1, d)))));
}

const BLOBS = new Map();   // key → Promise<Blob>, most recently used last
const BLOBS_MAX = 24;
let queue = Promise.resolve();

/**
 * Hand the main thread back between paint steps: a new task queued behind whatever else is waiting
 * (input, rendering, other scripts' tasks). This is a task boundary, not a clock: the steps and their
 * pixels are the same however long the wait is. (scheduler.yield would put the still ahead of them.)
 */
const nextTask = () => new Promise(res => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); res(); };
  ch.port2.postMessage(0);
});

/** Paint one still (OffscreenCanvas where available) in steps and encode it. */
async function paintBlob(W, H, opts) {
  await loadFonts(meta.fonts);
  let cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(W, H) : null;
  let ctx = cv?.getContext('2d');
  if (!ctx) { cv = makeCanvas(W, H); ctx = cv.getContext('2d'); }
  const steps = stillSteps(ctx, W, H, opts);
  // Each step yields the context it drew into; a 1-pixel read makes the browser rasterise that step's
  // (deferred) drawing now, inside this task, instead of all at once at the encode.
  for (let st = steps.next(); !st.done; st = steps.next()) {
    st.value?.getImageData(0, 0, 1, 1);
    await nextTask();
  }
  const blob = typeof cv.convertToBlob === 'function'
    ? await cv.convertToBlob({ type: 'image/webp', quality: 0.88 })
    : await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/webp', 0.88));
  cv.width = cv.height = 1;
  return blob;
}

/**
 * Render a placeholder still and return an object URL (image/webp where supported, else PNG).
 * The caller owns the URL (URL.revokeObjectURL when the <img> goes away); each call gets its own URL.
 * Stills are cached by (palette, aspect, seed, kind, pixel width, caption) and painted one at a time,
 * in steps that each return to the event loop, so no single task holds the main thread for a whole still.
 * @param {{ palette?: string[], aspect?: number, seed?: number, kind?: string, width?: number, cssWidth?: number, dpr?: number, caption?: boolean }} o
 * @returns {Promise<string>}
 */
export async function renderStill({ palette, aspect = 1.78, seed = 1, kind = 'wide-ext', width = 1280, cssWidth, dpr, caption = true } = {}) {
  const ar = Number(aspect) || 1.78, k = KINDS[kind] ? kind : 'wide-ext';
  const W = stillWidth({ width, cssWidth, dpr }), H = Math.max(16, Math.round(W / ar));
  const key = [normPalette(palette).join(), ar, seed, k, W, caption !== false].join('|');
  let job = BLOBS.get(key);
  if (job) BLOBS.delete(key);
  else {
    job = queue.then(() => paintBlob(W, H, { palette, seed, kind: k, caption, scale: clamp(W / 1280 * 1.5, 1, 2) }));
    queue = job.catch(() => {});
    job.catch(() => BLOBS.delete(key));
  }
  BLOBS.set(key, job);
  while (BLOBS.size > BLOBS_MAX) BLOBS.delete(BLOBS.keys().next().value);
  return URL.createObjectURL(await job);
}
