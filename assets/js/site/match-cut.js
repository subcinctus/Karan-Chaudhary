// Match cut between pages: a cross-document View Transition that carries a work card's still into the
// film page's lead frame, while the rest of the page fades through ink (assets/css/transitions.css).
// Where cross-document transitions do not run (Firefox, older browsers) the shutter (shutter.js) stays
// the cut; where they do, it steps aside. Reduced motion and Motion off: no transition at all.
//
// Index side, initMatchCut(): a click on a work card (or on an Index row, whose preview pane shows that
// film) names its frame "film-still" and leaves { slug, src } in sessionStorage 'kc:vt': src is the
// still the frame shows, a real still's URL or, for a procedural still, a JPEG of it at most 960 px wide.
// With Motion off the transition is skipped before this page is captured (pageswap).
// Film side, takeHandoff(slug, heroEl): before the first paint (project.js blocks rendering), the lead
// frame takes the name and the carried still, so the shared frame lands on the picture it left;
// project.js paints the full-size still over it and removes it. The frame gives the name up again when
// the film page is left, so the pager is a plain root fade. Each page's inline head script sets
// html[data-vt] ("on", "skipped" with Motion off, "none") on pagereveal.
//
//   import { initMatchCut, takeHandoff, supportsMatchCut } from './match-cut.js';
//   initMatchCut();                               // index.html, once
//   const img = takeHandoff(film.slug, hero);     // project.html, right after rendering: the hand-off <img> or null

import { isReducedMotion } from '../core/motion-pref.js';

const KEY = 'kc:vt';
const NAME = 'film-still';
const MAX_W = 960;   // the carried JPEG: about 40–90 KB

let pending = null;   // the film whose frame carries the name, until the page is left or restored

/** True where cross-document view transitions run (Chrome and Edge 126+, Safari 18.2+). */
export const supportsMatchCut = () => 'CSSViewTransitionRule' in window;

function clearNames() {
  for (const el of document.querySelectorAll('[style*="view-transition-name"]')) {
    if (el.style.viewTransitionName === NAME) el.style.viewTransitionName = '';
  }
  pending = null;
}

/**
 * The still a frame shows, for the film page to show at once: a real still's URL (already in the
 * cache), or for a procedural still (a blob: URL that dies with this page) a JPEG of it. null until it
 * has loaded.
 */
function carried(img) {
  if (!img?.complete || !img.naturalWidth) return null;
  const src = img.currentSrc || img.src;
  if (!src.startsWith('blob:')) return src;
  try {
    const w = Math.min(MAX_W, img.naturalWidth);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: Math.round(w * img.naturalHeight / img.naturalWidth) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return null; }
}

/** The frame a film link leaves from: the card's own, or the Index preview pane while it shows that film. */
function frameOf(a, slug) {
  if (a.classList.contains('work-card__link')) return a.querySelector('.work-card__frame');
  return [...document.querySelectorAll(`.work-index__preview [data-preview-frame][data-film="${CSS.escape(slug)}"]`)]
    .find(el => el.getClientRects().length) ?? null;
}

function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isReducedMotion()) return;
  const a = e.target.closest?.('a.work-card__link, a.work-index__link');
  if (!a || (a.target && a.target !== '_self')) return;
  let slug = a.dataset.film ?? a.closest('[data-film]')?.dataset.film;
  if (!slug) try { slug = new URL(a.href).searchParams.get('slug'); } catch { /* no film named */ }
  clearNames();
  const frame = slug ? frameOf(a, slug) : null;
  try {
    if (!frame) { sessionStorage.removeItem(KEY); return; }   // nothing to carry (no pane on this screen): the root fade alone
    sessionStorage.setItem(KEY, JSON.stringify({ slug, src: carried(frame.querySelector('img')) }));
  } catch { return; }   // storage blocked or full: the film page could not take the frame over
  frame.style.viewTransitionName = NAME;
  pending = slug;
}

/** Index side: name the clicked frame and store the hand-off; Motion off skips the transition. */
export function initMatchCut() {
  if (!supportsMatchCut()) return;
  document.addEventListener('click', onClick, { capture: true });
  addEventListener('pageswap', e => {
    if (!e.viewTransition) return;
    if (isReducedMotion()) { e.viewTransition.skipTransition(); return; }
    // A frame named for a film this navigation does not lead to (its own was cancelled): not shared.
    const to = e.activation?.entry?.url;
    if (pending && to && new URL(to).searchParams.get('slug') !== pending) clearNames();
  });
  // Back on this page from the back/forward cache: no frame is shared any more.
  addEventListener('pageshow', e => { if (e.persisted) clearNames(); });
}

/** Only a JPEG this site made, or a still's own http(s) URL, is shown. */
const handedSrc = s => (typeof s === 'string' && (/^data:image\/jpeg;base64,[\w+/=]+$/.test(s) || /^https?:\/\//.test(s)) ? s : null);

/**
 * Film side, synchronously before the first paint: when the index handed this film over, the lead frame
 * takes the name "film-still" and the carried still (prepended, so the film's own still paints over
 * it). Returns that <img> (project.js removes it once the full still is decoded), or null.
 */
export function takeHandoff(slug, heroEl) {
  let hand = null;
  try { hand = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); sessionStorage.removeItem(KEY); } catch { return null; }
  if (!hand || hand.slug !== slug || !heroEl) return null;
  heroEl.style.viewTransitionName = NAME;
  document.documentElement.classList.add('vt-handoff');
  // Leaving the film page (the pager, a link back) shares no frame: a plain root fade.
  addEventListener('pageswap', () => { heroEl.style.viewTransitionName = ''; }, { once: true });
  const src = handedSrc(hand.src);
  if (!src) return null;
  const img = document.createElement('img');
  img.className = 'film__handoff';
  img.alt = '';
  img.decoding = 'sync';   // in the first frame, which is the one the transition captures
  img.setAttribute('aria-hidden', 'true');
  img.src = src;
  heroEl.prepend(img);
  return img;
}
