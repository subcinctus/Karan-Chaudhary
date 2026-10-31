// Motion Prompt #077 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#077
// Motion Prompt #073 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#073
// (numbers only: #077's pinned horizontal strip: the section holds while the vertical scroll moves the
//  row sideways at exactly 1:1 (scroll distance = travel = padding·2 + cardW·n + gap·(n−1) − viewportW,
//  linear, no easing); cards here are 40–44 vw wide, sized so the whole pinned frame fits the window
//  height, with a 2.6 vw gap. #073's parallax, one layer, and only at the edges: a picture that is fully
//  inside the window shows its whole composition (scale 1, no shift); while its card crosses the left
//  or right edge it is pushed in up to 1.04× and drifts up to 1.8 % sideways, so the strip reads as
//  frames passing a gate without ever cropping a frame the visitor is looking at.)
//
// Selected work as a film strip on desktop: the six frames run edge to edge in one pinned row, with a
// HUD under it (frame counter, a progress line, the frame's aspect and camera move). Each card's gate
// wipes open left to right (clip-path, 1 s expo in-out) as it enters, its picture settling from 1.2×;
// a gate never opens on the palette placeholder: the stills are started 1.5 screens ahead of the strip
// (kc:prime-work, main.js) and a gate waits (≤ 1.5 s) for its still. A sideways trackpad swipe over the
// strip moves it (and never turns into the browser's swipe-back).
// Keyboard: every card is a real link; focusing one scrolls the page to the point where that card sits
// in the middle of the strip, so focus is never off screen. Without the desktop layer (touch, small
// screens, reduced motion, Motion off) the cards are the ordinary grid. In the Index view
// (html[data-work-view="index"], site/work-index.js) there is no strip: the table is the plain layout,
// and switching views re-arms the layer (kc:relayout).

const pad2 = n => String(n).padStart(2, '0');

export function initWorkRail(env) {
  const { gsap, ScrollTrigger, root, state } = env;
  if (root.dataset.workView === 'index') return undefined;
  const box = document.querySelector('#work [data-render="work"]');
  const grid = box?.querySelector('.work-grid');
  const cards = grid ? [...grid.querySelectorAll('.work-card')] : [];
  if (!box || cards.length < 3) return undefined;
  const plays = env.enters(box);
  let alive = true;

  // Start every card's still now if the strip is within 1.5 screens, else as it comes that near, so
  // they have painted before the strip starts to travel (main.js listens; renderStill paints serially).
  let primeIO = null;
  const prime = () => dispatchEvent(new CustomEvent('kc:prime-work'));
  if (typeof IntersectionObserver === 'undefined') prime();
  else {
    primeIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { primeIO.disconnect(); prime(); } }, { rootMargin: '150% 0px' });
    primeIO.observe(box);
  }

  root.classList.add('work-rail');
  box.classList.add('work-rail__box');
  const view = document.createElement('div');
  view.className = 'work-rail__view';
  grid.before(view);
  view.append(grid);
  const n = cards.length;
  const meta = cards.map(c => ({
    aspect: c.querySelector('.work-card__aspect')?.textContent?.trim() ?? '',
    move: c.querySelector('.work-card__foot span')?.textContent?.trim() ?? '',
  }));
  const hud = document.createElement('div');
  hud.className = 'work-rail__hud cam-label';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = `<span class="work-rail__count"><span class="work-rail__mask"><span class="work-rail__num">01</span></span><span class="work-rail__of">/ ${pad2(n)}</span></span>`
    + '<span class="work-rail__bar"><span class="work-rail__fill"></span></span>'
    + `<span class="work-rail__meta">${meta[0].aspect} · ${meta[0].move}</span>`;
  view.after(hud);
  const num = hud.querySelector('.work-rail__num');
  const fill = hud.querySelector('.work-rail__fill');
  const metaEl = hud.querySelector('.work-rail__meta');
  const frames = cards.map(c => c.querySelector('.work-card__frame'));

  // Geometry: the strip runs the full width of the window; its first card lines up with the content.
  // Card width: as wide as the screen allows (40 vw, 44 vw from 1800 px) but never so wide that the
  // pinned frame (heading, gates, titles, HUD, note) overflows the window height.
  const fit = () => {
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    box.style.setProperty('--rail-vw', `${vw}px`);
    box.style.setProperty('--rail-pad', `${Math.max(0, Math.round(box.getBoundingClientRect().left))}px`);
    const gate = cards[0].querySelector('.work-card__gate');
    if (!gate) return;
    const maxW = vw * (vw >= 1800 ? 0.44 : 0.40), minW = vw * 0.26;
    for (let i = 0; i < 2; i++) {   // titles re-wrap with the width: measure twice
      const cs = getComputedStyle(box);
      const content = [...box.children].reduce((h, el) => {
        const m = getComputedStyle(el);
        return h + el.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
      }, 0);
      const chrome = content - gate.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const ratio = gate.offsetWidth / Math.max(1, gate.offsetHeight);
      const w = Math.max(minW, Math.min(maxW, (vh - chrome - 8) * ratio));
      box.style.setProperty('--rail-card', `${Math.floor(w)}px`);
    }
  };
  fit();
  // Cached on every refresh, so the scroll handlers never read layout.
  let D = 0, VW = 0, lefts = [], widths = [], centres = [];
  const dist = () => Math.max(0, grid.scrollWidth - view.clientWidth);
  const measureCards = () => {
    D = dist(); VW = view.clientWidth;
    lefts = cards.map(c => c.offsetLeft); widths = cards.map(c => c.offsetWidth);
    centres = cards.map((c, i) => lefts[i] + widths[i] / 2);
  };
  // The HUD names the card the strip is on: the reference point travels from the first card's centre
  // (strip at rest) to the last card's (strip at its end), so it reads 01 at the start and 06 at the end.
  const nearest = p => {
    if (!centres.length) return 0;
    const ref = centres[0] + p * (centres[n - 1] - centres[0]);
    let best = 0;
    centres.forEach((c, i) => { if (Math.abs(c - ref) < Math.abs(centres[best] - ref)) best = i; });
    return best;
  };
  // A picture is untouched while its card is fully on screen; crossing an edge pushes it in a little.
  const edges = p => {
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      if (!f || !widths[i]) continue;
      const l = lefts[i] - p * D, r = l + widths[i];
      const enter = Math.min(1, Math.max(0, (r - VW) / widths[i])), exit = Math.min(1, Math.max(0, -l / widths[i]));
      const k = Math.max(enter, exit), dir = enter >= exit ? 1 : -1;
      f.style.setProperty('--ps', (1 + 0.04 * k).toFixed(4));
      f.style.setProperty('--px', `${(dir * 1.8 * k).toFixed(3)}%`);
    }
  };

  let current = 0;   // index shown in the HUD
  const setCurrent = i => {
    if (i === current) return;
    const dir = i > current ? 1 : -1;
    current = i;
    num.textContent = pad2(i + 1);
    metaEl.textContent = `${meta[i].aspect} · ${meta[i].move}`;
    gsap.fromTo(num, { yPercent: 100 * dir }, { yPercent: 0, duration: 0.45, ease: 'kc.out', overwrite: true });
  };

  const strip = gsap.to(grid, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      id: 'work-rail', trigger: box, start: 'top top', end: () => `+=${dist()}`,
      pin: true, scrub: true, invalidateOnRefresh: true, anticipatePin: 1,
      onRefreshInit: fit,
      onRefresh: self => { measureCards(); setCurrent(nearest(self.progress)); edges(self.progress); },
      onUpdate: self => {
        gsap.set(fill, { scaleX: self.progress });
        setCurrent(nearest(self.progress));
        edges(self.progress);
      },
    },
  });
  measureCards();
  edges(0);

  // Entrances: the frames on screen when the strip arrives open together; the rest as they enter.
  // A gate waits for its still (≤ 1.5 s), so it never opens on the palette placeholder.
  const painted = (list, ms = 1500) => Promise.all(list.map(f => (!f || f.classList.contains('has-piece')) ? null : new Promise(res => {
    const mo = new MutationObserver(() => { if (f.classList.contains('has-piece')) done(); });
    const t = setTimeout(done, ms);
    function done() { mo.disconnect(); clearTimeout(t); res(); }
    mo.observe(f, { attributes: true, attributeFilter: ['class'] });
  })));
  if (plays) {
    const vw = document.documentElement.clientWidth;
    const first = [], later = [];
    for (const c of cards) (c.offsetLeft < vw * 0.98 ? first : later).push(c);   // offsetLeft includes the strip's padding
    const enter = (list, delay = 0) => {
      const gates = list.map(c => c.querySelector('.work-card__gate'));
      const fr = list.map(c => c.querySelector('.work-card__frame'));
      const texts = list.flatMap(c => [...c.querySelectorAll('.work-card__text > *')]);
      return gsap.timeline({ paused: true, delay })
        .fromTo(gates, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'kc.io', stagger: 0.08, clearProps: 'clipPath' }, 0)
        .from(fr, { scale: 1.2, duration: 1.3, ease: 'kc.out', stagger: 0.08, clearProps: 'scale,transform' }, 0.05)
        .from(texts, { y: 20, autoAlpha: 0, duration: 0.8, ease: 'kc.out', stagger: 0.025, clearProps: 'all' }, 0.25);
    };
    const go = (list, tl) => () => painted(list.map(c => c.querySelector('.work-card__frame'))).then(() => { if (alive) tl.play(); });
    const firstTl = enter(first, env.delay(box));
    ScrollTrigger.create({ trigger: box, start: 'top 75%', once: true, onEnter: go(first, firstTl) });
    for (const c of later) {
      const tl = enter([c]);
      ScrollTrigger.create({ trigger: c, containerAnimation: strip, start: 'left 96%', once: true, onEnter: go([c], tl) });
    }
  }

  // Keyboard: bring the focused card to the middle of the strip.
  // Only for keyboard focus: a mouse press also focuses the link, and moving the strip under the
  // pointer between press and release would swallow the click.
  let pressed = 0;
  const onPress = () => { pressed = performance.now(); };
  const onFocus = e => {
    const card = e.target.closest?.('.work-card');
    if (!card) return;
    if (performance.now() - pressed < 800) return;
    try { if (!e.target.matches(':focus-visible')) return; } catch { /* old engines: keep going */ }
    const st = strip.scrollTrigger, d = dist();
    if (!st || !d) return;
    const want = Math.min(d, Math.max(0, card.offsetLeft + card.offsetWidth / 2 - view.clientWidth / 2));
    const y = st.start + (want / d) * (st.end - st.start);
    if (state.lenis) state.lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
    ScrollTrigger.update();
  };
  grid.addEventListener('focusin', onFocus);
  grid.addEventListener('pointerdown', onPress, { passive: true });

  // A sideways two-finger swipe over the strip moves it (Lenis only reads the vertical axis). Clamped to
  // the pin, and always taken, so it never reaches the browser as a history swipe.
  const onWheel = e => {
    if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const st = strip.scrollTrigger, lenis = state.lenis;
    if (!st || !lenis) return;
    e.preventDefault();
    e.lenisStopPropagation = true;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const cur = lenis.targetScroll;
    const y = Math.min(Math.max(st.end, cur), Math.max(Math.min(st.start, cur), cur + e.deltaX * unit));
    if (y !== cur) lenis.scrollTo(y);
  };
  view.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    alive = false;
    primeIO?.disconnect();
    grid.removeEventListener('focusin', onFocus);
    grid.removeEventListener('pointerdown', onPress);
    view.removeEventListener('wheel', onWheel, { passive: false });
    view.before(grid);
    view.remove();
    hud.remove();
    for (const p of ['transform', 'translate', 'rotate', 'scale']) grid.style.removeProperty(p);   // GSAP's revert leaves these inline
    if (!grid.getAttribute('style')) grid.removeAttribute('style');
    for (const p of ['--rail-vw', '--rail-pad', '--rail-card']) box.style.removeProperty(p);
    box.classList.remove('work-rail__box');
    for (const f of frames) { f?.style.removeProperty('--px'); f?.style.removeProperty('--ps'); }
    root.classList.remove('work-rail');
  };
}
