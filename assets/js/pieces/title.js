// Main title sequence (hero). Canvas 2D, 7.0 s, played once; seek(7.0) is the hero frame, the
// reduced-motion frame, the poster and the OG image.
//
// Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005
//   run-the-code port: the vendored cell from ../vendor/motion-prompt/motion.js draws the name reveal,
//   played once and held (u = min(t − 2.0, 1.4)); only its text, fonts and palette are swapped
//   through the module's exported TEXT5 / C / setFonts / OPTS.stage.
// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
//   numbers only: blur amounts 7 px / 6 px (× band scale), 1.6 s cubic in-out; direction reversed
//   (the far plane goes soft while the title plane comes into focus).
// Motion Prompt #112 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#112
//   numbers only: ellipse clear to 45 % of a 0.62·W radius, vertical × 1.35, rgb(32,35,43) to 70 %,
//   in over 0.4–1.4 s. Composited with 'multiply' so it darkens a low-key frame instead of lifting it.
// Motion Prompt #118 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#118
//   numbers only: dark #3A3530 55 % / white 45 % speckle up to 38 % alpha; 16 % lean towards #F2DDBE.
//   Deviations: the grain is re-seeded at 24 fps (it is a moving image, not a still), and the cream
//   lean is applied multiplicatively so the blacks stay black.
//
// Timeline (s)
//   0–7      grain, picture area only (8 tiles, tile = floor(t·24) mod 8)
//   0.3–1.6  original 9-blade iris opens (eOut) onto out-of-focus tungsten practicals; the bokeh
//            grows and rounds off with the aperture, its 9-gon turning with the blades
//   0.4–1.4  #112 vignette fades in (eIO), on the room layer under the type
//   0.3–6.6  slow push-in on the room, 2.5 % (eIO), so the lamps drift apart; still for the hold
//   2.0–3.4  #005 mask reveal of the name, hairline and role; held from u = 1.4
//   2.4–4.0  #033 rack focus: σ_name 7·s → 0, σ_bg 0 → 6·s (eIO); layers blurred, never the composite
//   4.8–5.6  letterbox settles 1.85 → 2.39 (tall layout: 1:1 → 4:5)
//   5.4–6.2  camera-report slate types on (IBM Plex Mono)
//   6.2–7.0  hold
// No flare pass, no light leak (cut for restraint).

import data from '../../../data/portfolio.js';
import { CELLS_BY_ID, MOTION, C as C5, OPTS as OPTS5, TEXT5, setFonts as setFonts5, getFonts as getFonts5 } from '../vendor/motion-prompt/motion.js';
import { clamp, lerp, P, eIO, eOut, smoothstep } from '../core/time.js';
import { mulberry32 } from '../core/prng.js';
import { kelvinChip, hexToRgb, rgbToHex } from '../core/color.js';
import { loadFonts, makeCanvas, blurLayer, nGonPath, resetCtx } from '../core/canvas.js';
import { grainTiles, grainIndex, drawGrain } from '../core/grain.js';

const INK0 = '#07080A', SCENE = '#09090B';
// #118's 16 % cream lean (multiply towards #F2DDBE) is applied to the type colours here and to the
// room in its cached layer, so no full-frame blend pass is needed per frame.
const CREAM = hexToRgb('#F2DDBE');
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const lean = hex => rgbToHex(hexToRgb(hex).map((v, i) => v * (0.84 + 0.16 * CREAM[i] / 255)));
const PAPER = lean('#ECE6DA'), PAPER2 = lean('#B9B3A8'), PAPER3 = lean('#8A857C'), TUNGSTEN = lean('#F4B26A');
const HAIRLINE = (() => { const [r, g, b] = hexToRgb(TUNGSTEN); return `rgba(${r},${g},${b},0.85)`; })();
const DISPLAY = '"Cormorant Garamond", "Iowan Old Style", Georgia, serif';
const SANS = '"Inter Tight", Inter, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const W_NAME = 500, W_ROLE = 500, W_SLATE = 400;

// Timeline.
const T = {
  irisA: 0.3, irisB: 1.6, vigA: 0.4, vigB: 1.4,
  reveal: 2.0, revealHold: 1.4, stagger: 0.12,
  rackA: 2.4, rackB: 4.0, push: 6.6, boxA: 4.8, boxB: 5.6, slateA: 5.4, slateB: 6.2, end: 7.0,
};
const BLADES = 9;
const GRAIN = 0.16;   // #118 effect amount (tile alpha is already 0–38 %)
const N_PRACTICALS = 14;
// Seed offset for the lamp layout: chosen from a contact sheet of seeds so the default (seed 1)
// spreads near and far lamps evenly around the title in both layouts.
const COMPOSITION = 4;

export const meta = {
  id: 'title',
  title: 'Main title',
  context: '2d',
  duration: T.end,
  loop: false,
  posterTime: T.end,
  aspect: { wide: 16 / 9, tall: 9 / 16 },   // study page only; the hero mounts with fit: 'fill'
  interactive: false,
  budgetMs: 8,
  fonts: [`${W_NAME} 64px ${DISPLAY}`, `${W_ROLE} 16px ${SANS}`, `${W_SLATE} 16px ${MONO}`],
  params: [],
  record: { w: 1920, h: 1080, fps: 24, subframes: 1, tune: 'film' },
  credits: ['#005 Mask reveal', '#033 Rack focus', '#112 Vignette', '#118 Film grain'],
};

const person = data?.person ?? {};
/** Camera-report line from data.person.slate, e.g. "A-CAM · 40mm · T2.0 · 5600K · 24fps · 2.39:1". */
export function slateLine(s = person.slate) {
  if (!s) return '';
  if (typeof s === 'string') return s;
  return [s.cam, s.lens, s.stop, s.kelvin && `${s.kelvin}K`, s.fps && `${s.fps}fps`, s.aspect].filter(Boolean).join(' · ');
}

export async function create(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let W = opts.width, H = opts.height, dpr = opts.dpr || 1;
  let layoutOpt = opts.layout;
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);

  const cell = CELLS_BY_ID['005'];
  const tiles = grainTiles(8, 256, seed, { maxAlpha: 0.38 });   // keyed by seed: built once

  // Practicals: positions in picture units (x: fraction of W, y: fraction of the final picture height
  // from its centre), depth 0 (far, small, bright) → 1 (near, large, dim), colour temperature.
  const rnd = mulberry32(((seed + COMPOSITION) * 2654435761) >>> 0 ^ 0x7a11);
  const practicals = [];
  // x is stratified (one lamp per jittered column, columns shuffled) so the lamps spread across the
  // frame like practicals along a street, without clumps or holes.
  const cols = Array.from({ length: N_PRACTICALS }, (_, i) => i);
  for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  for (let i = 0; i < N_PRACTICALS; i++) {
    let x = 0.03 + 0.94 * ((cols[i] + 0.15 + 0.7 * rnd()) / N_PRACTICALS), y = (rnd() - 0.5) * 0.84;
    const d = rnd(), K = 2700 + 500 * rnd();
    // Keep the lamps from sitting directly behind the title block.
    if (Math.abs(x - 0.5) < 0.3 && Math.abs(y) < 0.2) y = Math.sign(y || 1) * (0.2 + Math.abs(y) * 0.9);
    const col = kelvinChip(K, 5600);
    practicals.push({ x, y, d, K, col, rgb: hexToRgb(col), rot: rnd() });
  }

  let geo = null, nameLayer = null, bgLayer = null, bgBlur = null;
  let bgKey = '', nameKey = '';

  function texts(p) {
    const name = String(p?.name ?? person.name ?? 'Karan Chaudhary').toUpperCase();
    const role = String(p?.role ?? person.role ?? 'Cinematographer').toUpperCase();
    const slate = String(p?.slate ?? slateLine()).toUpperCase();
    return { name, role, slate };
  }

  function measure(font, ls, s) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = font; ctx.letterSpacing = ls; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(s);
    ctx.restore();
    return { L: m.actualBoundingBoxLeft, R: m.actualBoundingBoxRight, asc: m.actualBoundingBoxAscent, width: m.width };
  }

  /** Layout, cached by size + layout + strings. All lengths in CSS px unless noted "card". */
  function geometry(p) {
    const tx = texts(p);
    // Fill-mode piece: a portrait frame always gets the tall layout (a 2.39 strip would use a third
    // of a portrait tablet); a 'tall' hint is honoured on any frame.
    const tall = layoutOpt === 'tall' || H > W;
    const key = `${W}x${H}@${dpr}|${tall}|${tx.name}|${tx.role}|${tx.slate}`;
    if (geo && geo.key === key) return geo;

    const arFrom = tall ? 1.0 : 1.85, arTo = tall ? 0.8 : 2.39;
    const ph1 = Math.min(H, W / arTo), cy = H / 2;

    const lines = tall && tx.name.includes(' ')
      ? [tx.name.slice(0, tx.name.lastIndexOf(' ')), tx.name.slice(tx.name.lastIndexOf(' ') + 1)]
      : [tx.name];

    // Card font size for the name: as large as #005's top clip (y 8–119, baseline 110) allows.
    const capRatio = measure(`${W_NAME} 100px ${DISPLAY}`, '0px', 'H').asc / 100;
    const F = Math.min(150, Math.floor(92 / capRatio));
    const lsN = `${(0.18 * F).toFixed(2)}px`;
    const fontN = `${W_NAME} ${F}px ${DISPLAY}`;
    const mLines = lines.map(s => measure(fontN, lsN, s));
    const inkW = Math.max(...mLines.map(m => m.L + m.R));
    const capCard = capRatio * F;

    // Card scale k: the name fills a fraction of the width, capped by the picture height.
    const k = Math.min(((tall ? 0.74 : 0.5) * W) / inkW, ((tall ? 0.072 : 0.082) * ph1) / capCard);
    const fontPx = F * k, cap = capCard * k;

    // Role (card px; must stay under 50 so its cap fits #005's bottom clip y 129–181).
    const roleCapRatio = measure(`${W_ROLE} 100px ${SANS}`, '0px', 'H').asc / 100;
    const rolePx = Math.max(tall ? 10 : 11, fontPx * (tall ? 0.24 : 0.2));
    const RF = Math.min(50, rolePx / k);
    const lsR = `${(0.34 * RF).toFixed(2)}px`;
    const fontR = `${W_ROLE} ${RF.toFixed(2)}px ${SANS}`;
    const mRole = measure(fontR, lsR, tx.role);
    const roleCap = roleCapRatio * RF * k;

    // Vertical rhythm (CSS px) around the hairline.
    const gapNL = Math.max(9, 0.5 * cap), gapLR = Math.max(9, 0.5 * cap);
    const lineStepCard = 1.22 * F;
    const dyName = (121 - gapNL / k) - 110;                       // card px, moves name + its clip
    const dyRole = (127 + gapLR / k + roleCapRatio * RF) - 168;   // card px, moves role + its clip

    // Slate (one line, or two in narrow frames).
    const slatePx = Math.max(10.5, Math.min(13, fontPx * (tall ? 0.27 : 0.19)));
    const lsSpx = 0.12 * slatePx, lsS = `${lsSpx.toFixed(2)}px`;
    const fontS = `${W_SLATE} ${slatePx.toFixed(2)}px ${MONO}`;
    let slateLines = [tx.slate];
    if (measure(fontS, lsS, tx.slate).width > W * (tall ? 0.7 : 0.84)) {
      const parts = tx.slate.split(' · '), h2 = Math.ceil(parts.length / 2);
      slateLines = [parts.slice(0, h2).join(' · '), parts.slice(h2).join(' · ')];
    }
    const slateCap = slatePx * 0.7, slateLead = slatePx * 1.9;
    const gapRS = Math.max(18, roleCap * 2.6);

    const above = 3 * k + gapNL + cap + (lines.length - 1) * lineStepCard * k;
    const below = 3 * k + gapLR + roleCap + gapRS + slateCap + (slateLines.length - 1) * slateLead;
    const Ly = cy - 0.012 * ph1 + (above - below) / 2;            // hairline centre
    // The card spans the full frame width (cell(k, w, h, u) centres on w / 2 and clips to w), so a
    // name wider than #005's 539 px card is never cut; its height stays the card's 208.
    const cardW = W / k, ox = 0, oy = Ly - 124 * k;              // card origin

    // Name layer band (card y range, incl. the rise from below and blur margins).
    const S = ((tall ? 0.86 : 0.5) * W) / MOTION.w;               // spec band scale for blur amounts
    const sigN = 7 * S, sigB = 6 * S;
    const margin = Math.ceil(3 * sigN + 4);
    const topCard = 8 + dyName - (lines.length - 1) * lineStepCard;
    const botCard = 181 + dyRole;
    const bandTop = Math.floor(oy + topCard * k - margin);
    const bandH = Math.ceil((botCard - topCard) * k + 2 * margin);
    // …and only as wide as the widest of name, role and hairline (blur cost scales with area).
    const halfInk = Math.max(inkW / 2, (mRole.L + mRole.R) / 2, 190) * k;
    const bandLeft = Math.max(0, Math.floor(W / 2 - halfInk - margin));
    const bandW = Math.min(W, Math.ceil(W - 2 * bandLeft));

    const slateY = Ly + 3 * k + gapLR + roleCap + gapRS + slateCap;
    const slateM = slateLines.map(s => measure(fontS, lsS, s));

    geo = {
      key, tall, arFrom, arTo, ph1, cy, lines, mLines, F, fontN, lsN, k, fontPx, cap, RF, fontR, lsR, mRole,
      dyName, dyRole, lineStepCard, cardW, ox, oy, Ly, S, sigN, sigB, bandTop, bandH, bandLeft, bandW,
      fontS, lsS, lsSpx, slatePx, slateLines, slateM, slateY, slateLead,
      U: Math.sqrt(W * ph1),
    };
    // Layers at frame resolution (name) and half resolution (the room: it is all soft light and
    // smooth gradients, so it is lit, blurred, vignetted and leaned at half size and upscaled).
    nameLayer = makeCanvas(bandW * dpr, bandH * dpr);
    bgLayer = makeCanvas(Math.ceil((W * dpr) / 2), Math.ceil((H * dpr) / 2));
    bgBlur = makeCanvas(bgLayer.width, bgLayer.height);
    bgKey = nameKey = '';
    return geo;
  }

  // ---------------------------------------------------------------- background practicals

  function drawPracticals(g, open, rk) {
    const b = bgLayer.getContext('2d');
    const sc = bgLayer.width / W;
    b.setTransform(sc, 0, 0, sc, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = SCENE;
    b.fillRect(0, 0, W, H);
    // Faint spill from the lamps into the room.
    const amb = b.createRadialGradient(W * 0.5, g.cy - g.ph1 * 0.08, 0, W * 0.5, g.cy, Math.max(W, g.ph1) * 0.7);
    amb.addColorStop(0, 'rgba(244,178,106,0.04)');
    amb.addColorStop(0.55, 'rgba(244,178,106,0.012)');
    amb.addColorStop(1, 'rgba(244,178,106,0)');
    b.fillStyle = amb;
    b.fillRect(0, 0, W, H);

    // Bokeh: disc size follows the aperture (iris open) and the rack (focus moving off the lamps);
    // brightness falls with area so the light is roughly conserved.
    const aperture = lerp(0.58, 1, open);
    const defocus = 1 + 0.4 * rk;
    const curv = lerp(0.05, 0.7, open);   // stopped down: faceted; wide open: nearly round
    const irisRot = 0.35 * (1 - open);
    b.globalCompositeOperation = 'lighter';
    for (const q of practicals) {
      const r = g.U * (0.008 + 0.046 * q.d * q.d) * aperture * defocus;
      const a = (0.78 - 0.54 * q.d) * Math.pow(aperture, 0.6) / defocus;
      const x = q.x * W, y = g.cy + q.y * g.ph1;
      const rot = -Math.PI / 2 + irisRot + q.rot * 0.08;
      // Halation: a faint wide glow around each lamp so it reads as light, not as a dot.
      const hr = r * 2.6;
      const halo = b.createRadialGradient(x, y, r * 0.5, x, y, hr);
      halo.addColorStop(0, q.col);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      b.globalAlpha = a * 0.16;
      b.fillStyle = halo;
      b.fillRect(x - hr, y - hr, hr * 2, hr * 2);
      // The disc: slightly dimmer centre rising to a brighter rim (the soap-bubble edge of a real
      // out-of-focus highlight) that rolls off over the last few percent, so it reads as light
      // through glass rather than a flat cut-out.
      nGonPath(b, x, y, r, BLADES, rot, curv);
      const disc = b.createRadialGradient(x, y, 0, x, y, r);
      disc.addColorStop(0, rgba(q.rgb, 0.8));
      disc.addColorStop(0.72, rgba(q.rgb, 0.9));
      disc.addColorStop(0.93, rgba(q.rgb, 1));
      disc.addColorStop(1, rgba(q.rgb, 0.72));
      b.globalAlpha = a;
      b.fillStyle = disc;
      b.fill();
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- #005 name reveal

  function drawName(g, tx, t) {
    const n = nameLayer.getContext('2d');
    n.setTransform(1, 0, 0, 1, 0, 0);
    n.clearRect(0, 0, nameLayer.width, nameLayer.height);
    const u0 = clamp(t - T.reveal, 0, T.revealHold);
    if (u0 <= 0) return false;

    // Snapshot the vendored module's shared state; restore it after drawing.
    const keep = { C: { ...C5 }, TEXT5: { ...TEXT5 }, stage: OPTS5.stage, fonts: getFonts5() };
    try {
      OPTS5.stage = false;
      setFonts5({ disp: DISPLAY, jp: SANS });
      C5.white = PAPER; C5.yel = PAPER2;
      TEXT5.topFont = `${W_NAME} ${g.F}px`; TEXT5.topTracking = g.lsN;
      TEXT5.bottomFont = `${W_ROLE} ${g.RF.toFixed(2)}px`; TEXT5.bottomTracking = g.lsR;

      const base = [dpr * g.k, 0, 0, dpr * g.k, dpr * (g.ox - g.bandLeft), dpr * (g.oy - g.bandTop)];
      const pass = (u, { top = '', bottom = '', line = false, dx = 0, dy = 0 }) => {
        if (u <= 0) return;
        TEXT5.top = top; TEXT5.bottom = bottom;
        C5.coral = line ? HAIRLINE : 'rgba(0,0,0,0)';
        n.save();
        n.setTransform(...base);
        n.translate(dx, dy);
        cell(n, g.cardW, MOTION.h, Math.min(u, T.revealHold));
        n.restore();
      };
      const last = g.lines.length - 1;
      g.lines.forEach((s, i) => {
        const m = g.mLines[i];
        // letterSpacing adds a trailing gap; centre the ink, not the advance.
        pass(u0 - i * T.stagger, { top: s, dx: -(m.R - m.L) / 2, dy: g.dyName - (last - i) * g.lineStepCard });
      });
      pass(u0, { line: true });
      pass(u0 - last * T.stagger, { bottom: tx.role, dx: -(g.mRole.R - g.mRole.L) / 2, dy: g.dyRole });
    } finally {
      Object.assign(C5, keep.C); Object.assign(TEXT5, keep.TEXT5);
      OPTS5.stage = keep.stage; setFonts5(keep.fonts);
    }
    return true;
  }

  // ---------------------------------------------------------------- iris

  function drawIris(open, R) {
    const cx = W / 2, cy = H / 2;
    const rot = -Math.PI / 2 + 0.35 * (1 - open);
    const verts = [];
    for (let i = 0; i < BLADES; i++) {
      const a = rot + (i * 2 * Math.PI) / BLADES;
      verts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    verts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = INK0;
    ctx.fill('evenodd');

    // Each blade's leading edge: the aperture side i, continued past the next vertex towards the
    // barrel, with a 6 % sheen on the blade side that falls off away from the aperture.
    const Rc = Math.hypot(W / 2, H / 2);
    const L = Rc * 0.95, SEG = 8;
    const sw = Math.max(2, Math.min(W, H) * 0.012);
    // Closed, the room is black: the sheen only catches light once the aperture lets some in.
    const sheen = 0.06 * smoothstep(0, 0.25, open);
    for (let i = 0; i < BLADES; i++) {
      const [x0, y0] = verts[i];
      const da = rot + ((2 * i + 1) * Math.PI) / BLADES + Math.PI / 2;   // edge direction
      const dx = Math.cos(da), dy = Math.sin(da);
      const nx = Math.cos(da - Math.PI / 2), ny = Math.sin(da - Math.PI / 2);   // outward normal
      const gr = ctx.createLinearGradient(x0, y0, x0 + nx * sw, y0 + ny * sw);
      gr.addColorStop(0, `rgba(236,230,218,${sheen.toFixed(4)})`);
      gr.addColorStop(1, 'rgba(236,230,218,0)');
      ctx.fillStyle = gr;
      for (let j = 0; j < SEG; j++) {
        const s0 = (j / SEG) * L, s1 = ((j + 1) / SEG) * L + 0.5;
        ctx.globalAlpha = Math.pow(1 - j / SEG, 1.6);
        const ax = x0 + dx * s0, ay = y0 + dy * s0, bx = x0 + dx * s1, by = y0 + dy * s1;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.lineTo(bx + nx * sw, by + ny * sw); ctx.lineTo(ax + nx * sw, ay + ny * sw);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------------------------------------------------------------- frame

  function seek(t, p = {}) {
    t = clamp(t, 0, T.end);
    const g = geometry(p);
    const tx = texts(p);

    const open = eOut(P(t, T.irisA, T.irisB));
    const rk = eIO(P(t, T.rackA, T.rackB));
    // σ_bg carries a small constant lens softness (1.1·s) so the half-resolution discs never alias.
    const sigName = g.sigN * (1 - rk), sigBg = g.sigB * rk + g.S * 1.1;
    const box = eIO(P(t, T.boxA, T.boxB));
    const ar = lerp(g.arFrom, g.arTo, box);
    const ph = Math.min(H, W / ar), py = (H - ph) / 2;

    // 1. The room: practicals blurred as a layer (#033), then #112 vignette and #118 cream lean, all at
    //    half resolution and cached by their inputs (static from 4.0 s on).
    const va = eIO(P(t, T.vigA, T.vigB));
    const kB = `${g.key}|${open.toFixed(5)}|${rk.toFixed(5)}|${va.toFixed(5)}`;
    if (kB !== bgKey) {
      drawPracticals(g, open, rk);
      const f = bgBlur.getContext('2d'), sc = bgBlur.width / W;
      resetCtx(f, 1);
      f.fillStyle = SCENE; f.fillRect(0, 0, bgBlur.width, bgBlur.height);
      blurLayer(f, bgLayer, sigBg * dpr * (bgBlur.width / (W * dpr)), 0, 0, bgBlur.width, bgBlur.height);
      f.setTransform(sc, 0, 0, sc, 0, 0);
      if (va > 0) {
        // #112 (multiply: darkens a low-key frame and keeps the cool cast of its colour).
        f.save();
        f.translate(W / 2, g.cy);
        f.scale(1, (g.ph1 / W) * 1.35);
        const R1 = W * 0.62;
        const vg = f.createRadialGradient(0, 0, R1 * 0.45, 0, 0, R1);
        vg.addColorStop(0, 'rgba(32,35,43,0)');
        vg.addColorStop(1, `rgba(32,35,43,${(0.7 * va).toFixed(3)})`);
        f.globalCompositeOperation = 'multiply';
        f.fillStyle = vg;
        const big = Math.max(W, H) * 4;
        f.fillRect(-big, -big, big * 2, big * 2);
        f.restore();
      }
      f.globalCompositeOperation = 'multiply';
      f.globalAlpha = 0.16;
      f.fillStyle = '#F2DDBE';
      f.fillRect(0, 0, W, H);
      resetCtx(f, 1);
      bgKey = kB;
    }
    // Slow push-in on the room (2.5 %, eIO, settled by 6.6 s) so the lamps drift apart; the title
    // plane does not move.
    const push = 1 + 0.025 * eIO(P(t, T.irisA, T.push));
    resetCtx(ctx, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // bilinear: the room is all soft light
    const cw = W * dpr * push, chh = H * dpr * push;
    ctx.drawImage(bgBlur, (W * dpr - cw) / 2, g.cy * dpr - (g.cy * dpr) * push, cw, chh);

    // 2. Name, hairline and role (#005) on their own layer, racked into focus (#033).
    const u0 = clamp(t - T.reveal, 0, T.revealHold);
    const kN = `${g.key}|${u0.toFixed(5)}`;
    if (kN !== nameKey) { drawName(g, tx, t); nameKey = kN; }
    if (u0 > 0) blurLayer(ctx, nameLayer, sigName * dpr, g.bandLeft * dpr, g.bandTop * dpr, nameLayer.width, nameLayer.height);

    resetCtx(ctx, dpr);

    // 3. Slate types on under the role.
    const sp = eOut(P(t, T.slateA, T.slateB));
    if (sp > 0) {
      const all = g.slateLines.join('\n');
      let n = Math.floor(all.length * sp + 1e-9);
      ctx.font = g.fontS; ctx.letterSpacing = g.lsS; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = PAPER3;
      let caret = null;
      g.slateLines.forEach((s, i) => {
        const x0 = W / 2 - (g.slateM[i].width - g.lsSpx) / 2;   // advance minus the trailing tracking
        const y = g.slateY + i * g.slateLead;
        const shown = s.slice(0, Math.max(0, n));
        if (shown) ctx.fillText(shown, x0, y);
        if (n >= 0 && n <= s.length) caret = [x0 + (shown ? ctx.measureText(shown).width : 0), y];
        n -= s.length + 1;
      });
      ctx.letterSpacing = '0px';
      if (sp < 1 && caret) {
        ctx.fillStyle = TUNGSTEN;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(caret[0] + 1, caret[1] - g.slatePx * 0.72, Math.max(1, g.slatePx * 0.08), g.slatePx * 0.84);
        ctx.globalAlpha = 1;
      }
    }

    // 5. Iris (only while it still covers part of the frame).
    if (open < 1) {
      const Rc = Math.hypot(W / 2, H / 2) / Math.cos(Math.PI / BLADES) * 1.02;
      drawIris(open, Rc * open);
    }

    // 6. #118 grain on the picture, re-seeded at 24 fps.
    drawGrain(ctx, tiles[grainIndex(t, tiles.length)], 0, py, W, ph, GRAIN);

    // 7. Letterbox bars (matte, no grain).
    ctx.fillStyle = INK0;
    if (py > 0) { ctx.fillRect(0, 0, W, Math.ceil(py)); ctx.fillRect(0, Math.floor(py + ph), W, H - Math.floor(py + ph)); }
  }

  return {
    seek,
    resize(w, h, d, o) { W = w; H = h; dpr = d || 1; if (o?.layout) layoutOpt = o.layout; geo = null; },
    dispose() { tiles.length = 0; geo = nameLayer = bgLayer = bgBlur = null; },
    describe(p = {}) {
      const name = p?.name ?? person.name ?? 'Karan Chaudhary', role = p?.role ?? person.role ?? 'Cinematographer';
      const slate = String(p?.slate ?? slateLine()).replace(/ · /g, ', ');
      // The resolved frame first (it is also the reduced-motion frame), then what the motion does.
      return `Main title: ${name}, ${role}, in a letterboxed frame over out-of-focus tungsten lamps; camera report ${slate}. In motion, a nine-blade iris opens and focus racks from the lamps to the name.`;
    },
  };
}
