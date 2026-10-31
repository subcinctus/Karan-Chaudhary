// The visitor's place in the page, kept across layout changes and reloads.
//
// The desktop motion layer changes the page's height when it arms or reverts (the pinned work strip
// adds a spacer of one strip length), and a window crossing 1024 px, "Motion off" or a reload can do
// either. A scroll offset alone would then land on different content. Instead, a place is the first
// block that starts at or below the header line (or, failing that, the one straddling it) plus its
// distance from the top of the window; restoring it puts that same block back at that same distance.
//
//   const a = capture();   …layout changes…   restore(a);
//   remember() / recall(): the place survives a reload (sessionStorage, read only when the browser
//   was told not to restore the scroll itself: history.scrollRestoration = 'manual', set by the layer).
//   moved(): a count of the visitor's own scrolling (wheel, keys, touch), so a programmatic aim never
//   yanks someone who has already scrolled.

const root = document.documentElement;
const CANDIDATES = 'main h1, main h2, main h3, main p, main li, main figure, main .section-head, main .work-card, main [data-reveal], main .credits__row, footer';
const KEY = 'kc:place:';
const NAV_KEYS = new Set(['Tab', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', ' ', 'Home', 'End']);

let moves = 0;
const bump = () => { moves++; };
addEventListener('wheel', bump, { passive: true });
addEventListener('touchstart', bump, { passive: true });
addEventListener('keydown', e => { if (NAV_KEYS.has(e.key)) bump(); }, { passive: true });

/** How many times the visitor has scrolled by wheel, touch or keys since the page loaded. */
export const moved = () => moves;

const line = () => parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
const visible = el => !el.closest('[hidden], .kc-cursor, .marquee');

/** @returns {{ top: true } | { el: Element, off: number, y: number } | null} */
export function capture() {
  if (scrollY < 4) return { top: true };
  const L = line(), vh = innerHeight;
  let below = null, belowTop = Infinity, across = null, acrossH = Infinity;
  for (const el of document.querySelectorAll(CANDIDATES)) {
    const r = el.getBoundingClientRect();
    if (!r.height || r.bottom <= 0 || r.top >= vh) continue;
    if (r.top >= L - 1) { if (r.top < belowTop && visible(el)) { below = el; belowTop = r.top; } }
    else if (r.bottom > L && r.height < acrossH && visible(el)) { across = el; acrossH = r.height; }
  }
  const el = below ?? across;
  return el ? { el, off: el.getBoundingClientRect().top, y: scrollY } : { y: scrollY };
}

/**
 * Put a captured place back. `to(y)` scrolls (window.scrollTo by default; the layer passes Lenis).
 * `rail(el)` may return a scroll position for an element that sits in a pinned box (the layer maps it
 * onto the strip), since a pinned box's rect does not say where the page is.
 */
export function restore(a, { to = y => scrollTo(0, y), rail = null } = {}) {
  if (!a) return;
  if (a.top) { to(0); return; }
  if (!a.el?.isConnected) { if (Number.isFinite(a.y)) to(a.y); return; }
  const pinned = rail?.(a.el);
  if (Number.isFinite(pinned)) { to(Math.round(pinned)); return; }
  to(Math.max(0, Math.round(scrollY + a.el.getBoundingClientRect().top - a.off)));
}

// --- Reloads ----------------------------------------------------------------------------------------

const pageKey = () => KEY + location.pathname + location.search;

function describe(a) {
  if (!a) return null;
  if (a.top) return { top: true };
  if (!a.el) return { y: a.y };
  const host = a.el.closest('[id]') ?? document.body;
  const list = [...host.querySelectorAll(CANDIDATES)];
  return { id: host.id || null, i: list.indexOf(a.el), off: a.off, y: a.y };
}

function resolve(d) {
  if (!d) return null;
  if (d.top) return { top: true };
  const host = d.id ? document.getElementById(d.id) : document.body;
  const el = host && d.i >= 0 ? host.querySelectorAll(CANDIDATES)[d.i] : null;
  return el ? { el, off: d.off, y: d.y } : { y: d.y };
}

let saved = null;   // the descriptor recall() found, kept for the layer's first arm

/** Save the place when the page is left (reload, navigation). */
export function remember() {
  addEventListener('pagehide', () => {
    try { sessionStorage.setItem(pageKey(), JSON.stringify(describe(capture()))); } catch { /* storage blocked */ }
  });
}

/**
 * On a reload or back/forward load that the browser was told not to restore (the desktop layer sets
 * history.scrollRestoration = 'manual'), put the visitor back where they were. Returns true when it did.
 */
export function recall() {
  let d = null;
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]?.type;
    if ((nav !== 'reload' && nav !== 'back_forward') || history.scrollRestoration !== 'manual') return false;
    d = JSON.parse(sessionStorage.getItem(pageKey()) ?? 'null');
  } catch { return false; }
  if (!d) return false;
  saved = d;
  restore(resolve(d));
  return true;
}

/** The place recall() restored, re-resolved against the current DOM (null if there was none). */
export const recalled = () => (saved ? resolve(saved) : null);

/** Content arrived above the place after recall() (e.g. the previs plans): put it back again, unless
 *  the visitor has scrolled since. */
export function reapply() { if (saved && moves === 0) restore(resolve(saved)); }
