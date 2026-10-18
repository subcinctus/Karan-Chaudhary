// Reference piece: a film-leader slate with a rotating sweep. It exists to show (and test) the
// piece contract; copy it to start a new piece.
//
// Contract
//   export const meta = { id, title, context, duration, loop, posterTime, aspect, interactive, budgetMs,
//                         params, record, credits, fonts }
//   export async function create(canvas, { width, height, dpr, params, seed, quality, record, reducedMotion, layout })
//     → { seek(t, params), resize(width, height, dpr), dispose(), script?(t), describe?(params) }
// Rules
//   - seek is PURE: pixels = f(t, params, size, dpr, seed, quality). No unseeded randomness, wall
//     clocks, timers or animation-frame callbacks in pieces (npm run check greps for them); the Player
//     owns the only clock. Randomness comes from core/prng.js.
//   - The host sizes the backing store (canvas.width = round(width·dpr)); the piece only scales by dpr.
//   - Every font drawn on canvas is listed in meta.fonts and awaited in create().
//   - Caches are allowed only when keyed by their inputs (size, seed, quality).
//   - The poster (record mode) and the reduced-motion frame are both seek(posterTime, script(posterTime) over
//     params), so they match; keep script(posterTime) close to the defaults so controls start from them.
//   - Keep essential text out of the bottom-right ~120×60 CSS px: the Player's play/pause chrome sits there.

import { P, eIO, lerp, frameIndex } from '../core/time.js';
import { loadFonts, nGonPath, resetCtx } from '../core/canvas.js';
import { kelvinChip } from '../core/color.js';
import { grainTiles, grainIndex, drawGrain } from '../core/grain.js';

const INK0 = '#07080A', INK1 = '#0C0D10', LINE = '#2A2E36', PAPER = '#ECE6DA', PAPER3 = '#8A857C';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const DISPLAY = '"Cormorant Garamond", "Iowan Old Style", Georgia, serif';

export const meta = {
  id: '_template',
  title: 'Template · Leader',
  context: '2d',
  duration: 6,
  loop: true,
  posterTime: 5.75,
  aspect: { wide: 2.39, tall: 4 / 5 },
  interactive: true,
  budgetMs: 4,
  fonts: [`500 16px ${MONO}`, `500 80px ${DISPLAY}`],
  params: [
    { key: 'kelvin', label: 'Accent colour temperature', type: 'range', min: 2700, max: 6500, step: 100, value: 3200,
      group: 'Light', format: v => `${Math.round(v)} K`, spoken: v => `${Math.round(v)} kelvin`,
      hint: 'Seen by a camera balanced for 5600 K daylight.' },
    { key: 'blades', label: 'Iris blades', type: 'radio', value: 9, group: 'Lens',
      options: [{ value: 5, label: '5' }, { value: 6, label: '6' }, { value: 9, label: '9' }, { value: 0, label: 'Round' }] },
    { key: 'sweep', label: 'Sweep speed', type: 'range', min: 0.25, max: 2, step: 0.05, value: 1, group: 'Lens',
      format: v => `${v.toFixed(2)} rev/s`, spoken: v => `${v.toFixed(2)} revolutions per second` },
    { key: 'grain', label: 'Grain', type: 'toggle', value: true, group: 'Finish' },
  ],
  record: { w: 1280, h: 536, fps: 24, subframes: 1, tune: 'film' },
  credits: [],
};

export async function create(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let W = opts.width, H = opts.height, dpr = opts.dpr;
  const seed = opts.seed ?? 1;
  await loadFonts(meta.fonts);
  const tiles = grainTiles(4, 128, seed, { maxAlpha: 0.32 });   // keyed by seed: built once

  function seek(t, p) {
    resetCtx(ctx, dpr);
    ctx.fillStyle = INK0;
    ctx.fillRect(0, 0, W, H);

    // Picture area: 2.39 band (wide) or the full frame (tall), with frame lines.
    const tall = H > W;
    const pw = W, ph = tall ? H : Math.min(H, W / 2.39), py = (H - ph) / 2;
    ctx.fillStyle = INK1;
    ctx.fillRect(0, py, pw, ph);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, py + 0.5, pw - 1, ph - 1);

    const accent = kelvinChip(p.kelvin, 5600);
    const cx = W / 2, cy = H / 2, R = Math.min(pw, ph) * 0.36;

    // Leader rings and crosshair.
    ctx.strokeStyle = PAPER3; ctx.lineWidth = Math.max(1, R * 0.012);
    for (const k of [1, 0.82]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.25, cy); ctx.lineTo(cx + R * 1.25, cy);
    ctx.moveTo(cx, cy - R * 1.12); ctx.lineTo(cx, cy + R * 1.12);
    ctx.stroke();

    // Sweep wedge: clockwise from 12 o'clock, p.sweep revolutions per second.
    const a = ((t * p.sweep) % 1) * Math.PI * 2;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.82, -Math.PI / 2, -Math.PI / 2 + a);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, R * 0.016);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - Math.PI / 2) * R * 0.82, cy + Math.sin(a - Math.PI / 2) * R * 0.82);
    ctx.stroke();

    // Countdown numeral.
    const n = Math.max(1, 8 - Math.floor(t));
    ctx.fillStyle = PAPER;
    ctx.font = `500 ${Math.round(R * 0.9)}px ${DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + R * 0.04);

    // Iris outline at the ring's top-right: blade count from params, curvature eases in with time.
    const curv = 0.35 * eIO(P(t % 3, 0.5, 2.5));
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, R * 0.014);
    nGonPath(ctx, cx + R * 1.05, cy - R * 0.72, R * 0.16, p.blades, -Math.PI / 2, p.blades ? curv : 1);
    ctx.stroke();

    // Camera report line + timecode (quantised to 24 fps).
    const fs = Math.max(10, Math.round(Math.min(W, H) * 0.035));
    ctx.font = `500 ${fs}px ${MONO}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PAPER3; ctx.textAlign = 'left';
    const pad = fs * 1.2;
    // Bottom-right is the Player's chrome zone (play/pause), so the report stays left and wraps when tall.
    const report = ['TEMPLATE · A-CAM · 40mm', `T2.0 · ${Math.round(p.kelvin)}K · 24fps`];
    if (tall) report.forEach((line, i) => ctx.fillText(line, pad, py + ph - pad - (1 - i) * fs * 1.5));
    else ctx.fillText(report.join(' · '), pad, py + ph - pad);
    const f = frameIndex(t, 24), s = Math.floor(f / 24), ff = f % 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = PAPER;
    ctx.fillText(`TC 00:00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, W - pad, py + pad + fs);

    // Tally dot pulses with the sweep (pure: a function of t).
    ctx.fillStyle = '#E5484D';
    ctx.globalAlpha = lerp(0.35, 1, 0.5 + 0.5 * Math.cos(t * Math.PI * 2));
    ctx.beginPath(); ctx.arc(pad + fs * 0.4, py + pad + fs * 0.62, fs * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    if (p.grain) drawGrain(ctx, tiles[grainIndex(t, tiles.length)], 0, 0, W, H, 0.6);
  }

  return {
    seek,
    resize(w, h, d) { W = w; H = h; dpr = d; },
    dispose() { tiles.length = 0; },
    script(t) {
      // 3200 K → 5600 K → 3200 K; equals the defaults at posterTime (5.75 s).
      const up = eIO(P(t, 0.5, 2.5)), down = eIO(P(t, 3.5, 5.5));
      return { kelvin: Math.round(lerp(3200, 5600, up - down)) };
    },
    describe(p) {
      const iris = p.blades ? `${p.blades}-blade` : 'round';
      return `Template film leader: a countdown with a rotating sweep. Accent light ${Math.round(p.kelvin)} K, ${iris} iris, grain ${p.grain ? 'on' : 'off'}.`;
    },
  };
}
