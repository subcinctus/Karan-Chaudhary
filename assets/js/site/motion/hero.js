// Main title → page hand-off, and the hero's exit on scroll.
//
// Hand-off: when the title sequence ends (main.js dispatches `kc:intro` with { state: 'done' }), the
// chrome that waited during it arrives as one quick gesture instead of the CSS 0.9 s fade: the header's
// mark, links, timecode and toggle drop in 14 px, and the hero's buttons rise 28 px, 0.04 s apart, each
// 0.7 s on an expo ease-out (the whole group lands in ~0.9 s).
//
// Exit: tied 1:1 to the scroll while the hero leaves (top of the page → hero bottom at the top of the
// viewport), the picture drifts down 16 % (it moves at ~0.84× the page, so it reads as depth), pushes
// in 6 %, the letterbox closes from 2.39 towards ~3:1 (clip-path inset 0 → 22 % top and bottom) and a
// black shade fades in to 70 %: the frame closes like the end of a shot. The canvas itself is never
// resized, so the title Player does not redraw.

export function initHero(env) {
  const { gsap, root } = env;
  const hero = document.querySelector('[data-hero]');
  if (!hero) return undefined;
  const layers = [...hero.querySelectorAll('.hero__stage, .hero__fallback')];
  const foot = hero.querySelector('.hero__foot');

  const shade = document.createElement('div');
  shade.className = 'hero__shade';
  shade.setAttribute('aria-hidden', 'true');
  hero.insertBefore(shade, foot);

  gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } })
    .fromTo(layers, { yPercent: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' }, { yPercent: 16, scale: 1.06, clipPath: 'inset(22% 0% 22% 0%)', ease: 'none', duration: 1 }, 0)
    .fromTo(shade, { opacity: 0 }, { opacity: 0.7, ease: 'none', duration: 1 }, 0)
    .fromTo(foot, { y: 0, opacity: 1 }, { y: -48, opacity: 0, ease: 'none', duration: 0.4 }, 0);

  // Hand-off from the title sequence.
  let playing = root.dataset.intro === 'playing';
  const onIntro = e => {
    const s = e.detail?.state;
    if (s === 'playing') { playing = true; return; }
    if (s !== 'done' || !playing) return;
    playing = false;
    env.ctx.add(() => {
      const head = [...document.querySelectorAll('.site-header__mark, .site-nav li, .site-header__tc, .site-header__motion')];
      const cta = [...hero.querySelectorAll('.hero__cta, .hero__down')];
      gsap.timeline()
        .from(head, { y: -14, autoAlpha: 0, duration: 0.7, ease: 'kc.out', stagger: 0.04, clearProps: 'all' }, 0)
        .from(cta, { y: 28, autoAlpha: 0, duration: 0.7, ease: 'kc.out', stagger: 0.06, clearProps: 'all' }, 0.12);
    });
  };
  addEventListener('kc:intro', onIntro);

  return () => {
    removeEventListener('kc:intro', onIntro);
    shade.remove();
  };
}
