// Selected work as an index: the "Frames | Index" toggle in the section head, a credits-style table of
// the films (prerendered, so crawlers and visitors without JavaScript read the filmography) and, from
// 1100 px, a preview pane beside it.
//
// The renderers are pure string builders (Node-safe: tools/prerender.mjs runs them); import ./html.js,
// never ./render.js. render.js renderWork() places the toggle in sectionHead({ tools }) and the table
// after the frames; main.js calls mountWorkIndex() once the section is rendered.
//
// The view: html[data-work-view] is "frames" or "index", set before the first paint by the inline head
// script from localStorage 'kc:work-view', and work.css shows one view (without JavaScript, the table).
// Switching sets both, then dispatches kc:relayout: the desktop layer (motion/index.js) re-arms for the
// new layout (the index has no pinned strip) and puts the toggle back where it was on screen. Focus
// stays on the pressed button.
//
// The pane is aria-hidden (it repeats the row). It shows the film under the pointer or keyboard focus
// and keeps the last one: the frame letterboxed at its own aspect in a 16:9 gate (the featured real
// still, or the work card's procedural still: pieces/still.js, seed hashString(slug + 0), the first of
// stillKinds), the logline, the aspect and the camera move. Frames swap with a 300 ms crossfade
// (classes, work.css), instant under reduced motion and Motion off.

import { html, raw, safeUrl, srcsetOf, pad2, aspectLabel, filled, badge, featuredStill, cleanPalette, paletteBackground, MOVE_NAMES } from './html.js';
import { hashString } from '../core/prng.js';
import { isReducedMotion } from '../core/motion-pref.js';

const KEY = 'kc:work-view';
const VIEWS = [['frames', 'Frames'], ['index', 'Index']];
/** The pane's width in work.css: what a real still's srcset is chosen for. */
const PANE_SIZES = 'clamp(320px, 30vw, 640px)';
/** An empty cell: a dash to the eye, a blank cell to a screen reader. */
const NONE = raw('<span class="work-index__none" aria-hidden="true">—</span>');

/** "Festival · 2026" (real films only: the data check fails a premiere on a sample). */
const premiereOf = p => [filled(p?.event), p?.year].filter(Boolean).join(' · ') || null;
/** The camera body over the lens set, one mono line each. */
function kitOf(film) {
  const lines = [film.camera?.body, film.lenses?.set].filter(Boolean);
  return lines.length ? html`${lines.map(l => html`<span class="work-index__line">${l}</span>`)}` : null;
}

/**
 * The columns in order: [key, heading, cell(film, i)]. The title (no cell function) is the row header
 * and the row's only link. work.css drops columns by key on narrower screens; print shows them all.
 */
const COLUMNS = [
  ['no', 'No', (f, i) => pad2(i + 1)],
  ['year', 'Year', f => f.year],
  ['film', 'Title', null],
  ['dir', 'Director', f => filled(f.director)],
  ['prod', 'Production / Platform', f => filled(f.production)],
  ['format', 'Format', f => f.format],
  ['aspect', 'Aspect', f => (Number(f.aspect) ? aspectLabel(f.aspect) : null)],
  ['kit', 'Camera / Lens', kitOf],
  ['premiere', 'Premiere', f => premiereOf(f.premiere)],
];

/** The view toggle for the section head's tools slot (Frames is pressed until main.js reads the view). */
export function renderWorkToggle(data) {
  if (!(data.films ?? []).length) return '';
  return html`<div class="work-view" role="group" aria-label="Selected work view">${VIEWS.map(([view, label]) => html`<button class="work-view__btn" type="button" data-view="${view}" aria-pressed="${view === 'frames' ? 'true' : 'false'}">${label}</button>`)}</div>`;
}

function indexRow(film, i, data) {
  const href = `project.html?slug=${encodeURIComponent(film.slug)}`;
  return html`
          <tr class="work-index__row" data-film="${film.slug}">${COLUMNS.map(([key, , cell]) => {
    if (!cell) return html`<th class="work-index__${key}" scope="row"><a class="work-index__link" href="${href}"><span class="work-index__title">${film.title}</span></a> ${badge(film, data)}</th>`;
    const v = cell(film, i);
    return html`<td class="work-index__${key}">${v == null || v === '' ? NONE : v}</td>`;
  })}</tr>`;
}

/** The pane's frame for a film: its featured real still, or its palette until mountWorkIndex paints the placeholder. */
function previewFrame(film) {
  const still = featuredStill(film), src = safeUrl(still?.src), set = srcsetOf(still);
  const ar = Number(still?.aspect) || Number(film.aspect) || 1.78;
  return html`<div class="work-index__shot frame" data-preview-frame data-film="${film.slug}" data-title="${film.title}" style="--ar:${ar}${src ? '' : `;background:${paletteBackground(cleanPalette(film.palette))}`}">${src
    ? html`<img src="${src}"${set ? html` srcset="${set}" sizes="${PANE_SIZES}"` : ''} alt="" loading="lazy" decoding="async">` : ''}</div>`;
}

/** The pane's meta line: the film's aspect, then its camera move (number and name). */
const previewMeta = film => [Number(film.aspect) ? aspectLabel(film.aspect) : '', film.move ? `${film.move} ${MOVE_NAMES[film.move] ?? ''}`.trim() : ''].filter(Boolean).join(' · ');

/** The index table, in the curated order (No 01–06 matches the strip), and the preview pane (the first film). */
export function renderWorkIndex(data) {
  const films = data.films ?? [];
  if (!films.length) return '';
  return html`
    <div class="work-index" data-work-index data-reveal>
      <div class="work-index__list">
        <table class="work-index__table">
          <caption class="visually-hidden">Selected work: ${films.length} ${films.length === 1 ? 'film' : 'films'}, one per row</caption>
          <thead><tr>${COLUMNS.map(([key, label]) => html`<th class="work-index__${key}" scope="col">${label}</th>`)}</tr></thead>
          <tbody>${films.map((f, i) => indexRow(f, i, data))}
          </tbody>
        </table>
      </div>
      <div class="work-index__preview" aria-hidden="true">
        <div class="work-index__gate">${previewFrame(films[0])}</div>
        <p class="work-index__logline">${films[0].logline}</p>
        <p class="work-index__meta cam-label">${previewMeta(films[0])}</p>
      </div>
    </div>`;
}

// --- In the browser ---------------------------------------------------------------------------------

/**
 * Wire the toggle (html[data-work-view], localStorage 'kc:work-view', kc:relayout) and the pane.
 * @param {HTMLElement|null} section  #work, once its markup is rendered
 */
export function mountWorkIndex(section, data) {
  const index = section?.querySelector('[data-work-index]');
  if (!index) return;
  const root = document.documentElement;
  const buttons = [...section.querySelectorAll('.work-view [data-view]')];
  const current = () => (root.dataset.workView === 'index' ? 'index' : 'frames');
  const press = () => { for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.view === current())); };
  press();
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const view = b.dataset.view;
      if (view === current()) return;
      // Where the toggle sits on screen: the desktop layer re-arms for the new layout and puts it back there.
      const keep = { el: b, off: b.getBoundingClientRect().top, y: scrollY };
      root.dataset.workView = view;
      try { localStorage.setItem(KEY, view); } catch { /* storage blocked: the choice lasts this visit */ }
      press();
      window.dispatchEvent(new CustomEvent('kc:relayout', { detail: { keep } }));
      if (document.activeElement !== b) b.focus({ preventScroll: true });
    });
  }
  mountPreview(index, data);
}

/** The pane follows the row under the pointer or keyboard focus, and keeps the last one. */
function mountPreview(index, data) {
  const pane = index.querySelector('.work-index__preview');
  const gate = pane?.querySelector('.work-index__gate');
  const body = index.querySelector('tbody');
  if (!gate || !body) return;
  const films = new Map((data.films ?? []).map(f => [f.slug, f]));
  const logline = pane.querySelector('.work-index__logline'), meta = pane.querySelector('.work-index__meta');
  const urls = new Map();   // slug → Promise of the procedural still's object URL (kept for the page's life)
  let still = null;         // pieces/still.js, loaded with the first placeholder
  let shown = gate.querySelector('[data-preview-frame]')?.dataset.film ?? null, want = shown;

  // The work card's picture (main.js): seed hashString(slug + 0), the first of stillKinds, at the frame's size.
  const urlOf = film => {
    if (!urls.has(film.slug)) {
      urls.set(film.slug, (async () => {
        still ??= import('../pieces/still.js').catch(err => { console.info('[work] procedural stills unavailable; palette frames stay', err?.message ?? err); return null; });
        const mod = await still;
        if (!mod?.renderStill) return null;
        const kinds = film.stillKinds?.length ? film.stillKinds : ['wide-ext'];
        const ar = Number(film.aspect) || 1.78, w = gate.clientWidth || 480;
        return mod.renderStill({ palette: cleanPalette(film.palette), aspect: ar, seed: hashString(film.slug + 0), kind: kinds[0], caption: false,
          cssWidth: Math.round(Math.min(w, w * 9 / 16 * ar)), dpr: Math.min(2, devicePixelRatio || 1) });
      })().catch(err => { console.warn('[work] preview still', film.slug, err); return null; }));
    }
    return urls.get(film.slug);
  };

  /** Make a frame ready to show: its real still decoded, or its placeholder still painted in (tagged). */
  const paint = async (frame, film) => {
    const real = frame.querySelector('img');
    if (real) { real.loading = 'eager'; await real.decode().catch(() => {}); return; }
    const url = await urlOf(film);
    if (!url || frame.querySelector('img')) return;
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.src = url;
    await img.decode().catch(() => {});
    frame.prepend(img);
    frame.insertAdjacentHTML('beforeend', '<span class="work-index__tag">Placeholder still</span>');
  };

  // The outgoing frame fades out over the incoming one (300 ms in work.css), then goes.
  const leave = el => {
    el.removeAttribute('data-preview-frame');
    el.classList.add('is-leaving');
    let done = false;
    const gone = () => { if (!done) { done = true; el.remove(); } };
    if (isReducedMotion()) { gone(); return; }
    el.addEventListener('transitionend', gone, { once: true });
    setTimeout(gone, 450);
  };

  const show = async slug => {
    const film = films.get(slug);
    if (!film || slug === want || !pane.getClientRects().length) return;   // hidden (Frames view, under 1100 px): nothing to swap
    want = slug;
    if (slug === shown) return;   // back on the film already showing: a swap still on its way is dropped
    const t = document.createElement('template');
    t.innerHTML = String(previewFrame(film));
    const next = t.content.firstElementChild;
    await paint(next, film);
    if (want !== slug) return;    // the pointer has moved on
    const cur = gate.querySelector('[data-preview-frame]');
    if (cur) { cur.before(next); leave(cur); } else gate.append(next);
    shown = slug;
    if (logline) logline.textContent = film.logline ?? '';
    if (meta) meta.textContent = previewMeta(film);
  };

  const rowOf = e => e.target.closest?.('tr[data-film]');
  body.addEventListener('pointerover', e => { const tr = rowOf(e); if (tr) show(tr.dataset.film); });
  body.addEventListener('focusin', e => { const tr = rowOf(e); if (tr) show(tr.dataset.film); });

  // A click on the picture opens the film it shows, through its row's link (the match cut and the shutter
  // see that link). The keyboard path is the link itself.
  gate.addEventListener('click', e => {
    const slug = gate.querySelector('[data-preview-frame]')?.dataset.film;
    const a = slug ? [...body.querySelectorAll('tr[data-film]')].find(tr => tr.dataset.film === slug)?.querySelector('.work-index__link') : null;
    a?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: e.button, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey }));
  });

  // Paint the first film's still once the pane is about to show (Index view, ≥ 1100 px), then the rest,
  // one at a time behind it (pieces/still.js paints serially), so a hover swaps at once.
  const prime = () => {
    const cur = gate.querySelector('[data-preview-frame]');
    const first = films.get(cur?.dataset.film);
    if (cur && first) paint(cur, first);
    for (const f of films.values()) if (!featuredStill(f)) urlOf(f);
  };
  if (typeof IntersectionObserver === 'undefined') { prime(); return; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); prime(); } }, { rootMargin: '600px 0px' });
  io.observe(pane);
}
