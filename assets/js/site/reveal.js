// Motion Prompt #074 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#074
// (numbers only, rebuilt with a real IntersectionObserver: trigger line at 85 % of the viewport
//  height; once an element's top passes above it, opacity 0→1 and offset 28 px → 0 over 0.7 s,
//  cubic ease-out; elements in one row appear together; an element that leaves through the bottom of
//  the view is reset and plays again next time.)
//
// Fade-in on scroll for [data-reveal] elements. The hidden state exists only while
// html.reveal-on is set, which this module adds; without JavaScript, or under reduced motion /
// Motion off, nothing is ever hidden. Timing lives in site.css (.7s var(--ease-out), 28px).
//
//   import { initReveal } from './reveal.js';
//   const reveal = initReveal();      // after the sections are rendered
//   reveal.scan(newContainer);        // after rendering more [data-reveal] content

import { isReducedMotion, onMotionChange } from '../core/motion-pref.js';

const root = document.documentElement;
const LINE = '0px 0px -15% 0px';   // the 85 % line

export function initReveal() {
  let seen = new WeakSet();
  let io = null;

  const show = el => el.classList.add('is-in');
  /** Elements already above the 85 % line (e.g. after a jump to an anchor) show at once. */
  const settle = el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.85) show(el);
  };

  function start() {
    if (io || isReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) show(e.target);
        else if (e.boundingClientRect.top >= (e.rootBounds?.bottom ?? innerHeight * 0.85)) e.target.classList.remove('is-in');   // left below: reset
        else show(e.target);   // above the view: stays shown
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

  start();
  return { scan, stop };
}
