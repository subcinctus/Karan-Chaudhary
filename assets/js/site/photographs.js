// Photographs: the owner's still photography in series, never frames from a film (the schools that ask for
// photographs exclude film frames, and tools/lib/schema.mjs fails a photograph that is also a film frame).
// Two renderers, pure string builders (Node-safe; import ./html.js, never ./render.js):
//   - renderPhotographsSection(data): the home page's teaser (the series, 4–6 photographs and a link to the
//     page); '' while there are none, so render.js pruneSections() keeps #photographs and its links hidden.
//     main.js and tools/prerender.mjs put it into index.html's #photographs.
//   - renderPhotographsPage(data, opts): photographs.html. Each series under its title, year and a Colour /
//     B&W tag; every photograph whole, at its own aspect (its width and height reserve the box, so nothing
//     moves as they load); no captions unless asked for; "No photographs yet." while there are none.
//     photographs-main.js renders it with the options in the URL (pageOptions), tools/prerender.mjs without.
// In print (assets/css/photographs.css) each photograph takes a page of its own, so the browser's "Save as
// PDF" makes the one-photograph-per-page file the schools ask for (APPLYING.md).
//
//   photographs.html?set=afi      only the photographs tagged for one school's set (afi, nyu, famu, lodz, bfa)
//   photographs.html?captions=1   each photograph's caption under it (or photographs.captions: true in the data)
//   photographs.html?cover=1      a cover page first: the name, the contact and the series

import { html, safeUrl, badge, hasPhotographs, scFor, sectionHead } from './html.js';
import { hashString } from '../core/prng.js';

/** The school sets a photograph can be tagged with (photo.sets), as ?set= names them. */
export const SETS = { afi: 'AFI', nyu: 'NYU', famu: 'FAMU', lodz: 'Łódź', bfa: 'Beijing Film Academy' };
const KINDS = { colour: 'Colour', bw: 'B&W' };
const count = n => `${n} photograph${n === 1 ? '' : 's'}`;

/**
 * photographs.html's options from its query string ('?set=afi&captions=1&cover=1'). A set the site does
 * not know is reported (badSet), never applied: a PDF made from it would hold every photograph.
 */
export function pageOptions(search = '') {
  const q = new URLSearchParams(search);
  const set = String(q.get('set') ?? '').trim().toLowerCase();
  const known = Object.hasOwn(SETS, set);
  return { set: known ? set : null, badSet: set && !known ? set : null, captions: q.get('captions') === '1', cover: q.get('cover') === '1' };
}

/**
 * The series that have photographs to show, in the data's order, each holding only its photographs with a
 * usable src (and, with `set`, only those tagged for it). `n` numbers the series as the data does (the
 * page's #series-n anchors), whatever the filter leaves out.
 */
export function photoSeries(data, { set = null } = {}) {
  return (data?.photographs?.series ?? []).map((s, i) => ({
    ...s, n: i + 1,
    photos: (s?.photos ?? []).filter(p => safeUrl(p?.src) && (!set || (Array.isArray(p.sets) && p.sets.includes(set)))),
  })).filter(s => s.photos.length);
}

/** Up to `max` photographs for the teaser, taken in turn from each series (every first one, then every second, …). */
export function teaserPhotos(series, max = 6) {
  const out = [];
  for (let i = 0; out.length < max && series.some(s => i < s.photos.length); i++) {
    for (const s of series) if (i < s.photos.length && out.length < max) out.push(s.photos[i]);
  }
  return out;
}

/** One photograph, whole: its width and height reserve the box at its own aspect before it loads. */
function photo(p, cls) {
  const w = Math.round(Number(p.w)), h = Math.round(Number(p.h));
  return html`<img class="${cls}" src="${safeUrl(p.src)}" alt="${p.alt ?? ''}"${w > 0 && h > 0 ? html` width="${w}" height="${h}"` : ''} loading="lazy" decoding="async">`;
}

const seriesMeta = s => [s.year, KINDS[s.kind]].filter(Boolean).join(' · ');

/** The home page's Photographs section: the series, 4–6 photographs and the way to the page. '' while there are none. */
export function renderPhotographsSection(data) {
  if (!hasPhotographs(data)) return '';
  const series = photoSeries(data);
  const total = series.reduce((n, s) => n + s.photos.length, 0);
  return html`
    ${sectionHead({ sc: scFor(data, 'photographs'), label: 'Photographs', title: 'Photographs', id: 'photographs-title', aside: `${count(total)} · ${series.length} series` })}
    <div class="photo-teaser" data-reveal>
      <ul class="photo-teaser__series" role="list">${series.map(s => html`
        <li><a href="photographs.html#series-${s.n}">${s.title}</a> <span class="cam-label">${seriesMeta(s)}</span></li>`)}
      </ul>
      <ul class="photo-teaser__strip" role="list">${teaserPhotos(series).map(p => html`
        <li class="photo-teaser__item">${photo(p, 'photo-teaser__img')}</li>`)}
      </ul>
      <p class="photo-teaser__more"><a class="btn btn--ghost" href="photographs.html">All photographs · print view <span aria-hidden="true">→</span></a></p>
    </div>`;
}

/**
 * The page's head: where it sits, the title, then what the view holds and the print button (it needs
 * JavaScript; photographs.css hides it without), or, with nothing to show yet, the way back to the work.
 */
function pageHead(data, { set, badSet, total, series, empty }) {
  return html`
    <header class="photos-head container">
      <p class="photos-head__slate cam-label"><a href="index.html">${data?.person?.name}</a><span aria-hidden="true">/</span><span>${['Photographs', set && `${SETS[set]} set`].filter(Boolean).join(' · ')}</span></p>
      <h1 class="photos-head__title" id="photographs-page-title">Photographs</h1>${empty ? html`
      <p class="photos-empty">No photographs yet.</p>
      <div class="photos-head__tools"><a class="btn btn--ghost" href="index.html#work">Selected work</a></div>` : html`
      ${total ? html`<p class="photos-head__meta cam-label">${count(total)} · ${series} series</p>` : ''}
      ${badSet ? html`<p class="photos-head__note">There is no set called “${badSet}” (the sets are ${Object.keys(SETS).join(', ')}): every photograph is shown.</p>` : ''}
      <div class="photos-head__tools">
        ${set || badSet ? html`<a class="btn btn--ghost" href="photographs.html">All photographs</a>` : ''}
        ${total ? html`<button class="btn" type="button" data-print>Print / Save as PDF</button>` : ''}
        <p class="photos-head__status cam-label" role="status" data-print-status></p>
      </div>`}
    </header>`;
}

/** The cover page (?cover=1): the name, the contact and the series, printed before the photographs. */
function coverPage(data, series, set) {
  const p = data?.person ?? {}, c = data?.contact ?? {};
  const mail = c.email ? safeUrl(`mailto:${c.email}`, { allowMail: true }) : null;
  const site = String(data?.site?.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return html`
    <section class="photos-cover container" aria-label="Cover page">
      <p class="photos-cover__kicker cam-label">Photographs${set ? ` · ${SETS[set]}` : ''}</p>
      <p class="photos-cover__name">${p.name}</p>
      <p class="photos-cover__role">${p.role}</p>
      <ul class="photos-cover__contact" role="list">
        ${mail ? html`<li><a href="${mail}">${c.email}</a></li>` : ''}${c.phone ? html`<li>${c.phone}</li>` : ''}${site ? html`<li>${site}</li>` : ''}
      </ul>
      ${badge(c, data, 'Sample contact')}
      <ol class="photos-cover__series" role="list">${series.map(s => html`
        <li><span class="photos-cover__title">${s.title}</span> <span class="cam-label">${[seriesMeta(s), count(s.photos.length)].filter(Boolean).join(' · ')}</span></li>`)}
      </ol>
    </section>`;
}

/** One series: its head, then its photographs in order. */
function seriesBlock(s, { captions }) {
  return html`
      <section class="photo-series" id="series-${s.n}" aria-labelledby="series-${s.n}-title">
        <header class="photo-series__head">
          <h2 class="photo-series__title" id="series-${s.n}-title">${s.title}</h2>
          <p class="photo-series__meta cam-label">${s.year ? html`<span>${s.year}</span>` : ''}${KINDS[s.kind] ? html`<span class="tag">${KINDS[s.kind]}</span>` : ''}<span>${count(s.photos.length)}</span></p>
          ${s.note ? html`<p class="photo-series__note">${s.note}</p>` : ''}
        </header>
        <ol class="photo-grid" role="list">${s.photos.map(p => html`
          <li class="photo"><figure class="photo__figure">${photo(p, 'photo__img')}${captions && p.caption ? html`<figcaption class="photo__caption">${p.caption}</figcaption>` : ''}</figure></li>`)}
        </ol>
      </section>`;
}

/**
 * photographs.html's content for the options (pageOptions; none: every photograph, as the prerender writes
 * it). An unknown set is reported and not applied. The root carries a key of the markup, so the page script
 * can tell whether the copy already in the page is this one (and leave its photographs loading).
 */
export function renderPhotographsPage(data, { set = null, captions = false, cover = false, badSet = null } = {}) {
  const known = set && Object.hasOwn(SETS, set) ? set : null;
  const on = { set: known, badSet: badSet ?? (set && !known ? String(set) : null) };
  let inner;
  if (!hasPhotographs(data)) inner = pageHead(data, { ...on, empty: true });
  else {
    const series = photoSeries(data, { set: known });
    const total = series.reduce((n, s) => n + s.photos.length, 0);
    const withCaptions = captions === true || data.photographs?.captions === true;
    inner = html`${pageHead(data, { ...on, total, series: series.length })}${cover && total ? coverPage(data, series, known) : ''}
    <div class="photos container">${total ? series.map(s => seriesBlock(s, { captions: withCaptions }))
      : html`
      <p class="photos-empty">No photographs are in the ${SETS[known]} set yet.</p>`}
    </div>`;
  }
  return html`<div class="photos-page" data-photos-key="${hashString(String(inner)).toString(36)}">${inner}</div>`;
}
