// Showreel: a click-to-load facade. Nothing from Vimeo or YouTube loads until the visitor asks for
// it (privacy, speed). Without a playable reel the home page leaves the section out (render.js
// pruneReel); the "REEL — coming soon" slate below is only a fallback if mountReel is called anyway.
//
//   import { mountReel } from './reel.js';
//   const reel = mountReel(document.querySelector('[data-reel-frame]'), data);
//   reel.focus();   // "Watch reel" CTA: move focus to the play button (or the slate)
//
// data.reel: { provider: 'vimeo' | 'youtube' | 'file' | null, id, src, poster, title, runtime, placeholder }

import { html, put, safeUrl, badge, slateLine } from './render.js';

const VALID = {
  vimeo: id => /^\d{4,12}$/.test(String(id)),
  youtube: id => /^[\w-]{6,20}$/.test(String(id)),
};
const EMBED = {
  vimeo: id => `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1&title=0&byline=0&portrait=0`,
  youtube: id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
};
const NAME = { vimeo: 'Vimeo', youtube: 'YouTube' };

function slate(frame, data) {
  const r = data.reel ?? {}, s = data.person?.slate ?? {};
  frame.classList.add('reel__frame--slate');
  put(frame, html`
    <div class="reel-slate" tabindex="-1" data-reel-focus>
      <div class="reel-slate__grid" aria-hidden="true"></div>
      <p class="reel-slate__top cam-label"><span>Prod. ${data.person?.name ?? ''}</span><span>Roll A001</span><span>${r.runtime ? `TRT ${r.runtime}` : ''}</span></p>
      <p class="reel-slate__title"><span class="display-caps">Reel</span><span class="reel-slate__dash" aria-hidden="true">—</span><em>coming soon</em></p>
      <p class="reel-slate__bottom cam-label"><span>${slateLine({ ...s, aspect: null })}</span>${badge(r, data)}</p>
    </div>`);
}

export function mountReel(frame, data) {
  const r = data?.reel ?? {};
  const api = { focus() { frame?.querySelector('[data-reel-focus]')?.focus({ preventScroll: true }); } };
  if (!frame) return api;
  const provider = r.provider;
  const poster = safeUrl(r.poster);

  if (provider === 'file') {
    const src = safeUrl(r.src);
    if (!src) { slate(frame, data); return api; }
    put(frame, html`<video class="reel__video" controls playsinline preload="none" ${poster ? html`poster="${poster}"` : ''} data-reel-focus><source src="${src}">Your browser cannot play this video. <a href="${src}">Download the reel</a>.</video>`);
    return api;
  }

  if (!VALID[provider]?.(r.id)) { slate(frame, data); return api; }

  const label = `Play showreel (${NAME[provider]}, loads external player)`;
  put(frame, html`
    <button class="reel-facade" type="button" aria-label="${label}" data-reel-focus>
      ${poster ? html`<img class="reel-facade__poster" src="${poster}" alt="" loading="lazy" decoding="async">` : html`<span class="reel-facade__poster reel-facade__poster--none" aria-hidden="true"></span>`}
      <span class="reel-facade__play" aria-hidden="true"><span></span></span>
      <span class="reel-facade__label cam-label" aria-hidden="true">Play reel${r.runtime ? ` · ${r.runtime}` : ''} · ${NAME[provider]}</span>
    </button>`);
  frame.querySelector('.reel-facade').addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.className = 'reel__iframe';
    iframe.src = EMBED[provider](encodeURIComponent(r.id));
    iframe.title = `${r.title || 'Showreel'}: ${data.person?.name ?? ''}`;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('data-reel-focus', '');
    frame.replaceChildren(iframe);
    iframe.focus();
  }, { once: true });
  return api;
}
