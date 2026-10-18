// Motion Prompt #089 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#089
// (numbers only, rebuilt with real events: count 0→100 % over 0.25–2.1 s, cubic ease-out; bar 180×4;
//  the screen lifts out over 2.3–2.85 s, cubic ease-in-out; the page under it fades in and rises
//  from 14 px over 2.35–2.95 s, cubic ease-out. Content and colour changed: a film-leader countdown,
//  numerals 8 − floor(p·7) with a sweep wedge at (7p mod 1)·360°, on ink with a tungsten bar.)
//
// Film-leader preloader, first visit per session only. The inline script in index.html decides
// before first paint (html.is-preloading); this module runs the count and lifts the screen at
// 2.85 s after navigation start whether or not anything has finished loading. It never waits for
// the network. Esc lifts it at once. Reduced motion / Motion off: it never appears.
//
//   import { runPreloader } from './preloader.js';
//   const lifted = runPreloader({ enabled: data.site.intro.preloader, rise: [heroEl] });
//   lifted.then(() => player.play());   // resolves when the lift starts (or at once if not shown)

import { isReducedMotion } from '../core/motion-pref.js';
import { P, eOut } from '../core/time.js';

const KEY = 'kc:leader';
const T = { countIn: 0.25, countOut: 2.1, liftIn: 2.3, liftOut: 2.85, riseIn: 2.35, riseOut: 2.95 };
const EASE_IO = 'cubic-bezier(.65, 0, .35, 1)';
const EASE_OUT = 'cubic-bezier(.33, 1, .68, 1)';

const root = document.documentElement;
let active = null;

/** True while the leader covers the page. */
export const preloaderActive = () => !!active;

/** Lift now (Esc). Safe to call when nothing is showing. */
export function skipPreloader() { active?.skip(); }

/**
 * Run the preloader if the page started with it.
 * @param {{ enabled?: boolean, rise?: Element[] }} [o]  rise: elements that fade in and rise 14 px under it
 * @returns {Promise<{ shown: boolean }>} resolves when the lift starts (the page is being revealed)
 */
export function runPreloader({ enabled = true, rise = [] } = {}) {
  const el = document.querySelector('[data-preloader]');
  const showing = root.classList.contains('is-preloading');
  if (!el || !showing || !enabled || isReducedMotion()) {
    root.classList.remove('is-preloading');
    return Promise.resolve({ shown: false });
  }
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }

  const num = el.querySelector('[data-leader-num]');
  const pct = el.querySelector('[data-leader-pct]');
  const bar = el.querySelector('[data-leader-bar]');
  const sweep = el.querySelector('[data-leader-sweep]');
  // Times are measured from navigation start, so a slow module load shortens the count, never the page.
  const now = () => performance.now() / 1000;
  let raf = 0, lifted = false, lastNum = '', resolveLift;
  const liftStarted = new Promise(r => { resolveLift = r; });
  const anims = [];

  function frame() {
    raf = 0;
    const t = now();
    const p = eOut(P(t, T.countIn, T.countOut));
    const n = Math.round(100 * p);
    const leader = String(Math.max(1, 8 - Math.floor(p * 7)));
    if (leader !== lastNum) { num.textContent = leader; lastNum = leader; }
    pct.textContent = String(n).padStart(3, '0');
    bar.style.transform = `scaleX(${n / 100})`;
    sweep.style.setProperty('--a', `${(((p * 7) % 1) * 360).toFixed(1)}deg`);
    if (!lifted && t >= T.liftIn) lift(t);
    if (t < T.riseOut + 0.05) raf = requestAnimationFrame(frame);
  }

  function lift(t, fast = false) {
    if (lifted) return;
    lifted = true;
    const delay = fast ? 0 : Math.max(0, (T.liftIn - t) * 1000);
    const dur = fast ? 320 : (T.liftOut - T.liftIn) * 1000;
    const a = el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }],
      { duration: dur, delay, easing: EASE_IO, fill: 'forwards' });
    anims.push(a);
    const riseDelay = fast ? 60 : Math.max(0, (T.riseIn - t) * 1000);
    for (const r of rise) {
      r.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: (T.riseOut - T.riseIn) * 1000, delay: riseDelay, easing: EASE_OUT, fill: 'backwards' });   // runs on after the lift
    }
    setTimeout(resolveLift, delay);
    a.finished.then(done, done);
  }

  function done() {
    if (!active) return;
    cancelAnimationFrame(raf);
    root.classList.remove('is-preloading');
    for (const a of anims) { try { a.cancel(); } catch { /* finished */ } }
    active = null;
    resolveLift();
  }

  active = { skip: () => { if (!lifted) lift(now(), true); else done(); } };
  // Content under the leader starts hidden so the rise reads; WAAPI fill:'backwards' holds it.
  if (now() >= T.liftIn) lift(now(), true);
  frame();
  return liftStarted.then(() => ({ shown: true }));
}
