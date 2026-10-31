// The desktop motion layer's gate, shared by main.js and project.js.
//
// Fine pointer (hover: hover, pointer: fine), ≥ 1024 px wide, and motion on (no OS reduced motion, no
// "Motion off"): import site/motion/index.js, which loads GSAP + Lenis and arms the page motion. Only
// then, so phones and tablets never download either library. If the conditions become true later (a
// window widened, Motion switched back on) it loads at that point. A failure is logged and the page
// stays on the plain reveal layer (site/reveal.js) and native scroll.

import { isReducedMotion, onMotionChange } from '../core/motion-pref.js';

export const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';

/**
 * @param {{ page: 'home' | 'project', reveal?: object, aim?: Function }} hooks
 * @returns {Promise<void|null>} resolves when the layer has armed, or null when it is not wanted now
 */
export function loadDesktopMotion(hooks) {
  const mq = typeof matchMedia === 'function' ? matchMedia(DESKTOP) : { matches: false };
  let p = null;
  const want = () => !isReducedMotion() && mq.matches;
  const load = () => (p ??= import('./motion/index.js')
    .then(m => m.initMotion(hooks))
    .catch(err => { console.info('[motion] unavailable', err?.message ?? err); }));
  if (want()) return load();
  const later = () => { if (want()) load(); };
  mq.addEventListener?.('change', later);
  onMotionChange(later);
  return Promise.resolve(null);
}
