// Motion Prompt #074 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#074
// Motion Prompt #002 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#002
// (numbers only: #074's trigger line, sharpened to "top 88 %", played once; the block rises 40 px over
//  0.95 s on an expo ease-out while its opacity comes up over a shorter 0.5 s, so it reads as a cut-in
//  rather than a fade. #002's tight stagger for rows that enter together, without its back-out
//  overshoot: 0.06 s per item, so a row of three lands inside 0.15 s.)
//
// Desktop take-over of site/reveal.js for every [data-reveal] block that no other module animates
// (headings: text.js; frames, previs slots: frames.js; the work rail: work.js). Kit tables enter row by
// row. Blocks already on screen (or above it) when the layer arms are never hidden.

const SKIP = '.section-head, .study-block__head, .contact, .approach-title, .film__head';

export function initReveals(env) {
  const { gsap, ScrollTrigger, root, owned, state } = env;
  const batches = [];

  const targetsOf = el => (el.matches('.kit__col') ? [...el.querySelectorAll('.kit__title, .kit__row')] : [el]);

  function scan(scope = document) {
    const els = [];
    for (const el of scope.querySelectorAll('[data-reveal]')) {
      if (owned.has(el) || el.matches(SKIP) || el.dataset.motionSeen) continue;
      if (root.classList.contains('work-rail') && el.matches('.work-card')) continue;
      el.dataset.motionSeen = '1';
      if (!env.enters(el)) continue;
      els.push(...targetsOf(el));
    }
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: 40 });
    batches.push(...ScrollTrigger.batch(els, {
      start: 'top 88%', once: true,
      onEnter: batch => {
        gsap.to(batch, { y: 0, duration: 0.95, ease: 'kc.out', stagger: 0.06, overwrite: 'auto', clearProps: 'transform' });
        gsap.to(batch, { opacity: 1, duration: 0.5, ease: 'power1.out', stagger: 0.06, clearProps: 'opacity' });
      },
    }));
  }

  env.ctx.add(() => scan(document));
  state.scanners.push(scope => env.ctx.add(() => scan(scope)));

  return () => {
    for (const t of batches) t.kill();
    for (const el of document.querySelectorAll('[data-motion-seen]')) delete el.dataset.motionSeen;
  };
}
