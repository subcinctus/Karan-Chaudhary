// Motion Prompt #075 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#075
// Motion Prompt #086 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#086
// (numbers only: #075's sticky header that slides away on the way down and returns on the first move
//  up, here past the hero, with a 10 px direction threshold, 0.45 s on (.4, 0, .1, 1); #086's
//  underline that draws in from the left and leaves to the right lives in site.css / motion.css.)
//
// Header on desktop: it gets out of the way of the pictures while scrolling down and comes straight
// back on any scroll up, keyboard focus inside it, or the top of the page. The nav labels roll on
// hover: each letter rises out of its line while a copy rises in under it, 0.014 s apart, 0.5 s on a
// circular in-out (an Unseen-style roll). Each link keeps its name as an aria-label; the letters are
// aria-hidden.

export function initNav(env) {
  const { root, state } = env;
  const header = document.querySelector('[data-header]');
  const links = [...document.querySelectorAll('.site-nav a')];
  const saved = [];
  for (const a of links) {
    const text = a.textContent.trim();
    if (!text || a.querySelector('.kc-roll')) continue;
    saved.push([a, a.innerHTML, a.getAttribute('aria-label')]);
    a.setAttribute('aria-label', text);
    const chars = [...text].map((c, i) => `<span class="kc-roll__c" style="--i:${i}" data-c="${c === ' ' ? ' ' : c.replace(/"/g, '&quot;')}">${c === ' ' ? '&nbsp;' : c.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))}</span>`).join('');
    a.innerHTML = `<span class="kc-roll" aria-hidden="true">${chars}</span>`;
  }

  // Hide on the way down (past the hero), show on the way up.
  const hero = document.querySelector('[data-hero]');
  const past = () => (hero ? hero.offsetHeight * 0.8 : 200);
  let acc = 0, hidden = false;
  const set = h => { if (h !== hidden) { hidden = h; root.classList.toggle('header-away', h); } };
  const onScroll = ({ scroll, direction, velocity }) => {
    if (header?.matches(':focus-within') || root.dataset.intro === 'playing') { set(false); acc = 0; return; }
    if (scroll < past()) { set(false); acc = 0; return; }
    acc = Math.sign(acc) === direction ? acc + direction * Math.abs(velocity) : direction * Math.abs(velocity);
    if (acc > 10) set(true);
    else if (acc < -10) set(false);
  };
  const off = state.lenis?.on('scroll', onScroll);
  const onFocus = () => set(false);
  header?.addEventListener('focusin', onFocus);

  return () => {
    off?.();
    header?.removeEventListener('focusin', onFocus);
    root.classList.remove('header-away');
    for (const [a, html, label] of saved) {
      a.innerHTML = html;
      if (label == null) a.removeAttribute('aria-label'); else a.setAttribute('aria-label', label);
    }
  };
}
