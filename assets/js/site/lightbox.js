// Full-screen frame lightbox for the film page: one native <dialog class="lightbox"> (built on the first
// open) that shows a film's frames, or one of its sequences, opened from any [data-lightbox]
// [data-lightbox-index] button inside root. project.js imports this module on the first click on a frame
// (never on the critical path) and calls bindLightbox(main, { film, data }), which handles every later click.
//
//   Layout: a 56 px top bar (the counter "03 / 12", Info i, Close Esc), previous/next buttons (56 px, 24 px
//   from the edges, at the foot on phones), the frame on black, letterboxed (object-fit: contain) inside the
//   safe areas, and an info panel (the DP-first credit, the camera line, the caption or intent, the palette
//   chips, the placeholder badge): a 360 px side panel from 1440 px, a strip over the foot of the frame
//   below that.
//   Input: ← / → (no wrap), Home / End, i, Esc (the dialog's own cancel); on touch a horizontal swipe of
//   48 px or more (and 1.5× its vertical travel). A click beside the frame closes.
//   Motion: on open the page fades to black over 300 ms and the frame settles from 0.985 over 450 ms (expo
//   out); next / previous is a hard cut while the counter rolls a line; close fades out over 250 ms. None of
//   it under reduced motion or Motion off: every WAAPI call asks isReducedMotion() first.
//   Images: a frame shows the grid's image at once, then its full size: a real still at its srcset (sizes
//   100vw), a placeholder re-rendered at min(2560, innerWidth × dpr) (pieces/still.js caps the density);
//   the neighbours are preloaded, and every object URL made here is revoked when its image is swapped out
//   and on close.
//   While open: html.modal-open (the page is held still; motion/smooth.js stops Lenis on it), a polite live
//   region ("Frame 3 of 12: …"), and on close focus goes back to the button that opened it.

import { isReducedMotion } from '../core/motion-pref.js';
import { html, put, pad2, badge } from './html.js';
import { frameItems, frameCredit, frameLabel, renderChips } from './frame-card.js';
import { sequencesOf } from './film-facts.js';

const SWIPE = 48;   // px

/** An easing from tokens.css, with its value as the fallback. */
const ease = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const EASE_UI = ['--ease-ui', 'cubic-bezier(0.4, 0, 0.1, 1)'], EXPO_OUT = ['--ease-out-expo', 'cubic-bezier(0.16, 1, 0.3, 1)'];

const ARROW = d => html`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function markup() {
  return html`
    <div class="lightbox__bar">
      <p class="lightbox__count" aria-hidden="true"><span class="lightbox__roll"><span data-lb-n>01</span></span><span class="lightbox__of"> / <span data-lb-total>01</span></span></p>
      <p class="lightbox__set cam-label" data-lb-set></p>
      <div class="lightbox__tools">
        <button class="lightbox__btn" type="button" aria-expanded="false" aria-controls="lightbox-info" data-lb-info>Info <kbd>i</kbd></button>
        <button class="lightbox__btn" type="button" autofocus data-lb-close>Close <kbd>Esc</kbd></button>
      </div>
    </div>
    <div class="lightbox__stage" data-lb-stage>
      <img class="lightbox__img" alt="" decoding="async" data-lb-img>
      <span class="lightbox__tag badge-sample" hidden data-lb-tag>Placeholder still</span>
    </div>
    <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous frame" data-lb-step="-1">${ARROW('M15 5l-7 7 7 7')}</button>
    <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next frame" data-lb-step="1">${ARROW('M9 5l7 7-7 7')}</button>
    <aside class="lightbox__info" id="lightbox-info" aria-label="About this frame" hidden data-lb-panel></aside>
    <p class="visually-hidden" aria-live="polite" data-lb-live></p>`;
}

/**
 * Wire root's frame buttons to the lightbox. Returns { open(button), close() }; project.js calls open()
 * for the click that loaded this module, and every later click arrives here.
 * @param {HTMLElement} root
 * @param {{ film: object, data: object }} o
 */
export function bindLightbox(root, { film, data }) {
  const doc = document.documentElement;
  let dialog = null, el = {};
  let opener = null, set = null, scope = '', idx = 0, shown = 0, owned = null, closing = false, swipe = null;

  /** The frames a button's scope names: the film's frames, or sequence j. */
  function setFor(name) {
    if (name === 'frames') return { name: 'Frames', label: `Frames · ${film.title}`, items: frameItems(film) };
    const m = /^sequence-(\d+)$/.exec(name);
    const q = m ? sequencesOf(film)[Number(m[1])] : null;
    return q ? { name: 'Sequence', label: [`Sequence${q.scene ? ` · ${q.scene}` : ''}`, q.title].join(' · '), items: q.frames, sample: q } : null;
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('data-lenis-prevent', '');
    put(dialog, markup());
    for (const k of ['n', 'total', 'set', 'info', 'close', 'stage', 'img', 'tag', 'panel', 'live']) el[k] = dialog.querySelector(`[data-lb-${k}]`);
    el.prev = dialog.querySelector('[data-lb-step="-1"]');
    el.next = dialog.querySelector('[data-lb-step="1"]');
    document.body.append(dialog);

    el.close.addEventListener('click', () => close());
    el.info.addEventListener('click', () => toggleInfo());
    for (const b of [el.prev, el.next]) b.addEventListener('click', () => step(Number(b.dataset.lbStep)));
    // Esc: the dialog's own cancel, faded out like the Close button (if the browser lets it be held).
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('close', cleanup);
    dialog.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Home') show(0, -1);
      else if (e.key === 'End') show(set.items.length - 1, 1);
      else if (e.key === 'i' || e.key === 'I') toggleInfo();
      else return;
      e.preventDefault();
    });
    // A click on the black beside the frame closes; a swipe across it steps.
    el.stage.addEventListener('click', e => { if (!swipe?.moved && !onPicture(e.clientX, e.clientY)) close(); });
    el.stage.addEventListener('pointerdown', e => { swipe = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, moved: false }; });
    el.stage.addEventListener('pointerup', e => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe.moved = Math.hypot(dx, dy) > 10;
      if (Math.abs(dx) >= SWIPE && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
    });
    el.stage.addEventListener('pointercancel', () => { swipe = null; });
    el.img.addEventListener('load', placeTag);
    addEventListener('resize', () => { if (dialog.open) placeTag(); }, { passive: true });
  }

  function open(button) {
    const s = setFor(button?.dataset.lightbox);
    if (!s?.items.length || dialog?.open) return;
    if (!dialog) build();
    opener = button; set = s; scope = button.dataset.lightbox; closing = false;
    dialog.setAttribute('aria-label', `${s.name}: ${film.title}`);
    el.set.textContent = s.label;
    el.total.textContent = pad2(s.items.length);
    doc.classList.add('modal-open');
    dialog.showModal();
    show(Math.min(Math.max(Number(button.dataset.lightboxIndex) || 0, 0), s.items.length - 1), 0);
    if (!isReducedMotion()) {
      dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: ease(...EASE_UI) });
      el.img.animate([{ opacity: 0, transform: 'scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: ease(...EXPO_OUT) });
    }
  }

  async function close() {
    if (!dialog?.open || closing) return;
    closing = true;
    if (!isReducedMotion()) await dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: ease(...EASE_UI), fill: 'forwards' }).finished.catch(() => {});
    dialog.close();
  }

  /** After the dialog closes (Close, Esc, a click beside the frame): page, images and focus as they were. */
  function cleanup() {
    for (const a of dialog.getAnimations({ subtree: true })) a.cancel();
    doc.classList.remove('modal-open');
    shown++;   // drops any image still on its way
    el.img.removeAttribute('srcset'); el.img.removeAttribute('src');
    revoke();
    closing = false;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  const revoke = () => { if (owned) URL.revokeObjectURL(owned); owned = null; };
  /** The picture's own rectangle (client px): it is contained in the image box, so it may be letterboxed. */
  function picture() {
    const r = el.img.getBoundingClientRect(), w = el.img.naturalWidth, h = el.img.naturalHeight;
    if (!w || !h) return null;
    const k = Math.min(r.width / w, r.height / h), pw = w * k, ph = h * k;
    return { left: r.left + (r.width - pw) / 2, top: r.top + (r.height - ph) / 2, width: pw, height: ph };
  }
  function onPicture(x, y) {
    const p = picture();
    return !!p && x >= p.left && x <= p.left + p.width && y >= p.top && y <= p.top + p.height;
  }
  /** The placeholder badge at the foot of the picture, inside it (as on the lead frame). */
  function placeTag() {
    const p = picture(), s = el.stage.getBoundingClientRect();
    el.tag.style.left = p ? `${p.left - s.left + 12}px` : '';
    el.tag.style.bottom = p ? `${s.bottom - (p.top + p.height) + 12}px` : '';
  }
  const step = d => show(idx + d, d);

  function toggleInfo(on = el.panel.hidden) {
    el.panel.hidden = !on;
    el.info.setAttribute('aria-expanded', String(on));
    dialog.classList.toggle('is-info', on);
    placeTag();   // from 1440 px the picture steps aside for the panel
    if (on && !isReducedMotion()) {
      const wide = matchMedia('(min-width: 1440px)').matches;
      el.panel.animate([{ transform: wide ? 'translateX(100%)' : 'translateY(100%)' }, { transform: 'none' }], { duration: 220, easing: ease(...EXPO_OUT) });
    }
  }

  /** The info panel for frame i: credit, camera line, caption or intent, chips, badges. */
  function info(item, i) {
    const label = set.name === 'Sequence' ? `Frame ${pad2(i + 1)} of ${pad2(set.items.length)}` : frameLabel(item, i);
    put(el.panel, html`
      <p class="lightbox__credit">${frameCredit(film, data)}</p>
      <p class="lightbox__line">${label}</p>
      ${item.caption || item.intent ? html`<p class="lightbox__caption">${item.caption ?? item.intent}</p>` : ''}
      ${renderChips(item.palette)}
      <p class="lightbox__badges">${item.placeholder ? html`<span class="badge-sample">Placeholder still</span>` : ''}${set.sample ? badge(set.sample, data, 'Sample sequence') : ''}</p>`);
  }

  /** Show frame i (clamped: no wrap); d is the direction the counter rolls (0: none). */
  function show(i, d) {
    const n = set.items.length;
    if (!dialog?.open || i < 0 || i >= n || (i === idx && d && el.img.getAttribute('src'))) return;
    idx = i;
    const item = set.items[i], ticket = ++shown;
    el.n.textContent = pad2(i + 1);
    if (d && !isReducedMotion()) el.n.animate([{ transform: `translateY(${d > 0 ? 100 : -100}%)` }, { transform: 'none' }], { duration: 300, easing: ease(...EXPO_OUT) });
    for (const [b, off] of [[el.prev, i === 0], [el.next, i === n - 1]]) b.setAttribute('aria-disabled', String(off));
    el.tag.hidden = !item.placeholder;
    el.live.textContent = `Frame ${i + 1} of ${n}: ${item.alt}`;
    info(item, i);
    // At once: the image the page already shows for this frame (a hard cut); then the full-size one.
    const grid = root.querySelector(`[data-lightbox="${scope}"][data-lightbox-index="${i}"] img`);
    const quick = grid?.complete && grid.naturalWidth ? grid.currentSrc || grid.src : null;
    el.img.alt = item.alt;
    el.img.removeAttribute('srcset');
    if (quick) el.img.src = quick; else el.img.removeAttribute('src');
    revoke();
    full(item, ticket, quick);
    for (const j of [i + 1, i - 1]) if (set.items[j]) preload(set.items[j]);
  }

  /** The full-size image for item, swapped in once decoded (if `ticket` is still the frame shown). */
  async function full(item, ticket, quick) {
    if (item.placeholder) {
      const url = await render(item);
      if (!url) return;
      if (ticket !== shown) return URL.revokeObjectURL(url);
      const pic = new Image();
      pic.src = url;
      await pic.decode().catch(() => {});
      if (ticket !== shown) return URL.revokeObjectURL(url);
      el.img.src = url;
      revoke();
      owned = url;
      return;
    }
    if (!item.srcset && item.src === quick) return;
    const pic = new Image();
    if (item.srcset) { pic.sizes = '100vw'; pic.srcset = item.srcset; }
    pic.src = item.src;
    await pic.decode().catch(() => {});
    if (ticket !== shown) return;
    if (item.srcset) { el.img.sizes = '100vw'; el.img.srcset = item.srcset; }
    el.img.src = item.src;
  }

  let still = null;
  /** A placeholder painted for the screen's width (× dpr, which pieces/still.js caps at 1.5×; at most 2560 px), as an object URL this module owns; or null. */
  async function render(item) {
    still ??= import('../pieces/still.js').catch(() => null);
    const m = await still;
    if (!m?.renderStill) return null;
    const dpr = devicePixelRatio || 1;
    try {
      return await m.renderStill({ palette: item.palette, aspect: item.aspect, seed: item.seed, kind: item.kind, cssWidth: innerWidth, dpr, caption: false });
    } catch (err) { console.warn('[lightbox] still', item.kind, err); return null; }
  }

  /** Warm the neighbours: a real still into the cache, a placeholder into still.js's own cache. */
  function preload(item) {
    if (item.placeholder) { render(item).then(u => u && URL.revokeObjectURL(u)); return; }
    const pic = new Image();
    if (item.srcset) { pic.sizes = '100vw'; pic.srcset = item.srcset; }
    pic.src = item.src;
  }

  root.addEventListener('click', e => {
    const button = e.target.closest?.('[data-lightbox][data-lightbox-index]');
    if (button && root.contains(button)) open(button);
  });
  return { open, close };
}
