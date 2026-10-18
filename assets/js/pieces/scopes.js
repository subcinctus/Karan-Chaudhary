// Colour study · scopes. A waveform and a vectorscope computed from the graded 8-bit output, the way
// a grading suite would show them, plus the numbers behind the study's spoken summary.
//
//   Waveform     Y′ (BT.709 coefficients on encoded values) per column bucket: a 256 × 128 histogram,
//                softened [1 2 1] down each column, intensity log1p(n) / log1p(0.5 · max). Graticule 0 / 10 / 50 / 90 / 100 % (full range).
//   Vectorscope  Cb / Cr in 160² bins: x = c + Cb · 0.9R / 0.5, y = c − Cr · 0.9R / 0.5. 75 % targets
//                from R Yl G Cy B Mg; the skin line at 123°.
//   Sampling     stride 2 in x and y (~96k samples at 960 × 402). Recompute only when the image changes.
//
// Pure functions of the pixels; drawing helpers take a 2D context and a rect in CSS pixels.

import { rgbToYCbCr709 } from '../core/color.js';
import { SKIN_DEG } from './colour-grade.js';

export const WAVE_W = 256, WAVE_H = 128, VEC = 160;
const VR = VEC / 2, VK = (0.9 * VR) / 0.5;           // bins per unit of Cb / Cr
const VKB = VK / (1.8556 * 255), VKR = VK / (1.5748 * 255);   // straight from 8-bit B′−Y′, R′−Y′
const HUE_BINS = 72;                                  // 5° each
export const PHOSPHOR = [156, 226, 178];

// Display palette (tokens.css).
const C = { panel: '#0A0B0E', line: '#2A2E36', strong: '#3A3F49', paper: '#ECE6DA', paper2: '#B9B3A8', paper3: '#8A857C', tungsten: '#F4B26A' };
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** 75 % colour-bar targets on the vectorscope. */
export const TARGETS = [
  ['R', [0.75, 0, 0]], ['MG', [0.75, 0, 0.75]], ['B', [0, 0, 0.75]],
  ['CY', [0, 0.75, 0.75]], ['G', [0, 0.75, 0]], ['YL', [0.75, 0.75, 0]],
].map(([name, rgb]) => { const [, cb, cr] = rgbToYCbCr709(...rgb); return { name, cb, cr }; });

/**
 * Scopes from an RGBA buffer.
 * @returns {{ wave: Uint32Array, waveMax: number, vec: Uint32Array, vecMax: number, stats: object }}
 */
export function computeScopes(rgba, W, H, stride = 2) {
  const wave = new Uint32Array(WAVE_W * WAVE_H), vec = new Uint32Array(VEC * VEC);
  const yHist = new Uint32Array(256), hue = new Float64Array(HUE_BINS);
  // Sampled columns per bucket differ (e.g. 480 → 256), so counts are normalised per bucket later.
  const colBucket = new Uint16Array(W), colN = new Float32Array(WAVE_W);
  for (let x = 0; x < W; x++) { colBucket[x] = Math.min(WAVE_W - 1, ((x * WAVE_W) / W) | 0); if (x % stride === 0) colN[colBucket[x]]++; }
  let n = 0, clipped = 0, chromaSum = 0, chromaW = 0, coloured = 0;
  for (let y = 0; y < H; y += stride) {
    for (let x = 0, o = y * W * 4; x < W; x += stride, o += stride * 4) {
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, yi = Y + 0.5 | 0;
      n++; yHist[yi]++;
      if (r >= 254 || g >= 254 || b >= 254) clipped++;
      wave[(WAVE_H - 1 - (yi >> 1)) * WAVE_W + colBucket[x]]++;
      const vx = (VR + (b - Y) * VKB) | 0, vy = (VR - (r - Y) * VKR) | 0;
      if (vx >= 0 && vy >= 0 && vx < VEC && vy < VEC) vec[vy * VEC + vx]++;
    }
  }
  // Hue statistics from the vectorscope bins (25.6k bins, not 96k samples).
  for (let vy = 0, i = 0; vy < VEC; vy++) {
    const cr = (VR - vy - 0.5) / VK;
    for (let vx = 0; vx < VEC; vx++, i++) {
      const k = vec[i];
      if (!k) continue;
      const cb = (vx + 0.5 - VR) / VK, c = vx === VR && vy === VR ? 0 : Math.sqrt(cb * cb + cr * cr);   // centre bin = neutral
      chromaSum += c * k;
      if (c > 0.02) {
        let a = Math.atan2(cr, cb) * 180 / Math.PI; if (a < 0) a += 360;
        hue[Math.min(HUE_BINS - 1, (a / 360 * HUE_BINS) | 0)] += c * k; chromaW += c * k; coloured += k;
      }
    }
  }
  let waveMax = 0, vecMax = 0;
  const colMean = colN.reduce((a, b) => a + b, 0) / WAVE_W;
  // Per-bucket normalisation, then a [1 2 1] / 4 pass down each column: 8-bit codes binned in pairs
  // leave a comb of empty rows in smooth gradients (the sky), which reads as stipple, not as a trace.
  const waveN = new Float32Array(wave.length), waveS = new Float32Array(wave.length);
  for (let i = 0; i < wave.length; i++) waveN[i] = (wave[i] * colMean) / (colN[i % WAVE_W] || 1);
  for (let y = 0, i = 0; y < WAVE_H; y++) {
    for (let x = 0; x < WAVE_W; x++, i++) {
      const up = y > 0 ? waveN[i - WAVE_W] : waveN[i], dn = y < WAVE_H - 1 ? waveN[i + WAVE_W] : waveN[i];
      const v = (waveS[i] = 0.25 * up + 0.5 * waveN[i] + 0.25 * dn);
      if (v > waveMax) waveMax = v;
    }
  }
  for (let i = 0; i < vec.length; i++) if (i !== VR * VEC + VR && vec[i] > vecMax) vecMax = vec[i];
  const pct = q => { let acc = 0; const target = q * n; for (let i = 0; i < 256; i++) { acc += yHist[i]; if (acc >= target) return i; } return 255; };
  const share = (deg, half = 17.5) => {
    let s = 0;
    for (let i = 0; i < HUE_BINS; i++) {
      const mid = (i + 0.5) * (360 / HUE_BINS);
      let d = Math.abs(mid - deg) % 360; if (d > 180) d = 360 - d;
      if (d <= half) s += hue[i];
    }
    return chromaW ? s / chromaW : 0;
  };
  const sectors = {};
  for (let i = 0; i < HUE_BINS; i++) { const name = hueName((i + 0.5) * (360 / HUE_BINS)); sectors[name] = (sectors[name] ?? 0) + (chromaW ? hue[i] / chromaW : 0); }
  const stats = {
    samples: n,
    black: (pct(0.01) / 255) * 100,
    median: (pct(0.5) / 255) * 100,
    peak: (pct(0.995) / 255) * 100,
    clipped: (clipped / n) * 100,
    crushed: ((yHist[0] + yHist[1] + yHist[2] + yHist[3]) / n) * 100,
    chroma: chromaSum / n,
    colourShare: coloured / n,            // samples with chroma above 0.02
    skinShare: share(SKIN_DEG), tealShare: share(SKIN_DEG + 180),
    sectors,
  };
  return { wave: waveS, waveMax, vec, vecMax, stats };
}

/** Plain-language name for a vectorscope angle (degrees, Cb axis = 0°, Cr up). */
export function hueName(a) {
  a = ((a % 360) + 360) % 360;
  if (a < 20 || a >= 340) return 'blue';
  if (a < 80) return 'magenta';
  if (a < 113) return 'red';
  if (a < 160) return 'orange';
  if (a < 200) return 'yellow';
  if (a < 255) return 'green';
  if (a < 305) return 'cyan';
  return 'steel blue';
}

const fmtPct = v => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toString();

/** Spoken summary, e.g. "Waveform: shadows at 3%, 1.2% of pixels clipped; vectorscope: hues gathered on the skin line." */
export function describeScopes(s) {
  const wave = [`shadows at ${fmtPct(s.black)}%`, `highlights peaking at ${fmtPct(s.peak)}%`];
  wave.push(s.clipped >= 0.05 ? `${fmtPct(s.clipped)}% of pixels clipped` : 'nothing clipped');
  let vec;
  if (s.colourShare < 0.01) vec = 'no colour; the trace sits on the centre';
  else if (s.skinShare + s.tealShare >= 0.62) {
    vec = 'hues gathered on the skin line' + (s.tealShare >= 0.12 ? ' and its teal opposite' : '');
  } else {
    const top = Object.entries(s.sectors).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.12).slice(0, 2).map(([k]) => k);
    vec = top.length > 1 ? `hues split between ${top[0]} and ${top[1]}` : `hues mostly ${top[0] ?? 'neutral'}`;
  }
  const sat = s.colourShare < 0.01 ? '' : s.chroma < 0.02 ? ', low saturation' : s.chroma > 0.06 ? ', rich saturation' : '';
  return `Waveform: ${wave.join(', ')}; vectorscope: ${vec}${sat}.`;
}

// --- rendering ------------------------------------------------------------------------

/** Paint scope intensities into an ImageData (phosphor with alpha). */
function paint(img, counts, max, gamma = 0.8) {
  const d = img.data, norm = 1 / Math.log1p(Math.max(1, 0.5 * max));
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i], o = i * 4;
    if (!n) { d[o + 3] = 0; continue; }
    const v = Math.min(1, Math.log1p(n) * norm), a = Math.pow(v, gamma);
    if (v < 0.02) { d[o + 3] = 0; continue; }
    // The hottest bins whiten slightly, like a phosphor trace.
    const w = Math.max(0, v - 0.75) * 2.4;
    d[o] = PHOSPHOR[0] + (236 - PHOSPHOR[0]) * w; d[o + 1] = PHOSPHOR[1] + (246 - PHOSPHOR[1]) * w; d[o + 2] = PHOSPHOR[2] + (232 - PHOSPHOR[2]) * w;
    d[o + 3] = Math.round(255 * (0.06 + 0.94 * a));
  }
}

/** Offscreen canvases holding the rendered traces (reuse between frames). */
export function createScopeSurfaces(doc = document) {
  const mk = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
  const wave = mk(WAVE_W, WAVE_H), vec = mk(VEC, VEC);
  const wk = wave.getContext('2d'), vk = vec.getContext('2d');
  const wImg = wk.createImageData(WAVE_W, WAVE_H), vImg = vk.createImageData(VEC, VEC);
  return {
    wave, vec,
    update(sc) {
      paint(wImg, sc.wave, sc.waveMax); wk.putImageData(wImg, 0, 0);
      paint(vImg, sc.vec, sc.vecMax, 0.7); vk.putImageData(vImg, 0, 0);
    },
  };
}

const label = (ctx, text, x, y, fs, color = C.paper3, align = 'left', weight = 500) => {
  ctx.font = `${weight} ${fs}px ${MONO}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
};
const hair = (ctx, x0, y0, x1, y1, color, dash = null) => {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.setLineDash(dash ?? []);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]);
};
/** Snap a coordinate to the device-pixel centre so 1 px hairlines stay crisp. */
const snap = (v, dpr) => (Math.round(v * dpr - 0.5) + 0.5) / dpr;

/**
 * Waveform panel. rect in CSS px; wipe ∈ [0, 1] marks the A/B split (the waveform's x is the image's x).
 */
export function drawWaveform(ctx, r, surface, { fs, dpr = 1, wipe = null, title = 'WAVEFORM · Y′ 709' }) {
  label(ctx, title, r.x, r.y - fs * 0.95, fs);
  label(ctx, 'FULL RANGE %', r.x + r.w, r.y - fs * 0.95, fs, C.paper3, 'right', 400);
  ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
  const gut = Math.round(fs * 2.4), padY = Math.round(fs * 0.8);
  const p = { x: r.x + gut, y: r.y + padY, w: r.w - gut - fs * 0.8, h: r.h - 2 * padY };
  const roomy = p.h * 0.1 >= fs * 1.05;   // 10 % apart is enough for both 90 and 100 labels
  for (const [v, strong] of [[100, 1], [90, 0], [50, 0], [10, 0], [0, 1]]) {
    const y = snap(p.y + p.h * (1 - v / 100), dpr);
    hair(ctx, p.x, y, p.x + p.w, y, strong ? C.strong : C.line, strong ? null : [2, 3]);
    if (roomy || v === 100 || v === 50 || v === 0) label(ctx, String(v), p.x - fs * 0.6, y, Math.max(9.5, fs * 0.86), C.paper3, 'right', 400);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(surface.wave, p.x, p.y, p.w, p.h);
  ctx.restore();
  if (wipe != null && wipe > 0.002 && wipe < 0.998) {
    const x = snap(p.x + p.w * wipe, dpr);
    ctx.globalAlpha = 0.55; hair(ctx, x, p.y - padY * 0.5, x, p.y + p.h + padY * 0.5, C.tungsten, [1, 3]); ctx.globalAlpha = 1;
    label(ctx, 'A', x - fs * 0.6, r.y + padY * 0.5 + 1, Math.max(9.5, fs * 0.8), C.paper2, 'right');
    label(ctx, 'B', x + fs * 0.6, r.y + padY * 0.5 + 1, Math.max(9.5, fs * 0.8), C.paper2, 'left');
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.strokeRect(snap(r.x, dpr), snap(r.y, dpr), Math.round(r.w), Math.round(r.h));
}

/** Vectorscope panel (square rect). */
export function drawVectorscope(ctx, r, surface, { fs, dpr = 1, title = 'VECTOR · CB/CR' }) {
  label(ctx, title, r.x, r.y - fs * 0.95, fs);
  ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
  const S = Math.min(r.w, r.h), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const k = S / VEC, R = 0.9 * VR * k;                      // radius of 100 % saturation
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  hair(ctx, snap(cx, dpr), cy - R, snap(cx, dpr), cy + R, C.line);
  hair(ctx, cx - R, snap(cy, dpr), cx + R, snap(cy, dpr), C.line);
  // Skin line.
  const a = (SKIN_DEG * Math.PI) / 180, ex = cx + Math.cos(a) * R * 1.04, ey = cy - Math.sin(a) * R * 1.04;
  ctx.globalAlpha = 0.7; hair(ctx, cx, cy, ex, ey, C.tungsten); ctx.globalAlpha = 1;
  // Trace.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(surface.vec, cx - S / 2, cy - S / 2, S, S);
  ctx.restore();
  // 75 % targets.
  const box = Math.max(4, fs * 0.55);
  for (const t of TARGETS) {
    const tx = cx + t.cb * VK * k, ty = cy - t.cr * VK * k;
    ctx.strokeStyle = C.strong; ctx.lineWidth = 1;
    ctx.strokeRect(snap(tx - box / 2, dpr), snap(ty - box / 2, dpr), Math.round(box), Math.round(box));
    const len = Math.hypot(tx - cx, ty - cy) || 1;
    label(ctx, t.name, tx + ((tx - cx) / len) * fs * 1.25, ty + ((ty - cy) / len) * fs * 1.1, Math.max(9, fs * 0.78), C.paper3, 'center', 400);
  }
  label(ctx, 'SKIN', ex + Math.cos(a) * fs * 0.4, ey - fs * 0.75, Math.max(9, fs * 0.78), C.tungsten, 'center', 400);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.strokeRect(snap(r.x, dpr), snap(r.y, dpr), Math.round(r.w), Math.round(r.h));
}
