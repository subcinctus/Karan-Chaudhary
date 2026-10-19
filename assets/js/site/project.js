// Film detail page (project.html?slug=…). Reads the film from data/portfolio.js and renders the
// camera report, palette, frames (real stills, or procedural "PLACEHOLDER STILL" frames from
// pieces/still.js, or palette frames if that module is missing), BTS and prev/next. Sets the page
// title, description, canonical URL and CreativeWork JSON-LD. Unknown slug → a friendly not-found.

import data from '../../../data/portfolio.js';
import { applyPageGrain } from '../core/grain.js';
import { bindMotionToggle } from '../core/motion-pref.js';
import { hashString } from '../core/prng.js';
import * as R from './render.js';
import { initShutter, openShutter } from './shutter.js';
import { initProgress } from './progress.js';

const films = data.films ?? [];

function setMeta(film) {
  const site = data.site ?? {};
  const title = film ? `${film.title} — ${data.person?.name ?? ''}, ${film.role ?? 'Cinematographer'}` : `Film not found — ${data.person?.name ?? ''}`;
  const desc = film ? `${film.logline ?? ''} ${film.format ?? ''}, ${film.year ?? ''}. ${film.role ?? ''}: ${data.person?.name ?? ''}.`.trim() : site.description;
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
  if (!film) {
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
  }
}

/** Frames: real stills first; otherwise procedural placeholders (one per stillKinds entry). */
async function renderFrames(film, list, hero) {
  const real = (film.stills ?? []).filter(s => R.safeUrl(s?.src));
  if (real.length) {
    const lead = real.find(s => s.featured) ?? real[0];
    hero.innerHTML = String(R.html`<img src="${R.safeUrl(lead.src)}" alt="${lead.alt ?? ''}" decoding="async">`);
    R.put(list, R.html`${real.map(s => R.html`
      <li class="still"><figure>
        <div class="frame" style="--ar:${Number(s.aspect) || Number(film.aspect) || 1.78}"><img src="${R.safeUrl(s.src)}" alt="${s.alt ?? ''}" loading="lazy" decoding="async"></div>
        ${s.caption ? R.html`<figcaption class="cam-label">${s.caption}</figcaption>` : ''}
      </figure></li>`)}`);
    return;
  }

  const kinds = film.stillKinds?.length ? film.stillKinds : ['wide-ext', 'interior-practical', 'close-silhouette'];
  const pal = R.cleanPalette(film.palette);
  const aspect = Number(film.aspect) || 1.78;
  const cap = (i, kind) => R.html`<figcaption><span class="cam-label">Frame ${R.pad2(i + 1)} · ${String(kind).replace(/-/g, ' ')} · ${R.aspectLabel(aspect)}</span><span class="badge-sample">Placeholder still</span></figcaption>`;
  R.put(list, R.html`${kinds.map((k, i) => R.html`
    <li class="still"><figure>
      <div class="frame" style="--ar:${aspect};background:${R.paletteBackground(pal)}" data-still="${i}"></div>
      ${cap(i, k)}
    </figure></li>`)}`);
  hero.insertAdjacentHTML('beforeend', String(R.html`<span class="film__frame-cap badge-sample">Placeholder still</span>`));

  let still = null;
  try { still = await import('../pieces/still.js'); } catch (err) { console.info('[project] procedural stills unavailable; palette frames stay', err?.message ?? err); }
  if (!still?.renderStill) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  // Painting a still is synchronous canvas work: give the browser a frame between stills so
  // scrolling, the shutter and input never wait on a whole set of them.
  const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const draw = async (el, kind, seed, alt) => {
    try {
      await yieldFrame();
      // caption:false: the DOM "Placeholder still" badge labels these frames (readable, translatable).
      const url = await still.renderStill({ palette: pal, aspect, seed, kind, width: Math.round(el.clientWidth * dpr) || 1280, caption: false });
      const img = new Image();
      img.alt = alt; img.decoding = 'async'; img.src = url;
      el.prepend(img);
    } catch (err) { console.warn('[project] still', kind, err); }
  };
  await draw(hero, kinds[0], hashString(`${film.slug}hero`), `Placeholder frame for ${film.title}`);
  // The grid is below the fold: paint each frame as it comes near the viewport.
  const near = (el, fn) => {
    if (typeof IntersectionObserver === 'undefined') return fn();
    return new Promise(res => {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); res(fn()); } }, { rootMargin: '800px 0px' });
      io.observe(el);
    });
  };
  for (const el of list.querySelectorAll('[data-still]')) {
    const i = Number(el.dataset.still);
    await near(el, () => draw(el, kinds[i], hashString(film.slug + i), `Placeholder frame ${i + 1} for ${film.title}: ${String(kinds[i]).replace(/-/g, ' ')}`));
  }
}

async function boot() {
  applyPageGrain();
  initShutter();
  R.put(document.querySelector('[data-render="colophon"]'), R.renderColophon(data, { replay: false }));
  R.pruneReel(data);
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
  R.setJsonLd('ld-film', R.creativeWorkLD(film, data));
  initProgress({ runtime: data.site?.timecodeRuntime ?? 180 });
  await openShutter();   // uncover first: painting stills must not hold the panel over the page
  await renderFrames(film, main.querySelector('[data-stills]'), main.querySelector('[data-film-hero]'));
}

boot();
