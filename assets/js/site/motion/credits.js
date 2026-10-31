// Motion Prompt #094 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#094
// (numbers only: #094's seamless band, a set repeated to fill the width and moved one set width at a
//  constant speed; slowed from the cell's ~180 px/s to 56 px/s for a credits pace, paused on hover and
//  while off screen, and nudged by the scroll's velocity, never past 2×.)
//
// End credits on desktop. The filmography keeps native-speed scrolling (no hijack): a credit comes up to
// full brightness as it rises out of the bottom mask and dims again as it goes into the top one
// (opacity 0.35 → 1 → 0.35, tied 1:1 to the scroll), like a roll seen through the masks. The dimming
// happens only under the sticky masks (bottom 22 vh, top 12 vh): anywhere between them a credit is at
// full opacity, so its contrast is never reduced where it can be read. "Filmography" and
// the closing signature are set in letters that rise behind a mask (0.03 s apart, 1 s expo out). Above
// Contact, one slow band carries the availability line.

export function initCredits(env) {
  const { gsap, SplitText, state } = env;
  const splits = [];
  const cleanups = [];
  const roll = document.querySelector('.credits__roll');
  if (roll) {
    const rows = [...roll.querySelectorAll('.credits__row')];
    let tops = [], heights = [];
    const measure = () => {
      tops = rows.map(r => r.getBoundingClientRect().top + scrollY);
      heights = rows.map(r => r.offsetHeight);
    };
    const shade = () => {
      const vh = innerHeight, y = scrollY;
      rows.forEach((row, i) => {
        const t = (tops[i] - y) / vh, b = (tops[i] + heights[i] - y) / vh;
        if (b < -0.1 || t > 1.1) return;
        const up = Math.min(1, Math.max(0, (0.92 - t) / 0.14));    // full once its top is above 78 vh
        const down = Math.min(1, Math.max(0, (b - 0.02) / 0.14));  // full while its bottom is below 16 vh
        row.style.opacity = String(Math.round((0.35 + 0.65 * Math.min(up, down)) * 1000) / 1000);
      });
    };
    const st = env.ScrollTrigger.create({ trigger: roll, start: 'top bottom', end: 'bottom top', onRefresh: () => { measure(); shade(); }, onUpdate: shade });
    measure(); shade();
    cleanups.push(() => { st.kill(); for (const row of rows) row.style.removeProperty('opacity'); });
    for (const el of roll.querySelectorAll('.credits__heading, .credits__signature')) {
      if (!env.enters(el)) continue;
      const s = SplitText.create(el, { type: 'chars', mask: 'chars', charsClass: 'kc-char', aria: 'auto' });
      splits.push(s);
      gsap.from(s.chars, { yPercent: 110, duration: 1, ease: 'kc.out', stagger: 0.03, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    }
    const by = roll.querySelector('.credits__end > .credits__role');
    if (by && env.enters(by)) gsap.from(by, { y: 16, opacity: 0, duration: 0.8, ease: 'kc.out', clearProps: 'all', scrollTrigger: { trigger: by, start: 'top 90%', once: true } });
  }

  // The band.
  const band = document.querySelector('[data-marquee]');
  const track = band?.querySelector('.marquee__track');
  let off = () => {};
  if (band && track) {
    const unit = track.firstElementChild;
    const fillTo = document.documentElement.clientWidth * 1.2;
    const sets = [];
    while (unit && track.scrollWidth < fillTo * 2 && sets.length < 24) { const c = unit.cloneNode(true); track.append(c); sets.push(c); }
    // An even number of identical units: moving by half the track is exactly one seamless loop.
    if (track.children.length % 2) { const c = unit.cloneNode(true); track.append(c); sets.push(c); }
    const w = track.scrollWidth / 2;
    const SPEED = 56;   // px per second
    const tw = gsap.fromTo(track, { x: 0 }, { x: -w, duration: w / SPEED, ease: 'none', repeat: -1 });
    tw.pause();
    let hover = false, onScreen = false;
    const sync = () => { if (onScreen && !hover) tw.play(); else tw.pause(); };
    const st = env.ScrollTrigger.create({ trigger: band, start: 'top bottom', end: 'bottom top', onToggle: self => { onScreen = self.isActive; sync(); } });
    const enter = () => { hover = true; sync(); };
    const leave = () => { hover = false; sync(); };
    band.addEventListener('pointerenter', enter);
    band.addEventListener('pointerleave', leave);
    const onScroll = ({ velocity }) => {
      if (!onScreen) return;
      gsap.to(tw, { timeScale: Math.min(2, 1 + Math.abs(velocity) / 40), duration: 0.4, ease: 'power1.out', overwrite: true });
    };
    state.lenis?.on('scroll', onScroll);
    off = () => {
      band.removeEventListener('pointerenter', enter);
      band.removeEventListener('pointerleave', leave);
      st.kill();
      for (const c of sets) c.remove();
    };
  }

  return () => {
    off();
    for (const c of cleanups) c();
    for (const s of splits.reverse()) { try { s.revert(); } catch { /* done */ } }
  };
}
