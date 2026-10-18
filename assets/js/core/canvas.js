// Canvas 2D helpers: backing-store sizing, blur with a fallback for browsers without
// ctx.filter, n-gon (iris) paths, cover placement and font loading.

/**
 * Size a canvas's backing store for CSS size w×h at `dpr`. The host (Player or stage) calls this;
 * pieces only read canvas.width/height and scale by dpr.
 */
export function setupCanvas(canvas, w, h, dpr = 1) {
  const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  return { pw, ph };
}

/** 2D context with the transform set to CSS pixels. */
export function context2d(canvas, dpr = 1, opts) {
  const ctx = canvas.getContext('2d', opts);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Offscreen canvas (OffscreenCanvas is avoided so ctx.filter support matches the main canvas). */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// Scratch canvases keyed by name + size; contents are always fully redrawn before use.
const scratchMap = new Map();
export function scratch(name, w, h) {
  const key = `${name}:${Math.round(w)}x${Math.round(h)}`;
  let c = scratchMap.get(key);
  if (!c) { c = makeCanvas(w, h); scratchMap.set(key, c); }
  return c;
}

let filterSupport;
/** Feature-detect a working ctx.filter blur (pixel test, not just property presence). */
export function hasCtxFilter() {
  if (filterSupport !== undefined) return filterSupport;
  try {
    const c = makeCanvas(9, 9), k = c.getContext('2d');
    if (!('filter' in k)) return (filterSupport = false);
    k.filter = 'blur(2px)';
    k.fillStyle = '#fff'; k.fillRect(4, 4, 1, 1);
    filterSupport = k.getImageData(1, 4, 1, 1).data[3] > 0;
  } catch { filterSupport = false; }
  return filterSupport;
}
/** Test hook: force the fallback path. */
export const _setFilterSupport = v => { filterSupport = v; };

/**
 * Draw `src` into `ctx` blurred by Gaussian σ (in destination pixels) at (dx, dy, dw, dh).
 * Uses ctx.filter when it works; otherwise a downsample pyramid (½, ¼, …) then a smoothed upscale,
 * choosing the level from σ. Blur the layer, not the composite.
 */
export function blurLayer(ctx, src, sigma, dx = 0, dy = 0, dw = src.width, dh = src.height) {
  if (!(sigma > 0.05)) { ctx.drawImage(src, dx, dy, dw, dh); return; }
  if (hasCtxFilter()) {
    const prev = ctx.filter;
    ctx.filter = `blur(${sigma.toFixed(2)}px)`;
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.filter = prev || 'none';
    return;
  }
  // A box-ish downsample by 2^L approximates σ ≈ 2^L / 2 after bilinear upscale.
  const levels = Math.max(1, Math.min(6, Math.round(Math.log2(sigma * 2))));
  let cur = src, w = src.width, h = src.height;
  for (let i = 0; i < levels; i++) {
    w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2));
    const next = scratch(`pyr${i}`, w, h), k = next.getContext('2d');
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.clearRect(0, 0, w, h);
    k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
    k.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, w, h);
    cur = next;
  }
  const smooth = ctx.imageSmoothingEnabled, q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, cur.width, cur.height, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = smooth; ctx.imageSmoothingQuality = q;
}

/**
 * Iris / bokeh outline: n blades (n < 3 = round) of radius r, rotated by `rot`.
 * `curvature` 0 = straight blades, 1 = circle; edges bow outward between the two.
 */
export function nGonPath(ctx, cx, cy, r, n = 0, rot = 0, curvature = 0) {
  ctx.beginPath();
  if (n < 3 || curvature >= 1) { ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); return; }
  const half = Math.PI / n, apo = r * Math.cos(half);
  const mid = apo + (r - apo) * Math.max(0, curvature);
  const ctrl = 2 * mid - apo;   // quadratic control so the edge midpoint sits at `mid`
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i * 2 * Math.PI) / n, am = a0 + half;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a0 + 2 * half), y1 = cy + r * Math.sin(a0 + 2 * half);
    if (i === 0) ctx.moveTo(x0, y0);
    if (curvature > 0) ctx.quadraticCurveTo(cx + ctrl * Math.cos(am), cy + ctrl * Math.sin(am), x1, y1);
    else ctx.lineTo(x1, y1);
  }
  ctx.closePath();
}

/** Cover-fit placement of a sw×sh source inside dw×dh: returns { x, y, s } (scale s). */
export function coverFit(sw, sh, dw, dh) {
  const s = Math.max(dw / sw, dh / sh);
  return { x: (dw - sw * s) / 2, y: (dh - sh * s) / 2, s };
}
/** Contain-fit placement. */
export function containFit(sw, sh, dw, dh) {
  const s = Math.min(dw / sw, dh / sh);
  return { x: (dw - sw * s) / 2, y: (dh - sh * s) / 2, s };
}

/** Reset the state the kits and pieces commonly leave behind. */
export function resetCtx(ctx, dpr = 1) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.setLineDash?.([]);
}

/**
 * Load every font a canvas piece draws with. Resolves to fontsOk: true only when each face
 * is actually available (document.fonts.check), so recordings never use fallback fonts.
 */
export async function loadFonts(fonts = []) {
  if (!fonts.length || typeof document === 'undefined' || !document.fonts) return true;
  try {
    await Promise.all(fonts.map(f => document.fonts.load(f).catch(() => [])));
    await document.fonts.ready;
    return fonts.every(fontLoaded);
  } catch { return false; }
}

/** First family named in a CSS font shorthand, e.g. '600 48px "Cormorant Garamond", serif'. */
export const fontFamily = spec => (spec.match(/\d(?:px|pt|em|rem)(?:\s*\/\s*\S+)?\s+["']?([^"',]+)/)?.[1] ?? '').trim();

/** Weight and style named in a font shorthand, normalised to FontFace terms ('400', 'italic'). */
export function fontFaceKey(spec) {
  const head = spec.slice(0, spec.search(/\d*\.?\d+(?:px|pt|em|rem)\b/)).trim().split(/\s+/);
  let weight = '400', style = 'normal';
  for (const tok of head) {
    if (/^(italic|oblique)$/.test(tok)) style = tok;
    else if (tok === 'bold') weight = '700';
    else if (/^[1-9]00$/.test(tok)) weight = tok;
  }
  return { family: fontFamily(spec), weight, style };
}

const faceWeightMatches = (fw, w) => {
  const [a, b = a] = String(fw).replace('normal', '400').replace('bold', '700').split(/\s+/).map(Number);
  return w >= a && w <= b;   // variable faces declare a range, e.g. '300 700'
};

/**
 * True when a webfont face with the spec's family, weight and style has actually loaded.
 * document.fonts.check() alone is not enough: it reports true for families with no @font-face
 * at all (silent fallback), and family-only matching would accept a different weight.
 */
export function fontLoaded(spec) {
  const { family, weight, style } = fontFaceKey(spec);
  if (!family) return false;
  for (const face of document.fonts) {
    if (face.status !== 'loaded' || face.family.replace(/["']/g, '') !== family) continue;
    if (!faceWeightMatches(face.weight, Number(weight))) continue;
    if ((face.style.split(/\s/)[0] || 'normal') !== style) continue;
    return true;
  }
  return false;
}
