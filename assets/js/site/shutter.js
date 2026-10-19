// Motion Prompt #092 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#092
// (numbers only, rebuilt with real events: a full-viewport panel with the logo centred enters from
//  the left over 0.4 s (cubic ease-in-out) and covers everything, header included; the page and URL
//  switch while covered; the panel exits to the right over 0.45 s (cubic ease-in-out). Colour changed
//  from orange to ink with a tungsten edge; the logo is the "K·C" monogram.)
//
// Shutter page transition for internal page links (not in-page anchors, not new tabs, no modifier
// keys, not downloads). The leaving page covers, then navigates; the arriving page starts covered
// (sessionStorage flag read by the inline <head> script) and calls openShutter() once its content is
// rendered. bfcache-safe: a page restored from the back/forward cache is uncovered at once.
// Reduced motion / Motion off: ordinary navigation, never covered.
//
//   import { initShutter, openShutter } from './shutter.js';
//   initShutter();          // start intercepting links
//   openShutter();          // after the first render (no-op unless the page arrived covered)

import { isReducedMotion } from '../core/motion-pref.js';

const KEY = 'kc:shutter';
const EASE_IO = 'cubic-bezier(.65, 0, .35, 1)';
const IN_MS = 400, OUT_MS = 450;
const root = document.documentElement;

let panel = null, anim = null, leaving = false;

function reset() {
  try { anim?.cancel(); } catch { /* done */ }
  anim = null; leaving = false;
  root.classList.remove('shutter-cover', 'shutter-leaving');
  if (panel) panel.style.transform = '';
}

/** Is this click a same-site page navigation the shutter should cover? Returns the URL or null. */
function target(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target.closest?.('a[href]');
  if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self') || a.dataset.noShutter != null) return null;
  let url;
  try { url = new URL(a.href, location.href); } catch { return null; }
  if (url.origin !== location.origin) return null;
  if (!/(\.html|\/)$/.test(url.pathname)) return null;   // pages only, not media or PDFs
  const here = new URL(location.href);
  // Only pages that play the arriving half (index.html, project.html, next to this page): the study
  // pages and the 404 do not, and would leave the flag behind for a later, unrelated load.
  const dir = p => p.slice(0, p.lastIndexOf('/') + 1), file = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  if (dir(url.pathname) !== dir(here.pathname) || !['', 'index.html', 'project.html'].includes(file)) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;   // in-page anchor
  return url;
}

function onClick(e) {
  if (leaving || isReducedMotion()) return;
  const url = target(e);
  if (!url || !panel) return;
  e.preventDefault();
  leaving = true;
  root.classList.add('shutter-leaving');
  anim = panel.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }],
    { duration: IN_MS, easing: EASE_IO, fill: 'forwards' });
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* the next page simply starts uncovered */ }
    location.assign(url.href);
  };
  anim.finished.then(go, go);
  // A busy main thread (a heavy piece mid-frame) can hold the animation's start; the click never
  // waits longer than the cover itself plus a beat.
  setTimeout(go, IN_MS + 120);
}

/** Uncover an arriving page (exit to the right). Resolves when the page is visible. */
export function openShutter() {
  if (!panel || !root.classList.contains('shutter-cover')) return Promise.resolve();
  if (isReducedMotion()) { reset(); return Promise.resolve(); }
  anim = panel.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
    { duration: OUT_MS, easing: EASE_IO, fill: 'forwards' });
  // Never leave the page covered if the animation is held (busy main thread, throttled tab).
  const safety = new Promise(r => setTimeout(r, OUT_MS + 600));
  return Promise.race([anim.finished.catch(() => {}), safety]).then(reset);
}

export function initShutter() {
  panel = document.querySelector('[data-shutter]');
  document.addEventListener('click', onClick);
  // Back/forward cache: the page was frozen covered; open it at once.
  addEventListener('pageshow', e => { if (e.persisted) reset(); });
}
