// Motion Prompt #084 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#084
// (numbers only: #084's magnetic button, which follows (cursor − centre) × 0.35 inside a 110 px pull
//  radius and snaps back on an elastic release; damped for a DP's site: strength 0.3, at most 12 px,
//  following over 0.5 s and released over 0.7 s on an expo ease-out instead of the elastic.)
//
// Two calls to action lean towards the pointer when it comes near: the hero's button and the contact
// e-mail. Nothing moves while either has keyboard focus, and the pull never exceeds 12 px.

const TARGETS = '.hero__cta, .contact__mail a';
const RADIUS = 110, STRENGTH = 0.3, MAX = 12;

export function initMagnetic(env) {
  const { gsap } = env;
  const items = [...document.querySelectorAll(TARGETS)].map(el => ({
    el,
    x: gsap.quickTo(el, 'x', { duration: 0.5, ease: 'kc.out' }),
    y: gsap.quickTo(el, 'y', { duration: 0.5, ease: 'kc.out' }),
    pulled: false,
  }));
  if (!items.length) return undefined;
  const clamp = v => Math.max(-MAX, Math.min(MAX, v));

  let raf = 0, last = null;
  const frame = () => {
    raf = 0;
    const e = last;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.abs(dx) < r.width / 2 + RADIUS * 0.5 && Math.abs(dy) < r.height / 2 + RADIUS * 0.5 && !it.el.matches(':focus-visible');
      if (near) { it.pulled = true; it.x(clamp(dx * STRENGTH)); it.y(clamp(dy * STRENGTH)); }
      else if (it.pulled) {
        it.pulled = false;
        gsap.to(it.el, { x: 0, y: 0, duration: 0.7, ease: 'kc.out', overwrite: true });
        it.x = gsap.quickTo(it.el, 'x', { duration: 0.5, ease: 'kc.out' });
        it.y = gsap.quickTo(it.el, 'y', { duration: 0.5, ease: 'kc.out' });
      }
    }
  };
  const onMove = e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    last = e;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    document.removeEventListener('pointermove', onMove);
    cancelAnimationFrame(raf);
    for (const it of items) gsap.set(it.el, { clearProps: 'transform' });
  };
}
