// The reel's pure helpers (assets/js/site/reel-data.js and the shot index's renderer): times, every player
// URL (never YouTube's retired modestbranding), the label, the shots in reel order, the VideoObject and its
// key moments, the no-JS fallback, and the runtime limits the data check holds the reel to.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../../data/portfolio.js';
import * as RD from '../../assets/js/site/reel-data.js';
import { renderReelIndex } from '../../assets/js/site/reel-index.js';
import { fixtureData } from '../lib/fixture.mjs';
import { validateData } from '../lib/schema.mjs';

const VIMEO = { provider: 'vimeo', id: '123456789', hash: null, captions: null };
const YOUTUBE = { provider: 'youtube', id: 'abcDEF12345', captions: null };
const FILE = { provider: 'file', src: 'media/reel/reel.mp4', captions: null };

test('parseTime / formatTime / isoDuration', () => {
  for (const [t, s] of [['1:02', 62], ['0:12', 12], ['1:02:03', 3723], ['10:00', 600], [62, 62], [0, 0], ['62', 62], ['8.5', 8.5], ['1m2s', 62], ['2s', 2], ['1h', 3600], [' 1:30 ', 90]]) {
    assert.equal(RD.parseTime(t), s, String(t));
  }
  for (const t of ['ninety', '1:62', '1:2', '', null, undefined, -1, NaN, Infinity, '1:02:03:04', 'm', '-5', '/1']) assert.equal(RD.parseTime(t), null, String(t));
  assert.equal(RD.formatTime(62), '1:02');
  assert.equal(RD.formatTime('0:08'), '0:08');
  assert.equal(RD.formatTime(62.9), '1:02');
  assert.equal(RD.formatTime(3723), '1:02:03');
  assert.equal(RD.formatTime(62, { pad: true }), '01:02');
  assert.equal(RD.formatTime(8, { pad: true }), '00:08');
  assert.equal(RD.formatTime(3723, { pad: true }), '01:02:03');
  assert.equal(RD.formatTime('soon'), '');
  assert.equal(RD.isoDuration(90), 'PT1M30S');
  assert.equal(RD.isoDuration('1:30'), 'PT1M30S');
  assert.equal(RD.isoDuration(45), 'PT45S');
  assert.equal(RD.isoDuration(120), 'PT2M0S');
  assert.equal(RD.isoDuration(3723), 'PT1H2M3S');
  assert.equal(RD.isoDuration('soon'), '');
});

test('embedUrl: Vimeo with dnt, the unlisted hash, texttrack and #t=, never modestbranding', () => {
  const base = 'https://player.vimeo.com/video/123456789?autoplay=1&dnt=1&title=0&byline=0&portrait=0';
  assert.equal(RD.embedUrl(VIMEO), base);
  assert.equal(RD.embedUrl({ ...VIMEO, hash: 'abcdef1234' }), `${base}&h=abcdef1234`);
  assert.equal(RD.embedUrl({ ...VIMEO, captions: { lang: 'en', label: 'English' } }), `${base}&texttrack=en`);
  assert.equal(RD.embedUrl(VIMEO, { start: 62 }), `${base}#t=1m2s`);
  assert.equal(RD.embedUrl(VIMEO, { start: 42 }), `${base}#t=0m42s`);
  assert.equal(RD.embedUrl(VIMEO, { start: '1:30' }), `${base}#t=1m30s`);
  assert.equal(RD.embedUrl({ ...VIMEO, hash: 'abcdef1234', captions: { lang: 'pt-BR', label: 'Português' } }, { start: 8 }), `${base}&h=abcdef1234&texttrack=pt-BR#t=0m8s`);
  assert.equal(RD.embedUrl(VIMEO, { autoplay: false }), 'https://player.vimeo.com/video/123456789?dnt=1&title=0&byline=0&portrait=0');
  assert.equal(RD.embedUrl({ ...VIMEO, hash: 'not a hash!' }), base, 'a malformed hash is left out');
  assert.equal(RD.embedUrl({ ...VIMEO, captions: { lang: 'en"><x', label: 'x' } }), base, 'a malformed language is left out');
  assert.equal(RD.embedUrl({ ...VIMEO, id: '12ab' }), '');
  assert.equal(RD.embedUrl({ ...VIMEO, id: null }), '');
});

test('embedUrl: YouTube privacy-enhanced with rel, playsinline, captions and start, never modestbranding', () => {
  const base = 'https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0&playsinline=1';
  assert.equal(RD.embedUrl(YOUTUBE), base);
  assert.equal(RD.embedUrl(YOUTUBE, { start: 62 }), `${base}&start=62`);
  assert.equal(RD.embedUrl({ ...YOUTUBE, captions: { lang: 'en', label: 'English' } }, { start: 8 }), `${base}&cc_load_policy=1&cc_lang_pref=en&start=8`);
  assert.equal(RD.embedUrl(YOUTUBE, { start: 0.4 }), base, 'under a second is the start');
  assert.equal(RD.embedUrl({ ...YOUTUBE, id: 'a b<c' }), '');
  for (const r of [VIMEO, YOUTUBE, { ...YOUTUBE, captions: { lang: 'en', label: 'English' } }]) {
    for (const start of [0, 8, 62]) assert.doesNotMatch(RD.embedUrl(r, { start }), /modestbranding/);
  }
});

test('embedUrl: a video file with a media fragment; nothing playable gives ""', () => {
  assert.equal(RD.embedUrl(FILE), 'media/reel/reel.mp4');
  assert.equal(RD.embedUrl(FILE, { start: 8 }), 'media/reel/reel.mp4#t=8');
  assert.equal(RD.embedUrl({ ...FILE, src: 'media/reel/reel.mp4#t=30' }, { start: 8 }), 'media/reel/reel.mp4#t=8');
  assert.equal(RD.embedUrl({ ...FILE, src: '/media/reel/reel.mp4' }), '', 'root-relative URLs never pass');
  assert.equal(RD.embedUrl({ ...FILE, src: 'javascript:alert(1)' }), '');
  assert.equal(RD.embedUrl(data.reel), '', 'the real data has no reel yet');
  assert.equal(RD.embedUrl(null), '');
});

test('reelLabel: "Reel 2026 · updated October 2026 · 1:30", else "Runtime 1:30"', () => {
  assert.equal(RD.reelLabel({ updated: '2026-10', runtime: '1:30' }), 'Reel 2026 · updated October 2026 · 1:30');
  assert.equal(RD.reelLabel({ updated: '2025-01', runtime: 95 }), 'Reel 2025 · updated January 2025 · 1:35');
  assert.equal(RD.reelLabel({ updated: '2026-10' }), 'Reel 2026 · updated October 2026');
  assert.equal(RD.reelLabel({ runtime: '1:30' }), 'Runtime 1:30');
  assert.equal(RD.reelLabel({ updated: '2026-13', runtime: '1:30' }), 'Runtime 1:30', 'not a month');
  assert.equal(RD.reelLabel({ updated: null, runtime: null }), '');
  assert.equal(RD.reelLabel(data.reel), 'Runtime 1:30');
  assert.equal(RD.reelLabel(fixtureData().reel), 'Reel 2026 · updated October 2026 · 1:30');
});

test('reelShots: reel order, inside the runtime, the film\'s title when the shot has none', () => {
  const d = fixtureData();
  const shots = RD.reelShots(d);
  assert.deepEqual(shots.map(s => s.t), [2, 5, 8, 11, 14, 17]);
  assert.equal(shots[0].title, d.films[0].title);
  assert.equal(shots[0].film.slug, d.films[0].slug);
  assert.equal(shots[0].thumb, d.reel.shots[0].thumb);
  d.reel.shots = [{ t: '0:05', title: 'Own title', film: d.films[1].slug }, { t: '0:03' }, { t: 'soon' }, { t: '0:09', thumb: '/abs.jpg' }, { t: '0:20' }];
  d.reel.runtime = '0:20';
  assert.deepEqual(RD.reelShots(d).map(s => [s.t, s.title, s.thumb]), [[5, 'Own title', null], [9, '', null]], 'out of order, not a time, at the runtime and unsafe thumbs are left out');
  assert.deepEqual(RD.reelShots(data), []);
});

test('videoObjectLD: null without a reel, a poster and an upload date; otherwise every field and the key moments', () => {
  assert.equal(RD.videoObjectLD(data), null);
  const fx = fixtureData();
  for (const over of [{ poster: null }, { uploadDate: null }, { provider: null }, { poster: '/abs.jpg' }]) {
    assert.equal(RD.videoObjectLD(fixtureData({ reel: over })), null, JSON.stringify(over));
  }
  const v = RD.videoObjectLD(fx);
  const site = fx.site.url;
  assert.equal(v['@type'], 'VideoObject');
  assert.equal(v.name, `Showreel — ${fx.person.name}`);
  assert.equal(v.description, `Cinematography by ${fx.person.name}. Reel 2026 · updated October 2026 · 1:30. No dialogue — instrumental.`);
  assert.equal(v.thumbnailUrl, `${site}${fx.reel.poster}`);
  assert.equal(v.uploadDate, '2026-10-12');
  assert.equal(v.duration, 'PT1M30S');
  assert.equal(v.contentUrl, `${site}${fx.reel.src}`, 'a video file is its own content URL');
  assert.equal(v.embedUrl, undefined);
  const clips = v.hasPart;
  assert.equal(clips.length, 6);
  assert.ok(clips.every(c => c['@type'] === 'Clip' && Number.isFinite(c.startOffset) && c.endOffset > c.startOffset));
  assert.deepEqual(clips.map(c => c.startOffset), [2, 5, 8, 11, 14, 17]);
  assert.deepEqual(clips.map(c => c.endOffset), [5, 8, 11, 14, 17, 90], 'each ends at the next shot, the last at the runtime');
  assert.equal(clips[2].url, `${site}?t=8#reel`);
  assert.equal(clips[0].name, fx.films[0].title);
  assert.ok(JSON.stringify(v).length < 4000);

  const vimeo = RD.videoObjectLD(fixtureData({ reel: { ...VIMEO, hash: 'abcdef1234' } }));
  assert.equal(vimeo.embedUrl, 'https://player.vimeo.com/video/123456789?h=abcdef1234');
  assert.equal(vimeo.contentUrl, undefined);
  assert.equal(RD.videoObjectLD(fixtureData({ reel: YOUTUBE })).embedUrl, 'https://www.youtube-nocookie.com/embed/abcDEF12345');
  const bare = RD.videoObjectLD(fixtureData({ reel: { runtime: null, shots: [{ t: '0:04' }], updated: null, dialogue: null } }));
  assert.equal(bare.duration, undefined);
  assert.deepEqual(bare.hasPart, [{ '@type': 'Clip', name: 'Shot 1', startOffset: 4, url: `${site}?t=4#reel` }], 'no endOffset without a next shot or a runtime');
});

test('runtime caps: the data check fails a reel over 3:00, and no key moment runs past the runtime', () => {
  const check = d => validateData(d, { exists: () => true, size: () => 1, now: new Date('2026-10-31T00:00:00Z') });
  assert.ok(check(fixtureData({ reel: { runtime: '3:01' } })).fails.some(f => /reel\.runtime 3:01 is over 3:00/.test(f)));
  assert.ok(check(fixtureData({ reel: { runtime: '2:00' } })).fails.every(f => !/reel\.runtime/.test(f)));
  const short = fixtureData({ reel: { runtime: '0:15' } });
  assert.ok(check(short).fails.some(f => /reel\.shots\[5\]\.t 0:17 is not inside the reel's 0:15/.test(f)));
  const clips = RD.videoObjectLD(short).hasPart;
  assert.deepEqual(clips.map(c => [c.startOffset, c.endOffset]), [[2, 5], [5, 8], [8, 11], [11, 14], [14, 15]]);
});

test('renderReelFallback: the poster and a link to the reel on its host, for crawlers', () => {
  assert.equal(String(RD.renderReelFallback(data)), '');
  const vimeo = String(RD.renderReelFallback(fixtureData({ reel: { ...VIMEO, hash: 'abcdef1234' } })));
  assert.match(vimeo, /<a class="reel-fallback" href="https:\/\/vimeo\.com\/123456789\/abcdef1234" rel="noopener">/);
  assert.match(vimeo, /Watch the reel on Vimeo <span aria-hidden="true">↗<\/span>/);
  assert.match(vimeo, /<img class="reel-fallback__poster" src="media\/studies\/title\/poster\.jpg" alt=""/);
  assert.match(String(RD.renderReelFallback(fixtureData({ reel: YOUTUBE }))), /href="https:\/\/www\.youtube\.com\/watch\?v=abcDEF12345"[\s\S]*Watch the reel on YouTube/);
  const file = String(RD.renderReelFallback(fixtureData({ reel: { poster: 'javascript:alert(1)' } })));
  assert.match(file, /href="\.artifacts\/fixtures\/reel\.mp4">[\s\S]*Watch the reel<\/span>/);
  assert.doesNotMatch(file, /<img|javascript:/, 'an unsafe poster is left out');
});

test('renderReelIndex: hidden without a reel; tiles from the owner\'s thumbs or a real still, never a procedural one', () => {
  assert.equal(String(renderReelIndex(data)), '');
  assert.equal(String(renderReelIndex(fixtureData({ reel: { shots: [], dialogue: null } }))), '', 'no shots and no note: nothing');
  const note = String(renderReelIndex(fixtureData({ reel: { shots: [] } })));
  assert.match(note, /<p class="reel-note cam-label">No dialogue — instrumental<\/p>/);
  assert.doesNotMatch(note, /reel-index|aria-live/);

  const fx = fixtureData();
  const out = String(renderReelIndex(fx));
  assert.match(out, /<ol class="reel-index" role="list" aria-label="Shot index">/);
  assert.equal(out.match(/<button class="reel-shot" type="button" data-reel-t="/g).length, 6);
  assert.match(out, /data-reel-t="8" aria-label="Play the reel from 0:08 — [^"]+, 50 mm"/);
  assert.match(out, /<span class="reel-shot__tc">00:08<\/span>/);
  assert.match(out, /<p class="visually-hidden" aria-live="polite" data-reel-live><\/p>/);
  for (const s of fx.reel.shots) assert.ok(out.includes(`src="${s.thumb}"`), s.thumb);
  assert.doesNotMatch(out, /src="\/|blob:|data:/);

  // Without its own thumb a shot shows its film's real featured still (fixture film 0), and a sample film
  // (fixture film 1, procedural frames only) shows none.
  const bare = fixtureData();
  for (const s of bare.reel.shots) delete s.thumb;
  const tiles = String(renderReelIndex(bare)).split('<li class="reel-index__item">').slice(1);
  const lead = bare.films[0].stills.find(s => s.featured);
  assert.match(tiles[0], new RegExp(`<img src="${lead.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" srcset="[^"]+" sizes="[^"]+"`));
  assert.doesNotMatch(tiles[1], /<img/);

  const evil = fixtureData();
  evil.reel.shots[0] = { t: '0:02', title: '<script>x</script>"', lens: '40 mm', note: '"><img src=x>' };
  const e = String(renderReelIndex(evil));
  assert.doesNotMatch(e, /<script>|"><img src=x>/);
  assert.match(e, /&lt;script&gt;x&lt;\/script&gt;&quot;/);
});
