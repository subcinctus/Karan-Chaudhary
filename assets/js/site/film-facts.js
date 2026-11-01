// The film page's facts and extra blocks: the crew credits, laurels, references and the Enquiries line,
// the "Scene in five frames" sequence, the lighting plot and the before/after wipes (grade, previs against
// the final frame); their markup here, while mountFilmExtras paints the placeholder frames, draws the plan
// and binds the wipes (ui/wipe.js). render.js renderProject() places them in page order:
// report + renderCrew | notes … renderLaurels, watch, renderEnquiries → renderSequenceShell → Frames →
// renderPlotShell → renderGradeShell → renderReferences → BTS.
//
// The render* functions are pure string builders (Node-safe; tools/prerender.mjs and the tests run them);
// import ./html.js, never ./render.js. Factual rows are never sampled: crew names, laurels and references
// show only once filled (laurels only on a real film). The owner's own lines (photographed by, operated,
// lit) follow from person.name, the film's role and operated / lit. The sequence and the plot may be
// samples: each carries its own badge ("Sample sequence", "Sample plot"). A wipe never is: it shows only
// two real frames (an invented before/after would claim a grade that never happened).

import { html, safeUrl, pad2, filled, badge, cleanPalette } from './html.js';
import { frameItems, sequenceSeed, kindLabel, keepDots, isOwnDP, renderFrameButton, renderFrameCaption, paintGates } from './frame-card.js';

// --- Credits ----------------------------------------------------------------------------------------

/** The crew block's rows in order, each with the crew roles (data/portfolio.js crew[].role) it takes. */
const CREW = [
  ['Director of Photography', /^(?:director of photography|cinematographer|dop?)$/i],
  ['Camera operator', /^(?:camera )?operator$/i],
  ['Lighting', /^lighting(?: design(?:er)?)?$/i],
  ['Gaffer', /^gaffer$/i],
  ['Colourist', /^colou?rist$/i],
  ['Production designer', /^production design(?:er)?$/i],
];

/** Crew names for a role (real names only: a null or template name never shows). */
const crewFor = (film, re) => (film.crew ?? []).filter(c => re.test(String(c?.role ?? '').trim()) && filled(c?.name)).map(c => String(c.name).trim());

/**
 * The credits rows: Director → Director of Photography → Camera operator (the owner when operated) →
 * Lighting (designed by the owner when lit) → Gaffer → Colourist → Production designer, then any other
 * crew role as written. Filled names only; [[label, value], …].
 */
export function crewRows(film, data) {
  const own = data?.person?.name;
  // Operated: the owner says so, or (left empty) the film credits the owner as its camera operator.
  const operated = film.operated === true || (film.operated == null && !isOwnDP(film) && /operator/i.test(film.role ?? ''));
  const ownFor = {
    'Director of Photography': own && isOwnDP(film) ? own : null,
    'Camera operator': own && operated ? own : null,
    Lighting: own && film.lit === true ? `Designed by ${own}` : null,
  };
  const rows = [['Director', filled(film.director)]];
  for (const [label, re] of CREW) rows.push([label, [ownFor[label], ...crewFor(film, re)].filter(Boolean).join(', ')]);
  for (const c of film.crew ?? []) {
    const role = String(c?.role ?? '').trim();
    if (role && filled(c?.name) && !CREW.some(([, re]) => re.test(role))) rows.push([role, String(c.name).trim()]);
  }
  return rows.filter(([, v]) => v);
}

/** "Photographed by Karan Chaudhary" and the crew credits under the camera report. */
export function renderCrew(film, data) {
  const own = data?.person?.name;
  const rows = crewRows(film, data);
  if (!own && !rows.length) return '';
  return html`
    <section class="film__crew" aria-labelledby="crew-title">
      <h2 class="cam-label film__h" id="crew-title">Credits</h2>
      ${own ? html`<p class="film__credit"><span class="film__credit-role">${isOwnDP(film) ? 'Photographed by' : film.role}</span> <span class="film__credit-name">${own}</span></p>` : ''}
      ${rows.length ? html`<dl class="report">${rows.map(([k, v]) => html`<div class="report__row"><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
    </section>`;
}

/** Real laurels only, as text: the award, then the event and year (linked when there is a URL). */
export function renderLaurels(film, data) {
  if (film.placeholder) return '';   // never on a sample film (the honesty check fails it too)
  const list = (film.awards ?? []).map(a => (typeof a === 'string' ? { title: a } : a)).filter(a => filled(a?.title) || filled(a?.event));
  if (!list.length) return '';
  return html`
    <h2 class="cam-label film__h" id="laurels-title">Recognition</h2>
    <ul class="film__laurels" role="list" aria-labelledby="laurels-title">
      ${list.map(a => {
        const href = safeUrl(a.url);
        const body = html`<span class="film__laurel-title">${filled(a.title) ?? filled(a.event)}</span>${filled(a.title) ? html` <span class="film__laurel-event">${[filled(a.event), a.year].filter(Boolean).join(' · ')}</span>` : ''}`;
        return html`<li class="film__laurel">${href ? html`<a href="${href}" rel="noopener">${body}</a>` : body}</li>`;
      })}
    </ul>`;
}

/** Reference films, text only (never their frames), after the lighting plot. */
export function renderReferences(film, data) {
  const refs = (film.references ?? []).filter(r => filled(r?.title));
  if (!refs.length) return '';
  return html`
    <section class="film__refs container" aria-labelledby="refs-title">
      <h2 class="cam-label film__h" id="refs-title">References</h2>
      <ul class="film__ref-list" role="list">
        ${refs.map(r => html`<li class="film__ref"><span class="film__ref-title">${r.title}</span> <span class="film__ref-meta">${[r.year, filled(r.dp) && `DP ${r.dp}`].filter(Boolean).join(' · ')}</span>${filled(r.note) ? html`<span class="film__ref-note">${r.note}</span>` : ''}</li>`)}
      </ul>
    </section>`;
}

/** The Enquiries line: the contact address with the film's title as the subject. */
export function renderEnquiries(film, data) {
  const c = data?.contact ?? {};
  const mail = c.email ? safeUrl(`mailto:${c.email}?subject=${encodeURIComponent(film.title ?? '')}`, { allowMail: true }) : null;
  if (!mail) return '';
  return html`
    <h2 class="cam-label film__h" id="enquiries-title">Enquiries</h2>
    <p class="film__enquiries"><a class="film__mail" href="${mail}">${c.email}</a><span class="film__mail-subject">Subject: ${film.title}</span>${badge(c, data, 'Sample contact')}</p>`;
}

// --- Sequence ---------------------------------------------------------------------------------------

/** "Sc. 04 · INT. WORKSHOP · DUSK" → "04". */
const sceneNo = scene => /^\s*Sc\.?\s*([\w.-]+)/i.exec(String(scene ?? ''))?.[1] ?? null;

/**
 * A film's sequences, ready to render: at most 8 frames each, in edit order; a frame is real (a usable
 * src) or procedural (a kind, painted from seed slug + 'seq' + i); a sequence without frames is dropped.
 * Frames sit in gates at the film's aspect (a real frame is letterboxed in its gate, never cropped).
 */
export function sequencesOf(film) {
  const aspect = Number(film?.aspect) || 1.78;
  const palette = cleanPalette(film?.palette);
  return (Array.isArray(film?.sequences) ? film.sequences : []).filter(q => q && typeof q === 'object').map(q => {
    const frames = (Array.isArray(q.frames) ? q.frames : []).filter(fr => fr && (safeUrl(fr.src) || typeof fr.kind === 'string')).slice(0, 8)
      .map((fr, i) => {
        const src = safeUrl(fr.src), intent = filled(fr.intent) ?? null;
        return src ? { src, alt: fr.alt ?? '', intent, aspect }
          : { placeholder: true, kind: fr.kind, seed: sequenceSeed(film, i), alt: fr.alt ?? `Placeholder still: ${kindLabel(fr.kind)}`, intent, aspect, palette };
      });
    return { placeholder: q.placeholder === true || frames.some(fr => fr.placeholder), title: filled(q.title) ?? 'Sequence', scene: filled(q.scene) ?? null, hindsight: filled(q.hindsight) ?? null, frames };
  }).filter(q => q.frames.length);
}

/** The sequence blocks (one per sequence): frames in edit order, intent lines, "In hindsight —". */
export function renderSequenceShell(film, data) {
  return html`${sequencesOf(film).map((q, j) => {
    const n = q.frames.length, sc = sceneNo(q.scene);
    return html`
      <section class="sequence container" aria-labelledby="sequence-${j}-title" data-sequence="${j}">
        <header class="sequence__head">
          <p class="cam-label film__h">${keepDots(`Sequence${q.scene ? ` · ${q.scene}` : ''}`)}</p>
          <h2 class="sequence__title" id="sequence-${j}-title">${q.title}</h2>
          ${badge(q, data, 'Sample sequence')}
        </header>
        <ol class="sequence__list" role="list">
          ${q.frames.map((fr, i) => html`
            <li class="sequence__item">
              ${renderFrameButton(fr, i, { scope: `sequence-${j}`, total: n, label: `${sc ? `Sc. ${sc} · ` : ''}${pad2(i + 1)}/${pad2(n)}`, sizes: '(min-width: 1100px) 20vw, (min-width: 720px) 50vw, 100vw' })}
              <p class="sequence__n cam-label" aria-hidden="true">${pad2(i + 1)}</p>
              ${fr.intent ? html`<p class="sequence__intent">${fr.intent}</p>` : ''}
            </li>`)}
        </ol>
        ${q.hindsight ? html`<p class="sequence__hindsight"><span class="cam-label">In hindsight —</span> <span class="sequence__hindsight-text">${q.hindsight}</span></p>` : ''}
      </section>`;
  })}`;
}

// --- Lighting plot ----------------------------------------------------------------------------------

const num = v => typeof v === 'number' && Number.isFinite(v);
/** A plot the plan can draw: a camera with a position and focal length, and at least one light. */
const plotOf = film => {
  const p = film?.lightingPlot;
  const ok = p && typeof p === 'object' && num(p.camera?.x) && num(p.camera?.y) && num(p.camera?.focal) && p.camera.focal > 0
    && Array.isArray(p.lights) && p.lights.some(l => num(l?.az) && num(l?.el) && num(l?.dist));
  return ok ? p : null;
};
const lightsOf = p => p.lights.filter(l => num(l?.az) && num(l?.el) && num(l?.dist));
const propsOf = p => (Array.isArray(p.props) ? p.props : []).filter(q => num(q?.x) && num(q?.y));
const upper = v => String(v ?? '').toUpperCase();
const cap = v => { const s = String(v ?? ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
/** Where a light stands round the subject, in words (ui/plot.js describePlan's terms). */
const side = az => (az === 0 ? 'on the lens axis' : Math.abs(az) >= 180 ? 'behind' : `${Math.abs(az)}° camera-${az > 0 ? 'left' : 'right'}`);
const heightWords = el => (el > 0 ? `${el}° up` : el < 0 ? `${-el}° down` : 'eye level');

/** The plot's heading and SVG title: "Lighting plot: Untitled Short I, Sc. 04 · INT. WORKSHOP · DUSK". */
const plotTitle = (film, p) => `Lighting plot: ${film.title}${filled(p.scene) ? `, ${p.scene}` : ''}`;

/**
 * renderPlan()'s arguments for a film's lighting plot (ui/plot.js). lib supplies fieldOfView and FORMATS
 * (core/optics.js) and describePlan (ui/plot.js), which the page imports only when a plot is drawn:
 *   camera.fov is the horizontal field of view of camera.focal on Super 35 at the film's aspect;
 *   each light reads its role over its Kelvin ("KEY" over "2000K"), each prop its label over its Kelvin
 *   (a practical glows) or its detail. The plan sizes itself so every label fits beside its glyph, and a
 *   longer line beside a light that stands well to the side would zoom the plan out: the source, height
 *   and modifier are in the legend under it (plotRows) and in the SVG's description;
 *   the description is describePlan()'s sentence, the props and the motivation.
 */
export function plotArgs(film, data, { fieldOfView, FORMATS, describePlan }) {
  const p = plotOf(film);
  if (!p) return null;
  const aspect = Number(film.aspect) || 1.78;
  const c = p.camera;
  const camera = { x: c.x, y: c.y, fov: fieldOfView(c.focal, FORMATS.s35, aspect).h, label: filled(c.label) ?? `CAM · ${c.focal}MM` };
  const subject = { facing: p.subject?.facing ?? 'camera', ...(filled(p.subject?.label) ? { label: upper(p.subject.label) } : {}) };
  const L = lightsOf(p);
  const lights = L.map(l => ({
    role: l.role, az: l.az, el: l.el, dist: l.dist, kelvin: l.kelvin, ...(num(l.size) ? { size: l.size } : {}),
    label: upper(l.role || 'light'), ...(num(l.kelvin) ? { detail: `${l.kelvin}K` } : {}),
  }));
  const P = propsOf(p);
  const props = P.map(q => ({
    x: q.x, y: q.y, ...(num(q.r) ? { r: q.r } : {}), ...(num(q.kelvin) ? { kelvin: q.kelvin } : {}),
    label: upper(filled(q.label) ?? 'Prop'), detail: num(q.kelvin) ? `${q.kelvin}K` : filled(q.detail) ? upper(q.detail) : null,
  }));
  const propWords = P.map(q => [[filled(q.label), filled(q.detail)].filter(Boolean).join(', ').toLowerCase(), num(q.kelvin) && `${q.kelvin} K`].filter(Boolean).join(' at ')).filter(Boolean);
  const desc = [
    describePlan(camera, { x: 0, y: 0 }, L),
    propWords.length ? `Practicals and set: ${propWords.join('; ')}.` : '',
    filled(p.motivation) ?? '',
  ].filter(Boolean).join(' ');
  return { camera, subject, lights, props, labels: { title: plotTitle(film, p), desc } };
}

/** The plot's legend as report rows, so nothing lives only in the drawing: camera, lights, practicals. */
export function plotRows(film) {
  const p = plotOf(film);
  if (!p) return [];
  const c = p.camera;
  const rows = [['Camera', [filled(c.label) ?? `${c.focal} mm`, `${Math.hypot(c.x, c.y).toFixed(1)} m from the subject`].join(' · ')]];
  for (const l of lightsOf(p)) {
    rows.push([cap(l.role || 'light'), [filled(l.label) && cap(l.label), num(l.kelvin) && `${l.kelvin}K`, `${side(l.az)}, ${heightWords(l.el)}`, filled(l.modifier)].filter(Boolean).join(' · ')]);
  }
  for (const q of propsOf(p)) rows.push([cap(filled(q.label) ?? 'Prop'), [filled(q.detail), num(q.kelvin) && `${q.kelvin}K`].filter(Boolean).join(' · ') || '—']);
  return rows;
}

/**
 * A legend value in camera-report case, as the Light study's readout writes it (ui/light-plot.js): metres
 * keep a lower-case "m" (an upper-case M reads as mega), and no line starts with the "·" separator.
 */
const legendValue = v => html`${keepDots(v).split(/(?<=\d) m\b/).map((part, k) => (k ? html`\u00a0<span class="film-plot__unit">m</span>${part}` : part))}`;

/**
 * The lighting plot block: its frame with the legend under it (7/12) beside the plan and the motivation
 * (5/12). On phones it reads frame, plan, motivation, legend: the order of the markup.
 */
export function renderPlotShell(film, data) {
  const p = plotOf(film);
  if (!p) return '';
  const items = frameItems(film), i = Number.isInteger(p.frame) && items[p.frame] ? p.frame : 0;
  const item = items[i];
  return html`
    <section class="film-plot container" aria-labelledby="plot-title" data-film-plot>
      <header class="film-plot__head">
        <h2 class="cam-label film__h" id="plot-title">${keepDots(`Lighting plot${filled(p.scene) ? ` · ${p.scene}` : ''}`)}</h2>
        ${badge(p, data, 'Sample plot')}
      </header>
      <div class="film-plot__grid" style="--ar:${item.aspect}">
        <figure class="film-plot__shot">
          ${renderFrameButton(item, i, { total: items.length, cls: 'film-plot__frame', label: `Frame ${pad2(i + 1)} · lit as planned`, sizes: '(min-width: 900px) 58vw, 100vw' })}
          ${renderFrameCaption(film, item, i, { chips: false })}
        </figure>
        <div class="film-plot__plan">
          <svg class="film-plot__svg" id="film-plot-svg" viewBox="0 0 100 100" role="img" aria-labelledby="film-plot-svg-title" aria-describedby="film-plot-svg-desc"><title id="film-plot-svg-title">${plotTitle(film, p)}</title><desc id="film-plot-svg-desc">${filled(p.motivation) ?? ''}</desc></svg>
          ${filled(p.motivation) ? html`<p class="film-plot__why">${p.motivation}</p>` : ''}
        </div>
        <dl class="report report--tight film-plot__legend">${plotRows(film).map(([k, v]) => html`<div class="report__row"><dt>${k}</dt><dd>${legendValue(v)}</dd></div>`)}</dl>
      </div>
    </section>`;
}

// --- Before / after ---------------------------------------------------------------------------------

/** The wipes a film can carry: its grade (log → final) and its previs against the final frame. */
const PAIRS = [
  { key: 'grade', a: 'log', b: 'final', id: 'grade', title: 'Grade · log to final', tags: ['Log', 'Final grade'] },
  { key: 'previsCompare', a: 'previs', b: 'final', id: 'previs-compare', title: 'Previs · against the final frame', tags: ['Previs', 'Final'] },
];

/**
 * Before/after wipes of two real frames, one block per pair the film fills in (both sources required): the
 * picture with the B side clipped at --wipe (ui/wipe.js moves it), the A / B tags, a range input for the
 * keyboard, and the colourist's credit under the grade.
 */
export function renderGradeShell(film, data) {
  const aspect = Number(film?.aspect) || 1.78;
  return html`${PAIRS.map(p => {
    const v = film?.[p.key], A = safeUrl(v?.[p.a]?.src), B = safeUrl(v?.[p.b]?.src);
    if (!A || !B) return '';
    const [ta, tb] = p.tags;
    const credit = [p.key === 'grade' && filled(v.colourist) && `Colourist: ${v.colourist}`, filled(v.note)].filter(Boolean);
    return html`
      <section class="film-wipe container" aria-labelledby="${p.id}-title" data-wipe-block>
        <h2 class="cam-label film__h" id="${p.id}-title">${p.title}</h2>
        <figure class="wipe" data-wipe data-wipe-a="${ta}" data-wipe-b="${tb}" style="--wipe:50%">
          <div class="wipe__frame frame" style="--ar:${aspect}" data-wipe-frame>
            <img src="${A}" alt="${v[p.a].alt ?? ''}" loading="lazy" decoding="async">
            <span class="wipe__tag wipe__tag--a" aria-hidden="true">A · ${ta}</span>
            <div class="wipe__b"><img src="${B}" alt="${v[p.b].alt ?? ''}" loading="lazy" decoding="async"><span class="wipe__tag wipe__tag--b" aria-hidden="true">B · ${tb}</span></div>
            <span class="wipe__divider" aria-hidden="true"><span class="wipe__grip"></span></span>
          </div>
          <div class="wipe__control"><span class="cam-label" aria-hidden="true">A</span><input type="range" min="0" max="100" step="1" value="50" aria-label="Wipe between ${ta.toLowerCase()} and ${tb.toLowerCase()}"><span class="cam-label" aria-hidden="true">B</span></div>
          ${credit.length ? html`<figcaption class="wipe__cap">${credit.join(' · ')}</figcaption>` : ''}
        </figure>
      </section>`;
  })}`;
}

// --- Mounting (browser) -----------------------------------------------------------------------------

/** New blocks are in the page: the desktop layer gives them their entrances (motion/frames.js). */
const announce = scope => window.dispatchEvent(new CustomEvent('kc:content', { detail: { scope } }));

/**
 * Draw the lighting plot, bind the wipes, then announce the blocks (kc:content) and paint the sequence's
 * and the plot's placeholder frames as each comes near, all inside root. Resolves once every frame is painted.
 */
export async function mountFilmExtras(root, film, data) {
  const plot = root.querySelector('[data-film-plot]');
  const seqs = [...root.querySelectorAll('[data-sequence]')];
  const wipes = [...root.querySelectorAll('[data-wipe-block]')];   // renderProject placed them after the plot
  const blocks = [plot, ...seqs, ...wipes].filter(Boolean);
  if (!blocks.length) return;
  if (plot) {
    try {
      const [optics, plan] = await Promise.all([import('../core/optics.js'), import('../ui/plot.js')]);
      const args = plotArgs(film, data, { ...optics, describePlan: plan.describePlan });
      if (args) plan.renderPlan(plot.querySelector('.film-plot__svg'), args);
    } catch (err) { console.warn('[film] lighting plot', err); }
  }
  if (wipes.length) {
    try {
      const { bindWipe } = await import('../ui/wipe.js');
      for (const w of wipes) bindWipe(w.querySelector('[data-wipe]'));
    } catch (err) { console.warn('[film] wipes', err); }
  }
  announce(blocks.length === 1 ? blocks[0] : root);
  const sequences = sequencesOf(film);
  await Promise.all([
    ...seqs.map(s => paintGates(s, sequences[Number(s.dataset.sequence)]?.frames ?? [])),
    plot ? paintGates(plot, frameItems(film)) : null,
  ]);
}
