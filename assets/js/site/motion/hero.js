// The hero's exit on scroll.
//
// The header and the progress bar stay on screen while the main title plays, and the call to action
// fades in on its own (site.css, at 1.2 s), so nothing waits to arrive when the title ends.
//
// Exit: tied 1:1 to the scroll while the hero leaves (top of the page → hero bottom at the top of the
// viewport), the picture drifts down 16 % (it moves at ~0.84× the page, so it reads as depth), pushes
// in 6 %, the letterbox closes from 2.39 towards ~3:1 (clip-path inset 0 → 22 % top and bottom) and a
// black shade fades in to 70 %: the frame closes like the end of a shot. The canvas itself is never
// resized, so the title Player does not redraw.

export function initHero(env) {
  const { gsap } = env;
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

  return () => { shade.remove(); };
}
