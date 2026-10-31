// The reel's shot index: a contact sheet of the reel, an ordered list of buttons that each play it from
// one shot. A tile is the owner's frame from that shot or the film's real featured still (never a
// procedural placeholder), the time in tungsten, the film, and lens · note. Above it, "No dialogue —
// instrumental" when the reel has none. Nothing at all until there is a playable reel.
// renderReelIndex is a pure string builder (Node-safe; import ./html.js, never ./render.js); render.js
// renderReel() places it under the reel. main.js calls mountReelIndex(#reel, reel, data) with the
// API mountReel() returned ({ focus(), playFrom(s) }).
//
//   <ol class="reel-index" aria-label="Shot index"> … <button class="reel-shot" data-reel-t="62"
//     aria-label="Play the reel from 1:02 — Untitled Short I, 40 mm"> … </button> … </ol>

import { html, safeUrl, srcsetOf, featuredStill, hasReel } from './html.js';
import { reelShots, formatTime } from './reel-data.js';

/** 4 tiles a row from 1100 px, 3 from 720 px, 2 on phones (reel.css). */
const SIZES = '(min-width: 1100px) 25vw, (min-width: 720px) 33vw, 50vw';

function tile(s) {
  const still = s.thumb ? { src: s.thumb } : featuredStill(s.film);
  const src = safeUrl(still?.src), set = srcsetOf(still);
  const at = formatTime(s.t);
  return html`
    <li class="reel-index__item">
      <button class="reel-shot" type="button" data-reel-t="${s.t}" aria-label="${`Play the reel from ${at}${s.title ? ` — ${s.title}` : ''}${s.lens ? `, ${s.lens}` : ''}`}">
        <span class="reel-shot__frame frame" aria-hidden="true">${src ? html`<img src="${src}"${set ? html` srcset="${set}" sizes="${SIZES}"` : ''} alt="" loading="lazy" decoding="async">` : ''}</span>
        <span class="reel-shot__tc">${formatTime(s.t, { pad: true })}</span>
        ${s.title ? html`<span class="reel-shot__title">${s.title}</span>` : ''}
        ${s.lens || s.note ? html`<span class="reel-shot__meta">${[s.lens, s.note].filter(Boolean).join(' · ')}</span>` : ''}
      </button>
    </li>`;
}

/** The dialogue note and the shot index under the reel; '' without a playable reel, or with neither. */
export function renderReelIndex(data) {
  if (!hasReel(data)) return '';
  const shots = reelShots(data), quiet = data.reel?.dialogue === false;
  if (!shots.length && !quiet) return '';
  return html`
    <div class="reel-more" data-reveal>
      ${quiet ? html`<p class="reel-note cam-label">No dialogue — instrumental</p>` : ''}
      ${shots.length ? html`
        <ol class="reel-index" role="list" aria-label="Shot index">${shots.map(tile)}</ol>
        <p class="visually-hidden" aria-live="polite" data-reel-live></p>` : ''}
    </div>`;
}

/**
 * A shot plays the reel from its time (reel.playFrom moves focus to the player), is marked as the one
 * playing, and the live region says "Playing from 1:02".
 */
export function mountReelIndex(root, reel, data) {
  const list = root?.querySelector('.reel-index');
  if (!list || !hasReel(data) || typeof reel?.playFrom !== 'function') return;
  const live = root.querySelector('[data-reel-live]');
  list.addEventListener('click', e => {
    const shot = e.target.closest?.('[data-reel-t]');
    const t = Number(shot?.dataset.reelT);
    if (!shot || !Number.isFinite(t)) return;
    for (const b of list.querySelectorAll('[aria-current]')) b.removeAttribute('aria-current');
    shot.setAttribute('aria-current', 'true');
    reel.playFrom(t);
    if (!live) return;
    // Emptied first, so a second press of the same shot is announced again.
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = `Playing from ${formatTime(t)}`; });
  });
}
