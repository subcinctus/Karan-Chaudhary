// Motion Prompt #092 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#092
// (numbers only, rebuilt with real events: a full-viewport panel covers everything, header included;
//  the page and URL switch while covered; the panel then leaves in the same direction it came, so the
//  move reads as one wipe across. Re-cut from the cell's 0.4 s / 0.45 s cubic slide into a clip-path
//  curtain: in 0.42 s, out 0.62 s on an expo in-out (cubic-bezier(.77, 0, .175, 1)), about 1 s in all.
//  Colour changed from orange to ink with a tungsten leading edge; the logo is the "K·C" monogram, and
//  when the link names a film its title is shown as an intertitle.)
//
// Shutter page transition for internal page links (not in-page anchors, not new tabs, no modifier
// keys, not downloads). The leaving page covers, then navigates; the arriving page starts covered
// (sessionStorage flag read by the inline <head> script, which also restores the intertitle) and calls
// openShutter() once its content is rendered. bfcache-safe: a page restored from the back/forward
// cache is uncovered at once. WAAPI only (no GSAP), so phones get it and it never depends on the
// desktop layer. Reduced motion / Motion off: ordinary navigation, never covered. Where cross-document
// view transitions run, the match cut (match-cut.js, transitions.css) is the cut and the curtain steps
// aside; it stays the fallback for Firefox and older browsers.
//
//   import { initShutter, openShutter } from './shutter.js';
//   initShutter();          // start intercepting links
//   openShutter();          // after the first render (no-op unless the page arrived covered)

import { isReducedMotion } from '../core/motion-pref.js';
import { supportsMatchCut } from './match-cut.js';

const KEY = 'kc:shutter';
const EASE_IO = 'cubic-bezier(.77, 0, .175, 1)';
const IN_MS = 420, OUT_MS = 620;
const root = document.documentElement;

let panel = null, anim = null, leaving = false;

function reset() {
  try { anim?.cancel(); } catch { /* done */ }
  anim = null; leaving = false;
  root.classList.remove('shutter-cover', 'shutter-leaving', 'shutter-titled', 'shutter-lifting');
  root.style.removeProperty('--shutter-title');
  if (panel) panel.style.clipPath = '';
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
  return { url, title: titleOf(a) };
}

/** The film a link leads to, for the intertitle (work cards, Index rows and the project pager name one). */
function titleOf(a) {
  const t = a.querySelector('.work-card__title, .work-index__title, .film__pager-title')?.textContent?.trim();
  return t && t.length <= 80 ? t : '';
}

/** A JS string as a CSS string value (for --shutter-title). */
const cssString = s => `"${String(s).replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, ' ')}"`;

function onClick(e) {
  if (leaving || isReducedMotion() || supportsMatchCut()) return;
  const hit = target(e);
  if (!hit || !panel) return;
  e.preventDefault();
  leaving = true;
  if (hit.title) { root.style.setProperty('--shutter-title', cssString(hit.title)); root.classList.add('shutter-titled'); }
  root.classList.add('shutter-leaving');
  window.dispatchEvent(new CustomEvent('kc:leave'));   // the desktop layer stops smooth scrolling
  anim = panel.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    { duration: IN_MS, easing: EASE_IO, fill: 'forwards' });
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    try { sessionStorage.setItem(KEY, hit.title ? JSON.stringify({ title: hit.title }) : '1'); } catch { /* the next page simply starts uncovered */ }
    location.assign(hit.url.href);
  };
  anim.finished.then(go, go);
  // A busy main thread (a heavy piece mid-frame) can hold the animation's start; the click never
  // waits longer than the cover itself plus a beat.
  setTimeout(go, IN_MS + 120);
}

/** Uncover an arriving page (the curtain carries on off to the right). Resolves when the page is visible. */
export function openShutter() {
  if (!panel || !root.classList.contains('shutter-cover')) return Promise.resolve();
  if (isReducedMotion()) { reset(); return Promise.resolve(); }
  root.classList.add('shutter-lifting');   // the desktop layer: the first screen is being uncovered now
  window.dispatchEvent(new CustomEvent('kc:arrive', { detail: { ms: OUT_MS } }));
  anim = panel.animate([{ clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 100%)' }],
    { duration: OUT_MS, easing: EASE_IO, fill: 'forwards' });
  // Never leave the page covered if the animation is held (busy main thread, throttled tab).
  const safety = new Promise(r => setTimeout(r, OUT_MS + 600));
  return Promise.race([anim.finished.catch(() => {}), safety]).then(reset);
}

export function initShutter() {
  panel = document.querySelector('[data-shutter]');
  if (panel && !panel.querySelector('.shutter__title')) panel.insertAdjacentHTML('beforeend', '<span class="shutter__title"></span>');
  document.addEventListener('click', onClick);
  // Back/forward cache: the page was frozen covered; open it at once.
  addEventListener('pageshow', e => { if (e.persisted) { reset(); window.dispatchEvent(new CustomEvent('kc:restore')); } });
}
