// Data schema (tools/lib/schema.mjs) and the fixture (tools/lib/fixture.mjs): the real data and the fixture
// pass; the honesty rules, reel limits and per-school photograph sets catch what they are for.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import real from '../../data/portfolio.js';
import { validateData, honestyIssues } from '../lib/schema.mjs';
import { fixtureData, FIXTURE_CLIP } from '../lib/fixture.mjs';
import { REPO_ROOT } from '../lib/server.mjs';

const NOW = new Date('2026-10-31T12:00:00Z');
/** The repo's files, plus the fixture reel (generated on demand, so it may not exist yet). */
const exists = p => p === FIXTURE_CLIP || fs.existsSync(path.join(REPO_ROOT, p));
const check = (d, o = {}) => validateData(d, { exists, now: NOW, ...o });
const has = (list, re) => list.some(m => re.test(m));
const show = list => `\n  ${list.join('\n  ')}`;

test('the real data passes the schema', () => {
  const { fails } = validateData(real, { now: NOW });
  assert.deepEqual(fails, [], show(fails));
});

test('the fixture passes the schema, cleanly, and leaves the real data alone', () => {
  const before = JSON.stringify(real);
  const d = fixtureData();
  const { fails, warns } = check(d);
  assert.deepEqual(fails, [], show(fails));
  assert.deepEqual(warns, [], show(warns));
  assert.equal(JSON.stringify(real), before, 'fixtureData() must not change the imported data');
  // The first two films are patched whatever their slugs; extra overrides merge on top.
  assert.equal(d.films[0].slug, real.films[0].slug);
  assert.equal(d.films[0].placeholder, false);
  assert.equal(d.films[1].placeholder, real.films[1].placeholder);
  assert.equal(d.films[1].crew[0].name, 'Crew Name D');
  assert.equal(d.reel.provider, 'file');
  assert.equal(d.reel.shots.length, 6);
  assert.deepEqual(d.reel.shots.map(s => s.film), real.films.slice(0, 6).map(f => f.slug));
  const e = fixtureData({ reel: { runtime: '2:00' }, films: { [real.films[2].slug]: { kind: 'exercise' } } });
  assert.equal(e.reel.runtime, '2:00');
  assert.equal(e.reel.provider, 'file');
  assert.equal(e.films[2].kind, 'exercise');
  assert.notEqual(fixtureData().films[0].stills, fixtureData().films[0].stills, 'each call is a fresh copy');
  assert.throws(() => fixtureData({ films: { 'no-such-film': {} } }), /no film with slug "no-such-film"/);
});

test('nested-placeholder guard: a sample block inside a film marked real fails', () => {
  const d = fixtureData();
  const slug = d.films[0].slug;
  d.films[0].lightingPlot.placeholder = true;
  d.films[0].sequences[0].placeholder = true;
  d.films[0].grade.log.placeholder = true;
  const { fails } = check(d);
  assert.ok(fails.includes(`films[0].lightingPlot is still the sample: replace or delete it (${slug} is marked real)`), show(fails));
  assert.ok(has(fails, /^films\[0\]\.sequences\[0\] is still the sample/), show(fails));
  assert.ok(has(fails, /^films\[0\]\.grade\.log is still the sample/), show(fails));
  // A sample film may hold sample blocks; with honesty: false the rules are left to the honesty plugin.
  d.films[1].placeholder = true;
  d.films[1].lightingPlot = { ...d.films[0].lightingPlot };
  assert.ok(!has(check(d).fails, /^films\[1\]/));
  assert.deepEqual(check(d, { honesty: false }).fails, []);
  assert.equal(honestyIssues(d).length, 3);
  // The same sample plot in a film that is then marked real fails too.
  d.films[1].placeholder = false;
  assert.ok(has(honestyIssues(d), /^films\[1\]\.lightingPlot is still the sample/));
});

test('laurels: a premiere or awards on a sample film fail; on a real film they pass', () => {
  const d = fixtureData();
  assert.equal(d.films[0].awards.length, 1, 'the fixture\'s real film has an award and a premiere');
  d.films[1].placeholder = true;
  d.films[1].premiere = { event: 'Festival', year: 2026 };
  d.films[1].awards = [{ title: 'Award', event: 'Festival', year: 2026 }];
  const { fails } = check(d);
  assert.deepEqual(fails, [`films[1] (${d.films[1].slug}) is a sample film but lists a premiere and 1 award(s): laurels are real facts only (remove them, or set placeholder: false once the film is real)`]);
  d.films[1].awards = [{ title: 'Award' }];
  d.films[1].premiere = { event: 'Festival', year: 2026, url: 'http://example.com' };
  d.films[1].placeholder = false;
  d.films[1].lightingPlot = null;
  const shape = check(d).fails;
  assert.ok(has(shape, /awards\[0\] must be \{ title, event, year, url\? \}/), show(shape));
  assert.ok(has(shape, /premiere must be \{ event, year, url\? \} \(url: https\)/), show(shape));
});

test('reel: over 3:00 fails, outside 1:00–2:30 warns, an old "updated" warns, shots ascend inside the runtime', () => {
  const reel = over => { const d = fixtureData(); Object.assign(d.reel, over); return check(d); };
  assert.ok(has(reel({ runtime: '3:01' }).fails, /reel\.runtime 3:01 is over 3:00/));
  assert.ok(has(reel({ runtime: '0:45' }).warns, /reel\.runtime 0:45 is outside 1:00–2:30/));
  assert.deepEqual(reel({ runtime: '2:30' }).warns, []);
  assert.ok(has(reel({ runtime: 'ninety' }).fails, /is not a time like '1:30'/));
  assert.ok(has(reel({ updated: '2025-09' }).warns, /reel\.updated 2025-09 is 13 months old/));
  assert.deepEqual(reel({ updated: '2025-10' }).warns, []);
  assert.ok(has(reel({ updated: 'Oct 2026' }).fails, /must be 'YYYY-MM'/));
  assert.ok(has(reel({ uploadDate: '2026-02-30' }).fails, /uploadDate "2026-02-30" must be a date/));
  assert.ok(has(reel({ hash: 'abc/def' }).fails, /reel\.hash/));
  assert.ok(has(reel({ hash: 'abcdef1234' }).warns, /only Vimeo uses it/));
  // A playable reel still marked as the sample: the page tags it Sample, search engines get no VideoObject.
  assert.ok(has(reel({ placeholder: true }).warns, /^reel\.placeholder is still true though the reel has a provider/));
  assert.ok(!has(check(real).warns, /reel\.placeholder/), 'no provider yet: nothing to say');
  const d = fixtureData();
  const [a, b] = d.reel.shots;
  d.reel.shots = [b, a, { t: '1:30' }, { t: 'soon' }, { t: '1:40', film: 'no-such-film' }];
  const { fails } = check(d);
  assert.ok(has(fails, /reel\.shots\[1\]\.t 0:02 does not come after the shot before it/), show(fails));
  assert.ok(has(fails, /reel\.shots\[2\]\.t 1:30 is not inside the reel's 1:30/), show(fails));
  assert.ok(has(fails, /reel\.shots\[3\]\.t "soon" is not a time/), show(fails));
  assert.ok(has(fails, /reel\.shots\[4\]\.film "no-such-film" is not a film slug/), show(fails));
  d.reel.shots = [{ t: '0:12', thumb: 'media/reel/shots/missing.jpg' }];
  assert.ok(has(check(d).fails, /reel\.shots\[0\]\.thumb: "media\/reel\/shots\/missing\.jpg" does not exist/));
});

test('photographs: per-school counts warn, a film frame or a sample photograph fails, sizes add up', () => {
  const sets = (d, id) => d.photographs.series.flatMap(s => s.photos).filter(p => p.sets?.includes(id));
  // The fixture is inside every school's numbers: AFI 8 with 2 portraits, the others 10 (AFAD Łódź 5 + 5).
  let d = fixtureData();
  assert.equal(sets(d, 'afi').length, 8);
  assert.deepEqual(check(d).warns, []);
  // AFI: 8–12 with at least 2 portraits.
  sets(d, 'afi')[0].sets = ['nyu'];
  assert.ok(has(check(d).warns, /^photographs set afi: 7 photo\(s\), 2 portrait\(s\); AFI asks for 8–12/));
  d = fixtureData();
  for (const p of sets(d, 'afi')) p.portrait = false;
  assert.ok(has(check(d).warns, /^photographs set afi: 8 photo\(s\), 0 portrait\(s\)/));
  // NYU at most 10, FAMU 10–15, Beijing 10–12, AFAD Łódź 10 as one kind or 5 + 5.
  d = fixtureData();
  d.photographs.series[0].photos.push({ src: 'media/studies/light/poster.webp', alt: 'Extra.', w: 864, h: 1080, sets: ['nyu', 'famu', 'lodz', 'bfa'] });
  const eleven = check(d).warns;
  assert.ok(has(eleven, /^photographs set nyu: 11 photo\(s\); NYU asks for at most 10/), show(eleven));
  assert.ok(!has(eleven, /set famu/) && !has(eleven, /set bfa/), show(eleven));
  assert.ok(has(eleven, /^photographs set lodz: 11 photo\(s\); AFAD Łódź asks for 10, or two series of 5/), show(eleven));
  d = fixtureData();
  d.photographs.series[1].photos[0].sets = ['afi', 'nyu'];
  const nine = check(d).warns;
  assert.ok(has(nine, /set famu: 9 photo\(s\); FAMU asks for 10–15/) && has(nine, /set bfa: 9 photo\(s\); Beijing Film Academy asks for 10–12/), show(nine));
  d = fixtureData();
  d.photographs.series[1].photos[0].sets = ['afi', 'nyu', 'famu', 'bfa'];
  d.photographs.series[0].photos.push({ src: 'media/studies/light/poster.webp', alt: 'Extra.', w: 864, h: 1080, sets: ['lodz'] });
  assert.ok(has(check(d).warns, /^photographs set lodz: 10 photo\(s\); AFAD Łódź asks for 10, or two series of 5/), 'a 6 + 4 split is neither form');
  // More than 13 MB of images in one set warns (AFI caps the PDF at 15 MB): 8 × 1.4 MB passes, 10 do not.
  const big = check(fixtureData(), { size: () => 1.4e6 }).warns;
  assert.ok(!has(big, /set afi: about/), show(big));
  assert.ok(has(big, /^photographs set nyu: about 14\.0 MB of images \(over 13 MB/), show(big));
  // A film frame is never a photograph; a set still only warns; no sample photographs; shapes.
  d = fixtureData();
  d.photographs.series[0].photos[0].src = d.films[0].stills[1].src;
  d.photographs.series[0].photos[1].placeholder = true;
  d.photographs.series[0].photos[2].w = 0;
  d.photographs.series[0].photos[3].sets = ['afi', 'harvard'];
  d.photographs.series[1].kind = 'mono';
  const { fails } = check(d);
  assert.ok(has(fails, /photos\[0\]: media\/studies\/shotcard\/poster\.jpg is also a film frame \(films\[0\] \([^)]+\): stills\[1\]\)/), show(fails));
  assert.ok(has(fails, /^photographs: no sample photographs/), show(fails));
  assert.ok(has(fails, /photos\[2\] needs its size in pixels/), show(fails));
  assert.ok(has(fails, /photos\[3\]\.sets must list some of afi, nyu, famu, lodz, bfa/), show(fails));
  assert.ok(has(fails, /series\[1\]\.kind must be 'colour' or 'bw'/), show(fails));
  d = fixtureData();
  d.films[0].bts = [{ src: 'media/studies/light/poster.jpg', alt: 'On set.' }];
  assert.ok(has(check(d).warns, /is also a behind-the-scenes still .*AFI excludes set stills/));
});

test('film fields: kinds, facts, crew, references, frame cards, plot, sequence, before/afters, preview', () => {
  const d = fixtureData();
  const f = d.films[0];
  f.kind = 'feature';
  f.madeAt = { type: 'university' };
  f.aiUse = '';
  f.operated = 'yes';
  f.crew.push({ name: 'Crew Name Z' });
  f.references = Array.from({ length: 11 }, (_, i) => ({ title: `Film ${i}` }));
  f.references[0].still = 'media/x.jpg';
  f.stills[0].srcset = ['media/studies/focus/poster.jpg', 'media/films/missing-1400.jpg 1400w', '/media/root.jpg 2800w'];
  f.stills[1].palette = ['#000000', 'red'];
  f.stills[2].focus = [[0.5, 1.2]];
  f.lightingPlot.frame = 5;
  f.lightingPlot.lights[0].kelvin = 900;
  f.lightingPlot.lights[1].dist = 0;
  f.lightingPlot.camera = { x: 0, y: 3 };
  f.sequences[0].frames = f.sequences[0].frames.slice(0, 2);
  f.sequences[0].frames[0].intent = 'x'.repeat(141);
  f.sequences[0].frames[1] = { kind: 'close-up', alt: 'A frame.', intent: 'Close.' };
  f.grade.final = { alt: 'No src.' };
  f.preview = { src: 'media/studies/title/poster.webp' };
  const { fails, warns } = check(d);
  const want = [
    /kind "feature" is not one of fiction, documentary, music-video, commercial, experimental, exercise/,
    /madeAt must be \{ type: 'school' \| 'independent' \| 'commissioned', name\?, note\? \}/,
    /aiUse must be 'none' or plain words/,
    /operated must be true, false or null/,
    /crew\[3\] needs a role/,
    /references has 11 entries \(at most 10\)/,
    /references\[0\] has still: this list is text only/,
    /stills\[0\]\.srcset\[0\] "media\/studies\/focus\/poster\.jpg" is not "path NNNw"/,
    /stills\[0\]\.srcset\[1\]: "media\/films\/missing-1400\.jpg" does not exist/,
    /stills\[0\]\.srcset\[2\]: "\/media\/root\.jpg" must be a relative path/,
    /stills\[1\]\.palette must be a list of #RRGGBB colours/,
    /stills\[2\]\.focus must be points as fractions of the frame/,
    /lightingPlot\.frame 5 is not one of the film's 5 frames \(0–4\)/,
    /lightingPlot\.lights\[0\]\.kelvin 900 is outside 1500–12000 K/,
    /lightingPlot\.lights\[1\] needs numeric az and el \(degrees\) and dist \(metres, > 0\)/,
    /lightingPlot\.camera must be \{ x, y, focal, label\? \}/,
    /sequences\[0\] has 2 frames \(3–8, in edit order\)/,
    /sequences\[0\]\.frames\[1\]\.kind "close-up" is not one of/,
    /grade\.final\.src is missing \(a before\/after needs both images\)/,
    /preview\.src must be an \.mp4/,
  ];
  for (const re of want) assert.ok(has(fails, re), `no FAIL matching ${re}:${show(fails)}`);
  assert.ok(has(warns, /sequences\[0\]\.frames\[0\]\.intent is 141 characters \(one line: at most 140\)/), show(warns));
  assert.ok(has(warns, /sequences\[0\] has 1 procedural frame\(s\) but is not marked placeholder: true/), show(warns));
  // A real film with empty facts warns once, naming them; a plot with no lights fails.
  const e = fixtureData();
  Object.assign(e.films[0], { madeAt: null, aiUse: null, lightingPlot: { ...e.films[0].lightingPlot, lights: [] } });
  const r = check(e);
  assert.ok(has(r.warns, /^films\[0\] \([^)]+\): madeAt, aiUse not filled in \(AFI asks/), show(r.warns));
  assert.ok(has(r.fails, /lightingPlot needs at least one light/), show(r.fails));
});
