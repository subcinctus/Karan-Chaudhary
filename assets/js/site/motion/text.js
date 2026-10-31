// Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005
// (numbers only for the page layer: #005's mask reveal, where text rises into a clip and a rule grows
//  while opacity never changes, re-timed for headings: each line slides up 115 % of its own height
//  behind its line mask over 1.05 s on an expo ease-out, lines 0.085 s apart; the slate's rule draws
//  from the left over 1.1 s on an expo in-out; the scene number rolls up digit by digit, 0.04 s apart.)
//
// Section, study, contact and film headings are split into lines (GSAP SplitText, autoSplit: re-split
// on resize and font load, with the entrance's progress carried over). Headings keep one accessible
// name (aria: 'auto' puts it on the heading and hides the line wrappers); paragraphs are split with
// aria: 'none', so their text stays in the DOM as written. Each head plays once, when its top passes
// 85 % of the viewport. Heads already on screen when the layer arms are left alone (no blink).

const HEADS = [
  ['.section-head', '.section-head__title'],
  ['.study-block__head', '.study-block__title'],
  ['.contact', '.contact__title'],
  ['.film__head', '.film__title'],
  ['.approach-title', null],
];

export function initText(env) {
  const { gsap, SplitText, ctx } = env;
  const splits = [];

  for (const [sel, titleSel] of HEADS) {
    for (const head of document.querySelectorAll(sel)) {
      if (!env.enters(head)) continue;
      const title = titleSel ? head.querySelector(titleSel) : head;
      if (!title) continue;
      const delay = env.delay(head);
      const slate = head.querySelector('.section-head__slate, .film__slate');
      const rule = head.querySelector('.section-head__rule');
      const numEl = head.querySelector('.section-head__slate > span:first-child');
      const others = title === head ? [] : [...head.children].filter(c => c !== title && c !== slate && !c.contains(title));
      const loglines = [...head.querySelectorAll('.film__logline')];

      let num = null;
      if (numEl) { num = SplitText.create(numEl, { type: 'chars', mask: 'chars', charsClass: 'kc-char', aria: 'auto' }); splits.push(num); }
      // The project page logline: split too, so it reads as lines rather than a block.
      let log = null;
      if (loglines.length) { log = SplitText.create(loglines, { type: 'lines', mask: 'lines', linesClass: 'kc-line', aria: 'none', autoSplit: true }); splits.push(log); }

      const split = SplitText.create(title, {
        type: 'lines', mask: 'lines', linesClass: 'kc-line', autoSplit: true, aria: 'auto',
        onSplit(self) {
          const tl = gsap.timeline({ delay, scrollTrigger: { trigger: head, start: 'top 85%', once: true } });
          if (slate) tl.from(slate, { opacity: 0, duration: 0.45, ease: 'power1.out' }, 0);
          if (rule) tl.from(rule, { scaleX: 0, transformOrigin: '0% 50%', duration: 1.1, ease: 'kc.io' }, 0);
          if (num?.chars?.length) tl.from(num.chars, { yPercent: 105, duration: 0.7, ease: 'kc.out', stagger: 0.04 }, 0.05);
          tl.from(self.lines, { yPercent: 115, duration: 1.05, ease: 'kc.out', stagger: 0.085 }, 0.06);
          if (log?.lines?.length) tl.from(log.lines, { yPercent: 115, duration: 1, ease: 'kc.out', stagger: 0.07 }, 0.22);
          const rest = others.filter(o => !o.matches('.film__logline'));
          if (rest.length) tl.from(rest, { y: 28, duration: 0.9, ease: 'kc.out', stagger: 0.06, clearProps: 'transform' }, 0.2)
            .from(rest, { opacity: 0, duration: 0.5, ease: 'power1.out', stagger: 0.06, clearProps: 'opacity' }, 0.2);
          return tl;
        },
      });
      splits.push(split);
    }
  }
  void ctx;
  return () => { for (const s of splits.reverse()) { try { s.revert(); } catch { /* reverted with the context */ } } };
}
