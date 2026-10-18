// Shot-language card: one vendored Motion Prompt camera cell (#027 #030 #031 #032 #033 #043),
// repainted in a film's palette, cropped to the film's delivery aspect, and played once and held
// when the card is hovered, focused or (on touch screens) mostly in view. That real-time side (the
// hover loop, which owns a clock) is ui/shotcard-mount.js; this module stays pure.
//
// Motion Prompt #027 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#027
// Motion Prompt #030 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#030
// Motion Prompt #031 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#031
// Motion Prompt #032 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#032
// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
// Motion Prompt #043 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#043
//   run-the-code port: the cells are the vendored ones in ../vendor/motion-prompt/camera.js, drawn
//   unchanged. Only the kit palette (C), the kit fonts (setFonts) and the transform they draw under
//   are changed here. The move names, meanings and the readout numbers below come from `get` output.
// Motion Prompt #112 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#112
//   numbers only: ellipse clear to 45 % of a 0.62·W radius, vertical radius × (H/W) × 1.35,
//   rgb(32,35,43) to 70 %; composited with 'multiply' so it darkens a low-key frame.
// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
//   numbers only: dark #3A3530 55 % / white 45 % speckle (core/grain.js); re-seeded at 24 fps only
//   while the camera moves, so a resting or held card shows still grain.
//
// How a frame is drawn (seek is pure: pixels = f(t, params, size, dpr, seed)):
//   1. box = the film's aspect, contain-fitted in the canvas (bars in --ink-0 when they differ);
//   2. the 539×208 card is scaled to COVER the box, centred on the move's subject;
//   3. Object.assign(C, mapPalette(palette)), the sky gradient becomes C.card, draw the cell, then
//      resetPalette(), all synchronously (no other code can observe the remapped kit);
//   4. the kit's own viewfinder (corner marks, REC, HUD pill) is painted transparent and replaced by
//      a quieter one in box space: frame marks, a mono readout (top right) and a caption (bottom left);
//   5. #112 vignette and #118 grain.
// The kit draws blur with ctx.filter, whose radius is in device pixels; a thin context proxy scales
// those radii by the cover scale × dpr so the rack focus reads the same at any card size.
//
// Params: move ('#027'…'#043'), aspect (0 = fill the canvas), caption (bool) in the schema;
// u (seconds into the cell, 0 ≤ u < 9.4), palette (5 hex, darkest → lightest) and marks ('all' |
// 'no-top-left', when the page puts a label there) and quality (0.25–1, ignored when recording) pass through.
// Without u, t drives a scripted "play once and hold" timeline (record mode and the Player).

import { CELLS_BY_ID, CAMERA, C, resetPalette, setFonts } from '../vendor/motion-prompt/camera.js';
import { clamp, lerp, P, eIO, mod } from '../core/time.js';
import { loadFonts, resetCtx } from '../core/canvas.js';
import { hexToRgb, mixHex } from '../core/color.js';
import { grainTiles, grainIndex, drawGrain } from '../core/grain.js';
import { normPalette, pickAccent } from './still.js';

const CW = CAMERA.w, CH = CAMERA.h, PASS = CAMERA.pass;   // 539 × 208, one pass = 4.7 s
const INK0 = '#07080A';
const PAPER = '236,230,218';
const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
const SANS = '"Inter Tight", Inter, system-ui, sans-serif';
const CLEAR = 'rgba(0,0,0,0)';
const LOWRES_MAX = 1.25;   // max card-pixel scale for moves drawn through an offscreen (lowRes)
const DEFAULT_PALETTE = ['#07080A', '#1E2127', '#F4B26A', '#B9B3A8', '#ECE6DA'];   // site tokens, tungsten accent

// Point the kit's font constants at the site stacks (the kit's own text is painted transparent, but
// it is still measured, so it must not pull in a system face the page never loads).
setFonts({ en: SANS, mono: MONO, jp: SANS });

/**
 * The six moves. name / what / when are condensed from the CLI spec ("What happens", "When to use it").
 * t0–t1 is the cell's own move window (eased with eIO); uHold / exit drive the play-once-and-hold
 * state machine; focusX is the card x the crop centres on so the subject stays in view at 1.33.
 */
export const MOVES = {
  '027': { id: '#027', name: 'Dolly in', t0: 0.5, t1: 3.4, uHold: 3.8, exit: [4.2, 4.7], focusX: CW / 2,
    what: 'The camera itself travels toward the subject. Near objects grow and slide out of frame while the far hills barely change; the lens stays at 24mm.',
    when: 'To move in on a person or a detail and keep the sense of depth.' },
  '030': { id: '#030', name: 'Orbit', t0: 0.5, t1: 3.6, uHold: 3.9, exit: [4.2, 4.7], focusX: CW / 2, hazeHills: true,
    what: 'The camera travels on a 6 m circle around the subject, about 109° in all. The person stays centred while the trees behind sweep sideways.',
    when: 'To show a person in three dimensions, or to mark an entrance or a key moment.' },
  '031': { id: '#031', name: 'Crane up', t0: 0.5, t1: 3.4, uHold: 3.8, exit: [4.2, 4.7], focusX: CW / 2,
    what: 'The camera rises from 1.4 m to 9 m and tilts down to keep the person in frame. The ground fills the frame and the horizon leaves at the top.',
    when: 'To pull away at the end of a scene, or to reveal how large the place is.' },
  '032': { id: '#032', name: 'Dolly zoom', t0: 0.5, t1: 3.4, uHold: 3.8, exit: [4.2, 4.7], focusX: CW / 2,
    what: 'The camera pulls back while the lens zooms in by the same ratio. The person keeps the same size and only the background closes in.',
    when: 'For a moment of realisation, or to make unease visible.' },
  '033': { id: '#033', name: 'Rack focus', t0: 1.0, t1: 2.6, uHold: 3.4, exit: [4.2, 4.7], focusX: 225, captionRight: true, lowRes: true,
    what: 'The camera does not move. Focus shifts from a flower 2 m away to a person 9 m away, and the blur changes sides.',
    when: 'To move attention from foreground to background without cutting.' },
  '043': { id: '#043', name: 'Whip pan', t0: 1.7, t1: 2.5, uHold: 3.0, exit: [6.4, 9.4], focusX: CW / 2,
    what: 'The camera swings sideways very fast and the next scene is swapped in under the motion blur, at the point where the blur is strongest.',
    when: 'To change place or topic and keep the energy up.' },
};
export const MOVE_IDS = Object.keys(MOVES);

/** '#027' | '027' | 27 → '027' (unknown → '027'). */
export function moveKey(m) {
  const k = String(m ?? '').replace('#', '').padStart(3, '0');
  return MOVES[k] ? k : '027';
}

// --- Palette remap (spec §3.5) ----------------------------------------------------------------------

const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export { normPalette, pickAccent };

const mapCache = new Map();
/**
 * Kit palette keys for a film palette. Role mapping (spec §3.5): bg/card darkest, ink near-dark (deviation:
 * in these six cells ink only paints the car's tyres, which read wrong in the lightest tone),
 * blue = accent, blueM/L/XL = accent tints (mixed toward the dark sky, so far hills sit in haze),
 * g1–g4 = a ramp through the mid tones. The kit's viewfinder keys are transparent (redrawn here).
 */
export function mapPalette(palette) {
  const pal = normPalette(palette), key = pal.join();
  let m = mapCache.get(key);
  if (m) return m;
  const [d0, d1, mid, l1, l0] = pal, acc = pickAccent(pal);
  const glow = mixHex(mixHex(d1, l1, 0.2), acc, 0.1);   // horizon light
  m = {
    bg: d0, card: d0, border: mixHex(d0, l0, 0.14), ink: mixHex(d0, d1, 0.35), sub: mixHex(d0, l0, 0.5), faint: mixHex(d0, l0, 0.28),
    blue: mixHex(acc, d1, 0.18), blueM: mixHex(acc, d0, 0.3), blueL: mixHex(glow, d0, 0.38), blueXL: mixHex(glow, d0, 0.16), blueBg: mixHex(acc, d0, 0.9),
    grid: mixHex(d0, l0, 0.075),
    g1: mixHex(d0, d1, 0.5), g2: mixHex(mixHex(d0, d1, 0.7), acc, 0.16), g3: mixHex(d0, d1, 0.8), g4: mixHex(d1, l1, 0.22),
    face: rgba(l0, 0.85), glass: mixHex(l1, acc, 0.25),
    vfMark: CLEAR, hudBg: CLEAR, hudInk: CLEAR, vfLine: CLEAR, rec: CLEAR,
  };
  // Sky stops for the card gradient: non-enumerable, so Object.assign(C, map) copies kit keys only.
  Object.defineProperty(m, 'sky', { value: [d0, mixHex(d0, glow, 0.55), glow, mixHex(d0, d1, 0.42)] });
  mapCache.set(key, m);
  return m;
}

// --- Timeline -------------------------------------------------------------------------------------

/** Scripted "play once and hold" (seconds): enter at 1×, hold, exit, rest. Used when params.u is absent. */
export const DURATION = 8;
export function timelineU(t, key) {
  const m = MOVES[key], exitLen = m.exit[1] - m.exit[0];
  const holdEnd = DURATION - 0.5 - exitLen;
  const tt = mod(t, DURATION);
  if (tt < m.uHold) return tt;
  if (tt < holdEnd) return m.uHold;
  if (tt < holdEnd + exitLen) return m.exit[0] + (tt - holdEnd);
  return 0;
}

/** Progress of the cell's own move at u (same easing and reset as the kit's camCell). */
function moveProgress(m, u) {
  const uu = mod(u, PASS);
  const r = P(uu, PASS - 0.5, PASS);
  return r > 0.5 ? 0 : eIO(P(uu, m.t0, m.t1));
}

/** Camera-report readout for a move at u (pure; mirrors each cell's HUD numbers). */
export function readout(key, u) {
  const m = MOVES[key], p = moveProgress(m, u);
  switch (key) {
    case '027': return `24MM · ${lerp(8, 2.2, p).toFixed(1)} M`;
    case '030': { const a = Math.round(lerp(-0.95, 0.95, p) * 57.3); return `ARC ${a > 0 ? '+' : ''}${a}°`; }
    case '031': return `HEIGHT ${lerp(1.4, 9, p).toFixed(1)} M`;
    case '032': { const d = lerp(3.2, 8, p); return `${Math.round(d / 8 * 24)}MM · ${d.toFixed(1)} M`; }
    case '033': return `FOCUS ${lerp(2, 9, p).toFixed(1)} M`;
    case '043': { const cyc = Math.floor(mod(u, CAMERA.cycle) / PASS); const uu = mod(u, PASS);
      const mid = uu >= (m.t0 + m.t1) / 2; return cyc === 0 ? (mid ? 'SCENE B' : 'SCENE A') : (mid ? 'SCENE A' : 'SCENE B'); }
    default: return '';
  }
}

/** 0 at rest, 1 while the camera is performing or holding (eases in and out with the move). */
function activity(m, u) {
  if (u <= 0) return 0;
  return clamp(u / 0.4) * (1 - P(u, m.exit[1] - 0.4, m.exit[1]));
}

// --- Piece ----------------------------------------------------------------------------------------

export const meta = {
  id: 'shotcard',
  title: 'Shot-language card',
  context: '2d',
  duration: DURATION,
  loop: true,
  posterTime: 4.0,                 // inside every move's hold: the reduced-motion frame is u = uHold
  aspect: { wide: 2.39, tall: 4 / 3 },
  interactive: false,
  budgetMs: 6,
  fonts: [`500 12px ${MONO}`],
  params: [
    { key: 'move', label: 'Camera move', type: 'select', value: '#027', group: 'Move',
      options: MOVE_IDS.map(k => ({ value: MOVES[k].id, label: `${MOVES[k].id} ${MOVES[k].name}` })) },
    { key: 'aspect', label: 'Delivery aspect', type: 'select', value: 0, group: 'Frame',
      options: [0, 2.76, 2.39, 1.85, 1.78, 1.33].map(v => ({ value: v, label: v ? `${v.toFixed(2)}:1` : 'Fill' })) },
    { key: 'caption', label: 'Caption', type: 'toggle', value: true, group: 'Frame' },
  ],
  record: { w: 1280, h: 536, fps: 30, subframes: 1, tune: 'animation' },
  credits: ['#027', '#030', '#031', '#032', '#033', '#043', '#112', '#118'],
};

/** A CanvasRenderingContext2D proxy that scales `blur(Npx)` filters by `scale` (kit blur is in card px). */
function blurScalingProxy(ctx) {
  let scale = 1;
  const bound = new Map();
  const proxy = new Proxy(ctx, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      let f = bound.get(key);
      if (!f) { f = v.bind(target); bound.set(key, f); }
      return f;
    },
    set(target, key, value) {
      if (key === 'filter' && typeof value === 'string' && scale !== 1) {
        value = value.replace(/blur\(([\d.]+)px\)/g, (_, n) => `blur(${(Number(n) * scale).toFixed(2)}px)`);
      }
      target[key] = value;
      return true;
    },
  });
  return { proxy, setScale(s) { scale = s; } };
}

/** The film's aspect box inside the canvas (contain-fit; aspect 0 = the whole canvas). */
function boxFor(W, H, aspect) {
  if (!(aspect > 0) || Math.abs(W / H - aspect) < 0.01) return { x: 0, y: 0, w: W, h: H };
  if (W / H > aspect) { const w = H * aspect; return { x: (W - w) / 2, y: 0, w, h: H }; }
  const h = W / aspect; return { x: 0, y: (H - h) / 2, w: W, h };
}

export async function create(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let W = opts.width, H = opts.height, dpr = opts.dpr;
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);
  const tiles = grainTiles(4, 128, seed, { maxAlpha: 0.3 });
  const main = blurScalingProxy(ctx);
  const lowCanvas = document.createElement('canvas');
  const low = { canvas: lowCanvas, ...blurScalingProxy(lowCanvas.getContext('2d')) };
  const skyCache = new Map();

  // offset 0: card space (shot() and the kit's scratch canvases); offset -CH/2: world() space, which
  // draws after translate(w/2, h/2).
  function skyGradient(map, offset = 0) {
    const ck = `${offset}|${map.sky.join()}`;
    let g = skyCache.get(ck);
    if (!g) {
      g = ctx.createLinearGradient(0, offset, 0, offset + CH);
      const [top, upper, horizon, ground] = map.sky;
      g.addColorStop(0, top); g.addColorStop(0.3, upper); g.addColorStop(0.5, horizon);
      g.addColorStop(0.62, ground); g.addColorStop(1, top);
      skyCache.set(ck, g);
    }
    return g;
  }

  function seek(t, p = {}) {
    const key = moveKey(p.move);
    const m = MOVES[key];
    const u = Number.isFinite(p.u) ? clamp(p.u, 0, CAMERA.cycle - 1e-6) : timelineU(t, key);
    const map = mapPalette(p.palette ?? DEFAULT_PALETTE);
    const box = boxFor(W, H, Number(p.aspect) || 0);

    resetCtx(ctx, dpr);
    ctx.fillStyle = INK0;
    ctx.fillRect(0, 0, W, H);

    // Cover the box with the card, centred on the subject, never exposing the card's edge.
    const s = Math.max(box.w / CW, box.h / CH);
    const tx = clamp(box.x + box.w / 2 - m.focusX * s, box.x + box.w - CW * s, box.x);
    const ty = clamp(box.y + box.h / 2 - (CH / 2) * s, box.y + box.h - CH * s, box.y);
    const sky = skyGradient(map);
    // #030: at ±54° of yaw the kit's far hills (no near clipping) fold over the ground as a wedge;
    // drawing them in the sky gradient itself keeps the silhouettes of trees and buildings only.
    const haze = m.hazeHills ? skyGradient(map, -CH / 2) : null;
    const drawCard = (k, pk, blurScale) => {   // k is already in card space
      k.fillStyle = sky; k.fillRect(0, 0, CW, CH);
      // The kit's REC dot is drawn in C.blue (the subject's colour too), so it is clipped out instead.
      k.beginPath(); k.rect(0, 0, CW, CH); k.arc(29, 30, 6.5, 0, Math.PI * 2); k.clip('evenodd');
      Object.assign(C, map, { card: sky }, haze ? { blueXL: haze, blueL: haze } : null);
      pk.setScale(blurScale);
      try { CELLS_BY_ID[key](pk.proxy, CW, CH, u); }
      finally { resetPalette(); }
    };

    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    // quality < 1 (set by the mount helper on slow devices while a move plays) draws any move this way.
    const quality = opts.record ? 1 : clamp(Number(p.quality) || 1, 0.25, 1);
    const q = Math.min(s * dpr, LOWRES_MAX) * quality;
    if ((m.lowRes || quality < 1) && !opts.record && s * dpr > q + 0.05) {
      // #033 blurs ~30 sprites with ctx.filter; at card resolution that stays cheap enough to animate.
      // Rendered at ≤ 1.25 × card pixels and scaled up (the frame is mostly defocus anyway).
      const pw = Math.round(CW * q), ph = Math.round(CH * q);
      if (low.canvas.width !== pw || low.canvas.height !== ph) { low.canvas.width = pw; low.canvas.height = ph; }
      const lk = low.canvas.getContext('2d');
      resetCtx(lk, 1); lk.clearRect(0, 0, pw, ph); lk.save(); lk.scale(q, q);
      drawCard(lk, low, q);
      lk.restore();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(low.canvas, tx, ty, CW * s, CH * s);
    } else {
      ctx.translate(tx, ty); ctx.scale(s, s);
      drawCard(ctx, main, s * dpr);
    }
    ctx.restore();
    resetCtx(ctx, dpr);

    finish(ctx, box, map, m, key, u, p.caption !== false, p.marks === 'no-top-left');
  }

  function finish(k, box, map, m, key, u, caption, noTopLeft) {
    const { x, y, w, h } = box;
    k.save();
    k.beginPath(); k.rect(x, y, w, h); k.clip();

    // #112 vignette (numbers only), multiplied so it deepens the frame rather than greying it.
    k.save();
    k.globalCompositeOperation = 'multiply';
    k.translate(x + w / 2, y + h / 2); k.scale(1, (h / w) * 1.35);
    const R = w * 0.62, g = k.createRadialGradient(0, 0, R * 0.45, 0, 0, R);
    g.addColorStop(0, 'rgba(32,35,43,0)'); g.addColorStop(1, 'rgba(32,35,43,0.7)');
    k.fillStyle = g; k.fillRect(-w, -w, w * 2, w * 2);
    k.restore();

    // #118 grain: still at rest and in the hold; re-seeded at 24 fps only while the camera moves.
    const moving = u > 0 && Math.abs(u - m.uHold) > 1e-6;
    drawGrain(k, tiles[moving ? grainIndex(u, tiles.length) : 0], x, y, w, h, 0.2);

    // Viewfinder: frame marks, centre cross while active, readout top right, caption bottom left.
    const act = activity(m, u);
    const short = Math.min(w, h), inset = Math.round(short * 0.06), L = Math.round(short * 0.07);
    k.lineWidth = 1;
    k.strokeStyle = `rgba(${PAPER},${(0.2 + 0.22 * act).toFixed(3)})`;
    k.beginPath();
    const corners = [[x + inset, y + inset, 1, 1], [x + w - inset, y + inset, -1, 1], [x + inset, y + h - inset, 1, -1], [x + w - inset, y + h - inset, -1, -1]];
    for (const [cx, cy, sx, sy] of noTopLeft ? corners.slice(1) : corners) {
      const px = Math.round(cx) + 0.5, py = Math.round(cy) + 0.5;
      k.moveTo(px, py + sy * L); k.lineTo(px, py); k.lineTo(px + sx * L, py);
    }
    k.stroke();
    if (act > 0) {
      const cx = Math.round(x + w / 2) + 0.5, cy = Math.round(y + h / 2) + 0.5, c = Math.max(4, short * 0.025);
      k.strokeStyle = `rgba(${PAPER},${(0.3 * act).toFixed(3)})`;
      k.beginPath(); k.moveTo(cx - c, cy); k.lineTo(cx + c, cy); k.moveTo(cx, cy - c); k.lineTo(cx, cy + c); k.stroke();
    }
    const fs = Math.round(clamp(short * 0.045, 9, 12));
    k.font = `500 ${fs}px ${MONO}`;
    if ('letterSpacing' in k) k.letterSpacing = `${(fs * 0.08).toFixed(2)}px`;
    k.textBaseline = 'alphabetic';
    // Labels sit on the frame-mark lines, just past the marks' arms.
    const gap = L + Math.round(fs * 0.6), mid = Math.round(fs * 0.36);
    if (act > 0) {
      k.textAlign = 'right';
      k.fillStyle = `rgba(${PAPER},${(0.8 * act).toFixed(3)})`;
      k.fillText(readout(key, u), x + w - inset - gap, y + inset + mid);
    }
    if (caption) {
      // #033's focus brackets start bottom left, so its caption sits bottom right.
      k.textAlign = m.captionRight ? 'right' : 'left';
      k.fillStyle = `rgba(${PAPER},${(0.66 + 0.18 * act).toFixed(3)})`;
      k.fillText(`${m.id} ${m.name.toUpperCase()}`, m.captionRight ? x + w - inset - gap : x + inset + gap, y + h - inset + mid);
    }
    if ('letterSpacing' in k) k.letterSpacing = '0px';
    k.restore();
  }

  return {
    seek,
    resize(w, h, d) { W = w; H = h; dpr = d; },
    dispose() { tiles.length = 0; skyCache.clear(); lowCanvas.width = lowCanvas.height = 1; },
    describe(p = {}) {
      const m = MOVES[moveKey(p.move)];
      return `Shot-language card, Motion Prompt ${m.id} ${m.name}: ${m.what}`;
    },
  };
}
