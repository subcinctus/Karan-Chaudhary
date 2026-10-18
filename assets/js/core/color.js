// Colour science used by the studies. Linear light everywhere; encode only at output.
// Sources: Kim et al. 2002 (Planckian locus cubic spline), IEC 61966-2-1 (sRGB),
// ARRI LogC3 EI 800, ITU-R BT.709, Narkowicz ACES filmic fit, Bradford CAT (von Kries).

import { clamp } from './time.js';

// --- Planckian locus -------------------------------------------------------

/** Correlated colour temperature (1667–25000 K) → CIE 1931 xy, Kim et al. cubic spline. */
export function cctToXy(T) {
  const K = clamp(T, 1667, 25000);
  const k1 = 1 / K, k2 = k1 * k1, k3 = k2 * k1;
  const x = K <= 4000
    ? -0.2661239e9 * k3 - 0.2343589e6 * k2 + 0.8776956e3 * k1 + 0.179910
    : -3.0258469e9 * k3 + 2.1070379e6 * k2 + 0.2226347e3 * k1 + 0.240390;
  const x2 = x * x, x3 = x2 * x;
  let y;
  if (K <= 2222) y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  else if (K <= 4000) y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  else y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** xyY → XYZ. */
export function xyToXYZ(x, y, Y = 1) {
  return [(x * Y) / y, Y, ((1 - x - y) * Y) / y];
}

// --- Matrices (sRGB / Rec.709 primaries, D65) ----------------------------------

export const XYZ_TO_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252],
];
export const SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];
const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];
export const D65_XYZ = [0.95047, 1, 1.08883];

export const mul3 = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

export const xyzToLinearSRGB = xyz => mul3(XYZ_TO_SRGB, xyz);
export const linearSRGBToXYZ = rgb => mul3(SRGB_TO_XYZ, rgb);

/** Relative luminance (Y) of linear Rec.709 RGB. */
export const luminanceLinear = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Blackbody colour at T kelvin as linear sRGB, unit luminance (may exceed 1 per channel; clamped ≥ 0). */
export function kelvinToLinearSRGB(T) {
  const [x, y] = cctToXy(T);
  return xyzToLinearSRGB(xyToXYZ(x, y, 1)).map(v => Math.max(0, v));
}

/** von Kries adaptation in Bradford cone space: XYZ seen under srcWhite → appearance under dstWhite. */
export function vonKries(xyz, srcWhiteXYZ, dstWhiteXYZ) {
  const s = mul3(BRADFORD, srcWhiteXYZ), d = mul3(BRADFORD, dstWhiteXYZ), c = mul3(BRADFORD, xyz);
  return mul3(BRADFORD_INV, [c[0] * d[0] / s[0], c[1] * d[1] / s[1], c[2] * d[2] / s[2]]);
}

/**
 * Colour of a light at `kelvin` as recorded by a camera white-balanced to `wbKelvin`
 * (linear sRGB, unit luminance). 3200 K at 5600 K WB comes out amber; 5600 K at 3200 K WB, blue.
 */
export function lightColor(kelvin, wbKelvin = 5600) {
  const [x, y] = cctToXy(kelvin), [wx, wy] = cctToXy(wbKelvin);
  const adapted = vonKries(xyToXYZ(x, y, 1), xyToXYZ(wx, wy, 1), D65_XYZ);
  const rgb = xyzToLinearSRGB(adapted).map(v => Math.max(0, v));
  const Y = luminanceLinear(rgb) || 1;
  return rgb.map(v => v / Y);
}

/** Per-channel white-balance gains (simple RGB von Kries) that neutralise a wbKelvin source. */
export function wbGains(wbKelvin) {
  const w = kelvinToLinearSRGB(wbKelvin), Y = luminanceLinear(w);
  return w.map(v => Y / Math.max(v, 1e-6));
}

// --- Transfer functions ------------------------------------------------------

/** sRGB OETF: linear → encoded (0..1). */
export const srgbEncode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
/** sRGB EOTF: encoded → linear. */
export const srgbDecode = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

// ARRI LogC3 (v3), EI 800, scene linear reflectance → log signal.
export const LOGC3_EI800 = { cut: 0.010591, a: 5.555556, b: 0.052272, c: 0.247190, d: 0.385537, e: 5.367655, f: 0.092809 };
export function logC3Encode(x, p = LOGC3_EI800) {
  return x > p.cut ? p.c * Math.log10(p.a * x + p.b) + p.d : p.e * x + p.f;
}
export function logC3Decode(t, p = LOGC3_EI800) {
  return t > p.e * p.cut + p.f ? (Math.pow(10, (t - p.d) / p.c) - p.b) / p.a : (t - p.f) / p.e;
}

// --- BT.709 ------------------------------------------------------------------

/** Y′ from encoded R′G′B′ (BT.709 coefficients). */
export const luma709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Encoded R′G′B′ → [Y′, Cb, Cr] (Cb, Cr in −0.5..0.5). */
export function rgbToYCbCr709(r, g, b) {
  const Y = luma709(r, g, b);
  return [Y, (b - Y) / 1.8556, (r - Y) / 1.5748];
}
export function yCbCrToRgb709(Y, Cb, Cr) {
  return [Y + 1.5748 * Cr, Y - 0.1873 * Cb - 0.4681 * Cr, Y + 1.8556 * Cb];
}

// --- Tone mapping ------------------------------------------------------------

/** Narkowicz ACES filmic fit, scene linear → display linear 0..1 (monotonic for x ≥ 0). */
export function acesFit(x) {
  if (x <= 0) return 0;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}

// --- Utilities ---------------------------------------------------------------

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** Mix two hex colours in encoded space (UI use only). */
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
/** Encoded 0..255 RGB → linear 0..1. */
export const hexToLinear = hex => hexToRgb(hex).map(v => srgbDecode(v / 255));
/** Linear 0..1 RGB → hex (clamped). */
export const linearToHex = rgb => rgbToHex(rgb.map(v => srgbEncode(clamp(v)) * 255));

/** WCAG relative luminance + contrast ratio (used by the token contrast check). */
export const relativeLuminance = hex => luminanceLinear(hexToLinear(hex));
export function contrastRatio(a, b) {
  const [L1, L2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

/** UI chip colour for a Kelvin value (normalised so the brightest channel is 1, then sRGB). */
export function kelvinChip(kelvin, wbKelvin = 6504) {
  const rgb = lightColor(kelvin, wbKelvin), m = Math.max(...rgb) || 1;
  return linearToHex(rgb.map(v => v / m));
}

/** Deterministic ordered dither offset in ±0.5/255 from pixel coordinates (hash-based). */
export function ditherOffset(x, y, seed = 0) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x27d4eb2d) ^ Math.imul((y | 0) + (seed | 0), 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return ((h >>> 0) / 4294967296 - 0.5) / 255;
}
