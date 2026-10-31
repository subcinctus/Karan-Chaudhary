// Desktop motion layer: fast, sharp, cinematic page motion for fine-pointer screens ≥ 1024 px.
//
// Loaded only by main.js / project.js, and only when (hover: hover) and (pointer: fine) and
// (min-width: 1024px) match and motion is on (no prefers-reduced-motion, no "Motion off"). Phones and
// tablets keep the light reveal layer (site/reveal.js) and native scroll, and never download GSAP
// or Lenis. Everything here is reversible: gsap.matchMedia() records every tween, ScrollTrigger and
// SplitText made while arming, so leaving the desktop query (resizing), the OS reduced-motion setting
// or the site's "Motion off" toggle reverts the page to its plain layout, fully visible, with native
// scroll; turning motion back on re-arms it without hiding what is already on screen. Switching the
// Selected work view (kc:relayout, from site/work-index.js) re-arms it the same way.
//
// Curves (the same numbers as tokens.css): kc.out = expo out (.16, 1, .3, 1) for entrances, kc.io =
// expo in-out (.77, 0, .175, 1) for wipes and curtains, kc.ui = (.4, 0, .1, 1) for chrome. Durations
// 0.45–1.1 s, staggers ≤ 0.09 s with each group landing within ~0.4 s. Only transform, opacity and
// clip-path are animated; opacity, never visibility, so a block waiting for its entrance stays in the Tab
// order and the accessibility tree (and plays at once when keyboard focus enters it). One rAF:
// gsap.ticker drives Lenis and every ScrollTrigger.
//
//   const { initMotion } = await import('./motion/index.js');
//   initMotion({ page: 'home', reveal, aim });   // reveal: site/reveal.js API (suspend/resume)

import { gsap, ScrollTrigger, SplitText, Lenis } from './lib.js';
import { isReducedMotion, onMotionChange } from '../../core/motion-pref.js';
import { initSmooth } from './smooth.js';
import { initText } from './text.js';
import { initReveals } from './reveals.js';
import { initFrames } from './frames.js';
import { initHero } from './hero.js';
import { initWorkRail } from './work.js';
import { initCredits } from './credits.js';
import { initCursor } from './cursor.js';
import { initMagnetic } from './magnetic.js';
import { initNav } from './nav.js';
import { capture, restore, recalled, moved } from '../place.js';

const DESKTOP_Q = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
export const DESKTOP = DESKTOP_Q;
const root = document.documentElement;

let mm = null;
let hooks = {};
let arms = 0;
let resolveIdle = null;
const state = { lenis: null, armed: false, scanners: [], timings: {} };

const idleNow = () => { resolveIdle?.(); resolveIdle = null; };
const freshIdle = () => new Promise(r => { resolveIdle = r; });

// The visitor's place, captured before anything reverts (arming or reverting changes the page's height:
// the strip's pin spacer) and put back afterwards, so Motion off/on, a window crossing 1024 px or a
// reload never moves the content under them. These listeners are created before gsap.matchMedia's own,
// so they fire first, while the old layout is still in place.
let pending = null;
let railMemo = null;
// The place the visitor last came to rest on (a scroll that has stopped for 200 ms; never one caused by
// a window resize, which re-wraps the page under a fixed scroll offset), and their scroll count then.
let lastPlace = null, lastMoves = 0, restT = 0, resizing = 0;
const atRest = () => { lastPlace = grab(); lastMoves = moved(); };
addEventListener('scroll', () => {
  clearTimeout(restT); restT = 0;
  if (resizing) return;
  restT = setTimeout(() => { restT = 0; if (!resizing) atRest(); }, 200);
}, { passive: true });
addEventListener('resize', () => {
  clearTimeout(restT); restT = 0; clearTimeout(resizing);
  resizing = setTimeout(() => {
    resizing = 0;
    // A resize inside the desktop range leaves the layer armed while the page re-wraps under it: put back
    // the place it was at rest on (crossing 1024 px reverts or arms the layer, which keeps it itself).
    if (!state.armed || !lastPlace || moved() !== lastMoves) return;
    const p = lastPlace;
    ScrollTrigger.refresh();
    restore(p, { to: toSmooth, rail: el => railPlace(el, p.rail, p.off) });
    atRest();
  }, 400);
}, { passive: true });
// A reload is restored by place.js from the place it saved, not by the browser: the browser would put
// back a scroll offset measured with the strip's pin spacer into a page that does not have it yet.
addEventListener('pagehide', () => {
  try { history.scrollRestoration = root.classList.contains('motion-ready') ? 'manual' : 'auto'; } catch { /* read-only */ }
});
const grab = () => {
  const a = capture();
  const st = state.armed || mm ? ScrollTrigger.getById('work-rail') : null;
  if (a && st?.isActive) a.rail = st.progress;   // inside the pinned strip: keep its progress too
  return a;
};
const hold = () => {
  if (pending) return;
  // During a window resize the page has already re-wrapped at the new width: use where it was at rest.
  pending = resizing && lastPlace ? lastPlace : grab();
  // Taken over by a re-arm (synchronously) or put back by the cleanup (next frame); never left stale.
  requestAnimationFrame(() => requestAnimationFrame(() => { pending = null; }));
};
if (typeof matchMedia === 'function') {
  for (const q of [DESKTOP_Q, '(prefers-reduced-motion: reduce)']) matchMedia(q).addEventListener?.('change', hold);
}
/**
 * A pinned element's rect does not say where the page is: map the strip's box onto its trigger. A place
 * inside the strip's travel keeps its progress (rail); one taken above it (the box in the flow, e.g. the
 * Selected work toggle) keeps its offset in the box, short of the pin.
 */
function railPlace(el, rail, off = 0) {
  const st = ScrollTrigger.getById('work-rail');
  const box = el.closest('.work-rail__box');
  if (!st || !box) return null;
  if (rail != null) return st.start + rail * (st.end - st.start);
  return Math.min(st.start, st.start + el.getBoundingClientRect().top - box.getBoundingClientRect().top - off);
}
const toSmooth = y => {
  // Lenis caches the page height (its resize observer runs later): re-measure first, or the pin
  // spacer's extra length would be clamped away.
  if (state.lenis) { state.lenis.resize(); state.lenis.scrollTo(y, { immediate: true, force: true }); } else scrollTo(0, y);
  ScrollTrigger.update();
};

/** Arm (or re-arm) the layer for the current conditions. */
function arm() {
  if (mm) hold();
  mm?.revert(); mm = null;
  state.armed = false;
  let started = false;
  if (isReducedMotion()) { idleNow(); return; }
  const first = arms++ === 0;
  mm = gsap.matchMedia();
  mm.add({ desktop: DESKTOP, reduce: '(prefers-reduced-motion: reduce)' }, ctx => {
    if (!ctx.conditions.desktop || ctx.conditions.reduce) return undefined;
    const vh = innerHeight;
    // Where the visitor is: a jump into the page (hash) on the first arm, a reload's remembered place,
    // or whatever is under the header line right now (captured before the last revert, if any).
    // A resize re-wraps the page before this runs: the place it was at rest on is the true one (unless a
    // scroll is still in flight, when what is under the header now is).
    let place = pending ?? (lastPlace && !restT ? lastPlace : capture());
    pending = null;
    if (place?.el && railMemo != null && place.rail == null && place.el.closest('#work [data-render="work"]')) place.rail = railMemo;
    railMemo = null;
    const saved = first && moved() === 0 ? recalled() : null;
    if (saved) place = saved;
    const aimHash = first && !saved && moved() === 0 && Boolean(location.hash);
    const movesAtArm = moved();
    const settle = () => {
      if (moved() !== movesAtArm) return;   // the visitor scrolled meanwhile: leave them be
      if (aimHash) reaim();
      else restore(place, { to: toSmooth, rail: el => railPlace(el, place.rail, place.off) });
    };
    // Whatever the visitor can already see is never hidden to be re-revealed (no blink when motion is
    // switched back on, or when the layer arms after a jump into the page). The exception is a page that
    // arrived under the shutter: it is covered, so its first screen plays its entrance as the curtain
    // lifts.
    // Decided once: a curtain that has already begun to lift (shutter-lifting) has shown the first
    // screen, so nothing on it is hidden again.
    const covered = root.classList.contains('shutter-cover') && !root.classList.contains('shutter-lifting');
    const env = {
      gsap, ScrollTrigger, SplitText, Lenis, root, ctx, state, hooks, page: hooks.page ?? 'home', first, covered,
      owned: new WeakSet(),   // [data-reveal] elements a specific module animates (reveals.js skips them)
      /** Should this element play an entrance (it is below the fold, or the page is covered)? */
      enters(el) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return false;
        return covered || r.top >= vh * 0.98;
      },
      /** Delay for an entrance on the covered first screen (lets the curtain clear first). */
      delay(el) { return covered && el.getBoundingClientRect().top < vh ? 0.28 : 0; },
    };
    const offs = [];
    const run = (name, fn) => {
      const t = performance.now();
      try { offs.push(fn(env)); } catch (err) { console.warn(`[motion] ${name}`, err); }
      state.timings[name] = Math.round((performance.now() - t) * 10) / 10;
    };

    // Synchronously: what the first screen needs, and the pin (pins are created top to bottom).
    run('smooth', initSmooth);
    root.classList.add('motion-ready');
    hooks.reveal?.suspend?.();
    if (env.page === 'home') run('hero', initHero);
    run('nav', initNav);
    if (env.page === 'home') run('work', initWorkRail);
    // The rest one module per frame, so arming never becomes one long task; each runs inside the
    // matchMedia context (ctx.add), so a revert still undoes it. A revert mid-way stops the queue.
    const steps = [['text', initText], ['frames', initFrames], ['reveals', initReveals], ['focus', focusEnters]];
    if (env.page === 'home') steps.push(['credits', initCredits]);
    steps.push(['cursor', initCursor], ['magnetic', initMagnetic], ['layout', watchLayout]);
    let alive = true;
    started = true;
    const next = () => {
      if (!alive) return;
      const step = steps.shift();
      if (step) { ctx.add(() => run(...step)); requestAnimationFrame(next); return; }
      const tr = performance.now();
      ScrollTrigger.refresh();
      state.timings.refresh = Math.round((performance.now() - tr) * 10) / 10;
      // Heights settled (fonts, splits, pin): put the visitor's place (or a first jump) back again.
      settle();
      state.armed = true;
      atRest();
      requestAnimationFrame(() => requestAnimationFrame(idleNow));
    };
    ScrollTrigger.refresh();
    settle();
    requestAnimationFrame(next);

    return () => {
      alive = false;
      state.armed = false;
      // Put the visitor back once the layout is plain again (unless a re-arm takes the place over). A
      // place inside the pinned strip keeps the strip's progress for the next arm.
      // A window resize reverts before any listener of ours hears of it, and after the page has already
      // re-wrapped at the new width: the last place the visitor settled on stands in.
      if (!pending && lastPlace) pending = lastPlace;
      if (pending) requestAnimationFrame(() => { if (pending) { railMemo = pending.rail ?? null; restore(pending); lastPlace = pending; pending = null; } });
      for (const off of offs.reverse()) { try { off?.(); } catch (err) { console.warn('[motion] cleanup', err); } }
      root.classList.remove('motion-ready');
      state.scanners = [];
      hooks.reveal?.resume?.();
    };
  });
  if (!started) idleNow();
}

function reaim() {
  if (!location.hash || !state.lenis) return;
  let el = null;
  try { el = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* bad hash */ }
  if (el && Math.abs(el.getBoundingClientRect().top - 72) > 6) { state.lenis.resize(); state.lenis.scrollTo(el, { immediate: true, force: true }); }
}

/** Heights change as studies, plans and stills mount: refresh the triggers (debounced). */
function watchLayout(env) {
  const main = document.querySelector('main');
  if (!main || typeof ResizeObserver === 'undefined') return undefined;
  let t = 0, last = main.offsetHeight;
  const ro = new ResizeObserver(() => {
    const h = main.offsetHeight;
    if (Math.abs(h - last) < 2) return;
    last = h;
    clearTimeout(t);
    t = setTimeout(() => env.ScrollTrigger.refresh(), 200);
  });
  ro.observe(main);
  return () => { ro.disconnect(); clearTimeout(t); };
}

/**
 * Keyboard focus never rests on something unseen. Focus scrolls a block below the window up past its
 * trigger line, but not one already low in it (the Index table's first row, under the toggle): an
 * entrance still waiting there plays as soon as focus enters it.
 */
function focusEnters(env) {
  const { gsap, ctx } = env;
  const top = t => { let a = t; while (a.parent && a.parent !== gsap.globalTimeline) a = a.parent; return a; };
  const onFocus = e => {
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      if (el.style.opacity !== '0') continue;
      const own = gsap.getTweensOf(el).map(top);
      if (own.some(a => a.scrollTrigger?.vars.scrub)) continue;   // tied to the scroll (the hero's exit): focus scrolls it back
      const waiting = own.filter(a => a.progress() < 1);
      if (waiting.length) for (const a of waiting) a.play();
      else ctx.add(() => gsap.to(el, { opacity: 1, y: 0, duration: 0.5, ease: 'kc.out', clearProps: 'opacity,transform' }));
    }
  };
  document.addEventListener('focusin', onFocus);
  return () => document.removeEventListener('focusin', onFocus);
}

/** New [data-reveal] content (e.g. the previs plans) arrived after arming. */
function onContent(e) {
  if (!mm || !state.scanners.length) return;   // not armed, or the scanners have not run yet (they will see it)
  const scope = e.detail?.scope ?? document;
  for (const scan of state.scanners) { try { scan(scope); } catch (err) { console.warn('[motion] scan', err); } }
  ScrollTrigger.refresh();
}

/**
 * @param {{ page?: 'home' | 'project', reveal?: { suspend: Function, resume: Function }, settled?: Promise<unknown> }} o
 *   settled: the page's late content (the home page's previs plans) is in
 * @returns {Promise<void>} resolves once the first arm has run (or was skipped)
 */
export async function initMotion(o = {}) {
  hooks = o;
  let idle = freshIdle();
  window.__motion = {
    gsap, ScrollTrigger,
    get lenis() { return state.lenis; },
    get armed() { return state.armed; },
    get idle() { return idle; },
    get timings() { return { ...state.timings }; },   // ms per module at the last arm (diagnostics)
    arm: () => { idle = freshIdle(); arm(); return idle; },
  };
  // Line splits measure text: wait for the display face, and for the page's late content (o.settled), never
  // longer than 1.5 s; then for a frame that has painted it. Arming in the very frame the previs plans grow
  // their section would also slide that section down by the pinned strip's new spacer, and a section that
  // moves both ways at once counts as shifting, even under the header (a visitor who arrived on #about).
  const fonts = document.fonts ? Promise.race([
    document.fonts.ready,
    Promise.all([document.fonts.load('400 1em "Cormorant Garamond"'), document.fonts.load('400 1em "IBM Plex Mono"')]),
  ]).catch(() => {}) : Promise.resolve();
  await Promise.race([Promise.all([fonts, o.settled]), new Promise(r => setTimeout(r, 1500))]);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // A refresh re-measures the pinned strip by lifting its box out of the pin spacer and back, and an
  // element moved in the DOM loses focus (a card link, the Selected work toggle): give it back.
  let focused = null;
  ScrollTrigger.addEventListener('refreshInit', () => { focused = document.activeElement; });
  ScrollTrigger.addEventListener('refresh', () => {
    const a = focused, now = document.activeElement;
    focused = null;
    if (a && a !== document.body && a.isConnected && (!now || now === document.body)) a.focus({ preventScroll: true });
  });
  arm();
  onMotionChange(() => { idle = freshIdle(); arm(); });
  // The Selected work view changed (work-index.js): re-arm for its layout (the index has no pinned strip),
  // with the toggle put back where it was on screen.
  addEventListener('kc:relayout', e => {
    if (!root.classList.contains('motion-ready')) return;   // not armed: the plain layout follows by itself
    railMemo = null;
    const keep = e.detail?.keep?.el ? e.detail.keep : null, moves = moved();
    if (keep) pending = keep;
    idle = freshIdle();
    arm();
    // Once armed, again (a late refresh may have shifted the page), unless the visitor has scrolled since.
    if (keep) {
      idle.then(() => {
        if (moved() === moves && keep.el.isConnected && Math.abs(keep.el.getBoundingClientRect().top - keep.off) > 2) restore(keep, { to: toSmooth, rail: el => railPlace(el, null, keep.off) });
      });
    }
  });
  addEventListener('kc:content', onContent);
  return idle;
}
