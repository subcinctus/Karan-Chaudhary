// Check plugin (static + browser): the reel, as the plan's "Reel" describes it. It stays hidden until
// data/portfolio.js has a playable reel, so the browser half plays the fixture's (tools/lib/fixture.mjs).
//
//   static  reel: the reel's markup for the real data and the fixture (a video file, Vimeo, YouTube) holds
//           no root-relative or script URL; no site script asks YouTube for modestbranding; the real data
//           has no VideoObject.
//   browser reel, on the index:
//     - real data: #reel, its nav link and the shot index stay hidden, and nothing from Vimeo or YouTube loads;
//     - a video file (a VP9 copy of the generated test clip: this Chromium has no H.264 decoder): the section
//       shows with its label and "No dialogue — instrumental", one tile per shot (the owner's thumbs, never a
//       procedural still); shot 3 plays from its time (the first range played starts within 0.5 s of it, the
//       picture decodes, the server answers 206), focus is on the player, the live region says "Playing from
//       0:08" and the captions track shows; a later shot seeks the same video; ?t=8 labels the facade and
//       plays nothing until asked; screenshots fixture--reel--WxH.png;
//     - Vimeo and YouTube, routed to stubs (no network): nothing loads until asked; a shot's player URL
//       carries #t= or start=, texttrack or cc_load_policy, and never modestbranding; ?t=62 labels the facade
//       "Play from 1:02" and the player starts there.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FFMPEG, BT709_TAGS, YUV709, hasFfmpeg, run } from '../lib/ffmpeg.mjs';

/** The test reel as VP9: Playwright's Chromium cannot decode the H.264 clip ensureTestClip() makes. */
const WEBM = '.artifacts/fixtures/reel.webm';
const VIMEO = { provider: 'vimeo', id: '123456789', hash: 'abcdef1234', src: null, captions: { lang: 'en', label: 'English', src: null } };
const YOUTUBE = { provider: 'youtube', id: 'FIXTUREyt01', hash: null, src: null, captions: { lang: 'en', label: 'English', src: null } };
const STUB = '<!doctype html><title>Player stub</title><body style="margin:0;background:#000">';
const EMBED_HOST = /^https:\/\/(player\.vimeo\.com|www\.youtube-nocookie\.com|www\.youtube\.com|vimeo\.com)\//;

/** The 20 s testsrc2 pattern as a 640×360 VP9 WebM with a keyframe every second, made once (git-ignored). */
async function ensureWebm(abs) {
  const out = abs(WEBM);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return WEBM;
  if (!hasFfmpeg()) return null;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out.replace(/\.webm$/, `.${process.pid}.tmp.webm`);
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-t', '20',
    '-vf', YUV709, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '400k', '-g', '24',
    ...BT709_TAGS, '-an', tmp]);
  fs.renameSync(tmp, out);
  return WEBM;
}

/** Root-relative and script URLs in markup: attributes, every srcset candidate. */
function badUrls(markup) {
  const s = String(markup), hits = [];
  for (const m of s.matchAll(/\b(?:href|src|poster)\s*=\s*"\s*(?:\/(?!\/)|javascript:)[^"]*"/gi)) hits.push(m[0]);
  for (const m of s.matchAll(/\bsrcset\s*=\s*"([^"]*)"/g)) if (m[1].split(',').some(c => /^\/(?!\/)/.test(c.trim()))) hits.push(m[0]);
  return hits;
}

async function runStatic({ pass, fail, R, abs, read, walk, splitComments, loadData, fixture }) {
  const RD = await import(pathToFileURL(abs('assets/js/site/reel-data.js')).href);
  const data = await loadData();
  const sets = [['data/portfolio.js', data], ['the fixture (a video file)', fixture.fixtureData()],
    ['the fixture on Vimeo', fixture.fixtureData({ reel: VIMEO })], ['the fixture on YouTube', fixture.fixtureData({ reel: YOUTUBE })]];
  const bad = [];
  for (const [name, d] of sets) {
    const markup = String(R.renderReel(d));
    if (name !== 'data/portfolio.js' && !markup.includes('data-reel-frame')) bad.push(`${name}: no reel rendered`);
    for (const h of badUrls(markup)) bad.push(`${name}: ${h}`);
  }
  if (bad.length) fail(`reel markup: ${bad.slice(0, 6).join('; ')}`);
  else pass(`reel markup (the real data, and the fixture as a file, on Vimeo and on YouTube) has only relative and https URLs`);

  const asks = walk('assets/js', f => f.endsWith('.js')).filter(f => /modestbranding/.test(splitComments(read(f)).code));
  if (asks.length) fail(`YouTube's modestbranding (no effect since 2023) is still requested in ${asks.join(', ')}`);
  else pass('no site script asks YouTube for modestbranding');

  if (RD.videoObjectLD(data)) fail('data/portfolio.js has no playable reel, yet videoObjectLD() returns a VideoObject');
  else pass(`no VideoObject for the real data (${R.hasReel(data) ? 'no poster or upload date' : 'no reel yet'})`);
}

// ------------------------------------------------------------------------------------------------ browser

/** The index, settled, with the main title skipped (it plays once per session). */
async function openIndex(ctx, api, query = '') {
  const { srv } = api.browser();
  const page = await ctx.newPage();
  const { errors } = api.watch(page, srv);
  await page.goto(srv.url + `index.html${query}`, { waitUntil: 'load', timeout: 45000 });
  await api.settle(page, { name: 'index', path: 'index.html' }, { reduced: false });
  return { page, errors };
}

const reelFacts = page => page.evaluate(() => {
  const reel = document.getElementById('reel');
  const box = reel?.getBoundingClientRect();
  return {
    hidden: !reel || reel.hidden || !box?.height,
    navHidden: [...document.querySelectorAll('.site-nav a[href$="#reel"]')].every(a => a.closest('li')?.hidden),
    aside: reel?.querySelector('.section-head__aside')?.textContent.trim() ?? '',
    note: reel?.querySelector('.reel-note')?.textContent.trim() ?? '',
    shots: [...(reel?.querySelectorAll('.reel-shot') ?? [])].map(b => ({ t: Number(b.dataset.reelT), label: b.getAttribute('aria-label'), img: b.querySelector('img')?.getAttribute('src') ?? null, tc: b.querySelector('.reel-shot__tc')?.textContent })),
    facade: reel?.querySelector('.reel-facade__label')?.textContent.trim() ?? '',
    players: reel?.querySelectorAll('video, iframe').length ?? 0,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
});

/**
 * Where the reel's video lands: every "seeked" and "playing" with its currentTime, from the moment the video
 * is made. (Its played ranges cannot tell: Chromium starts the first range at 0 when a new video seeks to its
 * start position before it plays.)
 */
const SEEK_LOG = () => {
  window.__reelEvents = [];
  new MutationObserver(() => {
    const v = document.querySelector('#reel .reel__video');
    if (!v || v.__kcWatched) return;
    v.__kcWatched = true;
    for (const type of ['seeked', 'playing']) v.addEventListener(type, () => window.__reelEvents.push({ type, t: v.currentTime }));
  }).observe(document, { childList: true, subtree: true });
};

/** Bring the section through the viewport (its entrances play, its lazy images load), for a screenshot. */
const showReel = page => page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const reel = document.getElementById('reel');
  const go = y => (window.__motion?.lenis ? window.__motion.lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y));
  const top = reel.getBoundingClientRect().top + scrollY;
  for (let y = top - 100; y < top + reel.offsetHeight; y += Math.round(innerHeight * 0.6)) { go(y); await wait(250); }
  go(top - 72);
  const t0 = performance.now();
  while ([...reel.querySelectorAll('img')].some(i => !i.complete) && performance.now() - t0 < 8000) await wait(150);
  await wait(1200);
});

/** Click a tile (or the facade) and wait for the player. */
async function press(page, selector) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => { window.__reelEvents = []; });
  await el.click();
  await page.waitForFunction(() => document.querySelector('#reel .reel__video, #reel .reel__iframe'), null, { timeout: 10000 });
}

/** Wait until the video plays on past `t` (a real decode), then read where it landed, focus, the live region, captions. */
async function playedFrom(page, t) {
  await page.waitForFunction(at => {
    const v = document.querySelector('#reel .reel__video');
    return v && (v.error || (v.readyState >= 2 && window.__reelEvents.length && v.currentTime > at + 0.1));
  }, t, { timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const v = document.querySelector('#reel .reel__video');
    if (!v) return null;
    const track = v.textTracks[0];
    return {
      landed: window.__reelEvents.find(e => e.type === 'seeked' || e.type === 'playing')?.t ?? null,
      events: window.__reelEvents.map(e => `${e.type} ${e.t.toFixed(2)}`),
      t: v.currentTime, ready: v.readyState, width: v.videoWidth, error: v.error?.code ?? null,
      focused: document.activeElement === v, live: document.querySelector('[data-reel-live]')?.textContent ?? '',
      current: document.querySelector('.reel-shot[aria-current="true"]')?.dataset.reelT ?? null,
      track: track ? { kind: track.kind, mode: track.mode, cues: track.cues?.length ?? 0, isDefault: !!v.querySelector('track[default]') } : null,
    };
  });
}

async function runBrowser(api) {
  const { OPT, pass, fail, skip, info, browser, fixture, abs } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  if (OPT.only && !OPT.only.some(o => 'index'.includes(o))) return skip('skipped: --only does not name the index');
  const RD = await import(pathToFileURL(abs('assets/js/site/reel-data.js')).href);
  const vps = OPT.viewports;
  const desktop = vps.find(([w]) => w >= 1024) ?? vps[0], phone = vps.find(([w]) => w < 720) ?? null;
  const clean = (errors, tag) => (errors.length ? fail(`${tag}: ${errors.length} console/page error(s): ${errors.slice(0, 4).join(' | ')}`) : pass(`${tag}: no console or page errors`));
  const newContext = async ([w, h, dpr], { data = null, stub = null } = {}) => {
    const ctx = await chromium.newContext({ ...contextOptions({ w, h, dpr }), hasTouch: w < 720 });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
    await ctx.addInitScript(SEEK_LOG);
    const external = [];
    await ctx.route(u => EMBED_HOST.test(u.href), r => {
      external.push(r.request().url());
      return stub ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: STUB }) : r.abort();
    });
    if (data) { await fixture.routeFixture(ctx, srv, data); await fixture.stampFixture(ctx); }
    return { ctx, external };
  };

  // --- The real data: no reel yet, so nothing of it shows or loads.
  {
    const tag = `real data ${desktop[0]}×${desktop[1]}`;
    const { ctx, external } = await newContext(desktop);
    try {
      const { page, errors } = await openIndex(ctx, api);
      const f = await reelFacts(page);
      if (!f.hidden || !f.navHidden || f.shots.length || f.players || external.length) fail(`${tag}: the reel shows or loads without a playable reel (section hidden ${f.hidden}, nav link hidden ${f.navHidden}, ${f.shots.length} shot(s), ${f.players} player(s), ${external.length} external request(s))`);
      else pass(`${tag}: #reel, its nav link and the shot index stay hidden; nothing from Vimeo or YouTube loads`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- A video file: the label, the note, the shot index, seeking, focus, the live region, captions.
  let clip = null;
  try { clip = await ensureWebm(abs); } catch (e) { fail(`test clip: ${e.message.split('\n')[0]}`); }
  if (!clip) skip('skipped: video file reel (no ffmpeg to make the test clip)');
  const fx = clip ? fixture.fixtureData({ reel: { src: clip } }) : null;
  const shots = fx ? RD.reelShots(fx) : [];
  for (const vp of clip ? [desktop, phone].filter(Boolean) : []) {
    const [w, h] = vp, tag = `fixture video file ${w}×${h}`;
    const { ctx, external } = await newContext(vp, { data: fx });
    try {
      const { page, errors } = await openIndex(ctx, api);
      const media = [];
      page.on('response', r => { if (r.url().endsWith(clip)) media.push(r.status()); });
      const f = await reelFacts(page);
      const want = { aside: RD.reelLabel(fx.reel), labels: shots.map(s => `Play the reel from ${RD.formatTime(s.t)}${s.title ? ` — ${s.title}` : ''}${s.lens ? `, ${s.lens}` : ''}`) };
      const probs = [];
      if (f.hidden) probs.push('#reel is hidden');
      if (f.aside !== want.aside) probs.push(`label "${f.aside}" (want "${want.aside}")`);
      if (f.note !== 'No dialogue — instrumental') probs.push(`dialogue note "${f.note}"`);
      if (f.shots.map(s => s.label).join('|') !== want.labels.join('|')) probs.push(`tiles ${JSON.stringify(f.shots.map(s => s.label))}`);
      if (f.shots.some((s, i) => s.img !== shots[i].thumb)) probs.push(`tile images ${JSON.stringify(f.shots.map(s => s.img))} (want the owner's thumbs)`);
      if (f.players) probs.push('a player loaded before anyone asked');
      if (f.overflow) probs.push('horizontal overflow');
      if (probs.length) fail(`${tag}: ${probs.join('; ')}`);
      else pass(`${tag}: the section shows "${f.aside}" and "${f.note}"; ${f.shots.length} tiles (${f.shots[0]?.tc} … ${f.shots.at(-1)?.tc}) with the owner's thumbs, labelled "${f.shots[2]?.label}"; nothing plays until asked`);
      await showReel(page);
      await page.locator('#reel').screenshot({ path: fixture.fixtureShot(`reel--${w}x${h}`) });

      // Shot 3, then shot 5 on the same video.
      for (const i of [2, 4]) {
        const t = shots[i]?.t;
        if (t == null) continue;
        await press(page, `.reel-shot >> nth=${i}`);
        const v = await playedFrom(page, t);
        const label = `Playing from ${RD.formatTime(t)}`;
        if (!v || v.error || !(v.width > 0) || v.landed == null || Math.abs(v.landed - t) > 0.5 || !(v.t > t)) fail(`${tag}: shot ${i + 1} (${RD.formatTime(t)}): ${v ? `events ${v.events.join(', ') || 'none'}, currentTime ${v.t.toFixed(2)}, readyState ${v.ready}, ${v.width} px wide, error ${v.error}` : 'no video'}`);
        else if (!v.focused || v.live !== label || v.current !== String(t)) fail(`${tag}: shot ${i + 1}: focus on the player ${v.focused}, live region "${v.live}" (want "${label}"), aria-current on ${v.current}`);
        else pass(`${tag}: shot ${i + 1} lands at ${v.landed.toFixed(2)} s (its time ${t} s) and plays on (${v.t.toFixed(2)} s, ${v.width} px decoded); focus on the player, "${v.live}", the tile marked current`);
        if (i === 2) {
          if (!v?.track?.isDefault || v.track.kind !== 'captions' || v.track.mode !== 'showing' || !v.track.cues) fail(`${tag}: captions track ${JSON.stringify(v?.track)} (want a default captions track showing its cues)`);
          else pass(`${tag}: the captions track is the default and shows (${v.track.cues} cues from ${fx.reel.captions.src}, served as text/vtt)`);
        }
      }
      if (!media.includes(206)) fail(`${tag}: the clip was never served in a range (statuses ${[...new Set(media)].join(', ') || 'none'}): seeking needs HTTP Range`);
      else pass(`${tag}: the clip is served in ranges (${media.filter(s => s === 206).length} × 206)`);
      if (external.length) fail(`${tag}: requests to a video host: ${external.slice(0, 3).join(', ')}`);
      clean(errors, tag);

      // A deep link: ?t=8 labels the facade, plays nothing, then starts there when asked.
      if (vp === desktop && shots[2]) {
        const t = shots[2].t, dtag = `${tag} ?t=${t}`;
        const { page: dp, errors: derr } = await openIndex(ctx, api, `?t=${t}#reel`);
        const d = await reelFacts(dp);
        await press(dp, '.reel-facade');
        const v = await playedFrom(dp, t);
        if (d.facade !== `Play from ${RD.formatTime(t)}` || d.players) fail(`${dtag}: the facade reads "${d.facade}" with ${d.players} player(s) loaded (want "Play from ${RD.formatTime(t)}" and none)`);
        else if (v?.landed == null || Math.abs(v.landed - t) > 0.5) fail(`${dtag}: pressed, the video went ${v?.events.join(', ') || 'nowhere'} (want ${t} s, within 0.5 s)`);
        else pass(`${dtag}: the facade reads "${d.facade}", nothing plays until it is pressed, then playback starts at ${v.landed.toFixed(2)} s`);
        clean(derr, dtag);
      }
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- Vimeo and YouTube, routed to stubs: the player URLs a shot and a deep link ask for.
  const embeds = [
    ['Vimeo', VIMEO, t => [`#t=${Math.floor(t / 60)}m${t % 60}s`, 'texttrack=en', 'h=abcdef1234', 'dnt=1'], /^https:\/\/player\.vimeo\.com\/video\/123456789\?/],
    ['YouTube', YOUTUBE, t => [`start=${t}`, 'cc_load_policy=1', 'cc_lang_pref=en', 'rel=0', 'playsinline=1'], /^https:\/\/www\.youtube-nocookie\.com\/embed\/FIXTUREyt01\?/],
  ];
  for (const [name, reel, wants, base] of embeds) {
    const d = fixture.fixtureData({ reel });
    const t = RD.reelShots(d)[2]?.t;
    const tag = `fixture ${name} ${desktop[0]}×${desktop[1]}`;
    const { ctx, external } = await newContext(desktop, { data: d, stub: true });
    try {
      const { page, errors } = await openIndex(ctx, api);
      const before = external.length;
      await press(page, `.reel-shot >> nth=2`);
      const src = await page.evaluate(() => document.querySelector('#reel .reel__iframe')?.getAttribute('src') ?? '');
      await page.waitForTimeout(400);
      const got = await page.evaluate(() => ({ focused: document.activeElement?.matches?.('.reel__iframe') ?? false, live: document.querySelector('[data-reel-live]')?.textContent ?? '' }));
      const missing = wants(t).filter(p => !src.includes(p));
      if (before) fail(`${tag}: ${before} request(s) to ${name} before anyone pressed play`);
      else if (!base.test(src) || missing.length || /modestbranding/.test(src) || !external.some(u => base.test(u))) fail(`${tag}: shot 3 asked for "${src}" (missing ${missing.join(', ') || 'nothing'}; requested ${external.length})`);
      else if (!got.focused || got.live !== `Playing from ${RD.formatTime(t)}`) fail(`${tag}: after shot 3, focus on the player ${got.focused}, live region "${got.live}"`);
      else pass(`${tag}: nothing loads until asked; shot 3 opens ${src} (no modestbranding), focus on the player, "${got.live}"`);
      clean(errors, tag);

      const prior = external.length;
      const { page: dp, errors: derr } = await openIndex(ctx, api, '?t=62#reel');
      const f = await reelFacts(dp);
      const early = external.length - prior;
      await press(dp, '.reel-facade');
      const dsrc = await dp.evaluate(() => document.querySelector('#reel .reel__iframe')?.getAttribute('src') ?? '');
      const at = wants(62)[0];
      if (f.facade !== `Play from 1:02 · ${name}` || f.players || early) fail(`${tag} ?t=62: the facade reads "${f.facade}", with ${f.players} player(s) and ${early} request(s) to ${name} before it was pressed`);
      else if (!dsrc.includes(at) || /modestbranding/.test(dsrc)) fail(`${tag} ?t=62: the facade opened "${dsrc}" (want ${at})`);
      else pass(`${tag} ?t=62: the facade reads "${f.facade}" and loads nothing until pressed, then opens the player at ${at}`);
      clean(derr, `${tag} ?t=62`);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
  info('The video file plays a VP9 copy of the fixture clip: this Chromium build has no H.264 decoder, and a <video> it cannot decode still reads back the currentTime it was given.');
}

export const staticSections = [{ name: 'reel', title: 'Reel renderers: relative URLs only, no modestbranding, no VideoObject without a reel', run: runStatic }];
export const browserSections = [{ name: 'reel', title: 'Reel (fixture): hidden without a reel; label, shot index seeking, captions, embeds, ?t=', run: runBrowser }];
