// The section renderers shared by index.html and project.html, the header and menu lists, and the page
// chrome (header, menu sheet, anchors).
//
// The renderers are pure string builders that also run in Node: tools/prerender.mjs writes their output
// into the pages for crawlers and no-JS visitors, and the page scripts render the same markup again (no
// layout shift). The shared primitives (escaping, URL guards, formatters, the section head, JSON-LD)
// live in ./html.js and are re-exported here, so `import * as R from './render.js'` reaches them all.
// Blocks owned by the feature modules (work index, film facts, reel) are called from here in page
// order; those modules import ./html.js, never this file.

import {
  html, raw, safeUrl, srcsetOf, pad2, aspectLabel, fpsLabel, filled, badge, camReport, sectionHead, scFor, hiddenSections,
  hasReel, hasPrevisMedia, featuredStill, cleanPalette, paletteBackground, MOVE_NAMES, STUDY_LABEL,
} from './html.js';
import { renderWorkToggle, renderWorkIndex } from './work-index.js';
import { renderCrew, renderLaurels, renderReferences, renderEnquiries, renderSequenceShell, renderPlotShell } from './film-facts.js';
import { reelLabel, renderReelFallback } from './reel-data.js';
import { renderReelIndex } from './reel-index.js';

export * from './html.js';

export const studyAnchor = id => `study-${id}`;

// --- Header nav and menu sheet --------------------------------------------------------------

/** The home page's sections as the header and the menu sheet list them: [id, nav label, menu label]. Contact is the header's pill. */
const NAV = [
  ['reel', 'Reel', 'Reel'], ['work', 'Work', 'Selected work'], ['photographs', 'Photographs', 'Photographs'],
  ['studies', 'Studies', 'Studies'], ['previs', 'Previs', 'Previs'], ['about', 'About', 'About'],
  ['credits', 'Credits', 'Credits'], ['contact', null, 'Contact'],
];

/**
 * The header nav's list. Links are "#id" on the home page and "index.html#id" elsewhere (base). Sections
 * that wait for material are listed hidden, so pruneSections() can show them once the data has it.
 */
export function renderNav(data, { base = '' } = {}) {
  const off = hiddenSections(data);
  return html`<ul role="list">${NAV.filter(([, nav]) => nav).map(([id, nav]) => html`<li${off[id] ? raw(' hidden') : ''}><a href="${base}#${id}">${nav}</a></li>`)}</ul>`;
}

/** The menu sheet's list, each section with its scene number. */
export function renderMenu(data, { base = '' } = {}) {
  const off = hiddenSections(data);
  return html`<ol class="menu__list" role="list">${NAV.map(([id, , label]) => html`<li${off[id] ? raw(' hidden') : ''}><a href="${base}#${id}"><span class="cam-label" aria-hidden="true">Sc. ${scFor(data, id)}</span>${label}</a></li>`)}</ol>`;
}

/**
 * Sections that wait for real material (the reel, the photographs) stay hidden, with their header and
 * menu links, until data/portfolio.js has it, and the menu's scene labels follow (scFor): the first
 * thing under the name is the work, not an absence. Runs on the home page and on pages whose links
 * point at index.html#…; safe to run again.
 */
export function pruneSections(data) {
  const off = hiddenSections(data);
  for (const [id, hide] of Object.entries(off)) document.getElementById(id)?.toggleAttribute('hidden', hide);
  for (const a of document.querySelectorAll('.site-nav a[href*="#"], .menu__list a[href*="#"]')) {
    const id = a.hash.slice(1);
    if (id in off) (a.closest('li') ?? a).hidden = off[id];
    const sc = a.querySelector('.cam-label');
    if (sc) sc.textContent = `Sc. ${scFor(data, id)}`;
  }
}

// --- Index sections ---------------------------------------------------------------------

/** The reel, its label and its shot index; nothing at all until there is a playable reel. */
export function renderReel(data) {
  if (!hasReel(data)) return '';
  const r = data.reel ?? {};
  return html`
    ${sectionHead({ sc: scFor(data, 'reel'), label: 'Showreel', title: r.title || 'Showreel', id: 'reel-title', aside: reelLabel(r) })}
    <div class="reel" data-reveal>
      <div class="reel__frame frame" style="--ar:${16 / 9}" data-reel-frame>${renderReelFallback(data)}</div>
      <p class="reel__meta cam-label"><span>Showreel${r.runtime ? ` · ${r.runtime}` : ''}</span><span>Cinematography by ${data.person?.name ?? ''}</span>${badge(r, data)}</p>
    </div>
    ${renderReelIndex(data)}`;
}

/** Film card for the Selected work grid. The frame hosts the shot-language card (or a still). */
export function renderFilmCard(film, i, data) {
  const pal = cleanPalette(film.palette);
  const href = `project.html?slug=${encodeURIComponent(film.slug)}`;
  return html`
    <li class="work-card" data-reveal style="--ar:${Number(film.aspect) || 1.78}">
      <a class="work-card__link" href="${href}" aria-labelledby="film-${film.slug}-title" data-film="${film.slug}">
        <div class="work-card__gate">
          <div class="work-card__frame frame" data-card-frame style="background:${paletteBackground(pal)}">
            <span class="work-card__aspect" aria-hidden="true">${aspectLabel(film.aspect)}</span>
          </div>
        </div>
        <div class="work-card__text">
          <p class="work-card__slate cam-label"><span>${pad2(i + 1)}</span><span>${[film.year, film.format].filter(Boolean).join(' · ')}</span></p>
          <h3 class="work-card__title" id="film-${film.slug}-title">${film.title}</h3>
          <p class="work-card__role">${film.role}${filled(film.director) ? html` <span class="work-card__dir">· dir. ${film.director}</span>` : ''}</p>
          <p class="work-card__foot cam-label"><span>${film.move ? `${film.move} ${MOVE_NAMES[film.move] ?? ''}`.trim() : ''}</span>${badge(film, data)}</p>
        </div>
      </a>
    </li>`;
}

/** Selected work: the view toggle in the head, the frames, then the index table (one shows at a time). */
export function renderWork(data) {
  const films = data.films ?? [];
  const years = films.map(f => f.year).filter(Number.isFinite);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
  return html`
    ${sectionHead({ sc: scFor(data, 'work'), label: 'Selected work', title: 'Selected work', id: 'work-title', aside: `${films.length} films${span ? ` · ${span}` : ''}`,
      lede: 'Each frame is cropped to the aspect ratio the film was delivered in. Hover or focus a card to see the camera move that defines it.', tools: renderWorkToggle(data) })}
    <ol class="work-grid" role="list">${films.map((f, i) => renderFilmCard(f, i, data))}</ol>
    ${renderWorkIndex(data)}
    <p class="work-note cam-label" data-reveal>Camera moves: Motion Prompt #027 #030 #031 #032 #033 #043 by Shohei Ohtaki (MIT).</p>`;
}

const STUDY_COPY = {
  focus: { n: '01', lede: 'Choose a format, a focal length, a stop and a focus distance. The depth of field and the shape of the bokeh follow from the lens maths.' },
  light: { n: '02', lede: 'A plaster bust under classic portrait set-ups. Pick one and the lights move on the plan; then open the ratio or change the colour temperature.' },
  colour: { n: '03', lede: 'One scene-referred frame graded from Log C to finished looks. Drag the divider and read the scopes.' },
};

export function renderStudy(study, data) {
  const copy = STUDY_COPY[study.id] ?? { n: '', lede: '' };
  const extra = study.id === 'light'
    ? html`<figure class="study-plan" data-study-plan><svg id="index-light-plan" class="study-plan__svg" data-light-plan></svg><figcaption class="study-plan__cap"><p class="study-plan__note" data-light-note></p><dl class="report report--tight" data-light-report></dl></figcaption></figure>`
    : study.id === 'focus'
      ? html`<figure class="study-ruler" data-study-ruler><div class="study-ruler__frame focus-ruler__frame" data-dof-ruler></div><figcaption class="focus-readout" data-dof-readout></figcaption></figure>`
      : '';
  const credits = (study.credits ?? []).join(' ');
  return html`
    <article class="study-block study-block--${study.id}" id="${studyAnchor(study.id)}" aria-labelledby="${studyAnchor(study.id)}-title" data-study="${study.id}">
      <header class="study-block__head" data-reveal>
        <p class="cam-label">Study ${copy.n}</p>
        <h3 class="study-block__title" id="${studyAnchor(study.id)}-title">${study.title}</h3>
        <p class="tag study-block__kind">${STUDY_LABEL}</p>
        <p class="study-block__lede">${study.blurb || copy.lede}</p>
      </header>
      <div class="study-block__body">
        <div class="study-block__stage" data-study-host></div>
        ${extra}
        <aside class="study-block__panel" data-controls aria-label="${study.title} study controls"></aside>
      </div>
      <p class="study-block__foot cam-label">
        ${credits ? html`<span>Motion Prompt ${credits} (MIT)</span>` : ''}
        <a class="study-block__open" href="${safeUrl(study.href) ?? `studies/${study.id}.html`}">Open <span class="visually-hidden">the ${study.title} study </span>full screen <span aria-hidden="true">→</span></a>
      </p>
    </article>`;
}

export function renderStudies(data) {
  const studies = data.studies ?? [];
  return html`
    ${sectionHead({ sc: scFor(data, 'studies'), label: 'Studies', title: 'Focus / Light / Colour', id: 'studies-title', aside: 'Rendered live',
      lede: 'Three working studies, each rendered live in your browser from the maths a camera department uses.' })}
    ${studies.map(s => renderStudy(s, data))}`;
}

export function renderPrevisShell(data) {
  const p = data.previs ?? {};
  return html`
    ${sectionHead({ sc: scFor(data, 'previs'), label: 'Previs', title: String(p.heading || 'Virtual production / Previs').replace(/ \//g, ' /'), id: 'previs-title', aside: 'Unreal Engine · Sequencer',
      lede: hasPrevisMedia(data) ? p.intro : (p.introPending || p.intro) })}
    <ol class="previs-grid" role="list" data-previs-grid hidden></ol>`;
}

export function renderAbout(data) {
  const p = data.person ?? {};
  const bio = p.bio ?? {};
  const portrait = safeUrl(p.portrait?.src);
  const facts = [
    ['Name', p.name], ['Role', (p.roles ?? [p.role]).filter(Boolean).join(' / ')], ['Based', filled(p.base)], ['Status', p.availability],
  ];
  const edu = (p.education ?? []).filter(e => filled(e.school));
  // The owner's own list of films (FAMU asks for ten): text only, shown once there is one.
  const films = (p.tenFilms ?? []).filter(f => f?.title);
  return html`
    ${sectionHead({ sc: scFor(data, 'about'), label: 'About & approach', title: 'About', id: 'about-title' })}
    <div class="about">
      <div class="about__lead" data-reveal>
        ${portrait ? html`<figure class="about__portrait frame" style="--ar:0.8"><img src="${portrait}" alt="${p.portrait?.alt ?? ''}" loading="lazy" decoding="async"></figure>` : ''}
        <p class="about__short">${bio.short}</p>
        ${badge(p, data, 'Sample bio')}
      </div>
      <div class="about__body" data-reveal>
        ${(bio.long ?? []).map(t => html`<p>${t}</p>`)}
        ${camReport(facts)}
        ${edu.length ? html`<div class="about__edu"><p class="cam-label">Education</p><ul role="list">${edu.map(e => html`<li><span class="about__school">${e.school}</span> <span class="about__prog">${[e.programme, e.years].filter(Boolean).join(' · ')}</span> ${badge(e, data)}</li>`)}</ul></div>` : ''}
        ${films.length ? html`<div class="about__films"><p class="cam-label">${films.length === 10 ? 'Ten films' : 'Reference films'}</p><ul role="list">${films.map(f => html`<li><span class="about__film">${f.title}</span> <span class="about__prog">${[f.year, filled(f.dp) && `DP ${f.dp}`, f.note].filter(Boolean).join(' · ')}</span></li>`)}</ul></div>` : ''}
      </div>
    </div>
    <h3 class="approach-title" data-reveal>Approach</h3>
    <ol class="approach" role="list">
      ${(p.approach ?? []).map((a, i) => html`
        <li class="approach__item" data-reveal>
          <p class="approach__n cam-label">${pad2(i + 1)}</p>
          <h4 class="approach__head">${a.title}</h4>
          <p class="approach__text">${a.text}</p>
          ${a.study ? html`<a class="approach__link" href="#${studyAnchor(a.study)}" data-study-link="${a.study}" ${a.preset ? html`data-study-preset="${a.preset}"` : ''}>See it in the ${cap(a.study)} study${a.preset ? ` · ${presetName(a.preset)}` : ''} <span aria-hidden="true">→</span></a>` : ''}
        </li>`)}
    </ol>
    ${badge(p, data) ? html`<p class="approach__note cam-label" data-reveal>${badge(p, data, 'Sample approach')}</p>` : ''}`;
}
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const presetName = id => cap(String(id).replace(/[-_]/g, ' '));

export function renderKit(data) {
  const k = data.kit ?? {};
  const table = (title, groups = []) => html`
    <div class="kit__col" data-reveal>
      <h3 class="kit__title cam-label">${title}</h3>
      <dl class="kit__list">${groups.map(g => html`<div class="kit__row"><dt>${g.group}</dt><dd>${(g.items ?? []).join(' · ')}</dd></div>`)}</dl>
    </div>`;
  return html`
    ${sectionHead({ sc: scFor(data, 'kit'), label: 'Kit', title: 'Kit', id: 'kit-title', aside: k.placeholder ? '' : 'Camera report', lede: '' })}
    <div class="kit">${table('Owned', k.owned)}${table('Experienced with', k.experienced)}</div>
    ${badge(k, data) ? html`<p class="kit__note cam-label" data-reveal>${badge(k, data, 'Sample kit list')}</p>` : ''}`;
}

export function renderCredits(data) {
  const list = data.credits ?? [];
  const p = data.person ?? {};
  return html`
    <div class="credits__mask credits__mask--top" aria-hidden="true"></div>
    <div class="credits__roll">
      <h2 class="credits__heading display-caps" id="credits-title">Filmography</h2>
      <ol class="credits__list" role="list">
        ${list.map(c => html`
          <li class="credits__row">
            <span class="credits__role">${c.role}</span>
            <span class="credits__name"><span class="credits__film">${c.title}</span><span class="credits__meta">${[c.kind, c.year, filled(c.director) && `Dir. ${c.director}`].filter(Boolean).join(' · ')}</span>${badge(c, data)}</span>
          </li>`)}
      </ol>
      <div class="credits__end">
        <p class="credits__role">Photographed by</p>
        <p class="credits__signature display-caps">${p.name}</p>
      </div>
    </div>
    <div class="credits__mask credits__mask--bottom" aria-hidden="true"></div>`;
}

export function renderContact(data) {
  const c = data.contact ?? {};
  const mail = c.email ? safeUrl(`mailto:${c.email}`, { allowMail: true }) : null;
  const socials = (c.socials ?? []).map(s => ({ ...s, href: safeUrl(s.url) })).filter(s => s.href);
  const cv = safeUrl(c.cv);
  const p = data.person ?? {};
  const band = [p.availability, p.role, p.name].filter(Boolean);
  return html`
    ${band.length ? html`<div class="marquee" data-marquee aria-hidden="true"><div class="marquee__track"><span class="marquee__unit">${band.map(t => html`<span>${t}</span><i>·</i>`)}</span></div></div>` : ''}
    <div class="contact" data-reveal>
      <p class="cam-label">Sc. ${scFor(data, 'contact')} · Contact</p>
      <h2 class="contact__title" id="contact-title">${c.heading || 'Contact'}</h2>
      <p class="contact__avail">${data.person?.availability}${filled(data.person?.base) ? ` · ${data.person.base}` : ''}</p>
      ${mail ? html`<p class="contact__mail"><a href="${mail}">${c.email}</a></p>` : ''}
      <ul class="contact__links" role="list">
        ${c.phone ? html`<li><a href="${safeUrl(`tel:${String(c.phone).replace(/[^+\d]/g, '')}`, { allowMail: true }) ?? '#contact'}">${c.phone}</a></li>` : ''}
        ${c.representation ? html`<li>${c.representation}</li>` : ''}
        ${socials.map(s => html`<li><a href="${s.href}" rel="me noopener">${s.label}</a></li>`)}
        ${cv ? html`<li><a href="${cv}">CV (PDF)</a></li>` : ''}
      </ul>
      ${badge(c, data, 'Sample contact')}
    </div>`;
}

export function renderColophon(data, { replay = true } = {}) {
  const col = data.colophon ?? {};
  const footage = hasReel(data) || hasPrevisMedia(data);
  const unconfirmed = col.confirmed !== true && data?.site?.showPlaceholderBadges !== false;
  const credit = c => {
    if (typeof c === 'string') return html`<li>${c}</li>`;
    const links = (c?.links ?? []).map(l => ({ ...l, href: safeUrl(l?.href) })).filter(l => l.href);
    return html`<li>${c?.text ?? ''}${links.length ? html` ${links.map((l, i) => html`${i ? ' · ' : ''}<a href="${l.href}"${/^https?:/.test(l.href) ? raw(' rel="noopener"') : ''}>${l.label ?? l.href}</a>`)}` : ''}</li>`;
  };
  return html`
    <div class="colophon">
      <div class="colophon__text">
        <p class="cam-label">Colophon · How this site was made</p>
        <p class="colophon__lead">${col.text}${footage ? ' The reel and the previs renders are camera and engine footage.' : ''}</p>
        ${unconfirmed ? html`<p class="colophon__flag"><span class="badge-sample" title="The owner has not yet confirmed this disclosure: data/portfolio.js colophon.confirmed">To confirm</span></p>` : ''}
        <ul class="colophon__credits" role="list">${(col.credits ?? []).map(credit)}</ul>
      </div>
      <div class="colophon__tools">
        ${replay ? html`<button class="btn btn--ghost" type="button" data-replay-titles>Replay titles</button>` : html`<a class="btn btn--ghost" href="index.html">Home</a>`}
        <button class="btn btn--ghost" type="button" data-motion-toggle>Motion off</button>
        <p class="colophon__mark cam-label">© ${data.person?.name ?? ''}</p>
      </div>
    </div>`;
}

// --- Project page ---------------------------------------------------------------------------

const MADE_AT = { school: 'School', independent: 'Independent', commissioned: 'Commissioned' };
/** { type, name?, note? } → "School · name · note" / "Independent" / "Commissioned · client"; template text left out. */
function madeAtLine(m) {
  if (!MADE_AT[m?.type]) return null;
  return [MADE_AT[m.type], filled(m.name), filled(m.note)].filter(Boolean).join(' · ');
}
/** 'none' → "None"; otherwise the owner's own words about what AI did on the film. */
const aiUseLine = v => (typeof v !== 'string' || !v.trim() ? null : v.trim().toLowerCase() === 'none' ? 'None' : v.trim());
/** { event, year, url? } → "Event · 2026", linked when there is a URL. */
function premiereLine(p) {
  const text = [filled(p?.event), p?.year].filter(Boolean).join(' · ');
  if (!text) return null;
  const href = safeUrl(p.url);
  return href ? html`<a href="${href}" rel="noopener">${text}</a>` : text;
}

/** Camera-report rows for a film. Made at, Premiere and AI use show only once the owner fills them. */
export function filmReport(f) {
  const lens = f.lenses ?? {}, cam = f.camera ?? {};
  return [
    ['Role', f.role], ['Director', filled(f.director)], ['Production', filled(f.production)], ['Made at', madeAtLine(f.madeAt)],
    ['Format', f.format], ['Runtime', f.runtime], ['Premiere', premiereLine(f.premiere)],
    ['Camera', cam.body], ['Mode', cam.mode], ['Codec', cam.codec],
    ['Lenses', [lens.set, lens.range].filter(Boolean).join(' · ')], ['Anamorphic', lens.anamorphic ? 'Yes' : null], ['Filtration', lens.filtration],
    ['Aspect', f.aspect ? aspectLabel(f.aspect) : null], ['Frame rate', f.frameRate ? fpsLabel(f.frameRate) : null],
    ['Camera move', f.move ? `${f.move} ${MOVE_NAMES[f.move] ?? ''}`.trim() : null],
    ['AI use', aiUseLine(f.aiUse)],
  ];
}

/**
 * The film page, in order: head → lead frame → report and credits | lighting, palette, laurels,
 * watch, enquiries → sequence → frames → lighting plot → references → BTS → pager. A real featured
 * still is in the lead frame from the first paint; procedural frames are painted by project.js.
 */
export function renderProject(film, data, { prev, next, index }) {
  const pal = cleanPalette(film.palette);
  const watch = safeUrl(film.watch);
  const bts = (film.bts ?? []).filter(b => safeUrl(b?.src));
  const lead = featuredStill(film);
  const leadSet = srcsetOf(lead);
  return html`
    <article class="film" aria-labelledby="film-title" style="--ar:${Number(film.aspect) || 1.78}">
      <header class="film__head container">
        <p class="film__slate cam-label"><a href="index.html#work">Selected work</a><span aria-hidden="true">/</span><span>${[pad2(index + 1), film.year, film.format].filter(Boolean).join(' · ')}</span>${badge(film, data)}</p>
        <h1 class="film__title" id="film-title">${film.title}</h1>
        <p class="film__logline">${film.logline}</p>
      </header>
      <div class="film__hero container"><div class="film__frame frame" data-film-hero style="background:${paletteBackground(pal)}">${lead ? html`<img src="${safeUrl(lead.src)}"${leadSet ? html` srcset="${leadSet}" sizes="100vw"` : ''} alt="${lead.alt ?? ''}" decoding="async" fetchpriority="high">` : ''}</div></div>
      <div class="film__body container">
        <div class="film__facts">
          <section class="film__report" aria-labelledby="report-title">
            <h2 class="cam-label film__h" id="report-title">Camera report</h2>
            ${camReport(filmReport(film))}
          </section>
          ${renderCrew(film, data)}
        </div>
        <section class="film__notes" aria-labelledby="light-title">
          <h2 class="cam-label film__h" id="light-title">Lighting</h2>
          <p class="film__lighting">${film.lighting}</p>
          <h2 class="cam-label film__h" id="palette-title">Palette</h2>
          <ul class="palette" role="list" aria-labelledby="palette-title">
            ${pal.map(c => html`<li class="palette__chip"><span class="palette__swatch" style="background:${c}"></span><span class="palette__hex">${c.toUpperCase()}</span></li>`)}
          </ul>
          ${renderLaurels(film, data)}
          ${watch ? html`<p class="film__watch"><a class="btn" href="${watch}" rel="noopener">Watch the film <span aria-hidden="true">↗</span></a></p>` : ''}
          ${renderEnquiries(film, data)}
        </section>
      </div>
      ${renderSequenceShell(film, data)}
      <section class="film__stills container" aria-labelledby="stills-title">
        <h2 class="cam-label film__h" id="stills-title">Frames</h2>
        <ul class="stills" role="list" data-stills></ul>
      </section>
      ${renderPlotShell(film, data)}
      ${renderReferences(film, data)}
      ${bts.length ? html`
        <section class="film__bts container" aria-labelledby="bts-title">
          <h2 class="cam-label film__h" id="bts-title">Behind the scenes</h2>
          <ul class="stills stills--bts" role="list">${bts.map(b => html`<li class="still"><figure><div class="frame" style="--ar:${Number(b.aspect) || 1.5}"><img src="${safeUrl(b.src)}" alt="${b.alt ?? ''}" loading="lazy" decoding="async"></div>${b.caption ? html`<figcaption class="cam-label">${b.caption}</figcaption>` : ''}</figure></li>`)}</ul>
        </section>` : ''}
      <nav class="film__pager container" aria-label="More films">
        ${prev ? html`<a class="film__pager-link film__pager-link--prev" href="project.html?slug=${encodeURIComponent(prev.slug)}"><span class="cam-label">← Previous</span><span class="film__pager-title">${prev.title}</span></a>` : html`<span></span>`}
        <a class="film__pager-all cam-label" href="index.html#work">All work</a>
        ${next ? html`<a class="film__pager-link film__pager-link--next" href="project.html?slug=${encodeURIComponent(next.slug)}"><span class="cam-label">Next →</span><span class="film__pager-title">${next.title}</span></a>` : html`<span></span>`}
      </nav>
    </article>`;
}

export function renderNotFound(slug, data) {
  return html`
    <section class="film-missing container" aria-labelledby="missing-title">
      <p class="cam-label">Scene missing · Take 1 · NG</p>
      <h1 class="film-missing__title" id="missing-title">This film isn’t in the cut.</h1>
      <p class="film-missing__text">${slug ? html`There is no film called “<span class="mono">${slug}</span>”.` : 'No film was named in the link.'} It may have been renamed. Here is everything that is:</p>
      <ul class="film-missing__list" role="list">
        ${(data.films ?? []).map(f => html`<li><a href="project.html?slug=${encodeURIComponent(f.slug)}">${f.title}</a> <span class="cam-label">${f.year} · ${f.format}</span></li>`)}
      </ul>
      <p><a class="btn" href="index.html#work">Back to selected work</a></p>
    </section>`;
}

// --- JSON-LD (the builders are in ./html.js) ----------------------------------------------------

/** Insert (or replace) a JSON-LD script; `<` is escaped so the JSON cannot close the tag. */
export function setJsonLd(id, obj) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = id; document.head.append(el); }
  el.textContent = JSON.stringify(obj).replace(/</g, '\\u003c');
}

// --- Page chrome (header, menu sheet, motion toggles), shared by index.html and project.html ------

/**
 * Wire the fixed header: solid background once the page has scrolled past `solidAfter()` px, the
 * phone "Menu" sheet (a modal <dialog>: focus trap and Esc for free), current-section highlighting
 * and every [data-motion-toggle] button.
 * @param {{ bindMotionToggle: Function, solidAfter?: () => number }} o
 */
export function initChrome({ bindMotionToggle, solidAfter = () => 8 }) {
  const root = document.documentElement;
  const header = document.querySelector('[data-header]');
  for (const b of document.querySelectorAll('[data-motion-toggle]')) bindMotionToggle(b);

  // Solid header after the hero.
  let raf = 0;
  const solid = () => { raf = 0; root.classList.toggle('header-solid', scrollY > solidAfter()); };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(solid); }, { passive: true });
  addEventListener('resize', solid, { passive: true });
  solid();

  // Menu sheet.
  const menu = document.querySelector('[data-menu]');
  const open = document.querySelector('[data-menu-open]');
  if (menu && open && typeof menu.showModal === 'function') {
    const setOpen = v => { open.setAttribute('aria-expanded', String(v)); root.classList.toggle('menu-open', v); };
    let via = null;   // the link that closed the sheet, if any
    open.addEventListener('click', () => { via = null; menu.showModal(); setOpen(true); });
    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close());
    menu.addEventListener('close', () => {
      setOpen(false);
      const a = via; via = null;
      // Esc, Close or the backdrop: back to the Menu button. A same-page link: focus lands on the
      // section it scrolled to, so the next Tab continues from there instead of the header.
      const target = a && a.pathname === location.pathname && a.hash ? document.getElementById(decodeURIComponent(a.hash.slice(1))) : null;
      if (!a) open.focus({ preventScroll: true });
      else if (target) requestAnimationFrame(() => {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      });
    });
    menu.addEventListener('click', e => {
      if (e.target === menu) menu.close();                 // backdrop
      const a = e.target.closest('a[href]');
      if (a) { via = a; menu.close(); }                    // then the link navigates / scrolls
    });
    // A wide window never shows the sheet.
    matchMedia('(min-width: 900px)').addEventListener?.('change', e => { if (e.matches && menu.open) menu.close(); });
  }

  // Current section in the nav.
  const links = [...(header?.querySelectorAll('.site-nav a[href*="#"]') ?? [])];
  const byId = new Map(links.map(a => [a.hash.slice(1), a]));
  const sections = [...byId.keys()].map(id => document.getElementById(id)).filter(Boolean);
  if (sections.length && typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const a = byId.get(e.target.id);
        if (!a) continue;
        if (e.isIntersecting) { links.forEach(l => l.removeAttribute('aria-current')); a.setAttribute('aria-current', 'true'); }
        else if (a.getAttribute('aria-current')) a.removeAttribute('aria-current');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));
  }
}

/**
 * Keep in-page anchor jumps honest while the page below is still growing (study players, plans and
 * controls mount as they come near, so a section can move down during a smooth scroll). When the
 * scroll ends, re-aim at the target if it is no longer at the top; at most a few times, and never
 * against the visitor (any wheel, touch or key press cancels it).
 */
export function initAnchorAim() {
  let token = 0;
  const cancel = () => { token++; };
  for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, cancel, { passive: true });
  const ended = () => new Promise(res => {
    let t = 0;
    const done = () => { clearTimeout(t); removeEventListener('scrollend', done); res(); };
    if ('onscrollend' in window) addEventListener('scrollend', done);
    t = setTimeout(done, 1600);   // no scrollend (Safari), or no scroll at all
  });
  async function aim(el) {
    const my = ++token;
    for (let i = 0; i < 4; i++) {
      await ended();
      if (my !== token) return;
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const off = el.getBoundingClientRect().top - pad;
      if (Math.abs(off) < 6) return;
      el.scrollIntoView({ block: 'start' });
    }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href*="#"]');
    if (!a || a.pathname !== location.pathname || !a.hash || e.defaultPrevented || e.button) return;
    let el = null;
    try { el = document.getElementById(decodeURIComponent(a.hash.slice(1))); } catch { return; }
    if (el) requestAnimationFrame(() => aim(el));
  });
  return aim;
}

/** Jump to location.hash once JS-rendered content exists (the browser tried before it did). */
export function settleHash() {
  if (!location.hash) return;
  let el = null;
  try { el = document.querySelector(decodeURIComponent(location.hash)); } catch { return; }
  el?.scrollIntoView({ block: 'start' });
}
