// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
// (numbers only: the static grain's 55 % dark / 45 % white split and its 16–38 % opacity, scaled; see below.)
//
// Colour study · the scene. A dusk road, built ONCE into a scene-referred, linear-light Float32Array
// (Rec.709 primaries, camera white balance 5600 K) at a fixed resolution: 960×402, or 640×268 on
// phones. Nothing here is display-referred: the grade (colour-grade.js) does all the encoding.
//
// The frame, as a DP would light it:
//   - sky: deep blue overhead → dusky rose → orange at the horizon, the sun just under it (right),
//     thin stratus lit from below near the sun, the evening star;
//   - two ridges of hills and a tree line in silhouette against the glow;
//   - a two-lane road to a vanishing point right of centre, paint lines, asphalt that catches the sky
//     at grazing angles;
//   - five tungsten streetlamps (3200 K, ×25) at 8 / 14 / 22 / 34 / 55 m: physically placed light
//     pools (cosine / inverse-square, cut-off fixture) and soft reflections on the road;
//   - an oncoming car, headlights at 5600 K ×60 (tests highlight roll-off), beams on the road;
//   - a roadside motel with warm windows and a teal neon sign (0.1, 1.6, 1.4) that washes the facade
//     and fills the vectorscope's cyan;
//   - a figure on the verge, rim-lit by the lamp behind, face lit by the orange horizon, shadows cast
//     by every lamp.
// Also returned: a sky mask (day-for-night darkens the sky) and scene luminance (it keeps emitters).
//
// Pure: a function of (W, H, seed). Cached by those keys. Canvas2D is used only to rasterise
// anti-aliased coverage masks (silhouettes, neon tubes); every radiance value is computed here.

import { lightColor } from '../core/color.js';
import { fbm, valueNoise2, hash2 } from '../core/prng.js';
import { clamp, smoothstep } from '../core/time.js';
import { makeCanvas } from '../core/canvas.js';

export const SCENE_SIZES = { full: [960, 402], small: [640, 268] };
export const NEON = [0.1, 1.6, 1.4];
export const NEON_FONT = 'italic 400 40px "Cormorant Garamond"';

const cache = new Map();

/** The scene for a size and seed (built on first use, then cached). */
export function getScene(W, H, seed = 1) {
  const key = `${W}x${H}:${seed}`;
  let s = cache.get(key);
  if (!s) {
    if (cache.size > 2) cache.delete(cache.keys().next().value);
    s = buildScene(W, H, seed);
    cache.set(key, s);
  }
  return s;
}

// --- helpers ------------------------------------------------------------------

/** Coverage masks (0..1, anti-aliased by the 2D rasteriser) drawn with canvas paths. */
function masker(W, H) {
  const c = makeCanvas(W, H), k = c.getContext('2d', { willReadFrequently: true });
  return draw => {
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, W, H);
    k.fillStyle = '#fff'; k.strokeStyle = '#fff';
    k.lineCap = 'round'; k.lineJoin = 'round';
    draw(k);
    const d = k.getImageData(0, 0, W, H).data, m = new Float32Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < m.length; i++) {
      const a = d[i * 4 + 3];
      if (!a) continue;
      m[i] = a / 255;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    m.bbox = x1 < 0 ? null : [x0, y0, x1, y1];
    return m;
  };
}

/**
 * Three box passes ≈ Gaussian (σ ≈ r). Separable running sums over the mask's bounding box grown by
 * the blur's reach (edge-clamped); returns a new full-size array with that region filled.
 */
function blur(src, W, H, r) {
  r = Math.max(1, Math.round(r));
  const out = new Float32Array(W * H);
  if (!src.bbox) return out;
  const m = 3 * r + 2;
  const X0 = Math.max(0, src.bbox[0] - m), X1 = Math.min(W - 1, src.bbox[2] + m);
  const Y0 = Math.max(0, src.bbox[1] - m), Y1 = Math.min(H - 1, src.bbox[3] + m);
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  let a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) a.set(src.subarray((Y0 + y) * W + X0, (Y0 + y) * W + X0 + w), y * w);
  const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {                    // horizontal: a → b
      const o = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc * inv;
        acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {                    // vertical: b → a
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  for (let y = 0; y < h; y++) out.set(a.subarray(y * w, y * w + w), (Y0 + y) * W + X0);
  out.bbox = [X0, Y0, X1, Y1];
  return out;
}

/** Fraction of a pixel footprint [q − w/2, q + w/2] (in period units) covered by the duty [0, on). */
function dutyCover(q, w, on) {
  if (w >= 1) return on;
  const a = q - w / 2, b = q + w / 2;
  let c = 0;
  for (const k of [-1, 0, 1]) c += Math.max(0, Math.min(b, k + on) - Math.max(a, k));
  return clamp(c / w);
}

// --- the scene --------------------------------------------------------------------

function buildScene(W, H, seed) {
  const N = W * H, s = W / 960;
  const rgb = new Float32Array(N * 3), skyMask = new Float32Array(N), lum = new Float32Array(N);
  const mask = masker(W, H);

  // Camera: pinhole, level, 1.25 m high. ~27 mm on Super 35 at this crop.
  const hy = H * 0.56, fpx = W * 0.62, CH = 1.25, vpx = W * 0.57;
  const P = (X, Yh, Z) => [vpx + (fpx * X) / Z, hy - (fpx * (Yh - CH)) / Z];

  const LAMP = lightColor(3200, 5600);     // amber under a daylight balance
  const DAY = lightColor(5600, 5600);      // neutral
  const HOR = [0.81, 0.40, 0.20], SUN = [2.0, 0.9, 0.4];
  const sunX = W * 0.70, sunY = hy + H * 0.05;

  // Sky gradient by elevation (rows), interpolated in log space between dusk stops.
  const STOPS = [
    [0.00, HOR], [0.03, [0.42, 0.19, 0.10]], [0.08, [0.12, 0.072, 0.085]],
    [0.16, [0.042, 0.048, 0.105]], [0.27, [0.022, 0.034, 0.092]], [0.40, [0.014, 0.025, 0.078]],
  ];
  const skyRow = e => {
    e = Math.max(0, e);
    for (let i = 1; i < STOPS.length; i++) {
      if (e <= STOPS[i][0] || i === STOPS.length - 1) {
        const [e0, a] = STOPS[i - 1], [e1, b] = STOPS[i], u = smoothstep(e0, e1, e);
        return a.map((v, c) => Math.exp(Math.log(v) + (Math.log(b[c]) - Math.log(v)) * u));
      }
    }
    return STOPS[0][1];
  };
  const sunGlow = (x, y) => {
    const dx = (x - sunX) / W, dy = (y - sunY) / H;
    return [Math.exp(-(dx * dx) / 0.04 - (dy * dy) / 0.012), Math.exp(-(dx * dx) / 0.30 - (dy * dy) / 0.09)];
  };
  // Sky as seen in a reflection (no clouds), for the asphalt sheen and haze.
  const skyAt = (x, y) => {
    const base = skyRow((hy - y) / fpx), [g1, g2] = sunGlow(x, y);
    return [0, 1, 2].map(c => base[c] + SUN[c] * g1 * 0.8 + [0.35, 0.14, 0.06][c] * g2);
  };

  // Separable tables: sun glow = column term × row term; haze and hill colour per column.
  const K2 = [0.35, 0.14, 0.06];
  const gx1 = new Float32Array(W), gx2 = new Float32Array(W), gxc = new Float32Array(W);
  const haze = new Float32Array(W * 3), hill = new Float32Array(W * 3);
  for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - sunX) / W;
    gx1[x] = Math.exp(-(dx * dx) / 0.04); gx2[x] = Math.exp(-(dx * dx) / 0.30); gxc[x] = Math.exp(-(dx * dx) / 0.09);
    const h1 = skyAt(x + 0.5, hy - 1), h2 = skyAt(x + 0.5, hy - 2);
    for (let c = 0; c < 3; c++) { haze[x * 3 + c] = h1[c] * 0.3; hill[x * 3 + c] = h2[c] * 0.2 + (c === 2 ? 0.055 : 0.03); }
  }
  const gy = y => { const dy = (y - sunY) / H; return [Math.exp(-(dy * dy) / 0.012) * 0.8, Math.exp(-(dy * dy) / 0.09)]; };

  // Ridges (px from the top), per column.
  const far = new Float32Array(W), near = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W, dv = Math.abs(x - vpx) / W;
    const f1 = fbm(u * 4.2 + 3.1, 0.37, { octaves: 4, seed: seed + 11 });
    far[x] = hy - H * (0.016 + 0.05 * f1 * f1) * (0.6 + 0.4 * smoothstep(0, 0.3, dv));
    const f2 = fbm(u * 3.0 + 9.7, 0.71, { octaves: 4, seed: seed + 23 });
    const trees = fbm(u * 90, 0.2, { octaves: 2, seed: seed + 31 });
    const env = smoothstep(0.06, 0.42, dv);
    near[x] = hy - H * env * (0.012 + 0.07 * Math.pow(f2, 1.6) + 0.018 * smoothstep(0.45, 0.8, trees));
  }

  // Lamps (left side of the road), the car, the sign, the figure: world positions in metres.
  const LAMPS = [8, 14, 22, 34, 55].map(Z => ({ Z, Xp: -5.2, Xh: -4.1, h: 6.0 }));
  const LAMP_I = 62, POOL_R2 = 6 * 6 * (1 / (0.68 * 0.68) - 1);   // cone edge at cos θ = 0.68
  const CAR = { X: 1.8, Z: 62 };
  const SIGN = { X: 5.0, Z: 16, h: 4.45 };
  const FIG = { X: -4.25, Z: 7.4, r: 0.24, h: 1.72 };

  // --- background: sky, clouds, hills, ground ---------------------------------
  const CLOUD = { octaves: 5, seed: seed + 5 }, FIELD = { octaves: 3, seed: seed + 7 };
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    const rowSky = skyRow((hy - yc) / fpx), [ry1, ry2] = gy(yc);
    const mirSky = skyRow((yc - hy) / fpx), [my1, my2] = gy(2 * hy - yc);   // the sky the road mirrors
    const e = (hy - yc) / fpx;
    const band = smoothstep(0.03, 0.07, e) * (1 - smoothstep(0.2, 0.33, e)), litY = 1 - 0.55 * smoothstep(0.05, 0.28, e);
    const groundCov = clamp(yc - hy + 0.5);           // the row that straddles the horizon blends
    const Z = yc > hy ? Math.min(4000, (fpx * CH) / (yc - hy)) : 4000;
    const dZ = (Z * Z) / (fpx * CH);                  // metres of road per pixel row
    const T = Math.exp(-Z / 240);                     // aerial perspective
    const cosV = CH / Math.sqrt(CH * CH + Z * Z);
    const fres = (0.03 + 0.55 * Math.pow(1 - cosV, 5)) * 0.2;
    const fieldA = 1 - smoothstep(4, 40, dZ), fieldNear = fieldA > 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, xc = x + 0.5;
      let r = 0, g = 0, b = 0;

      // Sky (above the horizon / behind the hills).
      if (groundCov < 1) {
        const g1 = gx1[x] * ry1, g2 = gx2[x] * ry2;
        r = rowSky[0] + SUN[0] * g1 + K2[0] * g2;
        g = rowSky[1] + SUN[1] * g1 + K2[1] * g2;
        b = rowSky[2] + SUN[2] * g1 + K2[2] * g2;
        if (band > 0) {
          const n = fbm((xc / W) * 3.4, (yc / H) * 21, CLOUD);
          const d = smoothstep(0.5, 0.74, n) * band * 0.92;
          if (d > 0) {
            const lit = gxc[x] * litY;
            const cr = 0.045 * (1 - lit) + 1.05 * lit, cg = 0.04 * (1 - lit) + 0.42 * lit, cb = 0.065 * (1 - lit) + 0.27 * lit;
            r += (cr - r) * d; g += (cg - g) * d; b += (cb - b) * d;
          }
        }
        // The evening star.
        const vx = xc - W * 0.205, vy = yc - (hy - fpx * 0.27), v2 = (vx * vx + vy * vy) / (0.55 * s * s + 0.25);
        if (v2 < 30) { const a = 3.2 * Math.exp(-v2); r += a; g += a * 0.97; b += a * 0.92; }

        // Hills over the sky.
        const cf = clamp(yc - far[x]), cn = clamp(yc - near[x]);
        const fr = hill[x * 3], fg = hill[x * 3 + 1], fb = hill[x * 3 + 2];
        r += (fr - r) * cf; g += (fg - g) * cf; b += (fb - b) * cf;
        r += (0.011 - r) * cn; g += (0.012 - g) * cn; b += (0.018 - b) * cn;
        skyMask[i] = (1 - Math.max(cf, cn)) * (1 - groundCov);
      }

      // Ground plane.
      if (groundCov > 0) {
        const X = ((xc - vpx) * Z) / fpx, aX = Math.abs(X);
        const px = fpx / Z;                            // pixels per metre at this depth
        const road = clamp((3.6 - aX) * px + 0.5);
        const shoulder = clamp((4.5 - aX) * px + 0.5) - road;
        const field = 1 - road - shoulder;
        const edge = clamp((aX - 3.32) * px + 0.5) - clamp((aX - 3.46) * px + 0.5);
        const dash = clamp((0.07 - aX) * px + 0.5) * dutyCover(((Z + 1.3) / 9) % 1, dZ / 9, 1 / 3);
        const paint = Math.max(edge, dash);
        const tex = field < 1 ? 0.85 + 0.3 * valueNoise2(xc * 0.9, yc * 1.7, seed + 3) : 1;
        const ft = field > 0 ? 0.7 + 0.6 * (fieldNear ? fbm(X * 0.22, Z * 0.06, FIELD) * fieldA : 0) + 0.3 * (1 - fieldA) : 1;
        const aR = 0.05 * tex, aS = 0.09 * tex;
        let alR = road * aR + shoulder * aS + field * 0.1 * ft;
        let alG = road * aR + shoulder * aS + field * 0.085 * ft;
        let alB = road * aR + shoulder * aS * 0.95 + field * 0.06 * ft;
        alR += (0.5 - alR) * paint * road; alG += (0.5 - alG) * paint * road; alB += (0.48 - alB) * paint * road;

        // Irradiance: sky ambient + lamps (with the figure's shadow) + headlights + neon spill.
        let er = 0.05, eg = 0.06, eb = 0.1, el = 0;
        for (const L of LAMPS) {
          const dx = X - L.Xh, dz = Z - L.Z, r2 = dx * dx + dz * dz;
          if (r2 > POOL_R2) continue;                     // outside the fixture's cut-off cone
          const d2 = r2 + L.h * L.h, d = Math.sqrt(d2), cos = L.h / d;
          let e = (LAMP_I * cos) / d2 * smoothstep(0.68, 0.95, cos);
          if (e < 1e-4) continue;
          // Shadow of the figure (a vertical capsule) on the ray ground → lamp.
          const lx = L.Xh - X, lz = L.Z - Z, l2 = lx * lx + lz * lz;
          const t = clamp(((FIG.X - X) * lx + (FIG.Z - Z) * lz) / l2);
          const hx = X + lx * t - FIG.X, hz = Z + lz * t - FIG.Z;
          const sh = (1 - smoothstep(FIG.r * 0.55, FIG.r * 1.5, Math.sqrt(hx * hx + hz * hz))) * (1 - smoothstep(FIG.h - 0.15, FIG.h + 0.05, t * L.h)) * (t > 0 && t < 1 ? 1 : 0);
          el += e * (1 - 0.94 * sh);
        }
        er += el * LAMP[0]; eg += el * LAMP[1]; eb += el * LAMP[2];
        const cz = CAR.Z - Z;
        if (cz > 0) {
          const wdt = 0.9 + 0.2 * cz, lx = (X - CAR.X) / wdt;
          const e = (260 * Math.exp(-lx * lx) * smoothstep(0.5, 6, cz)) / (cz * cz + 12);
          er += e * DAY[0]; eg += e * DAY[1]; eb += e * DAY[2];
        }
        { const dx = X - SIGN.X, dz = Z - SIGN.Z, d2 = dx * dx + dz * dz + SIGN.h * SIGN.h, e = (6 * SIGN.h) / (d2 * Math.sqrt(d2));
          er += e * NEON[0]; eg += e * NEON[1]; eb += e * NEON[2]; }
        let gr = alR * er, gg = alG * eg, gb = alB * eb;

        // Asphalt catches the sky at grazing angles (rough, so weak), then haze toward the horizon.
        if (road > 0) {
          const k = fres * road * (1 - paint * 0.7), m1 = gx1[x] * my1, m2 = gx2[x] * my2;
          gr += (mirSky[0] + SUN[0] * m1 + K2[0] * m2) * k;
          gg += (mirSky[1] + SUN[1] * m1 + K2[1] * m2) * k;
          gb += (mirSky[2] + SUN[2] * m1 + K2[2] * m2) * k;
        }
        const hT = 1 - T;
        gr = gr * T + haze[x * 3] * hT; gg = gg * T + haze[x * 3 + 1] * hT; gb = gb * T + haze[x * 3 + 2] * hT;
        r += (gr - r) * groundCov; g += (gg - g) * groundCov; b += (gb - b) * groundCov;
      }
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
    }
  }

  // Reflections on the asphalt: soft vertical streaks under the far lamps and the headlights.
  // Separable: exp(−½(dx² + dy²)) = exp(−½dx²) · exp(−½dy²), so one exp per row and per column.
  const addGauss = (cx, cy, sxp, syp, cr, cg, cb, onlyGround = false) => {
    const x0 = Math.max(0, Math.floor(cx - 3 * sxp)), x1 = Math.min(W - 1, Math.ceil(cx + 3 * sxp));
    const y0 = Math.max(0, Math.floor(cy - 3 * syp)), y1 = Math.min(H - 1, Math.ceil(cy + 3 * syp));
    if (x1 < x0 || y1 < y0) return;
    const gxs = new Float32Array(x1 - x0 + 1);
    for (let x = x0; x <= x1; x++) { const dx = (x + 0.5 - cx) / sxp; gxs[x - x0] = Math.exp(-0.5 * dx * dx); }
    for (let y = y0; y <= y1; y++) {
      if (onlyGround && y + 0.5 < hy + 1) continue;
      const dy = (y + 0.5 - cy) / syp, gy0 = Math.exp(-0.5 * dy * dy);
      if (gy0 < 1e-4) continue;
      for (let x = x0, i = (y * W + x0) * 3; x <= x1; x++, i += 3) {
        const a = gxs[x - x0] * gy0;
        rgb[i] += cr * a; rgb[i + 1] += cg * a; rgb[i + 2] += cb * a;
      }
    }
  };
  for (const L of LAMPS) {
    const [mx, my] = P(L.Xh, -L.h, L.Z);
    if (my > H - 4) continue;                 // only reflections whose source point is in frame
    const sxp = Math.max(1.2 * s, (0.16 * fpx) / L.Z);
    addGauss(mx, my, sxp, (my - hy) * 0.1 + 2, LAMP[0] * 0.22, LAMP[1] * 0.22, LAMP[2] * 0.22, true);
  }
  for (const side of [-1, 1]) {
    const [mx, my] = P(CAR.X + side * 0.62, -0.68, CAR.Z);
    addGauss(mx, my, 1.1 * s, (my - hy) * 0.45 + 2, DAY[0] * 0.4, DAY[1] * 0.4, DAY[2] * 0.4, true);
  }

  // --- objects (coverage masks + shading) ------------------------------------------
  const over = (m, shade) => {
    if (!m.bbox) return;
    const [x0, y0, x1, y1] = m.bbox;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x, a = m[i];
      if (a <= 0) continue;
      const c = shade(x + 0.5, y + 0.5, i);
      const j = i * 3;
      rgb[j] += (c[0] - rgb[j]) * a; rgb[j + 1] += (c[1] - rgb[j + 1]) * a; rgb[j + 2] += (c[2] - rgb[j + 2]) * a;
      skyMask[i] *= 1 - a;
    }
  };

  // Motel: front face at Z = 26 (X 6.5 → 13.5), side wall on X = 6.5 (Z 26 → 37), 3.3 m high.
  const BZ = 26, BX = 6.5, BX2 = 13.5, BZ2 = 37, BH = 3.3;
  const front = mask(k => { const [x0, y0] = P(BX, BH, BZ), [x1, y1] = P(BX2, 0, BZ); k.fillRect(x0, y0, x1 - x0, y1 - y0); });
  const side = mask(k => {
    const a = P(BX, BH, BZ), b = P(BX, BH, BZ2), c = P(BX, 0, BZ2), d = P(BX, 0, BZ);
    k.beginPath(); k.moveTo(...a); k.lineTo(...b); k.lineTo(...c); k.lineTo(...d); k.closePath(); k.fill();
  });
  const roof = mask(k => {
    const a = P(BX - 0.25, BH + 0.25, BZ - 0.3), b = P(BX2 + 0.2, BH + 0.25, BZ - 0.3), c = P(BX2 + 0.2, BH, BZ - 0.3), d = P(BX - 0.25, BH, BZ - 0.3);
    const e = P(BX - 0.25, BH + 0.25, BZ2), f = P(BX - 0.25, BH, BZ2);
    k.beginPath(); k.moveTo(...e); k.lineTo(...a); k.lineTo(...b); k.lineTo(...c); k.lineTo(...d); k.lineTo(...f); k.closePath(); k.fill();
  });
  const windows = mask(k => {
    for (const [xa, xb] of [[7.3, 8.4], [9.4, 10.5], [12.0, 13.0]]) {
      const [x0, y0] = P(xa, 2.15, BZ - 0.01), [x1, y1] = P(xb, 1.05, BZ - 0.01);
      k.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  });
  const door = mask(k => { const [x0, y0] = P(10.9, 2.1, BZ - 0.01), [x1, y1] = P(11.6, 0, BZ - 0.01); k.fillRect(x0, y0, x1 - x0, y1 - y0); });
  const lit = (X, Yh, Z, nx, nz) => {      // irradiance on a vertical wall point from the neon and the lamps
    let er = 0.02, eg = 0.024, eb = 0.04;
    { const dx = SIGN.X - X, dy = SIGN.h - Yh, dz = SIGN.Z - Z, d2 = dx * dx + dy * dy + dz * dz;
      const cos = Math.max(0, (dx * nx + dz * nz) / Math.sqrt(d2)), e = (45 * cos) / d2;
      er += e * NEON[0]; eg += e * NEON[1]; eb += e * NEON[2]; }
    for (const L of LAMPS) {
      const dx = L.Xh - X, dy = L.h - Yh, dz = L.Z - Z, d2 = dx * dx + dy * dy + dz * dz;
      const cos = Math.max(0, (dx * nx + dz * nz) / Math.sqrt(d2)), e = (LAMP_I * 0.35 * cos) / d2;
      er += e * LAMP[0]; eg += e * LAMP[1]; eb += e * LAMP[2];
    }
    return [er, eg, eb];
  };
  const T26 = Math.exp(-BZ / 240);
  over(front, (x, y) => {
    const Z = BZ, X = ((x - vpx) * Z) / fpx, Yh = CH - ((y - hy) * Z) / fpx;
    const [er, eg, eb] = lit(X, Yh, Z, 0, -1), al = 0.2;
    const sky = skyAt(x, hy - 1), wc = 1 - T26;
    // Warm spill under the windows.
    const sp = 0.02 * smoothstep(1.1, 0.1, Yh);
    const eave = 0.55 + 0.45 * smoothstep(BH, BH - 0.7, Yh);           // shade under the roof edge
    return [al * er * T26 * eave + sky[0] * 0.3 * wc + sp * LAMP[0], al * eg * T26 * eave + sky[1] * 0.3 * wc + sp * LAMP[1], al * eb * T26 * eave + sky[2] * 0.3 * wc + sp * LAMP[2]];
  });
  over(side, (x, y) => {
    const X = BX, Z = (fpx * X) / Math.max(1e-3, x - vpx), Yh = CH - ((y - hy) * Z) / fpx;
    const [er, eg, eb] = lit(X, Yh, Z, -1, 0), al = 0.2, Tz = Math.exp(-Z / 240), sky = skyAt(x, hy - 1);
    return [al * er * Tz + sky[0] * 0.3 * (1 - Tz), al * eg * Tz + sky[1] * 0.3 * (1 - Tz), al * eb * Tz + sky[2] * 0.3 * (1 - Tz)];
  });
  over(roof, () => [0.012, 0.013, 0.018]);
  over(windows, (x, y) => {
    const X = ((x - vpx) * BZ) / fpx, Yh = CH - ((y - hy) * BZ) / fpx;
    // Three rooms at three levels; the middle one has its curtain half drawn.
    const room = X > 11.8 ? 0.1 : X > 9 ? (X < 9.85 ? 0.12 : 0.42) : 0.3;
    const k = room * (0.75 + 0.45 * smoothstep(1.05, 2.15, Yh));
    return [k * LAMP[0], k * LAMP[1], k * LAMP[2]];
  });
  over(door, () => [0.02, 0.018, 0.016]);

  // Lamp poles, arms and housings; the sign's pole and box; the car body.
  const poles = mask(k => {
    for (const L of LAMPS) {
      const [bx, by] = P(L.Xp, 0, L.Z), [tx, ty] = P(L.Xp, L.h + 0.2, L.Z), [hx, hy2] = P(L.Xh - 0.25, L.h, L.Z);
      const w = Math.max(0.9 * s, (0.14 * fpx) / L.Z);
      k.lineWidth = w;
      k.beginPath(); k.moveTo(bx, by); k.lineTo(tx, ty); k.quadraticCurveTo(tx + (hx - tx) * 0.4, ty, hx, hy2); k.stroke();
      const hw = (0.55 * fpx) / L.Z, hh = (0.16 * fpx) / L.Z, [cx, cy] = P(L.Xh, L.h + 0.03, L.Z);
      k.beginPath(); k.ellipse(cx, cy, hw / 2, Math.max(0.8 * s, hh), 0, Math.PI, 0); k.fill();
    }
    const [bx, by] = P(SIGN.X + 0.6, 0, SIGN.Z + 0.4), [tx, ty] = P(SIGN.X + 0.6, SIGN.h - 0.5, SIGN.Z + 0.4);
    k.lineWidth = Math.max(1, (0.16 * fpx) / SIGN.Z);
    k.beginPath(); k.moveTo(bx, by); k.lineTo(tx, ty); k.stroke();
  });
  over(poles, () => [0.007, 0.007, 0.009]);

  // Sign box and neon (a rounded frame and the word "Motel" as tubes).
  const sb = { x0: SIGN.X - 1.25, x1: SIGN.X + 1.25, y0: SIGN.h - 0.55, y1: SIGN.h + 0.55 };
  const [bx0, by0] = P(sb.x0, sb.y1, SIGN.Z), [bx1, by1] = P(sb.x1, sb.y0, SIGN.Z);
  const box = mask(k => { k.fillRect(bx0, by0, bx1 - bx0, by1 - by0); });
  over(box, () => [0.006, 0.008, 0.009]);
  const tubeW = Math.max(0.9, 1.25 * s);
  const neon = mask(k => {
    const pad = (0.12 * fpx) / SIGN.Z, rr = (0.14 * fpx) / SIGN.Z;
    const x = bx0 + pad, y = by0 + pad, w = bx1 - bx0 - 2 * pad, h = by1 - by0 - 2 * pad;
    k.lineWidth = tubeW;
    k.beginPath();
    k.moveTo(x + rr, y); k.arcTo(x + w, y, x + w, y + h, rr); k.arcTo(x + w, y + h, x, y + h, rr);
    k.arcTo(x, y + h, x, y, rr); k.arcTo(x, y, x + w, y, rr); k.closePath(); k.stroke();
    const px = Math.round(h * 0.95);
    k.font = NEON_FONT.replace('40px', `${px}px`);
    k.textAlign = 'center'; k.textBaseline = 'middle';
    k.lineWidth = tubeW * 0.9;
    k.strokeText('Motel', x + w / 2, y + h * 0.52);
  });
  const nGlow1 = blur(neon, W, H, 2 * s), nGlow2 = blur(neon, W, H, 9 * s);
  const [nx0, ny0, nx1, ny1] = nGlow2.bbox ?? [0, 0, -1, -1];
  for (let y = ny0; y <= ny1; y++) for (let x = nx0; x <= nx1; x++) {
    const i = y * W + x, a = neon[i] * 3.6 + nGlow1[i] * 1.3 + nGlow2[i] * 0.55;
    if (a <= 0) continue;
    rgb[i * 3] += NEON[0] * a; rgb[i * 3 + 1] += NEON[1] * a; rgb[i * 3 + 2] += NEON[2] * a;
  }

  const car = mask(k => {
    const [x0, y0] = P(CAR.X - 0.92, 1.42, CAR.Z), [x1, y1] = P(CAR.X + 0.92, 0.18, CAR.Z);
    const [c0] = P(CAR.X - 0.6, 1.42, CAR.Z), [c1] = P(CAR.X + 0.6, 1.42, CAR.Z), [, yb] = P(0, 0.85, CAR.Z);
    k.beginPath(); k.moveTo(x0, y1); k.lineTo(x0, yb); k.lineTo(c0, y0); k.lineTo(c1, y0); k.lineTo(x1, yb); k.lineTo(x1, y1); k.closePath(); k.fill();
  });
  over(car, () => [0.006, 0.006, 0.008]);

  // The figure: long coat, hands in pockets, facing the road. Metres, origin at the feet.
  // Outline clockwise from the back of the raised collar; corners rounded with arcTo.
  const FIGPTS = [
    [-0.055, 1.5], [-0.16, 1.455], [-0.215, 1.405], [-0.235, 1.3], [-0.245, 1.08], [-0.215, 0.98],
    [-0.235, 0.8], [-0.275, 0.44], [0.215, 0.43], [0.185, 0.8], [0.165, 0.97], [0.2, 1.12],
    [0.205, 1.3], [0.17, 1.41], [0.075, 1.475], [0.05, 1.535], [-0.04, 1.545],
  ];
  const [fx, fy] = P(FIG.X, 0, FIG.Z), mpx = fpx / FIG.Z;
  const F = (u, v) => [fx + u * mpx, fy - v * mpx];
  const HEAD = [F(0.025, 1.625), 0.088 * mpx, 0.112 * mpx, -0.15];
  const drawFigure = k => {
    const pts = FIGPTS.map(([u, v]) => F(u, v)), n = pts.length, rr = 0.035 * mpx;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    k.beginPath(); k.moveTo(...mid(pts[n - 1], pts[0]));
    for (let i = 0; i < n; i++) k.arcTo(...pts[i], ...mid(pts[i], pts[(i + 1) % n]), rr);
    k.closePath(); k.fill();
    k.beginPath(); k.ellipse(HEAD[0][0], HEAD[0][1], HEAD[1], HEAD[2], HEAD[3], 0, Math.PI * 2); k.fill();
    k.fillRect(...F(-0.04, 1.58), 0.09 * mpx, 0.1 * mpx);
    for (const [a, b, da, db] of [[-0.14, -0.04, -0.025, -0.035], [0.02, 0.125, 0.025, 0.01]]) {
      k.beginPath();
      k.moveTo(...F(a, 0.47)); k.lineTo(...F(b, 0.47)); k.lineTo(...F(b + db, 0.04)); k.lineTo(...F(a + da, 0.04)); k.closePath(); k.fill();
      k.beginPath(); k.ellipse(...F((a + b) / 2 + (da + db) / 2 + 0.04, 0.035), 0.095 * mpx, 0.038 * mpx, 0, 0, Math.PI * 2); k.fill();
    }
  };
  const fig = mask(drawFigure);
  const face = mask(k => {
    k.save(); k.beginPath(); k.ellipse(HEAD[0][0], HEAD[0][1], HEAD[1], HEAD[2], HEAD[3], 0, Math.PI * 2); k.clip();
    k.beginPath(); k.ellipse(...F(0.1, 1.6), 0.05 * mpx, 0.085 * mpx, 0, 0, Math.PI * 2); k.fill();
    k.restore();
    k.fillRect(...F(0.01, 1.555), 0.035 * mpx, 0.04 * mpx);
  });
  const head = mask(k => { k.beginPath(); k.ellipse(HEAD[0][0], HEAD[0][1], HEAD[1] + 1, HEAD[2] + 1, HEAD[3], 0, Math.PI * 2); k.fill(); });
  // Rim (lamp behind, up-left) and teal edge (sign, right): mask minus the mask shifted toward the light.
  const at = (m, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
  // A thin line where the up-left neighbour is outside (≈1 px at 960), plus a fainter second pixel.
  const d1 = Math.max(1, Math.round(s)), d2 = 2 * d1;
  const rimM = new Float32Array(N), tealM = new Float32Array(N);
  const [fx0, fy0, fx1, fy1] = fig.bbox ?? [0, 0, -1, -1];
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
    const i = y * W + x, m = fig[i];
    if (m <= 0) continue;
    rimM[i] = m * Math.min(1, (1 - at(fig, x - d1, y - d1)) + 0.35 * (1 - at(fig, x - d2, y - d2)));
    tealM[i] = m * (1 - at(fig, x + d1, y)) * 0.8;
  }
  const SKIN = [0.56, 0.36, 0.27];
  const glowH = skyAt(vpx, hy - 2);
  over(fig, (x, y, i) => {
    const sk = face[i], hd = head[i], rim = rimM[i], te = tealM[i];
    // Coat / hair base: sky ambient on dark wool.
    let r = 0.004, g = 0.0045, b = 0.007;
    const rimK = hd > 0.5 ? 0.9 : 0.75;
    r += rim * rimK * LAMP[0]; g += rim * rimK * LAMP[1]; b += rim * rimK * LAMP[2];
    r += te * 0.035 * NEON[0]; g += te * 0.035 * NEON[1]; b += te * 0.035 * NEON[2];
    // Skin: the horizon in front lights the face warm; a little teal from the sign; rim on the neck.
    const fr = SKIN[0] * (glowH[0] * 0.16 + 0.004 + rim * 0.5 * LAMP[0]) + SKIN[0] * te * 0.05 * NEON[0];
    const fg = SKIN[1] * (glowH[1] * 0.16 + 0.004 + rim * 0.5 * LAMP[1]) + SKIN[1] * te * 0.05 * NEON[1];
    const fb = SKIN[2] * (glowH[2] * 0.16 + 0.006 + rim * 0.5 * LAMP[2]) + SKIN[2] * te * 0.05 * NEON[2];
    return [r + (fr - r) * sk, g + (fg - g) * sk, b + (fb - b) * sk];
  });

  // --- emitters: lamp heads, headlights (cores + atmospheric glow) ---------------------
  for (const L of LAMPS) {
    const [cx, cy] = P(L.Xh, L.h - 0.06, L.Z), rr = (0.35 * fpx) / L.Z;
    addGauss(cx, cy, Math.max(0.7 * s, rr * 0.55), Math.max(0.6 * s, rr * 0.22), 25 * LAMP[0], 25 * LAMP[1], 25 * LAMP[2]);
    addGauss(cx, cy + rr * 0.3, rr * 1.3 + 1.2 * s, rr * 1.1 + 1.2 * s, 0.45 * LAMP[0], 0.45 * LAMP[1], 0.45 * LAMP[2]);
    addGauss(cx, cy + rr, rr * 5 + 6 * s, rr * 4 + 6 * s, 0.04 * LAMP[0], 0.04 * LAMP[1], 0.04 * LAMP[2]);
  }
  for (const side of [-1, 1]) {
    const [cx, cy] = P(CAR.X + side * 0.62, 0.68, CAR.Z);
    addGauss(cx, cy, 0.75 * s, 0.6 * s, 60 * DAY[0], 60 * DAY[1], 60 * DAY[2]);
    addGauss(cx, cy, 3.2 * s, 2.6 * s, 1.4 * DAY[0], 1.4 * DAY[1], 1.4 * DAY[2]);
    addGauss(cx, cy, 15 * s, 10 * s, 0.07 * DAY[0], 0.07 * DAY[1], 0.07 * DAY[2]);
  }

  for (let i = 0; i < N; i++) {
    const r = (rgb[i * 3] = Math.max(0, rgb[i * 3])), g = (rgb[i * 3 + 1] = Math.max(0, rgb[i * 3 + 1])), b = (rgb[i * 3 + 2] = Math.max(0, rgb[i * 3 + 2]));
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Static print grain (#118): a dark #3A3530 (55 %) or white (45 %) speck with a hashed opacity in
  // #118's 16–38 % range. #118 scatters 2,600 sparse squares over a small card; over a full graded
  // frame that reads as dust, so here every pixel carries a speck at 18 % of that opacity (≈3–7 %),
  // which reads as fine, even film grain. It never moves.
  const grainA = new Float32Array(N), grainC = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = hash2(x, y, seed * 7919 + 118), i = y * W + x;
    grainC[i] = (h & 0xffff) / 65536 < 0.55 ? 0 : 1;
    grainA[i] = (0.16 + ((h >>> 16) / 65536) * 0.22) * 0.18;
  }

  return {
    W, H, seed, rgb, sky: skyMask, lum, grainA, grainC,
    camera: { hy, fpx, CH, vpx },
    info: { lampK: 3200, carK: 5600, wbK: 5600, lamps: LAMPS.map(l => l.Z) },
  };
}
