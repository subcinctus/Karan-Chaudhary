// Motion Prompt #027 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#027
// Motion Prompt #030 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#030
// Motion Prompt #031 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#031
// Motion Prompt #032 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#032
// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
// Motion Prompt #043 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#043
// (the camera cells these card moves are named after; re-expressed as 2D transforms on a still, no code copied)
//
// Selected-work card: a frame grab (a real still, or a procedural placeholder still) with the film's
// camera move applied to it as a transform, the way a DP shows a move on a still. Hover, keyboard
// focus or (on touch screens) ≥ 60 % in view plays the move once and holds it; leaving eases it back.
// Reduced motion / Motion off: the clean frame, no move.
//
// The moves are the Motion Prompt camera cells the cards are named after (#027 dolly in, #030 orbit,
// #031 crane up, #032 dolly zoom, #033 rack focus, #043 whip pan), re-expressed as 2D transforms on a
// photograph with the kits' cubic eases: no vendored code runs here, so a still card never needs it.
// This module owns a clock (requestAnimationFrame), as the Player does.
//
//   import { mountStillMove } from './still-move.js';
//   const card = mountStillMove(frame, { move: '#027', srcA: url, srcB: url2, focus: [[0.62, 0.4], [0.3, 0.6]], trigger: link });

import { isReducedMotion, onMotionChange } from '../core/motion-pref.js';
import { clamp, lerp, eIO, eOut, eIn } from '../core/time.js';

const pct = v => `${(v * 100).toFixed(3)}%`;

/**
 * Each move: dur (s, 1× speed) and pose(p, ctx) for p = 0 … 1 (rest … hold).
 * A pose: { s, x, y, r, origin } for layer A (x, y in fractions of the frame; r in degrees), and the
 * optional extras: b (layer B, whip pan), back (dolly-zoom background scale), focus ([fx, fy] for the
 * rack-focus mask and brackets), smear (px of horizontal motion blur), soft (px of background blur).
 * Coverage: with the origin inside the frame, a scale s about it always covers the frame; a
 * translation x needs (s − 1) · min(ox, 1 − ox) ≥ |x|. Every pose below keeps that margin.
 */
const MOVES = {
  // Dolly in: a slow push toward the subject's thirds point.
  '#027': { dur: 3.5, pose: (p, c) => ({ s: 1 + 0.08 * eIO(p), origin: c.focus[0] }) },
  // Orbit: the frame slides and turns a little around the subject (parallax read on a flat frame).
  '#030': { dur: 3.0, pose: p => { const e = eIO(p); return { s: 1 + 0.14 * e, x: -0.04 * e, r: -0.8 * e }; } },
  // Crane up: the camera rises, so the picture sinks and settles a touch closer.
  '#031': { dur: 3.0, pose: p => { const e = eIO(p); return { s: 1 + 0.1 * e, y: 0.04 * e }; } },
  // Dolly zoom: the subject holds its size while the background stretches behind it.
  '#032': { dur: 3.2, pose: (p, c) => ({ s: 1, back: 1 + 0.16 * eIO(p), origin: c.focus[0] }) },
  // Rack focus: the plane of focus travels from the subject to the second point; the lens breathes.
  '#033': { dur: 2.2, pose: (p, c) => {
    const e = eIO(p);
    return { s: 1 + 0.015 * e, focus: [lerp(c.focus[0][0], c.focus[1][0], e), lerp(c.focus[0][1], c.focus[1][1], e)], soft: 1 };
  } },
  // Whip pan: away from frame A with a horizontal smear, cut on the blur, land on frame B.
  '#043': { dur: 1.1, pose: p => {
    if (p < 0.5) { const q = eIn(p / 0.5); return { s: 1 + 0.3 * q, x: -0.14 * q, smear: 40 * q, b: null }; }
    const q = eOut((p - 0.5) / 0.5);
    return { s: 1, x: 0, hideA: true, b: { s: 1 + 0.3 * (1 - q), x: 0.14 * (1 - q) }, smear: 40 * (1 - q) };
  } },
};

let uid = 0;

/**
 * @param {HTMLElement} frame  the card's frame (position: relative; overflow: hidden)
 * @param {{ move?: string, srcA: string, srcB?: Promise<string>|string|null, alt?: string,
 *   focus?: number[][], trigger?: HTMLElement }} o  focus: [[fx, fy] subject, [fx, fy] second point], fractions
 * @returns {{ destroy(): void, get phase(): string }}
 */
export function mountStillMove(frame, o) {
  const m = MOVES[o.move] ?? MOVES['#027'];
  const ctx = { focus: o.focus?.length ? [o.focus[0], o.focus[1] ?? o.focus[0]] : [[0.62, 0.42], [0.34, 0.6]] };
  const trigger = o.trigger ?? frame;
  const id = `sm${++uid}`;

  const layer = (src, cls) => {
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.className = `still-move__img ${cls}`;
    img.setAttribute('aria-hidden', 'true');
    if (src) img.src = src;
    return img;
  };
  const wrap = document.createElement('div');
  wrap.className = `still-move still-move--${(o.move ?? '#027').slice(1)}`;
  wrap.setAttribute('aria-hidden', 'true');
  const a = layer(o.srcA, 'still-move__a');
  wrap.append(a);

  // Optional layers per move.
  let front = null, sharp = null, brackets = null, b = null, svg = null, blurNode = null;
  if (o.move === '#032') {   // the subject, held at its size over the stretching background
    front = layer(o.srcA, 'still-move__front');
    wrap.append(front);
  }
  if (o.move === '#033') {   // a sharp copy masked around the plane of focus over a soft frame
    sharp = layer(o.srcA, 'still-move__sharp');
    wrap.append(sharp);
    brackets = document.createElement('span');
    brackets.className = 'still-move__brackets';
    brackets.innerHTML = '<i></i><i></i><i></i><i></i>';
    wrap.append(brackets);
  }
  if (o.move === '#043') {
    b = layer(null, 'still-move__b');
    b.style.visibility = 'hidden';
    wrap.prepend(b);
    Promise.resolve(o.srcB).then(src => { b.src = src || o.srcA; }, () => { b.src = o.srcA; });
    // Horizontal-only motion blur: an SVG Gaussian with a zero vertical deviation.
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'still-move__defs');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.innerHTML = `<filter id="${id}-smear" x="-20%" y="0" width="140%" height="100%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>`;
    blurNode = svg.querySelector('feGaussianBlur');
    wrap.append(svg);
  }
  frame.prepend(wrap);

  let reduced = isReducedMotion();
  let u = 0, phase = 'rest';          // u: 0 … 1 of the move; rest | enter | hold | leave
  let hovered = false, focused = false, inViewEnough = false, visible = false;
  let raf = 0, last = 0, drawn = -1, destroyed = false;
  const noHover = typeof matchMedia === 'function' ? matchMedia('(hover: none)') : { matches: false };
  const wants = () => hovered || focused || (noHover.matches && inViewEnough);

  const transform = (q, W) => {
    const s = q.s ?? 1, x = q.x ?? 0, y = q.y ?? 0, r = q.r ?? 0;
    return `translate(${pct(x)}, ${pct(y)})${r ? ` rotate(${r.toFixed(3)}deg)` : ''} scale(${s.toFixed(4)})`;
  };

  function draw() {
    const p = reduced ? 0 : u;
    if (p === drawn) return;
    drawn = p;
    const W = frame.clientWidth || 400;
    const q = m.pose(p, ctx);
    const origin = q.origin ? `${pct(q.origin[0])} ${pct(q.origin[1])}` : '50% 50%';
    a.style.transformOrigin = origin;
    if (q.back != null) {   // dolly zoom: the full frame is the background layer
      a.style.transform = `scale(${q.back.toFixed(4)})`;
      front.style.transformOrigin = origin;
      front.style.transform = transform(q, W);
      const [fx, fy] = ctx.focus[0];
      front.style.setProperty('--fx', pct(fx)); front.style.setProperty('--fy', pct(fy));
    } else {
      a.style.transform = transform(q, W);
    }
    if (sharp) {
      const soft = Math.max(1.5, W / 260);     // background softness, in CSS px
      a.style.filter = `blur(${soft.toFixed(2)}px)`;
      a.style.transform = `${transform(q, W)} scale(1.03)`;
      sharp.style.transform = transform(q, W);
      sharp.style.setProperty('--fx', pct(q.focus[0])); sharp.style.setProperty('--fy', pct(q.focus[1]));
      brackets.style.left = pct(q.focus[0]); brackets.style.top = pct(q.focus[1]);
      brackets.style.opacity = String(reduced ? 0 : clamp(p * 6));
    }
    if (b) {
      a.style.visibility = q.hideA ? 'hidden' : '';
      b.style.visibility = q.b ? '' : 'hidden';
      if (q.b) b.style.transform = transform(q.b, W);
      const smear = (q.smear ?? 0) * (W / 420);
      blurNode.setAttribute('stdDeviation', `${smear.toFixed(2)} 0`);
      const f = smear > 0.2 ? `url(#${id}-smear)` : '';
      a.style.filter = f; b.style.filter = f;
    }
  }

  function retarget() {
    if (reduced) { phase = 'rest'; u = 0; stop(); draw(); return; }
    phase = wants() ? (u >= 1 ? 'hold' : 'enter') : (u <= 0 ? 'rest' : 'leave');
    if (phase === 'enter' || phase === 'leave') start();
  }

  function tick(ts) {
    raf = 0;
    if (destroyed || !visible) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 60;
    last = ts;
    if (phase === 'enter') { u = Math.min(1, u + dt / m.dur); if (u >= 1) phase = 'hold'; }
    else if (phase === 'leave') { u = Math.max(0, u - dt / (m.dur * 0.6)); if (u <= 0) phase = 'rest'; }
    draw();
    if (phase === 'enter' || phase === 'leave') raf = requestAnimationFrame(tick);
    else last = 0;
  }
  function start() { if (!raf && !destroyed && visible && !reduced) { last = 0; raf = requestAnimationFrame(tick); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  const onEnter = e => { if (e.pointerType === 'touch') return; hovered = true; retarget(); };
  const onLeave = e => { if (e.pointerType === 'touch') return; hovered = false; retarget(); };
  const onFocusIn = () => { focused = true; retarget(); };
  const onFocusOut = e => { if (!trigger.contains(e.relatedTarget)) { focused = false; retarget(); } };
  trigger.addEventListener('pointerenter', onEnter);
  trigger.addEventListener('pointerleave', onLeave);
  trigger.addEventListener('focusin', onFocusIn);
  trigger.addEventListener('focusout', onFocusOut);

  const view = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const e of entries) {
      visible = e.isIntersecting;
      inViewEnough = e.intersectionRatio >= 0.6;
      if (!visible) { stop(); if (!wants()) { u = 0; phase = 'rest'; draw(); } }
      else retarget();
    }
  }, { threshold: [0, 0.6] }) : null;
  if (view) view.observe(frame); else visible = true;

  const offPref = onMotionChange(({ reduced: r }) => { reduced = r; stop(); drawn = -1; retarget(); draw(); });
  draw();

  return {
    get phase() { return phase; },
    get u() { return u; },
    destroy() {
      destroyed = true; stop(); view?.disconnect(); offPref();
      trigger.removeEventListener('pointerenter', onEnter);
      trigger.removeEventListener('pointerleave', onLeave);
      trigger.removeEventListener('focusin', onFocusIn);
      trigger.removeEventListener('focusout', onFocusOut);
      wrap.remove();
    },
  };
}
