// Smooth wheel scrolling (Lenis 1.3.27, MIT, darkroom.engineering) on the GSAP ticker: one rAF for the
// scroll, every ScrollTrigger and every tween. Tuned for precision rather than float: lerp 0.12
// (between Lenis' 0.1 default and darkroom's own 0.125), wheel 1:1, touch untouched (syncTouch off),
// so a notch of the wheel lands where a native scroll would, only eased.
//
// Lenis moves the real window scroll, so IntersectionObservers (the Players' lazy init and offscreen
// pause), position: sticky and the browser's own focus scrolling all keep working. What Lenis does not
// do, this module does:
//   · in-page anchors: our own click handler (Lenis' anchors option does not preventDefault): an expo
//     ease to the target (a cut, then a short settle, when it is far), a re-aim if the page grew while
//     travelling, then focus moves to the target;
//   · keys: a keyboard scroll (Tab, Page, arrows, Space, Home, End) cancels any smooth scroll still in
//     flight, so the browser's focus scroll is never overridden;
//   · stopped while the film leader, the phone menu or a page transition covers the page.
// The skip link stays native (instant jump, focus to <main>).

const NAV_KEYS = new Set(['Tab', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', ' ', 'Home', 'End']);
const expoOut = t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function initSmooth(env) {
  const { gsap, ScrollTrigger, Lenis, root, state } = env;
  const lenis = new Lenis({
    lerp: 0.12, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: false,
    prevent: node => Boolean(node?.closest?.('[data-lenis-prevent], dialog')),
  });
  state.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  const tick = t => lenis.raf(t * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // Covered or modal states stop it.
  const hold = () => root.classList.contains('is-preloading') || root.classList.contains('menu-open') || root.classList.contains('shutter-leaving');
  let held = null;
  const sync = () => {
    const h = hold();
    if (h === held) return;
    held = h;
    if (h) lenis.stop(); else lenis.start();
  };
  const mo = new MutationObserver(sync);
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  sync();
  const onLeave = () => lenis.stop();
  const onRestore = () => { held = null; sync(); ScrollTrigger.refresh(); };
  addEventListener('kc:leave', onLeave);
  addEventListener('kc:restore', onRestore);

  // In-page anchors.
  const pad = () => parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
  const land = el => {
    if (Math.abs(el.getBoundingClientRect().top - pad()) > 6) lenis.scrollTo(el, { immediate: true, force: true });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  // Near targets glide (≤ 1.2 s, expo out). Far ones cut, then settle: the page jumps to just short
  // of the target and eases the last 0.6 screen in 0.9 s, so a jump across the whole page never
  // races through the pinned strip and the live studies on the way (and reads like a cut, not a
  // whip).
  const go = el => {
    const off = el.getBoundingClientRect().top - pad();
    const far = innerHeight * 2.5;
    if (Math.abs(off) > far) lenis.scrollTo(scrollY + off - Math.sign(off) * innerHeight * 0.6, { immediate: true, force: true });
    const dist = Math.abs(el.getBoundingClientRect().top - pad());
    lenis.scrollTo(el, { duration: Math.min(1.2, 0.7 + dist / 5000), easing: expoOut, force: true, onComplete: () => land(el) });
  };
  const onClick = e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href*="#"]');
    if (!a || a.matches('.skip-link') || a.closest('dialog')) return;
    if (a.pathname !== location.pathname || a.search !== location.search || !a.hash || a.hash === '#') return;
    let el = null;
    try { el = document.getElementById(decodeURIComponent(a.hash.slice(1))); } catch { return; }
    if (!el) return;
    e.preventDefault();
    if (location.hash !== a.hash) history.pushState(null, '', a.hash);
    go(el);
  };
  document.addEventListener('click', onClick, { capture: true });

  // Keys win over an eased scroll still in flight.
  const onKey = e => {
    if (NAV_KEYS.has(e.key) && lenis.isScrolling === 'smooth') { lenis.stop(); lenis.start(); }
  };
  addEventListener('keydown', onKey, { capture: true });

  return () => {
    document.removeEventListener('click', onClick, { capture: true });
    removeEventListener('keydown', onKey, { capture: true });
    removeEventListener('kc:leave', onLeave);
    removeEventListener('kc:restore', onRestore);
    mo.disconnect();
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
    state.lenis = null;
  };
}
