// Motion Prompt #115 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#115
// Motion Prompt #117 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#117
// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
// (numbers only: #115 luminance 0.2126/0.7152/0.0722 and contrast ×1.25 around 140; #117 the teal /
//  orange palette roles, rebuilt as a skin-axis grade; #118 16 % toward #F2DDBE plus static grain,
//  55 % dark #3A3530 / 45 % white, opacity from #118's 16–38 % (scaled; see colour-scene.js). Nothing vendored.)
//
// Colour study · the grade. Scene-referred linear light in, 8-bit display RGBA out.
//
//   LOG            ARRI LogC3 EI 800 of (linear · 2^EV), shown as is (the flat camera original)
//   Rec.709        (linear · 2^EV) → Narkowicz ACES fit → sRGB OETF
//   Teal & orange  709 → Y′CbCr (BT.709), chroma pulled 60 % onto the skin axis (123°) and ×1.25,
//                  highlights nudged orange, shadows teal, luma contrast ×1.1 around 0.5
//   Bleach bypass  709 → overlay of luma onto colour (NVIDIA formula), 70 % opacity
//   B&W            709 → Y′, contrast ×1.25 around 140/255 (#115)
//   Day for night  linear · 2^−2.3, sky · 2^(−1.5·mask), WB gains (0.62, 0.85, 1.25) and a 55 %
//                  desaturation, both lifted off emitters (p = smoothstep(1.5, 6, Y_scene)) → 709
//   Print finish   (any look) 16 % toward #F2DDBE + static grain (#118)
//
// Speed: per-channel transfer curves are 1D LUTs indexed by the float's own bits (see below), so there
// is no log/pow per pixel. Each look is graded once per (look, EV, print) into a full-frame buffer and
// cached; moving the wipe only copies rows.

import { logC3Encode, acesFit, srgbEncode, ditherOffset, hexToRgb } from '../core/color.js';

export const LOOKS = [
  { id: 'log', label: 'Log C', name: 'LOG C3 · EI 800', spoken: 'the flat Log C camera original' },
  { id: 'rec709', label: 'Rec.709', name: 'REC.709', spoken: 'the Rec. 709 display transform' },
  { id: 'teal', label: 'Teal/orange', name: 'TEAL & ORANGE', spoken: 'teal and orange' },
  { id: 'bleach', label: 'Bleach', name: 'BLEACH BYPASS', spoken: 'bleach bypass' },
  { id: 'bw', label: 'B&W', name: 'BLACK & WHITE', spoken: 'black and white' },
  { id: 'd4n', label: 'Day for night', name: 'DAY FOR NIGHT', spoken: 'day for night' },
];
export const LOOK_BY_ID = Object.fromEntries(LOOKS.map(l => [l.id, l]));

export const SKIN_DEG = 123;
const UX = Math.cos((SKIN_DEG * Math.PI) / 180), UY = Math.sin((SKIN_DEG * Math.PI) / 180);
const PRINT = hexToRgb('#F2DDBE').map(v => v / 255);
const GRAIN_DARK = hexToRgb('#3A3530').map(v => v / 255);
const D4N_GAINS = [0.62, 0.85, 1.25];

// --- float-bit LUTs ---------------------------------------------------------------
// A linear value's LUT index is its float32 bit pattern shifted right: exponent + top 8 mantissa bits,
// i.e. 256 entries per octave from 2^−24 to 2^12. Each pixel's index is computed once per scene
// (Uint16), and exposure is folded into the LUT itself: lut_ev[j] = f(2^ev · x_j). A graded frame is
// then table gathers plus, for the creative looks, a few multiply-adds in display space.

const F = new Float32Array(1), I = new Int32Array(F.buffer);
const MB = 8, SHIFT = 23 - MB, LO = -24, HI = 12;
const BASE = (127 + LO) << MB, NL = (HI - LO) << MB;
const lutX = j => Math.pow(2, (j >> MB) + LO) * (1 + ((j & ((1 << MB) - 1)) + 0.5) / (1 << MB));

/** LUT index of a linear value (negative / tiny → 0, huge → last). */
function li(x) {
  F[0] = x;
  const j = (I[0] >> SHIFT) - BASE;
  return j < 0 ? 0 : j >= NL ? NL - 1 : j;
}

const TRANSFER = { log: logC3Encode, d709: x => srgbEncode(acesFit(x)) };
const lutCache = new Map();
/** Transfer LUT with exposure folded in; `scale` 255 for looks that write it straight out. */
function lut(name, ev, scale = 1) {
  const key = `${name}|${ev}|${scale}`;
  let t = lutCache.get(key);
  if (!t) {
    const f = TRANSFER[name], k = Math.pow(2, ev);
    t = new Float32Array(NL);
    for (let j = 0; j < NL; j++) t[j] = f(k * lutX(j)) * scale;
    if (lutCache.size > 24) lutCache.delete(lutCache.keys().next().value);
    lutCache.set(key, t);
  }
  return t;
}

const sstep = (a, b, x) => { const u = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return u * u * (3 - 2 * u); };

/**
 * Teal & orange as a matrix. With c = (Cb, Cr) from R′G′B′ (BT.709) and u the skin axis:
 *   c′ = 1.25 · (0.4·c + 0.6·u(u·c)) + shift(Y′)·u,  Y″ = 0.5 + 1.1·(Y′ − 0.5)
 *   shift(Y′) = 0.04·smoothstep(.45, .9, Y′) − 0.05·(1 − smoothstep(.05, .45, Y′))
 * back to R′G′B′ (G′ = Y − .1873Cb − .4681Cr). Everything but shift is linear, so on 0..255 values
 * out = T·rgb − 12.75 + shift(Y′)·w, with w = 255·B·u, and shift tabulated over Y′ in quarter-code steps (index 4·Y′, 0..1020).
 */
const TEAL = (() => {
  const l = [0.2126, 0.7152, 0.0722];
  const C = [[-l[0] / 1.8556, -l[1] / 1.8556, (1 - l[2]) / 1.8556], [(1 - l[0]) / 1.5748, -l[1] / 1.5748, -l[2] / 1.5748]];
  const M = [[1.25 * (0.4 + 0.6 * UX * UX), 1.25 * 0.6 * UX * UY], [1.25 * 0.6 * UX * UY, 1.25 * (0.4 + 0.6 * UY * UY)]];
  const B = [[0, 1.5748], [-0.1873, -0.4681], [1.8556, 0]];
  const MC = [0, 1].map(r => [0, 1, 2].map(c => M[r][0] * C[0][c] + M[r][1] * C[1][c]));
  const T = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) T.push(1.1 * l[c] + B[r][0] * MC[0][c] + B[r][1] * MC[1][c]);
  const w = B.map(([b0, b1]) => 255 * (b0 * UX + b1 * UY));
  const shift = new Float32Array(1025);
  for (let k = 0; k <= 1024; k++) { const Y = k / 1020; shift[k] = 0.04 * sstep(0.45, 0.9, Y) - 0.05 * (1 - sstep(0.05, 0.45, Y)); }
  return { T, w, shift };
})();

// --- grader ---------------------------------------------------------------------------

/**
 * A grader bound to one scene (from colour-scene.js).
 *   look(id, ev, print) → Uint8ClampedArray RGBA, W×H (cached)
 *   composite(a, b, wipeX, ev, print) → Uint8ClampedArray RGBA: look a left of column wipeX, b right
 */
export function createGrader(scene) {
  const { W, H, rgb, sky, lum, grainA, grainC } = scene, N = W * H;
  const dither = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dither[y * W + x] = ditherOffset(x, y, scene.seed) * 255 + 0.5;   // ±0.5 code + 0.5 so truncation rounds
  const idx = new Uint16Array(N * 3);
  for (let j = 0; j < N * 3; j++) idx[j] = li(rgb[j]);
  const looks = new Map();
  let idxD4N = null, comp = null, compKey = '';

  /** Day for night happens in linear light before the display transform, so it is folded into indices. */
  function d4nIndex() {
    if (idxD4N) return idxD4N;
    idxD4N = new Uint16Array(N * 3);
    const base = Math.pow(2, -2.3);
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const p = sstep(1.5, 6, lum[i]), k = base * Math.pow(2, -1.5 * sky[i]);
      let r = rgb[j] * k * (D4N_GAINS[0] + (1 - D4N_GAINS[0]) * p);
      let g = rgb[j + 1] * k * (D4N_GAINS[1] + (1 - D4N_GAINS[1]) * p);
      let b = rgb[j + 2] * k * (D4N_GAINS[2] + (1 - D4N_GAINS[2]) * p);
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, s = 0.55 * (1 - p);
      r += (Y - r) * s; g += (Y - g) * s; b += (Y - b) * s;
      idxD4N[j] = li(r); idxD4N[j + 1] = li(g); idxD4N[j + 2] = li(b);
    }
    return idxD4N;
  }

  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('colour-grade: little-endian only');

  /**
   * #118 print finish: 16 % toward #F2DDBE, then the static grain (55 % dark #3A3530 / 45 % white;
   * see colour-scene.js). Per pixel and channel that is affine, out = v·0.84(1 − a) + (0.16·P(1 − a)
   * + grain·a)·255, applied after the look the way a print emulation sits after the grade. The grain
   * opacity a is quantised to 32 levels (invisible in a hashed speck), so each pixel needs one byte:
   * its grain class (white?, level), indexing a 64 × 3 × 256 byte table of finished values.
   */
  let printT = null;
  function printTables() {
    if (printT) return printT;
    let a0 = Infinity, a1 = -Infinity;
    for (let i = 0; i < N; i++) { const a = grainA[i]; if (a < a0) a0 = a; if (a > a1) a1 = a; }
    const span = a1 > a0 ? (a1 - a0) / 31 : 1;
    const cls = new Uint8Array(N);
    for (let i = 0; i < N; i++) cls[i] = (grainC[i] ? 32 : 0) | Math.round((grainA[i] - a0) / span);
    const lut8 = new Uint8Array(64 * 3 * 256);
    for (let q = 0; q < 64; q++) {
      const a = a0 + (q & 31) * span, c = q >> 5;
      for (let ch = 0; ch < 3; ch++) {
        const k = 0.84 * (1 - a), o = (0.16 * PRINT[ch] * (1 - a) + (GRAIN_DARK[ch] + (1 - GRAIN_DARK[ch]) * c) * a) * 255;
        for (let v = 0; v < 256; v++) lut8[(q * 3 + ch) * 256 + v] = Math.min(255, Math.round(v * k + o));
      }
    }
    return (printT = { cls, lut8 });
  }

  // Each look is one small hot loop (module level, below) so V8 optimises it on its own types;
  // the print finish is a second pass over the finished bytes. Buffers evicted from the look cache
  // are reused, so steady-state grading allocates nothing.
  const spare = [];
  function grade(id, ev, print) {
    const out = spare.pop() ?? new Uint8ClampedArray(N * 4), o32 = new Uint32Array(out.buffer);
    if (id === 'log' || id === 'rec709' || id === 'd4n') {
      loopCurve(lut(id === 'log' ? 'log' : 'd709', ev, 255), id === 'd4n' ? d4nIndex() : idx, dither, o32, N);
    } else {
      const D = lut('d709', ev, 255);
      if (id === 'teal') loopTeal(D, idx, dither, o32, N);
      else if (id === 'bleach') loopBleach(D, idx, dither, o32, N);
      else loopBW(D, idx, dither, o32, N);
    }
    if (print) { const { cls, lut8 } = printTables(); loopPrint(o32, cls, lut8, N); }
    return out;
  }

  function look(id, ev = 0, print = false) {
    id = LOOK_BY_ID[id] ? id : 'rec709';
    const key = `${id}|${ev}|${print ? 1 : 0}`;
    let buf = looks.get(key);
    if (!buf) {
      if (looks.size >= 8) {                                            // keep the 8 most recent
        const k0 = looks.keys().next().value;
        spare.push(looks.get(k0)); looks.delete(k0);
      }
      buf = grade(id, ev, print);
      looks.set(key, buf);
    }
    return buf;
  }

  function composite(a, b, wipeX, ev = 0, print = false) {
    const wx = Math.max(0, Math.min(W, Math.round(wipeX)));
    const key = `${a}|${b}|${wx}|${ev}|${print ? 1 : 0}`;
    if (key === compKey) return comp;
    const A = look(a, ev, print), B = look(b, ev, print);
    comp ??= new Uint8ClampedArray(N * 4);
    const row = W * 4, cut = wx * 4;
    for (let y = 0, o = 0; y < H; y++, o += row) {
      if (cut > 0) comp.set(A.subarray(o, o + cut), o);
      if (cut < row) comp.set(B.subarray(o + cut, o + row), o + cut);
    }
    compKey = key;
    return comp;
  }

  return { W, H, look, composite, dispose() { looks.clear(); spare.length = 0; comp = null; idxD4N = null; printT = null; } };
}

// --- hot loops ------------------------------------------------------------------------------
// Values arrive in 0..255 with the dither (±0.5 code, plus 0.5 so truncation rounds). Truncate
// with |0 first, then clamp as integers, then one 32-bit store (RGBA bytes, little-endian word).

/** LOG, Rec.709 and day for night: one transfer LUT per channel. LUTs are ≥ 0. */
function loopCurve(L, ix, dither, o32, N) {
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    const d = dither[i];
    let R = (L[ix[j]] + d) | 0, G = (L[ix[j + 1]] + d) | 0, B = (L[ix[j + 2]] + d) | 0;
    R = R > 255 ? 255 : R; G = G > 255 ? 255 : G; B = B > 255 ? 255 : B;
    o32[i] = 0xff000000 | (B << 16) | (G << 8) | R;
  }
}

/** Teal & orange: out = T·rgb − 12.75 + shift(Y′)·w (see TEAL). */
function loopTeal(D, idx, dither, o32, N) {
  const { T, w, shift } = TEAL;
  const T0 = T[0], T1 = T[1], T2 = T[2], T3 = T[3], T4 = T[4], T5 = T[5], T6 = T[6], T7 = T[7], T8 = T[8];
  const w0 = w[0], w1 = w[1], w2 = w[2];
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    const r = D[idx[j]], g = D[idx[j + 1]], b = D[idx[j + 2]], d = dither[i] - 12.75;
    const sh = shift[(0.2126 * r + 0.7152 * g + 0.0722 * b) * 4 | 0];
    let R = (T0 * r + T1 * g + T2 * b + sh * w0 + d) | 0, G = (T3 * r + T4 * g + T5 * b + sh * w1 + d) | 0, B = (T6 * r + T7 * g + T8 * b + sh * w2 + d) | 0;
    R = R < 0 ? 0 : R > 255 ? 255 : R; G = G < 0 ? 0 : G > 255 ? 255 : G; B = B < 0 ? 0 : B > 255 ? 255 : B;
    o32[i] = 0xff000000 | (B << 16) | (G << 8) | R;
  }
}

/**
 * NVIDIA bleach bypass on 0..255 values: A = 2·c·L (dark), B = 1 − 2(1 − L)(1 − c) (light),
 * mixed by t = clamp(10(L − .45)), then 70 % over the original: out = 0.3c + 0.7·mix(A, B, t).
 */
function loopBleach(D, idx, dither, o32, N) {
  const k = 1 / 255;
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    const r = D[idx[j]], g = D[idx[j + 1]], b = D[idx[j + 2]], d = dither[i];
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) * k, f = 0.3 + 1.4 * L;
    let R, G, B;
    if (L <= 0.45) { R = (r * f + d) | 0; G = (g * f + d) | 0; B = (b * f + d) | 0; }
    else {
      const t = L >= 0.55 ? 1 : (L - 0.45) * 10, q = 1.4 * (1 - L);
      const Ar = r * f, Ag = g * f, Ab = b * f;
      R = (Ar + (0.3 * r + 178.5 - q * (255 - r) - Ar) * t + d) | 0;
      G = (Ag + (0.3 * g + 178.5 - q * (255 - g) - Ag) * t + d) | 0;
      B = (Ab + (0.3 * b + 178.5 - q * (255 - b) - Ab) * t + d) | 0;
    }
    R = R < 0 ? 0 : R > 255 ? 255 : R; G = G < 0 ? 0 : G > 255 ? 255 : G; B = B < 0 ? 0 : B > 255 ? 255 : B;
    o32[i] = 0xff000000 | (B << 16) | (G << 8) | R;
  }
}

/** Black & white (#115): luminance, contrast ×1.25 around 140. */
function loopBW(D, idx, dither, o32, N) {
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    let v = ((0.2126 * D[idx[j]] + 0.7152 * D[idx[j + 1]] + 0.0722 * D[idx[j + 2]] - 140) * 1.25 + 140 + dither[i]) | 0;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    o32[i] = 0xff000000 | (v << 16) | (v << 8) | v;
  }
}

/** #118 print finish over finished bytes: three byte lookups per pixel (see printTables). */
function loopPrint(o32, cls, lut8, N) {
  for (let i = 0; i < N; i++) {
    const v = o32[i], q = cls[i] * 768;
    o32[i] = 0xff000000 | (lut8[q + 512 + ((v >>> 16) & 255)] << 16) | (lut8[q + 256 + ((v >>> 8) & 255)] << 8) | lut8[q + (v & 255)];
  }
}
