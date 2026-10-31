// Shared primitives for every renderer: escaping templates, URL guards, small formatters, data
// predicates, the section head and the JSON-LD builders. Pure string building with no imports and
// nothing DOM-bound at module scope, so it runs in Node too (tools/prerender.mjs, tools/test/).
//
// Feature modules (site/work-index.js, site/film-facts.js, site/reel-data.js, …) import this file,
// never render.js: render.js imports them and re-exports everything here, so there is no cycle.
//
// Every string that comes from data/portfolio.js goes through esc(): the html`` tag escapes each
// interpolated value unless it is wrapped in raw() (only for markup built by these modules).
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

/** A still's srcset (['media/…/still-01-1400.jpg 1400w', …]) as one attribute value; unsafe candidates are dropped. */
export function srcsetOf(still) {
  const list = Array.isArray(still?.srcset) ? still.srcset : [];
  return list.map(c => String(c).trim().split(/\s+/))
    .filter(([u, d, more]) => safeUrl(u) && more == null && (d == null || /^\d+(?:\.\d+)?[wx]$/.test(d)))
    .map(c => c.join(' ')).join(', ');
}

/** Write markup into an element (markup must come from html``). */
export function put(el, markup) { if (el) el.innerHTML = String(markup); return el; }

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

/** Template strings in data/portfolio.js that are not real information yet: never shown on the site. */
const TEMPLATE_TEXT = new Set(['Director Name', 'Production / School', 'Artist / Label', 'Agency / Client', 'City, Country',
  'School name', 'Programme / course', 'Years']);
/** The value, or null while it still holds template text (so "dir. Director Name" is left out). */
export const filled = v => (v == null || TEMPLATE_TEXT.has(String(v).trim()) ? null : v);

/** Every study block and study page carries this line (the colophon and disclosure lines stay too). */
export const STUDY_LABEL = 'Interactive study · code written with AI assistance · not camera work';

/** Motion Prompt camera moves used by the shot-language cards (and the previs shot list). */
export const MOVE_NAMES = { '#027': 'Dolly in', '#030': 'Orbit', '#031': 'Crane up', '#032': 'Dolly zoom', '#033': 'Rack focus', '#043': 'Whip pan' };

// --- What the data holds -----------------------------------------------------------

/** True when data.reel points at something playable (a Vimeo / YouTube id or a video file). */
export function hasReel(data) {
  const r = data?.reel ?? {};
  if (r.provider === 'file') return !!safeUrl(r.src);
  if (r.provider === 'vimeo') return /^\d{4,12}$/.test(String(r.id ?? ''));
  if (r.provider === 'youtube') return /^[\w-]{6,20}$/.test(String(r.id ?? ''));
  return false;
}
/** True once at least one previs shot has a rendered video. */
export const hasPrevisMedia = data => Object.values(data?.previs?.media ?? {}).some(m => !!safeUrl(m?.video));
/** True once a photograph series holds at least one photo with a usable src. */
export const hasPhotographs = data => (data?.photographs?.series ?? []).some(s => (s?.photos ?? []).some(p => !!safeUrl(p?.src)));

/** A film's lead frame: its featured real still, else its first real still, else null (procedural). */
export function featuredStill(film) {
  const reals = (film?.stills ?? []).filter(s => safeUrl(s?.src));
  return reals.find(s => s.featured) ?? reals[0] ?? null;
}

/** Visible SAMPLE badge for placeholder records (when the site switch allows it). */
export function badge(rec, data, label = 'Sample') {
  if (!rec?.placeholder || data?.site?.showPlaceholderBadges === false) return '';
  return html`<span class="badge-sample" title="Placeholder content: replace it in data/portfolio.js">${label}</span>`;
}

// --- Scenes: the home page's sections in order ------------------------------------------

/** Home-page sections in order. The kit and the end credits share one scene (the menu calls it Credits). */
const SCENES = ['reel', 'work', 'photographs', 'studies', 'previs', 'about', 'kit', 'contact'];
const SCENE_OF = { credits: 'kit' };

/**
 * Sections that wait for real material, by id: true while data/portfolio.js has none. They are
 * hidden with their header and menu links (render.js pruneSections, and the prerendered HTML).
 */
export const hiddenSections = data => ({ reel: !hasReel(data), photographs: !hasPhotographs(data) });

/**
 * Scene number of a home-page section ("01"), counting only the sections that show: without a reel
 * the work is Sc. 01. A hidden section gets the number it will have once it shows.
 */
export function scFor(data, id) {
  const scene = SCENE_OF[id] ?? id;
  const off = hiddenSections(data);
  return pad2(SCENES.filter(s => s === scene || !off[s]).indexOf(scene) + 1);
}

// --- Shared blocks ----------------------------------------------------------------------

/** Camera-report rows: [[label, value], …] → <dl>. Empty values are skipped. */
export function camReport(rows, cls = 'report') {
  const items = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  return html`<dl class="${cls}">${items.map(([k, v]) => html`<div class="${cls}__row"><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

/**
 * Section header used by every index section: slate line + h2. `tools` (e.g. the Selected work
 * view toggle) sits at the end of the slate row, so the head is no taller; it may be block markup,
 * so the row is a <div> when it holds them.
 */
export function sectionHead({ sc, label, title, id, aside = '', lede = '', tools = '' }) {
  const row = html`<span>Sc. ${sc}</span><span class="section-head__rule" aria-hidden="true"></span><span>${label}</span>${aside ? html`<span class="section-head__aside">${aside}</span>` : ''}`;
  return html`
    <header class="section-head" data-reveal>
      ${String(tools) ? html`<div class="section-head__slate cam-label">${row}<div class="section-head__tools">${tools}</div></div>` : html`<p class="section-head__slate cam-label">${row}</p>`}
      <h2 class="section-head__title" id="${id}">${title}</h2>
      ${lede ? html`<p class="section-head__lede">${lede}</p>` : ''}
    </header>`;
}

// --- Palette placeholders (used until pieces/still.js or shotcard.js exist) ---------------------

/** CSS background for a film's palette when no still and no card piece is available. */
export function paletteBackground(p = []) {
  const [a = '#0C0D10', b = '#1E2127', c = '#8E8980', d = '#B9B3A8'] = p;
  return `radial-gradient(60% 80% at 68% 58%, ${c}55 0%, transparent 60%), radial-gradient(30% 40% at 70% 56%, ${d}40 0%, transparent 70%), linear-gradient(180deg, ${a} 0%, ${b} 62%, ${a} 100%)`;
}
const HEX = /^#[0-9a-f]{6}$/i;
export const cleanPalette = p => (Array.isArray(p) ? p.filter(c => HEX.test(c)) : []);

// --- JSON-LD ---------------------------------------------------------------------------------

/** A site-relative path as an absolute URL on data.site.url (canonical, OG and JSON-LD only). */
export const absUrl = (data, rel) => (rel ? new URL(rel, data.site?.url ?? globalThis.location?.href).href : undefined);

export function personLD(data) {
  const p = data.person ?? {};
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: p.name, jobTitle: p.role,
    hasOccupation: { '@type': 'Occupation', name: (p.roles ?? [])[0] ?? p.role },
    url: data.site?.url, image: absUrl(data, data.site?.ogImage),
    // Unreal Engine is claimed only once a previs render exists (data.previs.media.*.video).
    knowsAbout: (p.knowsAbout ?? ['Cinematography', 'Lighting', 'Colour grading', 'Previsualization'])
      .filter(k => k !== 'Unreal Engine' || hasPrevisMedia(data)),
    sameAs: (p.sameAs ?? []).filter(u => /^https:\/\//.test(u)),
  };
}

export function creativeWorkLD(film, data) {
  const p = data.person ?? {};
  return {
    '@context': 'https://schema.org', '@type': 'CreativeWork',
    name: film.title, genre: film.format, dateCreated: film.year ? String(film.year) : undefined,
    abstract: film.logline, url: absUrl(data, `project.html?slug=${encodeURIComponent(film.slug)}`),
    contributor: { '@type': 'Person', name: p.name, jobTitle: film.role, url: data.site?.url },
    ...(filled(film.director) && !film.placeholder ? { director: { '@type': 'Person', name: film.director } } : {}),
    ...(film.placeholder ? { creativeWorkStatus: 'Sample placeholder' } : {}),
  };
}
