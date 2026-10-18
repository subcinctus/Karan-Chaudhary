// Escaping templates and the section renderers shared by index.html and project.html.
//
// Every string that comes from data/portfolio.js goes through esc(): the html`` tag escapes each
// interpolated value unless it is wrapped in raw() (only for markup built by this module).
// URLs go through safeUrl(): relative paths, https:, http: and mailto: only; never a leading "/".

// --- Escaping ---------------------------------------------------------------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
/** Escape text for HTML text and attribute positions. null/undefined → ''. */
export const esc = v => (v == null ? '' : String(v).replace(/[&<>"'`]/g, c => ESC[c]));

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Mark trusted markup (built here) so html`` does not escape it. */
export const raw = s => (s instanceof Raw ? s : new Raw(String(s ?? '')));

function part(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}
/** Tagged template: interpolations are escaped; arrays are joined; raw() passes through. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/**
 * Make a data URL safe for href/src. Relative paths (no leading "/", no "//"), https:, http: and
 * mailto: are allowed; everything else (javascript:, data:, root-relative) returns null.
 */
export function safeUrl(u, { allowMail = false } = {}) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (!s || s.startsWith('/') || s.startsWith('\\')) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return s;   // relative
  const p = scheme[1].toLowerCase();
  if (p === 'https' || p === 'http') return s;
  if ((p === 'mailto' || p === 'tel') && allowMail) return s;
  return null;
}

// --- Small formatters ----------------------------------------------------------------

export const pad2 = n => String(n).padStart(2, '0');
/** 2.39 → "2.39:1", 1.33 → "1.33:1" (4:3 shown as written in the data). */
export const aspectLabel = a => `${Number(a).toFixed(2)}:1`;
/** fps → "24 fps" / "23.976 fps". */
export const fpsLabel = f => `${+Number(f).toFixed(3)} fps`;
/** Slate object → "A-CAM · 40mm · T2.0 · 5600K · 24 fps · 2.39:1". */
export function slateLine(s = {}) {
  return [s.cam, s.lens, s.stop, s.kelvin && `${s.kelvin}K`, s.fps && `${s.fps} fps`, s.aspect].filter(Boolean).join(' · ');
}
export const studyAnchor = id => `study-${id}`;

/** Visible SAMPLE badge for placeholder records (when the site switch allows it). */
export function badge(rec, data, label = 'Sample') {
  if (!rec?.placeholder || data?.site?.showPlaceholderBadges === false) return '';
  return html`<span class="badge-sample" title="Placeholder content: replace it in data/portfolio.js">${label}</span>`;
}

/** Camera-report rows: [[label, value], …] → <dl>. Empty values are skipped. */
export function camReport(rows, cls = 'report') {
  const items = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  return html`<dl class="${cls}">${items.map(([k, v]) => html`<div class="${cls}__row"><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

/** Section header used by every index section: slate line + h2. */
export function sectionHead({ sc, label, title, id, aside = '', lede = '' }) {
  return html`
    <header class="section-head" data-reveal>
      <p class="section-head__slate cam-label"><span>Sc. ${sc}</span><span class="section-head__rule" aria-hidden="true"></span><span>${label}</span>${aside ? html`<span class="section-head__aside">${aside}</span>` : ''}</p>
      <h2 class="section-head__title" id="${id}">${title}</h2>
      ${lede ? html`<p class="section-head__lede">${lede}</p>` : ''}
    </header>`;
}

// --- Palette placeholders (used until pieces/still.js or shotcard.js exist) ---------------------

/** CSS background for a film's palette when no still and no card piece is available. */
export function paletteBackground(p = []) {
  const [a = '#0C0D10', b = '#1E2127', c = '#8A857C', d = '#B9B3A8'] = p;
  return `radial-gradient(60% 80% at 68% 58%, ${c}55 0%, transparent 60%), radial-gradient(30% 40% at 70% 56%, ${d}40 0%, transparent 70%), linear-gradient(180deg, ${a} 0%, ${b} 62%, ${a} 100%)`;
}
const HEX = /^#[0-9a-f]{6}$/i;
export const cleanPalette = p => (Array.isArray(p) ? p.filter(c => HEX.test(c)) : []);

// --- Index sections ---------------------------------------------------------------------

export function renderReel(data) {
  const r = data.reel ?? {};
  const s = data.person?.slate ?? {};
  return html`
    ${sectionHead({ sc: '01', label: 'Showreel', title: r.title || 'Showreel', id: 'reel-title', aside: r.runtime ? `Runtime ${r.runtime}` : '' })}
    <div class="reel" data-reveal>
      <div class="reel__frame frame" style="--ar:${r.provider ? 16 / 9 : 2.39}" data-reel-frame></div>
      <p class="reel__meta cam-label"><span>Showreel${r.runtime ? ` · ${r.runtime}` : ''}</span><span>Cinematography by ${data.person?.name ?? ''}</span>${r.provider ? badge(r, data) : ''}</p>
    </div>`;
}

/** Motion Prompt camera moves used by the shot-language cards (and the previs shot list). */
export const MOVE_NAMES = { '#027': 'Dolly in', '#030': 'Orbit', '#031': 'Crane up', '#032': 'Dolly zoom', '#033': 'Rack focus', '#043': 'Whip pan' };

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
          <p class="work-card__role">${film.role}${film.director ? html` <span class="work-card__dir">· dir. ${film.director}</span>` : ''}</p>
          <p class="work-card__foot cam-label"><span>${film.move ? `${film.move} ${MOVE_NAMES[film.move] ?? ''}`.trim() : ''}</span>${badge(film, data)}</p>
        </div>
      </a>
    </li>`;
}

export function renderWork(data) {
  const films = data.films ?? [];
  const years = films.map(f => f.year).filter(Number.isFinite);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
  return html`
    ${sectionHead({ sc: '02', label: 'Selected work', title: 'Selected work', id: 'work-title', aside: `${films.length} films${span ? ` · ${span}` : ''}`,
      lede: 'Each frame is cropped to the aspect ratio the film was delivered in. Hover or focus a card to see the camera move that defines it.' })}
    <ol class="work-grid" role="list">${films.map((f, i) => renderFilmCard(f, i, data))}</ol>
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
        <p class="study-block__lede">${study.blurb || copy.lede}</p>
      </header>
      <div class="study-block__body">
        <div class="study-block__stage" data-study-host></div>
        ${extra}
        <aside class="study-block__panel" data-controls aria-label="${study.title} study controls"></aside>
      </div>
      <p class="study-block__foot cam-label">
        ${credits ? html`<span>Motion Prompt ${credits} (MIT)</span>` : ''}
        <a class="study-block__open" href="${safeUrl(study.href) ?? `studies/${study.id}.html`}">Open full screen <span aria-hidden="true">→</span></a>
      </p>
    </article>`;
}

export function renderStudies(data) {
  const studies = data.studies ?? [];
  return html`
    ${sectionHead({ sc: '03', label: 'Studies', title: 'Focus / Light / Colour', id: 'studies-title', aside: 'Rendered live',
      lede: 'Three working studies, each rendered live in your browser from the maths a camera department uses. They are how I think about the job.' })}
    ${studies.map(s => renderStudy(s, data))}`;
}

export function renderPrevisShell(data) {
  const p = data.previs ?? {};
  return html`
    ${sectionHead({ sc: '04', label: 'Previs', title: p.heading || 'Virtual production / Previs', id: 'previs-title', aside: 'Unreal Engine · Sequencer', lede: p.intro })}
    <ol class="previs-grid" role="list" data-previs-grid hidden></ol>`;
}

export function renderAbout(data) {
  const p = data.person ?? {};
  const bio = p.bio ?? {};
  const portrait = safeUrl(p.portrait?.src);
  const facts = [
    ['Name', p.name], ['Role', (p.roles ?? [p.role]).filter(Boolean).join(' / ')], ['Based', p.base], ['Status', p.availability],
  ];
  const edu = (p.education ?? []).filter(e => e.school);
  return html`
    ${sectionHead({ sc: '05', label: 'About & approach', title: 'About', id: 'about-title' })}
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
      </div>
    </div>
    <h3 class="approach-title" data-reveal>Approach</h3>
    <ol class="approach" role="list">
      ${(p.approach ?? []).map((a, i) => html`
        <li class="approach__item" data-reveal>
          <p class="approach__n cam-label">${pad2(i + 1)}</p>
          <h4 class="approach__head">${a.title}</h4>
          <p class="approach__text">${a.text}</p>
          ${a.study ? html`<a class="approach__link" href="#${studyAnchor(a.study)}" data-study-link="${a.study}" ${a.preset ? raw(`data-study-preset="${esc(a.preset)}"`) : ''}>See it in the ${cap(a.study)} study${a.preset ? ` · ${presetName(a.preset)}` : ''} <span aria-hidden="true">→</span></a>` : ''}
        </li>`)}
    </ol>`;
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
    ${sectionHead({ sc: '06', label: 'Kit', title: 'Kit', id: 'kit-title', aside: k.placeholder ? '' : 'Camera report', lede: '' })}
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
            <span class="credits__name"><span class="credits__film">${c.title}</span><span class="credits__meta">${[c.kind, c.year, c.director && `Dir. ${c.director}`].filter(Boolean).join(' · ')}</span>${badge(c, data)}</span>
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
  return html`
    <div class="contact" data-reveal>
      <p class="cam-label">Sc. 07 · Contact</p>
      <h2 class="contact__title" id="contact-title">Let’s make something.</h2>
      <p class="contact__avail">${data.person?.availability}${data.person?.base ? ` · ${data.person.base}` : ''}</p>
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
  return html`
    <div class="colophon">
      <div class="colophon__text">
        <p class="cam-label">Colophon · How this site was made</p>
        <p class="colophon__lead">${col.text}</p>
        <ul class="colophon__credits" role="list">${(col.credits ?? []).map(t => html`<li>${t}</li>`)}</ul>
      </div>
      <div class="colophon__tools">
        ${replay ? html`<button class="btn btn--ghost" type="button" data-replay-titles>Replay titles</button>` : html`<a class="btn btn--ghost" href="index.html">Home</a>`}
        <button class="btn btn--ghost" type="button" data-motion-toggle>Motion off</button>
        <p class="colophon__mark cam-label">© ${data.person?.name ?? ''}</p>
      </div>
    </div>`;
}

// --- Project page ---------------------------------------------------------------------------

export function filmReport(f) {
  const lens = f.lenses ?? {}, cam = f.camera ?? {};
  return [
    ['Role', f.role], ['Director', f.director], ['Production', f.production], ['Format', f.format], ['Runtime', f.runtime],
    ['Camera', cam.body], ['Mode', cam.mode], ['Codec', cam.codec],
    ['Lenses', [lens.set, lens.range].filter(Boolean).join(' · ')], ['Anamorphic', lens.anamorphic ? 'Yes' : null], ['Filtration', lens.filtration],
    ['Aspect', f.aspect ? aspectLabel(f.aspect) : null], ['Frame rate', f.frameRate ? fpsLabel(f.frameRate) : null],
    ['Camera move', f.move ? `${f.move} ${MOVE_NAMES[f.move] ?? ''}`.trim() : null],
  ];
}

export function renderProject(film, data, { prev, next, index }) {
  const pal = cleanPalette(film.palette);
  const watch = safeUrl(film.watch);
  const awards = (film.awards ?? []).filter(Boolean);
  const bts = (film.bts ?? []).filter(b => safeUrl(b?.src));
  return html`
    <article class="film" aria-labelledby="film-title" style="--ar:${Number(film.aspect) || 1.78}">
      <header class="film__head container">
        <p class="film__slate cam-label"><a href="index.html#work">Selected work</a><span aria-hidden="true">/</span><span>${[pad2(index + 1), film.year, film.format].filter(Boolean).join(' · ')}</span>${badge(film, data)}</p>
        <h1 class="film__title" id="film-title">${film.title}</h1>
        <p class="film__logline">${film.logline}</p>
      </header>
      <div class="film__hero container"><div class="film__frame frame" data-film-hero style="background:${paletteBackground(pal)}"></div></div>
      <div class="film__body container">
        <section class="film__report" aria-labelledby="report-title">
          <h2 class="cam-label film__h" id="report-title">Camera report</h2>
          ${camReport(filmReport(film))}
        </section>
        <section class="film__notes" aria-labelledby="light-title">
          <h2 class="cam-label film__h" id="light-title">Lighting</h2>
          <p class="film__lighting">${film.lighting}</p>
          <h2 class="cam-label film__h" id="palette-title">Palette</h2>
          <ul class="palette" role="list" aria-labelledby="palette-title">
            ${pal.map(c => html`<li class="palette__chip"><span class="palette__swatch" style="background:${c}"></span><span class="palette__hex">${c.toUpperCase()}</span></li>`)}
          </ul>
          ${awards.length ? html`<h2 class="cam-label film__h">Recognition</h2><ul class="film__awards" role="list">${awards.map(a => html`<li>${typeof a === 'string' ? a : a.title}</li>`)}</ul>` : ''}
          ${watch ? html`<p class="film__watch"><a class="btn" href="${watch}" rel="noopener">Watch the film <span aria-hidden="true">↗</span></a></p>` : ''}
        </section>
      </div>
      <section class="film__stills container" aria-labelledby="stills-title">
        <h2 class="cam-label film__h" id="stills-title">Frames</h2>
        <ul class="stills" role="list" data-stills></ul>
      </section>
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

// --- JSON-LD -------------------------------------------------------------------------------

const abs = (data, rel) => (rel ? new URL(rel, data.site?.url ?? location.href).href : undefined);

export function personLD(data) {
  const p = data.person ?? {};
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: p.name, jobTitle: p.role,
    hasOccupation: { '@type': 'Occupation', name: (p.roles ?? [])[0] ?? p.role },
    url: data.site?.url, image: abs(data, data.site?.ogImage),
    knowsAbout: ['Cinematography', 'Lighting', 'Colour grading', 'Previsualization', 'Unreal Engine'],
    sameAs: (p.sameAs ?? []).filter(u => /^https:\/\//.test(u)),
  };
}

export function creativeWorkLD(film, data) {
  const p = data.person ?? {};
  return {
    '@context': 'https://schema.org', '@type': 'CreativeWork',
    name: film.title, genre: film.format, dateCreated: film.year ? String(film.year) : undefined,
    abstract: film.logline, url: abs(data, `project.html?slug=${encodeURIComponent(film.slug)}`),
    contributor: { '@type': 'Person', name: p.name, jobTitle: film.role, url: data.site?.url },
    ...(film.director && !film.placeholder ? { director: { '@type': 'Person', name: film.director } } : {}),
    ...(film.placeholder ? { creativeWorkStatus: 'Sample placeholder' } : {}),
  };
}

/** Insert (or replace) a JSON-LD script; `<` is escaped so the JSON cannot close the tag. */
export function setJsonLd(id, obj) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = id; document.head.append(el); }
  el.textContent = JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Write markup into an element (markup must come from html``). */
export function put(el, markup) { if (el) el.innerHTML = String(markup); return el; }

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
    open.addEventListener('click', () => { menu.showModal(); setOpen(true); });
    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close());
    menu.addEventListener('close', () => { setOpen(false); open.focus({ preventScroll: true }); });
    menu.addEventListener('click', e => {
      if (e.target === menu) menu.close();                 // backdrop
      const a = e.target.closest('a[href]');
      if (a) { menu.close(); }                             // then the link navigates / scrolls
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

/** Jump to location.hash once JS-rendered content exists (the browser tried before it did). */
export function settleHash() {
  if (!location.hash) return;
  let el = null;
  try { el = document.querySelector(decodeURIComponent(location.hash)); } catch { return; }
  el?.scrollIntoView({ block: 'start' });
}
