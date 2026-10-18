// Shot-language card, real-time side: mounts pieces/shotcard.js into a work card's frame and plays
// the move once and holds it on hover, keyboard focus or (on touch screens) when mostly in view.
// This module owns a clock (requestAnimationFrame), as the Player does; the piece stays pure and is
// driven only through create() / seek(t, { u }).

import { create, MOVES, moveKey, normPalette } from '../pieces/shotcard.js';
import { setupCanvas } from '../core/canvas.js';
import { isReducedMotion, onMotionChange } from '../core/motion-pref.js';

/**
 * Mount a shot-language card for a film into `container` (e.g. the work card's .frame).
 * Hover / keyboard focus on `trigger` (default: the container), or ≥ 60 % in view on devices without
 * hover, plays the move to uHold at 1× and holds it. Leaving before the hold rewinds at 1×; leaving
 * after it plays the exit, then rests at u = 0. Offscreen the loop stops. Reduced motion (or the site's
 * Motion-off toggle) shows the still frame at uHold.
 * @param {HTMLElement} container
 * @param {{ move?: string, palette?: string[], aspect?: number, slug?: string }} film
 * @param {{ reducedMotion?: boolean, trigger?: HTMLElement, caption?: boolean, topLeftMark?: boolean, seed?: number }} [o]
 * @returns {{ destroy(): void, ready: Promise<void>, get u(): number, get phase(): string }}
 */
export function mountShotCard(container, film = {}, o = {}) {
  const key = moveKey(film.move), m = MOVES[key];
  // The site and the gallery put an aspect label top left, so that frame mark is left out by default.
  const params = { move: m.id, palette: normPalette(film.palette), aspect: Number(film.aspect) || 0, caption: o.caption !== false,
    marks: o.topLeftMark ? 'all' : 'no-top-left' };
  const trigger = o.trigger ?? container;
  const canvas = document.createElement('canvas');
  canvas.className = 'shotcard__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.dataset.move = m.id;
  container.prepend(canvas);

  // An explicit reducedMotion sets the starting value; the card then follows the OS setting and the
  // site's Motion-off toggle live either way (onMotionChange below).
  let reduced = o.reducedMotion ?? isReducedMotion();
  let inst = null, destroyed = false, W = 0, H = 0, dpr = 1;
  let u = 0, phase = 'rest';          // rest | enter | hold | rewind | exit | unexit
  let hovered = false, focused = false, inViewEnough = false, visible = false;
  let raf = 0, last = 0, drawn = '';
  let quality = 1, slow = 0;          // drops to 0.5 for this card after consecutive long frames
  const noHover = typeof matchMedia === 'function' ? matchMedia('(hover: none)') : { matches: false };

  const wants = () => hovered || focused || (noHover.matches && inViewEnough);
  const shownU = () => (reduced ? m.uHold : u);

  function draw() {
    if (!inst || !W || !H) return;
    const moving = phase !== 'rest' && phase !== 'hold';
    const q = moving ? quality : 1;   // settled frames are always drawn at full quality
    const su = shownU(), sig = `${su.toFixed(4)}|${W}x${H}@${dpr}|${q}`;
    if (sig === drawn) return;
    drawn = sig;
    inst.seek(0, { ...params, u: su, quality: q });
  }

  function retarget() {
    if (reduced) { phase = 'rest'; u = 0; stop(); draw(); return; }
    const on = wants();
    if (on) {
      if (phase === 'rest' || phase === 'rewind') phase = 'enter';
      else if (phase === 'exit') phase = 'unexit';
    } else {
      if (phase === 'enter') phase = 'rewind';
      else if (phase === 'hold') { phase = 'exit'; u = m.exit[0]; }
      else if (phase === 'unexit') phase = 'exit';
    }
    if (phase !== 'rest' && phase !== 'hold') start();
  }

  function step(dt) {
    switch (phase) {
      case 'enter': u = Math.min(m.uHold, u + dt); if (u >= m.uHold) phase = 'hold'; break;
      case 'rewind': u = Math.max(0, u - dt); if (u <= 0) phase = 'rest'; break;
      case 'exit': u += dt; if (u >= m.exit[1]) { u = 0; phase = 'rest'; } break;
      case 'unexit': u -= dt; if (u <= m.exit[0]) { u = m.uHold; phase = 'hold'; } break;
      default: break;
    }
  }

  function tick(ts) {
    raf = 0;
    if (destroyed || !visible) return;
    const dt = last ? Math.min(0.25, (ts - last) / 1000) : 1 / 60;   // real time: a slow device drops frames, the move keeps its length
    last = ts;
    if (dt > 0.09) { if (++slow >= 2) quality = 0.5; } else slow = Math.max(0, slow - 1);
    step(dt);
    draw();
    if (phase !== 'rest' && phase !== 'hold') raf = requestAnimationFrame(tick);
    else last = 0;
  }
  function start() {
    if (raf || destroyed || !visible || !inst || reduced) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  function measure() {
    const r = container.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && h === H && d === dpr) return false;
    W = w; H = h; dpr = d;
    setupCanvas(canvas, W, H, dpr);
    inst?.resize(W, H, dpr);
    drawn = '';
    return true;
  }

  // Events.
  const onEnter = e => { if (e.pointerType === 'touch') return; hovered = true; retarget(); };
  const onLeave = e => { if (e.pointerType === 'touch') return; hovered = false; retarget(); };
  const onFocusIn = () => { focused = true; retarget(); };
  const onFocusOut = e => { if (!trigger.contains(e.relatedTarget)) { focused = false; retarget(); } };
  trigger.addEventListener('pointerenter', onEnter);
  trigger.addEventListener('pointerleave', onLeave);
  trigger.addEventListener('focusin', onFocusIn);
  trigger.addEventListener('focusout', onFocusOut);

  // Two observers: `near` (200 px margin) starts the piece early so the resting frame is drawn before
  // the card scrolls in; `view` (the real viewport, no margin) decides "≥ 60 % in view" and pauses
  // offscreen. A margin would inflate intersectionRatio and play cards before anyone can see them.
  const near = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { near.disconnect(); init(); }
  }, { rootMargin: '200px 0px 200px 0px' });
  near.observe(container);
  const view = new IntersectionObserver(entries => {
    for (const e of entries) {
      visible = e.isIntersecting;
      inViewEnough = e.intersectionRatio >= 0.6;
      if (!visible) {
        // Offscreen: nobody sees it, so settle at rest (or the hold, if still hovered) and stop.
        stop();
        if (!wants()) { u = 0; phase = 'rest'; drawn = ''; draw(); }
      } else {
        if (!inst) init();
        measure();
        draw();
        retarget();
      }
    }
  }, { threshold: [0, 0.6] });
  view.observe(container);

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (measure()) draw(); }) : null;
  ro?.observe(container);

  const offPref = onMotionChange(({ reduced: r }) => { reduced = r; stop(); drawn = ''; retarget(); draw(); });

  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  let initStarted = false;
  async function init() {
    if (initStarted) return;
    initStarted = true;
    measure();
    try {
      inst = await create(canvas, { width: W || 1, height: H || 1, dpr, params, seed: o.seed ?? 1, quality: 1, record: false, reducedMotion: reduced, layout: 'wide' });
      if (destroyed) { inst.dispose(); inst = null; return; }
      measure();
      drawn = '';
      draw();
      container.dataset.shotcard = 'ready';
      retarget();
    } catch (err) {
      console.warn('[shotcard] could not start', m.id, err);
      canvas.remove();
    } finally { resolveReady(); }
  }

  return {
    ready,
    get u() { return shownU(); },
    get phase() { return phase; },
    destroy() {
      destroyed = true;
      stop(); near.disconnect(); view.disconnect(); ro?.disconnect(); offPref();
      trigger.removeEventListener('pointerenter', onEnter);
      trigger.removeEventListener('pointerleave', onLeave);
      trigger.removeEventListener('focusin', onFocusIn);
      trigger.removeEventListener('focusout', onFocusOut);
      inst?.dispose(); inst = null;
      canvas.remove();
    },
  };
}
