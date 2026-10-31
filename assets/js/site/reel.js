// Showreel: a click-to-load facade. Nothing from Vimeo or YouTube loads until the visitor asks for it
// (privacy, speed), and a video file waits for the same click. Without a playable reel the home page
// leaves the section out (render.js pruneSections); the "REEL — coming soon" slate below is only a
// fallback if mountReel is called anyway.
//
//   import { mountReel } from './reel.js';
//   const reel = mountReel(document.querySelector('[data-reel-frame]'), data);
//   reel.focus();        // "Watch reel" CTA: move focus to the play button (or the slate)
//   reel.playFrom(62);   // the shot index: play from 1:02 and focus the player (a file seeks; an embed reloads there)
//
// A ?t= in the page's URL (the reel's key moments in search results link to index.html?t=62#reel)
// labels the facade "Play from 1:02"; it never starts playback by itself.
//
// data.reel: { provider: 'vimeo' | 'youtube' | 'file' | null, id, hash, src, poster, title, runtime,
//              captions: { lang, label, src? (a .vtt, for a file) }, placeholder }

import { html, put, safeUrl, badge, slateLine } from './html.js';
import { embedUrl, parseTime, formatTime } from './reel-data.js';

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

/** The reel's own captions, for a video file: <track kind="captions" default>. */
function captionTrack(r) {
  const c = r.captions ?? {}, src = safeUrl(c.src);
  return src ? html`<track kind="captions" src="${src}" srclang="${c.lang ?? ''}" label="${c.label ?? c.lang ?? 'Captions'}" default>` : '';
}

export function mountReel(frame, data) {
  const r = data?.reel ?? {};
  const focus = () => frame?.querySelector('[data-reel-focus]')?.focus({ preventScroll: true });
  if (!frame || !embedUrl(r)) {
    if (frame) slate(frame, data);
    return { focus, playFrom() {} };
  }

  const host = NAME[r.provider], poster = safeUrl(r.poster), runtime = parseTime(r.runtime);
  // A deep link into the reel: labelled, never played by itself. A time past the runtime is ignored.
  const asked = parseTime(new URLSearchParams(location.search).get('t'));
  const from = asked >= 1 && (runtime == null || asked < runtime) ? Math.floor(asked) : 0;
  let player = null;   // the <video> or <iframe>, once asked for

  function play(s = 0) {
    const at = Math.floor(parseTime(s) ?? 0);
    if (r.provider === 'file') {
      if (!player) {
        const src = embedUrl(r);
        put(frame, html`<video class="reel__video" controls playsinline preload="none" ${poster ? html`poster="${poster}"` : ''} data-reel-focus><source src="${src}">${captionTrack(r)}Your browser cannot play this video. <a href="${src}">Download the reel</a>.</video>`);
        player = frame.querySelector('video');
      }
      player.currentTime = at;   // before the metadata has loaded, this is where playback starts
      player.play()?.catch(() => { /* refused or interrupted: the controls are there */ });
    } else {
      // An embed cannot be sought from outside without its script API: a new player starts at that time.
      const iframe = document.createElement('iframe');
      iframe.className = 'reel__iframe';
      iframe.src = embedUrl(r, { start: at });
      iframe.title = `${r.title || 'Showreel'}: ${data.person?.name ?? ''}`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.setAttribute('data-reel-focus', '');
      frame.replaceChildren(iframe);
      player = iframe;
    }
    player.focus();
  }

  const label = `Play showreel${from ? ` from ${formatTime(from)}` : ''}${host ? ` (${host}, loads external player)` : ''}`;
  const shown = from ? `Play from ${formatTime(from)}` : `Play reel${runtime != null ? ` · ${formatTime(runtime)}` : ''}`;
  put(frame, html`
    <button class="reel-facade" type="button" aria-label="${label}" data-reel-focus>
      ${poster ? html`<img class="reel-facade__poster" src="${poster}" alt="" loading="lazy" decoding="async">` : html`<span class="reel-facade__poster reel-facade__poster--none" aria-hidden="true"></span>`}
      <span class="reel-facade__play" aria-hidden="true"><span></span></span>
      <span class="reel-facade__label cam-label" aria-hidden="true">${shown}${host ? ` · ${host}` : ''}</span>
    </button>`);
  frame.querySelector('.reel-facade').addEventListener('click', () => play(from), { once: true });
  return { focus, playFrom: play };
}
