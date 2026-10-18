// Film grain from seeded noise. Two uses:
//  - grainTiles(): a small set of tiles a piece cycles with floor(t·24) (moving grain in titles);
//  - applyPageGrain(): one static tile behind the page, exposed as the CSS var --grain (#118 look:
//    grain over reading text must not move).
// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
// (numbers only: dark #3A3530 55 % / white 45 % speckle; nothing vendored)

import { hash3 } from './prng.js';
import { makeCanvas } from './canvas.js';
import { hexToRgb } from './color.js';

/**
 * One grain tile (canvas). Each pixel is either a dark or a light speck with a hashed alpha.
 * amount scales alpha (0..1). Pure function of (size, seed, options).
 */
export function grainTile(size = 256, seed = 1, { dark = '#3A3530', light = '#FFFFFF', darkShare = 0.55, amount = 1, maxAlpha = 0.38 } = {}) {
  const c = makeCanvas(size, size), k = c.getContext('2d');
  const img = k.createImageData(size, size), d = img.data;
  const D = hexToRgb(dark), Lt = hexToRgb(light);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = hash3(x, y, 0, seed), i = (y * size + x) * 4;
      const isDark = (h & 0xffff) / 65536 < darkShare;
      const col = isDark ? D : Lt;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      d[i + 3] = Math.round(((h >>> 16) / 65536) * maxAlpha * amount * 255);
    }
  }
  k.putImageData(img, 0, 0);
  return c;
}

/** n tiles with consecutive seeds (cache by (n, size, seed) in the caller). */
export function grainTiles(n = 8, size = 256, seed = 1, opts) {
  return Array.from({ length: n }, (_, i) => grainTile(size, seed * 7919 + i, opts));
}

/** Which tile shows at time t (re-seeded at `fps`). */
export const grainIndex = (t, n = 8, fps = 24) => ((Math.floor(t * fps + 1e-9) % n) + n) % n;

/** Fill a rect with a grain tile as a repeating pattern. */
export function drawGrain(ctx, tile, x, y, w, h, alpha = 1) {
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Static page-grain tile as a PNG data URL. */
export function pageGrainDataURL({ size = 128, seed = 7, maxAlpha = 0.16 } = {}) {
  return grainTile(size, seed, { maxAlpha }).toDataURL('image/png');
}

/** Generate the page grain once and expose it as --grain on the root element. */
export function applyPageGrain(root = document.documentElement, opts) {
  try {
    root.style.setProperty('--grain', `url("${pageGrainDataURL(opts)}")`);
  } catch (err) {
    console.warn('[grain] page grain unavailable', err);
  }
}
