// Motion Prompt #079 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#079
// (numbers only, rebuilt with real scroll: a 6 px bar along the top of the viewport; fill width =
//  scroll fraction, the same as CSS animation-timeline: scroll(). Colour changed to tungsten on a
//  transparent track, plus a mono timecode readout.)
//
// Timecode scroll progress. The bar uses a CSS scroll-driven animation where supported (site.css,
// animation-timeline: scroll(root)), with this module as the fallback; the readout maps the scroll
// fraction onto site.timecodeRuntime seconds at 24 fps: "TC 00:01:23:12".
// Reduced motion / Motion off: both are hidden by site.css (html[data-motion="off"]).
//
//   import { initProgress } from './progress.js';
//   initProgress({ runtime: data.site.timecodeRuntime });

import { frameIndex } from '../core/time.js';

const pad = n => String(n).padStart(2, '0');

/** Seconds → "TC hh:mm:ss:ff" at fps. */
export function timecode(seconds, fps = 24) {
  const f = frameIndex(Math.max(0, seconds), fps);
  const ff = f % fps, s = Math.floor(f / fps);
  return `TC ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(ff)}`;
}

export function initProgress({ runtime = 180, fps = 24 } = {}) {
  const fill = document.querySelector('[data-progress]');
  const tcs = [...document.querySelectorAll('[data-tc]')];
  const cssDriven = typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()');
  if (cssDriven) document.documentElement.classList.add('progress-css');
  let raf = 0, last = '';

  function update() {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    if (!cssDriven && fill) fill.style.transform = `scaleX(${p.toFixed(4)})`;
    const tc = timecode(p * runtime, fps);
    if (tc !== last) { last = tc; for (const el of tcs) el.textContent = tc; }
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  update();
  return { update: queue };
}
