// Seeded randomness. Pieces never use the unseeded global RNG; every "random" value is a hash of
// its inputs, so a frame is reproducible from (t, params, seed) alone.

/** mulberry32: tiny 32-bit PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Final avalanche (murmur3 fmix32). */
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Integer hash of a lattice point → uint32. Inputs are truncated to int32. */
export function hash2(x, y, seed = 0) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  return fmix(h);
}

export function hash3(x, y, z, seed = 0) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h = Math.imul(h ^ (z | 0), 0x85ebca77);
  return fmix(h);
}

/** Hash → float in [0, 1). */
export const rand2 = (x, y, seed = 0) => hash2(x, y, seed) / 4294967296;
export const rand3 = (x, y, z, seed = 0) => hash3(x, y, z, seed) / 4294967296;

/** FNV-1a string hash (e.g. seed from a film slug). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return fmix(h);
}

/** Smooth 2D value noise in [0, 1) with quintic interpolation. */
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = rand2(xi, yi, seed), b = rand2(xi + 1, yi, seed);
  const c = rand2(xi, yi + 1, seed), d = rand2(xi + 1, yi + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal Brownian motion over valueNoise2, normalised back to [0, 1). */
export function fbm(x, y, { octaves = 5, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 1013);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** 1D convenience: fbm along a line. */
export const fbm1 = (x, opts) => fbm(x, 0.5, opts);

/** Deterministic Fisher–Yates shuffle (returns a new array). */
export function shuffled(arr, seed = 1) {
  const r = mulberry32(seed), out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
