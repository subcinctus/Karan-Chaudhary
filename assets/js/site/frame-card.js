// Frame cards on the film page: every frame of a film (its real stills, or procedural "PLACEHOLDER STILL"
// frames from pieces/still.js) as a button that opens the lightbox, with its caption (the camera line, or
// the placeholder label and badge, then the palette chips), and the DP-first credit line the lightbox's
// info panel shows. The string builders and data helpers are pure (Node-safe); import ./html.js, never
// ./render.js. paintStill / paintGates, at the end, paint the placeholders in the browser.
//
// One frame list serves every view of a frame (the grid, the lead frame, the lighting plot's frame, the
// lightbox), so they all agree. A placeholder's seed depends only on the film and the frame's place:
// frame i is hashString(slug + i), so the work card (main.js), the lead frame and frame 01 are one image,
// and a match cut from the card lands on the picture it started from. Sequence frames use slug + 'seq' + i.

import { html, safeUrl, srcsetOf, pad2, aspectLabel, filled, cleanPalette, paletteBackground } from './html.js';
import { hashString } from '../core/prng.js';

/** Compositions for a film without stillKinds (pieces/still.js STILL_KINDS). */
export const DEFAULT_KINDS = ['wide-ext', 'interior-practical', 'close-silhouette'];

/** Seed of a film's procedural frame i (frame 0 is also the lead frame and the work card). */
export const frameSeed = (film, i) => hashString(`${film?.slug ?? ''}${i}`);
/** Seed of frame i of a film's sequence. */
export const sequenceSeed = (film, i) => hashString(`${film?.slug ?? ''}seq${i}`);
/** 'window-shaft' → 'window shaft'. */
export const kindLabel = kind => String(kind ?? '').replace(/-/g, ' ');

/** True when the owner photographed the film (the role is DP or cinematographer). */
export const isOwnDP = film => /director of photography|cinematograph/i.test(film?.role ?? 'Director of Photography');

/**
 * The film's frames, in order: its real stills (with a usable src), else one procedural placeholder per
 * stillKinds entry. Real: { src, srcset, alt, aspect, line, caption, palette }. Placeholder:
 * { placeholder: true, kind, seed, alt, aspect, palette }. A still's own palette wins over the film's.
 */
export function frameItems(film) {
  const aspect = Number(film?.aspect) || 1.78, pal = cleanPalette(film?.palette);
  const reals = (film?.stills ?? []).filter(s => safeUrl(s?.src));
  if (reals.length) {
    return reals.map(s => ({
      src: safeUrl(s.src), srcset: srcsetOf(s), alt: s.alt ?? '', aspect: Number(s.aspect) || aspect,
      line: filled(s.line) ?? null, caption: filled(s.caption) ?? null,
      palette: cleanPalette(s.palette).length ? cleanPalette(s.palette) : pal,
    }));
  }
  const kinds = film?.stillKinds?.length ? film.stillKinds : DEFAULT_KINDS;
  return kinds.map((kind, i) => ({
    placeholder: true, kind, seed: frameSeed(film, i), aspect, palette: pal,
    alt: `Placeholder still for ${film?.title ?? 'this film'}: ${kindLabel(kind)}`,
  }));
}

/** "UNTITLED SHORT I (2026) — DP Karan Chaudhary · Dir. Name": the lightbox's credit line (text). */
export function frameCredit(film, data) {
  const name = data?.person?.name;
  const title = `${String(film?.title ?? '').toUpperCase()}${film?.year ? ` (${film.year})` : ''}`;
  const own = name ? (isOwnDP(film) ? `DP ${name}` : `${film.role} ${name}`) : '';
  const dir = filled(film?.director);
  return [title, [own, dir && `Dir. ${dir}`].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}

/** 5–6 palette chips, 10×10 px (decorative: the film's palette is listed in words above). */
export function renderChips(palette) {
  const p = cleanPalette(palette).slice(0, 6);
  return p.length ? html`<span class="chips" aria-hidden="true" title="${p.join(' ')}">${p.map(c => html`<i style="background:${c}"></i>`)}</span>` : '';
}

/** What a frame's caption says on its first line: the camera line, or the placeholder label. */
export const frameLabel = (item, i) => item.line ?? `Frame ${pad2(i + 1)}${item.kind ? ` · ${kindLabel(item.kind)}` : ''} · ${aspectLabel(item.aspect)}`;

/**
 * One frame's caption: the camera line (or "Frame 01 · window shaft · 2.39:1" and the "Placeholder still"
 * badge), the still's own caption, then the palette chips (chips: false leaves them out).
 */
export function renderFrameCaption(film, still, i, { chips = true } = {}) {
  return html`
    <figcaption class="still__cap">
      <span class="still__text">
        <span class="still__line">${frameLabel(still, i)}</span>
        ${still.placeholder ? html`<span class="badge-sample">Placeholder still</span>` : ''}
        ${still.caption ? html`<span class="still__caption">${still.caption}</span>` : ''}
      </span>
      ${chips ? renderChips(still.palette) : ''}
    </figcaption>`;
}

/**
 * A frame as a button that opens the lightbox: a letterboxed gate at the frame's aspect holding the real
 * still, or the palette until project.js / film-facts.js paint the placeholder into [data-paint].
 * scope names the lightbox's set ('frames', 'sequence-0'); label is what the desktop cursor says.
 */
export function renderFrameButton(item, i, { scope = 'frames', total = 1, cls = '', sizes = '100vw', label = '' } = {}) {
  const set = item.srcset;
  return html`
    <button class="still__open" type="button" data-lightbox="${scope}" data-lightbox-index="${i}" aria-label="Open frame ${i + 1} of ${total} full screen: ${item.alt}">
      <span class="frame${cls ? ` ${cls}` : ''}" style="--ar:${item.aspect}${item.placeholder ? `;background:${paletteBackground(item.palette)}` : ''}"${item.placeholder ? html` data-paint="${i}"` : ''}${label ? html` data-label="${label}"` : ''}>${item.src
        ? html`<img src="${item.src}"${set ? html` srcset="${set}" sizes="${sizes}"` : ''} alt="${item.alt}" loading="lazy" decoding="async">`
        : ''}</span>
    </button>`;
}

/** The Frames grid: one card per frame (the first spans the row from 720 px). */
export function renderFrameCards(film) {
  const items = frameItems(film);
  return html`${items.map((item, i) => html`
    <li class="still" data-frame="${i}">
      <figure>
        ${renderFrameButton(item, i, { total: items.length, sizes: i ? '(min-width: 720px) 50vw, 100vw' : '100vw' })}
        ${renderFrameCaption(film, item, i)}
      </figure>
    </li>`)}`;
}

// --- Painting the placeholders (browser) ----------------------------------------------------------------

let stillModule = null;
/** pieces/still.js, loaded on first use; null when it cannot load (the palette gates stay). */
const loadStill = () => (stillModule ??= import('../pieces/still.js').catch(err => {
  console.info('[frames] procedural stills unavailable; palette frames stay', err?.message ?? err);
  return null;
}));
// Painting a still is synchronous canvas work: give the browser a frame between stills so scrolling, the
// shutter and input never wait on a whole set of them.
const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

/** Run fn once el comes within 800 px of the viewport (at once without IntersectionObserver). */
export function whenNear(el, fn) {
  if (typeof IntersectionObserver === 'undefined') return Promise.resolve(fn());
  return new Promise(res => {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); res(fn()); } }, { rootMargin: '800px 0px' });
    io.observe(el);
  });
}

/**
 * Paint placeholder `item` into its gate: an <img> of the procedural still at the gate's width (× dpr, at
 * most 2), first in the gate, or right after `after` (a hand-off image, which it then covers). Resolves to
 * the <img> (its object URL lives as long as the page), or null.
 */
export async function paintStill(gate, item, { after = null } = {}) {
  const still = await loadStill();
  if (!still?.renderStill) return null;
  try {
    await yieldFrame();
    const dpr = Math.min(2, devicePixelRatio || 1);
    // caption: false: the DOM "Placeholder still" badge labels these frames (readable, translatable).
    const url = await still.renderStill({ palette: item.palette, aspect: item.aspect, seed: item.seed, kind: item.kind, width: Math.round(gate.clientWidth * dpr) || 1280, caption: false });
    const img = new Image();
    img.alt = item.alt; img.decoding = 'async'; img.src = url;
    if (after?.isConnected) after.after(img); else gate.prepend(img);
    return img;
  } catch (err) { console.warn('[frames] still', item.kind, err); return null; }
}

/** Paint each placeholder gate ([data-paint]) in scope as it comes near; items[i] is gate i's frame. */
export function paintGates(scope, items) {
  return Promise.all([...scope.querySelectorAll('[data-paint]')].map(gate => {
    const item = items[Number(gate.dataset.paint)];
    return item?.placeholder && !gate.querySelector('img') ? whenNear(gate, () => paintStill(gate, item)) : null;
  }));
}
