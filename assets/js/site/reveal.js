// Motion Prompt #074 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#074
// (numbers only, rebuilt with a real IntersectionObserver: trigger line at 85 % of the viewport
//  height; once an element's top passes above it, it rises in; elements in one row appear together.
//  Sharpened from the cell's 28 px / 0.7 s cubic fade: 20 px, opacity over 0.5 s and the rise over
//  0.8 s on an expo ease-out, and played once (no reset when an element leaves below the view).)
//
// Rise-in on scroll for [data-reveal] elements: the simple layer for phones, tablets and any browser
// without the desktop motion layer (site/motion/). The hidden state exists only while html.reveal-on
// is set, which this module adds; without JavaScript, or under reduced motion / Motion off, nothing is
// ever hidden. Timing lives in site.css (.reveal-on [data-reveal]).
//
//   import { initReveal } from './reveal.js';
//   const reveal = initReveal();      // after the sections are rendered
//   reveal.scan(newContainer);        // after rendering more [data-reveal] content
//   reveal.suspend(); reveal.resume() // the desktop layer takes reveals over, and hands them back

import { isReducedMotion, onMotionChange } from '../core/motion-pref.js';

const root = document.documentElement;
const LINE = '0px 0px -15% 0px';   // the 85 % line

export function initReveal() {
  let seen = new WeakSet();
  let io = null;
  let suspended = false;   // the desktop motion layer owns reveals while set

  const show = el => el.classList.add('is-in');
  /** Elements already above the 85 % line (e.g. after a jump to an anchor) show at once. */
  const settle = el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.85) show(el);
  };

  function start() {
    if (io || suspended || isReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    io = new IntersectionObserver(entries => {
      for (const e of entries) {
        // In view or above it (jumped past): shown, once. Below the line: still waiting.
        if (e.isIntersecting || e.boundingClientRect.top < (e.rootBounds?.bottom ?? innerHeight * 0.85)) { show(e.target); io?.unobserve(e.target); }
      }
    }, { rootMargin: LINE, threshold: 0 });
    scan(document);   // settle first, so what is already on screen never blinks
    root.classList.add('reveal-on');
  }

  function stop() {
    io?.disconnect(); io = null; seen = new WeakSet();
    root.classList.remove('reveal-on');
  }

  function scan(scope = document) {
    if (!io) return;
    for (const el of scope.querySelectorAll('[data-reveal]')) {
      if (seen.has(el)) continue;
      seen.add(el);
      settle(el);
      io.observe(el);
    }
  }

  // Motion off → everything shown; back on → re-armed without hiding what is already on screen.
  onMotionChange(({ reduced }) => (reduced ? stop() : start()));

  /** Hand reveals to another layer: whatever is still hidden is shown by it (or by resume()). */
  function suspend() {
    suspended = true;
    io?.disconnect(); io = null;
    root.classList.remove('reveal-on');
  }
  /** Take reveals back (the desktop layer was reverted). Elements already shown stay shown. */
  function resume() {
    if (!suspended) return;
    suspended = false;
    for (const el of document.querySelectorAll('[data-reveal]')) {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight) show(el);   // on screen or above: never hidden again
    }
    seen = new WeakSet();
    start();
  }

  start();
  return { scan, stop, suspend, resume, get suspended() { return suspended; } };
}
