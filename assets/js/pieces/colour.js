// Motion Prompt #087 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#087
// (numbers only: the scripted wipe 50 % → 20 % (0.75–1.55 s) → 82 % (1.55–2.65 s) → 50 % (2.65–3.55 s),
//  cubic ease-in-out, 4.8 s cycle; A/B labels top-left / top-right. Rebuilt with real pointer events.)
//
// Colour study. One scene-referred frame (colour-scene.js), graded in JS (colour-grade.js) from ARRI
// LogC3 to finished looks, compared A/B across a wipe, measured on a waveform and a vectorscope
// (scopes.js). The scopes are drawn INSIDE the canvas so a recording carries them:
//   wide  (1.5)  picture at 2.39 across the top, then waveform · vectorscope · grade readout;
//   tall  (0.68) picture, a full-width waveform, then vectorscope + readout.
// The divider is the "wipe" param: a slider in the controls (keyboard), and draggable on the picture
// through bindWipeDrag(player), exported for any page that mounts this piece.

import { clamp, mod, eIO, lerp, frameIndex } from '../core/time.js';
import { loadFonts, resetCtx } from '../core/canvas.js';
import { getScene, SCENE_SIZES, NEON_FONT } from './colour-scene.js';
import { createGrader, LOOKS, LOOK_BY_ID } from './colour-grade.js';
import { computeScopes, createScopeSurfaces, drawWaveform, drawVectorscope, describeScopes, MONO } from './scopes.js';

const INK0 = '#07080A', PAPER = '#ECE6DA', PAPER2 = '#B9B3A8', PAPER3 = '#8A857C', LINE = '#2A2E36';
const IMG_AR = 2.39;

// #087 timing.
const CYCLE = 4.8, SWITCH = 2.65;
const WIPE_KEYS = [[0.75, 0.5], [1.55, 0.2], [2.65, 0.82], [3.55, 0.5]];
const DEMO = ['rec709', 'teal', 'bleach', 'bw', 'd4n'];

const EV_VALUES = Array.from({ length: 13 }, (_, i) => (i - 6) / 3);
/** Exposure in thirds of a stop, as a DP writes it: −1⅔, ±0, +⅓. */
export function formatStops(v) {
  const n = Math.round(v * 3), a = Math.abs(n);
  if (!a) return '±0';
  const whole = Math.floor(a / 3), frac = ['', '⅓', '⅔'][a % 3];
  return `${n < 0 ? '−' : '+'}${whole || ''}${frac}`;
}
function spokenStops(v) {
  const n = Math.round(v * 3), a = Math.abs(n);
  if (!a) return 'normal exposure';
  const whole = Math.floor(a / 3), frac = ['', 'one third', 'two thirds'][a % 3];
  const amount = whole && frac ? `${whole} and ${frac} stops` : whole ? `${whole} ${whole === 1 ? 'stop' : 'stops'}` : `${frac} of a stop`;
  return `${n < 0 ? 'minus' : 'plus'} ${amount}`;
}
const lookOptions = LOOKS.map(l => ({ value: l.id, label: l.label }));
const lookName = id => (LOOK_BY_ID[id] ?? LOOK_BY_ID.rec709).name;
const lookShort = id => (LOOK_BY_ID[id] ?? LOOK_BY_ID.rec709).label.toUpperCase();
const lookSpoken = id => (LOOK_BY_ID[id] ?? LOOK_BY_ID.rec709).spoken;

export const meta = {
  id: 'colour',
  title: 'Colour · From Log C to the look',
  context: '2d',
  duration: CYCLE * DEMO.length,   // 24 s: every look gets one #087 wipe cycle
  loop: true,
  posterTime: 4.2,                 // divider at rest at 50 %, Log C against teal & orange (= defaults)
  aspect: { wide: 1.5, tall: 0.68 },
  interactive: true,
  budgetMs: 12,                    // grade ≤ 8 ms + scopes ≤ 3 ms on a changed frame
  fonts: [`500 12px ${MONO}`, `400 12px ${MONO}`, NEON_FONT],
  params: [
    { key: 'lookA', label: 'Look A · left of the divider', type: 'radio', value: 'log', group: 'Compare', options: lookOptions, animate: false },
    { key: 'lookB', label: 'Look B · right of the divider', type: 'radio', value: 'teal', group: 'Compare', options: lookOptions, animate: false },
    { key: 'wipe', label: 'Wipe', type: 'range', min: 0, max: 1, step: 0.01, value: 0.5, group: 'Compare',
      format: v => `${Math.round(v * 100)}%`,
      spoken: (v, p) => `Divider at ${Math.round(v * 100)} percent: ${lookSpoken(p.lookA ?? 'log')} on the left, ${lookSpoken(p.lookB ?? 'teal')} on the right`,
      hint: 'Drag the divider on the picture, or use the arrow keys here.' },
    { key: 'ev', label: 'Exposure', type: 'range', values: EV_VALUES, value: 0, group: 'Grade',
      format: v => `${formatStops(v)} stop`, spoken: v => spokenStops(v),
      hint: 'In thirds of a stop, applied in linear light before the look.' },
    { key: 'print', label: 'Print finish', type: 'toggle', value: false, group: 'Grade',
      hint: 'Sixteen percent toward a warm print stock, with static grain (#118).' },
  ],
  record: { w: 1920, h: 1280, fps: 30, subframes: 1, tune: 'film' },
  credits: ['#087 Before/after slider', '#115 Black and white', '#117 Teal and orange', '#118 Film grain'],
};

// --- layout ------------------------------------------------------------------------

/**
 * Rects (CSS px) for the picture, the scope panels and the readout. Pure; also used by
 * bindWipeDrag to map a pointer onto the divider.
 */
export function layoutRects(W, H, layout = W >= H ? 'wide' : 'tall') {
  const tall = layout === 'tall';
  const fs = Math.max(tall ? 10.5 : 11, W * (tall ? 0.03 : 0.0122));   // never below 10.5 CSS px
  const g = Math.round(Math.max(10, fs * 1.25)), hh = Math.round(fs * 2.1);
  const image = { x: 0, y: 0, w: W, h: Math.round(W / IMG_AR) };
  let wave, vec, info;
  if (!tall) {
    const top = image.h + g + hh, ph = Math.max(40, H - top - g);
    const iw = Math.round(Math.max(fs * 15, W * 0.2));
    const ww = Math.max(60, W - 4.5 * g - ph - iw);
    wave = { x: g, y: top, w: ww, h: ph };
    vec = { x: g * 2 + ww, y: top, w: ph, h: ph };
    info = { x: vec.x + ph + g * 1.5, y: top - hh, w: W - (vec.x + ph + g * 1.5) - g, h: ph + hh };
  } else {
    const wh = Math.round(W * 0.34);
    wave = { x: g, y: image.h + g + hh, w: W - 2 * g, h: wh };
    const vy = wave.y + wh + g + hh, vs = Math.max(40, Math.min(Math.round(W * 0.5), H - vy - g));
    vec = { x: g, y: vy, w: vs, h: vs };
    info = { x: g * 2.5 + vs, y: vy - hh, w: W - (g * 2.5 + vs) - g, h: vs + hh };
  }
  return { tall, fs, g, hh, image, wave, vec, info };
}

/** The #087 divider position at time u within a cycle (eIO between keys). */
export function wipeAt(t) {
  const u = mod(t, CYCLE), K = WIPE_KEYS;
  if (u <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (u < K[i][0]) return lerp(K[i - 1][1], K[i][1], eIO((u - K[i - 1][0]) / (K[i][0] - K[i - 1][0])));
  }
  return K[K.length - 1][1];
}

// --- piece -------------------------------------------------------------------------------

export async function create(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let W = opts.width, H = opts.height, dpr = opts.dpr, layout = opts.layout ?? (W >= H ? 'wide' : 'tall');
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);

  const surfaces = createScopeSurfaces();
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  let bound = null;          // { scene, grader } for the current scene size
  let imgKey = '', scopes = null;
  const statsCache = new Map();

  const sceneSize = () => (layout === 'tall' || W < 640 ? SCENE_SIZES.small : SCENE_SIZES.full);
  function ensure() {
    const [sw, sh] = sceneSize();
    if (!bound || bound.scene.W !== sw || bound.scene.H !== sh) {
      bound?.grader.dispose();
      const scene = getScene(sw, sh, seed);
      bound = { scene, grader: createGrader(scene) };
      sceneCanvas.width = sw; sceneCanvas.height = sh;
      imgKey = '';
    }
    return bound;
  }

  /** Resolve params into the exact inputs of the grade (so cache keys and pixels agree). */
  function resolve(p) {
    const { scene } = ensure();
    const a = LOOK_BY_ID[p.lookA] ? p.lookA : 'log', b = LOOK_BY_ID[p.lookB] ? p.lookB : 'teal';
    const ev = Math.round(clamp(Number(p.ev) || 0, -2, 2) * 3) / 3;
    const print = !!p.print;
    const wx = Math.round(clamp(Number.isFinite(p.wipe) ? p.wipe : 0.5) * scene.W);
    return { a, b, ev, print, wx, key: `${scene.W}|${a}|${b}|${wx}|${ev}|${print ? 1 : 0}` };
  }

  /** Grade + scopes for resolved inputs; cached by key. */
  function image(r) {
    const { scene, grader } = ensure();
    const comp = grader.composite(r.a, r.b, r.wx, r.ev, r.print);
    const sc = computeScopes(comp, scene.W, scene.H, 2);
    statsCache.set(r.key, sc.stats);
    if (statsCache.size > 64) statsCache.delete(statsCache.keys().next().value);
    return { comp, sc };
  }

  function seek(t, p) {
    const r = resolve(p);
    const { scene } = bound;
    if (r.key !== imgKey) {
      const { comp, sc } = image(r);
      sceneCtx.putImageData(new ImageData(comp, scene.W, scene.H), 0, 0);
      surfaces.update(sc);
      scopes = sc; imgKey = r.key;
    }
    const L = layoutRects(W, H, layout), { fs, image: im } = L;

    resetCtx(ctx, dpr);
    ctx.fillStyle = INK0; ctx.fillRect(0, 0, W, H);

    // Picture.
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sceneCanvas, im.x, im.y, im.w, im.h);
    const frac = r.wx / scene.W, dx = Math.round((im.x + frac * im.w) * dpr) / dpr;

    // Divider (#087): a hairline and a small grip; hidden at the very edges.
    if (frac > 0.001 && frac < 0.999) {
      ctx.fillStyle = 'rgba(236,230,218,0.9)';
      ctx.fillRect(dx - 0.5, im.y, 1, im.h);
      const gy = im.y + im.h / 2, gr = Math.max(9, fs * 1.05);
      ctx.beginPath(); ctx.arc(dx, gy, gr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(7,8,10,0.62)'; ctx.fill();
      ctx.strokeStyle = 'rgba(236,230,218,0.9)'; ctx.lineWidth = 1; ctx.stroke();
      const a = gr * 0.36, o = gr * 0.2;
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(dx - o, gy - a); ctx.lineTo(dx - o - a, gy); ctx.lineTo(dx - o, gy + a); ctx.closePath();
      ctx.moveTo(dx + o, gy - a); ctx.lineTo(dx + o + a, gy); ctx.lineTo(dx + o, gy + a); ctx.closePath();
      ctx.fill();
    }

    // A / B tags (top corners of the picture, as #087's BEFORE / AFTER).
    // Each tag is clipped to its own side, so the divider wipes the labels as it wipes the picture.
    const tfs = L.tall ? fs * 0.8 : fs * 0.92, m = L.tall ? fs * 0.6 : fs * 0.9;
    const tag = (text, x, right) => {
      ctx.save();
      ctx.beginPath();
      if (right) ctx.rect(dx, im.y, im.x + im.w - dx, im.h); else ctx.rect(im.x, im.y, dx - im.x, im.h);
      ctx.clip();
      ctx.font = `500 ${tfs}px ${MONO}`;
      ctx.letterSpacing = `${(tfs * 0.08).toFixed(2)}px`;
      const tw = ctx.measureText(text).width, padX = tfs * 0.7, th = tfs * 1.9;
      const bx = right ? x - tw - padX * 2 : x, by = im.y + m;
      ctx.fillStyle = 'rgba(7,8,10,0.58)'; ctx.fillRect(bx, by, tw + padX * 2, th);
      ctx.fillStyle = PAPER; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + padX, by + th / 2 + 0.5);
      ctx.letterSpacing = '0px';
      ctx.restore();
    };
    tag(`A · ${L.tall ? lookShort(r.a) : lookName(r.a)}`, im.x + m, false);
    tag(`B · ${L.tall ? lookShort(r.b) : lookName(r.b)}`, im.x + im.w - m, true);

    // Camera report on the picture (wide only), on the same chip as the tags.
    if (!L.tall) {
      ctx.font = `400 ${fs * 0.86}px ${MONO}`;
      ctx.letterSpacing = `${(fs * 0.08).toFixed(2)}px`;
      const text = 'A-CAM · 27MM · T2.8 · EI 800 · WB 5600K', tw = ctx.measureText(text).width, padX = fs * 0.7, th = fs * 1.8;
      const by = im.y + im.h - m - th;
      ctx.fillStyle = 'rgba(7,8,10,0.5)'; ctx.fillRect(im.x + m, by, tw + padX * 2, th);
      ctx.fillStyle = PAPER2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, im.x + m + padX, by + th / 2 + 0.5);
      ctx.letterSpacing = '0px';
    }

    // Scopes.
    ctx.letterSpacing = `${(fs * 0.06).toFixed(2)}px`;
    drawWaveform(ctx, L.wave, surfaces, { fs, dpr, wipe: frac });
    drawVectorscope(ctx, L.vec, surfaces, { fs, dpr });
    drawReadout(ctx, L, t, r, scopes.stats);
    ctx.letterSpacing = '0px';
  }

  function drawReadout(ctx, L, t, r, st) {
    const { info: b, fs, hh } = L;
    const lh = fs * 1.7, colV = b.x + fs * 4.6;
    const room = b.x + b.w - colV;
    // Label in paper-3, value in mono 500; a value that does not fit uses its short form, then shrinks.
    const row = (label, value, y, vColor = PAPER, short = null) => {
      ctx.font = `400 ${fs}px ${MONO}`; ctx.fillStyle = PAPER3; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x, y);
      ctx.font = `500 ${fs}px ${MONO}`; ctx.fillStyle = vColor;
      if (short && ctx.measureText(value).width > room) value = short;
      const vw = ctx.measureText(value).width;
      if (vw > room) ctx.font = `500 ${Math.max(fs * 0.7, (fs * room) / vw).toFixed(2)}px ${MONO}`;
      ctx.fillText(value, colV, y);
    };
    const f = frameIndex(mod(t, meta.duration), 24), tc = `TC 00:00:${String(Math.floor(f / 24)).padStart(2, '0')}:${String(f % 24).padStart(2, '0')}`;
    ctx.font = `500 ${fs}px ${MONO}`; ctx.fillStyle = PAPER3; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tc, b.x, b.y + hh - fs * 0.95);
    ctx.fillStyle = LINE; ctx.fillRect(b.x, Math.round((b.y + hh) * dpr) / dpr, b.w, 1);
    let y = b.y + hh + lh * 0.75;
    row('A', lookName(r.a), y, PAPER, lookShort(r.a)); y += lh;
    row('B', lookName(r.b), y, PAPER, lookShort(r.b)); y += lh;
    row('EXP', `${formatStops(r.ev)}  PRINT ${r.print ? 'ON' : 'OFF'}`, y, PAPER2); y += lh;
    if (L.tall) {   // a narrow column: one number per row
      row('BLACK', `${fmt(st.black)}%`, y, PAPER2); y += lh;
      row('PEAK', `${fmt(st.peak)}%`, y, PAPER2); y += lh;
    } else { row('BLACK', `${fmt(st.black)}%  PEAK ${fmt(st.peak)}%`, y, PAPER2); y += lh; }
    row('CLIP', `${fmt(st.clipped)}%`, y, st.clipped >= 1 ? '#F4B26A' : PAPER2);
  }
  const fmt = v => (v >= 10 ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(1));

  return {
    seek,
    resize(w, h, d, o = {}) { W = w; H = h; dpr = d; if (o.layout) layout = o.layout; imgKey = ''; },
    dispose() { bound?.grader.dispose(); bound = null; statsCache.clear(); },
    script(t) {
      const idx = Math.floor((t + CYCLE - SWITCH) / CYCLE) % DEMO.length;
      return { lookA: 'log', lookB: DEMO[(idx + DEMO.length) % DEMO.length], wipe: wipeAt(t) };
    },
    describe(p) {
      const r = resolve(p);
      const stats = statsCache.get(r.key) ?? image(r).sc.stats;
      const exp = r.ev ? `, exposure ${spokenStops(r.ev)}` : '';
      const fin = r.print ? ', print finish on' : '';
      return `Colour study of a dusk road: ${lookSpoken(r.a)} left of the divider, ${lookSpoken(r.b)} right of it, divider at ${Math.round((r.wx / bound.scene.W) * 100)}%${exp}${fin}. ${describeScopes(stats)}`;
    },
  };
}

// --- pointer drag on the picture ----------------------------------------------------------

/**
 * Make the divider draggable on a mounted colour Player's canvas. Keyboard users use the Wipe
 * slider the Player builds; this adds pointer / touch. Vertical touch scrolling still works
 * (touch-action: pan-y). Returns an unbind function.
 *   import { bindWipeDrag } from '../pieces/colour.js';
 *   const player = mount(host, { load: () => import('../pieces/colour.js'), controls: true });
 *   bindWipeDrag(player);
 */
export function bindWipeDrag(player, { canvas = player.canvas } = {}) {
  // Mouse and pen grab the divider at once. Touch waits to see the gesture: a tap sets the divider,
  // a mostly-horizontal drag moves it, and a vertical swipe is left to the browser to scroll the page
  // (it cancels the pointer), so reading down the page never moves the divider or stops the demo.
  const SLOP = 8;                                   // CSS px before a touch counts as a drag
  let drag = null, pend = null;
  canvas.style.touchAction = 'pan-y';
  const geo = () => {
    const b = canvas.getBoundingClientRect();
    const lay = player.host?.dataset.layout === 'tall' ? 'tall' : (b.width >= b.height ? 'wide' : 'tall');
    return { b, im: layoutRects(b.width, b.height, lay).image };
  };
  const hit = e => {
    const { b, im } = geo(), x = e.clientX - b.left, y = e.clientY - b.top;
    return { inside: y >= im.y && y <= im.y + im.h && x >= im.x && x <= im.x + im.w, v: clamp((x - im.x) / im.w) };
  };
  const set = v => player.set({ wipe: Math.round(v * 100) / 100 }, { animate: false, source: 'pointer' });
  const grab = e => {
    drag = e.pointerId; pend = null;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    set(hit(e).v);
  };
  const down = e => {
    if (!player.meta || (e.button ?? 0) > 0 || drag != null) return;
    if (!hit(e).inside) return;
    if (e.pointerType === 'touch') { pend = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    grab(e);
    e.preventDefault();
  };
  const move = e => {
    if (drag === e.pointerId) { set(hit(e).v); return; }
    if (pend && pend.id === e.pointerId) {
      const dx = Math.abs(e.clientX - pend.x), dy = Math.abs(e.clientY - pend.y);
      if (dx > SLOP && dx > dy) grab(e);
      else if (dy > SLOP) pend = null;              // a scroll: leave it to the browser
      return;
    }
    if (e.pointerType === 'mouse') canvas.style.cursor = hit(e).inside ? 'ew-resize' : '';
  };
  const up = e => {
    if (pend && pend.id === e.pointerId && e.type === 'pointerup') set(hit(e).v);   // a tap
    if (pend?.id === e.pointerId) pend = null;
    if (drag === e.pointerId) drag = null;
  };
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up };
  for (const [k, f] of Object.entries(events)) canvas.addEventListener(k, f);
  return () => {
    for (const [k, f] of Object.entries(events)) canvas.removeEventListener(k, f);
    drag = pend = null;
    canvas.style.cursor = ''; canvas.style.touchAction = '';
  };
}
