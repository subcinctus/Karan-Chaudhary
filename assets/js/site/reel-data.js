// The reel's data helpers: times, the player URLs (Vimeo hash, captions and #t=; YouTube start and
// captions, never the retired modestbranding), the "Reel 2026 · updated October 2026 · 1:30" label, the
// shot index in reel order, VideoObject JSON-LD with the shots as key moments, and the no-JS fallback.
// Pure and Node-safe (tools/test/, tools/prerender.mjs); import ./html.js, never ./render.js.
// render.js renderReel() uses reelLabel() for the section head's aside and renderReelFallback() inside
// the reel frame (mountReel replaces it); reel-index.js lists reelShots(); ld.js adds videoObjectLD().
//
// Sources (checked 2026-10):
//   YouTube: modestbranding has had no effect since 15 Aug 2023; start, cc_load_policy, cc_lang_pref,
//     rel, playsinline: https://developers.google.com/youtube/player_parameters
//   Vimeo: dnt, texttrack, h (an unlisted video's hash), #t=1m2s:
//     https://help.vimeo.com/hc/en-us/articles/12426260232977-Player-parameters-overview
//   VideoObject (name, thumbnailUrl and uploadDate required; Clip key moments):
//     https://developers.google.com/search/docs/appearance/structured-data/video

import { html, pad2, safeUrl, absUrl, hasReel } from './html.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOST = { vimeo: 'Vimeo', youtube: 'YouTube' };
/** Caption languages as BCP 47 tags ('en', 'pt-BR'); anything else is left out of a URL. */
const LANG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
/** A Vimeo unlisted link's hash (vimeo.com/123456789/abcdef1234), or ''. */
const hashOf = r => (/^[0-9a-z]+$/i.test(r?.hash ?? '') ? r.hash : '');

// --- Times ---------------------------------------------------------------------------------------

/** '1:02' → 62, '1:02:03' → 3723, 62 or '62' → 62, '1m2s' → 62 (a ?t= value); anything else → null. */
export function parseTime(t) {
  if (typeof t === 'number') return Number.isFinite(t) && t >= 0 ? t : null;
  const s = String(t ?? '').trim();
  let m = /^(?:(\d+):)?(\d{1,2}):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  m = /^(?=\d)(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(s);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}

/** 62 → '1:02', 3723 → '1:02:03'; { pad: true } → '01:02' (the shot index's timecode). Not a time → ''. */
export function formatTime(s, { pad = false } = {}) {
  const t = parseTime(s);
  if (t == null) return '';
  const whole = Math.floor(t), h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60;
  const mm = h || pad ? pad2(m) : String(m);
  return `${h ? `${pad ? pad2(h) : h}:` : ''}${mm}:${pad2(whole % 60)}`;
}

/** 90 or '1:30' → 'PT1M30S' (ISO 8601, VideoObject's duration). Not a time → ''. */
export function isoDuration(s) {
  const t = parseTime(s);
  if (t == null) return '';
  const whole = Math.floor(t), h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60;
  return `PT${h ? `${h}H` : ''}${h || m ? `${m}M` : ''}${whole % 60}S`;
}

// --- Player URLs and the label ----------------------------------------------------------------------

/**
 * The player URL for a reel, starting at `start` seconds (a shot of the index, a ?t= link):
 *   vimeo    https://player.vimeo.com/video/{id}?autoplay=1&dnt=1&title=0&byline=0&portrait=0[&h={hash}][&texttrack={lang}][#t={m}m{s}s]
 *   youtube  https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0&playsinline=1[&cc_load_policy=1&cc_lang_pref={lang}][&start={s}]
 *   file     {src}[#t={s}]
 * '' when the reel has nothing playable. autoplay: false leaves autoplay=1 out.
 */
export function embedUrl(reel, { start = 0, autoplay = true } = {}) {
  const r = reel ?? {};
  if (!hasReel({ reel: r })) return '';
  const at = Math.floor(parseTime(start) ?? 0);
  const lang = LANG.test(r.captions?.lang ?? '') ? r.captions.lang : '';
  if (r.provider === 'vimeo') {
    const q = [autoplay && 'autoplay=1', 'dnt=1', 'title=0', 'byline=0', 'portrait=0', hashOf(r) && `h=${hashOf(r)}`, lang && `texttrack=${lang}`];
    return `https://player.vimeo.com/video/${r.id}?${q.filter(Boolean).join('&')}${at ? `#t=${Math.floor(at / 60)}m${at % 60}s` : ''}`;
  }
  if (r.provider === 'youtube') {
    const q = [autoplay && 'autoplay=1', 'rel=0', 'playsinline=1', lang && `cc_load_policy=1&cc_lang_pref=${lang}`, at && `start=${at}`];
    return `https://www.youtube-nocookie.com/embed/${r.id}?${q.filter(Boolean).join('&')}`;
  }
  const src = safeUrl(r.src).split('#')[0];
  return at ? `${src}#t=${at}` : src;
}

/** "Reel 2026 · updated October 2026 · 1:30" (reel.updated 'YYYY-MM', reel.runtime); without the month, "Runtime 1:30". */
export function reelLabel(reel) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(reel?.updated ?? ''));
  const runtime = formatTime(reel?.runtime);
  if (!m) return runtime ? `Runtime ${runtime}` : '';
  return [`Reel ${m[1]}`, `updated ${MONTHS[Number(m[2]) - 1]} ${m[1]}`, runtime].filter(Boolean).join(' · ');
}

// --- The shot index -----------------------------------------------------------------------------------

/**
 * reel.shots in reel order, each { t (seconds), film (the film record or null), title, lens, note, thumb }.
 * A shot whose time is not a time, does not come after the one before or is not inside the runtime is
 * left out (the data check fails it). title: the shot's own, else its film's.
 */
export function reelShots(data) {
  const r = data?.reel ?? {};
  const runtime = parseTime(r.runtime);
  const films = new Map((data?.films ?? []).map(f => [f.slug, f]));
  const out = [];
  let last = -1;
  for (const s of Array.isArray(r.shots) ? r.shots : []) {
    const t = parseTime(s?.t);
    if (t == null || t <= last || (runtime != null && t >= runtime)) continue;
    last = t;
    const film = films.get(s.film) ?? null;
    out.push({ t, film, title: s.title || film?.title || '', lens: s.lens || '', note: s.note || '', thumb: safeUrl(s.thumb) });
  }
  return out;
}

// --- Search and no-JS -------------------------------------------------------------------------------

/**
 * VideoObject JSON-LD for the reel, the shot index as Clip key moments (startOffset; endOffset: the next
 * shot or the runtime; url: the home page's ?t= link). Null unless the reel is playable and has a
 * poster and an upload date.
 */
export function videoObjectLD(data) {
  const r = data?.reel ?? {};
  const poster = safeUrl(r.poster);
  if (!hasReel(data) || !poster || !r.uploadDate) return null;
  const runtime = parseTime(r.runtime);
  const shots = reelShots(data);
  const clips = shots.map((s, i) => {
    const end = shots[i + 1]?.t ?? runtime;
    return {
      '@type': 'Clip', name: s.title || `Shot ${i + 1}`, startOffset: s.t,
      ...(end > s.t ? { endOffset: end } : {}), url: absUrl(data, `?t=${s.t}#reel`),
    };
  });
  const player = r.provider === 'vimeo' ? `https://player.vimeo.com/video/${r.id}${hashOf(r) ? `?h=${hashOf(r)}` : ''}`
    : r.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${r.id}` : null;
  const name = data.person?.name;
  return {
    '@context': 'https://schema.org', '@type': 'VideoObject',
    name: [r.title || 'Showreel', name].filter(Boolean).join(' — '),
    description: `${[name && `Cinematography by ${name}`, reelLabel(r), r.dialogue === false && 'No dialogue — instrumental'].filter(Boolean).join('. ')}.`,
    thumbnailUrl: absUrl(data, poster),
    uploadDate: r.uploadDate,
    ...(runtime != null ? { duration: isoDuration(runtime) } : {}),
    ...(player ? { embedUrl: player } : { contentUrl: absUrl(data, embedUrl(r)) }),
    ...(clips.length ? { hasPart: clips } : {}),
  };
}

/**
 * The reel for visitors without JavaScript and for crawlers: the poster and a link to the reel on its
 * host ("Watch the reel on Vimeo ↗"), or to the video file. mountReel() replaces it with the player.
 */
export function renderReelFallback(data) {
  if (!hasReel(data)) return '';
  const r = data.reel, poster = safeUrl(r.poster), host = HOST[r.provider];
  const href = r.provider === 'vimeo' ? `https://vimeo.com/${r.id}${hashOf(r) ? `/${hashOf(r)}` : ''}`
    : r.provider === 'youtube' ? `https://www.youtube.com/watch?v=${r.id}` : embedUrl(r);
  return html`
    <a class="reel-fallback" href="${href}"${host ? html` rel="noopener"` : ''}>
      ${poster ? html`<img class="reel-fallback__poster" src="${poster}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="reel-fallback__label cam-label">${host ? html`Watch the reel on ${host} <span aria-hidden="true">↗</span>` : 'Watch the reel'}</span>
    </a>`;
}
