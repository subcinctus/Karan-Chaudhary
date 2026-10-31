// Film detail page (project.html?slug=…). Reads the film from data/portfolio.js and renders the
// camera report and credits, palette, the scene sequence, the frames (real stills, or procedural
// "PLACEHOLDER STILL" frames from pieces/still.js, or palette frames if that module is missing), the
// lighting plot, BTS and prev/next. Sets the page title, description, canonical URL, robots (sample
// films are not indexed) and CreativeWork JSON-LD. Unknown slug → a friendly not-found.
//
// The lead frame shows the same image as the film's work card and frame 01 (frame-card.js frameSeed:
// slug + 0), so a match cut from the index lands on the picture it started from; a real featured still
// is in the page from the first paint (render.js renderProject).

import data from '../../../data/portfolio.js';
import { applyPageGrain } from '../core/grain.js';
import { bindMotionToggle } from '../core/motion-pref.js';
import * as R from './render.js';
import { initShutter, openShutter } from './shutter.js';
import { initProgress } from './progress.js';
import { loadDesktopMotion } from './desktop.js';
import { recall, remember } from './place.js';
import { takeHandoff } from './match-cut.js';
import { frameItems, renderFrameCards, paintStill, paintGates } from './frame-card.js';
import { mountFilmExtras } from './film-facts.js';

const films = data.films ?? [];

/** "Logline. Short fiction, 2026. Director of Photography: Name." from the parts the film has (else the site's). */
function describe(film, site) {
  const name = data.person?.name;
  const parts = [film.logline, [film.format, film.year].filter(Boolean).join(', '), film.role && name && `${film.role}: ${name}`]
    .map(s => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.map(s => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(' ') : site.description;
}

function setMeta(film) {
  const site = data.site ?? {};
  const title = film ? `${film.title} — ${data.person?.name ?? ''}, ${film.role ?? 'Cinematographer'}` : `Film not found — ${data.person?.name ?? ''}`;
  const desc = film ? describe(film, site) : site.description;
  document.title = title;
  const set = (sel, attr, v) => document.querySelector(sel)?.setAttribute(attr, v);
  set('meta[name="description"]', 'content', desc);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', desc);
  if (film && site.url) {
    const url = new URL(`project.html?slug=${encodeURIComponent(film.slug)}`, site.url).href;
    set('link[rel="canonical"]', 'href', url);
    set('meta[property="og:url"]', 'content', url);
  }
  // A sample film is not a page for search engines (nor is a missing one).
  if (!film || film.placeholder) {
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
  }
}

/** New frames are in the page: the desktop layer gives them their entrances (motion/frames.js). */
const announce = scope => window.dispatchEvent(new CustomEvent('kc:content', { detail: { scope } }));

/**
 * Once an image is painted over the hand-off image (the work card's still that the match cut carried
 * in), the hand-off goes: decoded first, so the swap is never a flash.
 */
async function settleHandoff(img, handoff) {
  if (!img || !handoff) return;
  if (!img.complete) await new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  if (!img.naturalWidth) return;   // the still did not load: the hand-off stands in for it
  await img.decode?.().catch(() => {});
  handoff.remove();
}

/**
 * The frame lightbox (lightbox.js) is fetched on the first click on a frame, or a beat earlier when the
 * pointer or keyboard focus reaches one; never on the critical path (this module blocks rendering).
 * Once it has loaded it handles every [data-lightbox] button in root itself.
 */
function lazyLightbox(root, opts) {
  let ready = null;
  const load = () => (ready ??= import('./lightbox.js').then(m => {
    root.removeEventListener('click', first);
    return m.bindLightbox(root, opts);
  }).catch(err => { console.warn('[project] lightbox unavailable', err); return null; }));
  const warm = e => {
    if (!e.target.closest?.('[data-lightbox]')) return;
    root.removeEventListener('pointerover', warm); root.removeEventListener('focusin', warm);
    load();
  };
  async function first(e) {
    const button = e.target.closest?.('[data-lightbox][data-lightbox-index]');
    if (button) (await load())?.open(button);
  }
  root.addEventListener('pointerover', warm);
  root.addEventListener('focusin', warm);
  root.addEventListener('click', first);
}

async function boot() {
  applyPageGrain();
  initShutter();
  R.put(document.querySelector('[data-render="colophon"]'), R.renderColophon(data, { replay: false }));
  R.pruneSections(data);
  R.initChrome({ bindMotionToggle, solidAfter: () => -1 });

  const slug = new URLSearchParams(location.search).get('slug');
  const index = films.findIndex(f => f.slug === slug);
  const film = films[index];
  const main = document.querySelector('[data-project]');
  setMeta(film);

  if (!film) {
    R.put(main, R.renderNotFound(slug, data));
    openShutter();
    return;
  }
  const prev = films[(index - 1 + films.length) % films.length];
  const next = films[(index + 1) % films.length];
  R.put(main, R.renderProject(film, data, { prev: films.length > 1 ? prev : null, next: films.length > 1 ? next : null, index }));
  const hero = main.querySelector('[data-film-hero]');
  // The lead frame fits the first screen under the head (site.css --film-head): the head's height, measured
  // now (so a match cut lands on the frame's final size) and again whenever it changes (type, the window).
  const head = main.querySelector('.film__head');
  const fit = () => main.style.setProperty('--film-head', `${head.offsetHeight}px`);
  fit();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(head);
  const lead = R.featuredStill(film), leadImg = hero.querySelector('img');
  // Synchronously, before the first paint: a match cut from the index lands on this lead frame.
  const handoff = takeHandoff(film.slug, hero) ?? null;
  // A real still keeps its own aspect: the lead frame letterboxes it, never crops it.
  if (lead && Number(lead.aspect) > 0) hero.style.setProperty('--ar', Number(lead.aspect));
  if (!lead) hero.insertAdjacentHTML('beforeend', String(R.html`<span class="film__frame-cap badge-sample">Placeholder still</span>`));
  const frames = frameItems(film);
  const list = main.querySelector('[data-stills]');
  R.put(list, renderFrameCards(film));
  lazyLightbox(main, { film, data });
  R.setJsonLd('ld-film', R.creativeWorkLD(film, data));
  initProgress({ runtime: data.site?.timecodeRuntime ?? 180 });
  recall();
  remember();
  settleHandoff(leadImg, handoff);
  // On desktop the curtain waits a beat (≤ 0.25 s) for the motion layer, so the title's entrance can
  // play as it lifts; it never holds the page longer than that, and elsewhere it opens at once. A layer
  // that arms after the lift has begun treats the first screen as already seen.
  const motion = loadDesktopMotion({ page: 'project' });
  await Promise.race([motion, new Promise(r => setTimeout(r, 250))]);
  await openShutter();   // uncover first: painting stills must not hold the panel over the page
  announce(list);
  // The lead frame first (frame 01's image, painted at the lead frame's size), then each frame of the
  // grid, the sequence and the plot as it comes near.
  const painted = lead ? null : paintStill(hero, frames[0], { after: handoff }).then(img => settleHandoff(img, handoff));
  await Promise.all([painted, paintGates(list, frames), mountFilmExtras(main, film, data)]);
}

boot();
