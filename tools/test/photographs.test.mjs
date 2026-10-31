// Photographs in Node (site/photographs.js): the home page's section and photographs.html. Both renderers
// are also the prerender's input (tools/prerender.mjs), so they must run without a DOM and without options,
// render nothing (the section) or say so (the page) while there are no photographs, filter by a school's
// set, count right, leave captions off unless asked, and escape everything the data holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../../data/portfolio.js';
import { SETS, pageOptions, photoSeries, teaserPhotos, renderPhotographsSection, renderPhotographsPage } from '../../assets/js/site/photographs.js';
import { hiddenSections, scFor } from '../../assets/js/site/html.js';

/** Two series with obviously fake records (test-only), tagged for different sets. */
function withPhotos() {
  const d = structuredClone(data);
  const p = (n, sets, extra = {}) => ({ src: `media/photographs/test/${n}.jpg`, alt: `Test photograph ${n}`, w: 2400, h: 1600, sets, ...extra });
  d.photographs = {
    captions: false,
    series: [
      { title: 'Series A', year: 2026, kind: 'colour', note: 'Test note.', photos: [p('a1', ['afi', 'nyu']), p('a2', ['afi'], { caption: 'Caption a2' }), p('a3', ['nyu']), p('a4', [])] },
      { title: 'Series B', year: 2025, kind: 'bw', photos: [p('b1', ['afi'], { portrait: true, w: 1600, h: 2000 }), p('b2', ['afi', 'nyu'])] },
    ],
  };
  return d;
}
const figures = s => (String(s).match(/<figure class="photo__figure">/g) ?? []).length;
const srcs = s => [...String(s).matchAll(/<img class="photo__img" src="([^"]*)"/g)].map(m => m[1]);

test('no photographs: no home section, and a page that says so', () => {
  assert.equal(hiddenSections(data).photographs, true, 'the sample data has none');
  assert.equal(String(renderPhotographsSection(data)), '');
  const page = String(renderPhotographsPage(data));   // as the prerender calls it: no options
  assert.match(page, /<p class="photos-empty">No photographs yet\.<\/p>/);
  assert.match(page, /<h1 class="photos-head__title" id="photographs-page-title">Photographs<\/h1>/);
  assert.doesNotMatch(page, /<figure|<button[^>]*data-print>/, 'no figures and no print button');
  assert.match(page, /href="index\.html#work"/, 'the way back to the work');
  // A series without a usable photograph is still nothing to show.
  const d = structuredClone(data);
  d.photographs.series = [{ title: 'Empty', kind: 'colour', photos: [{ src: 'javascript:alert(1)', alt: 'x', w: 1, h: 1 }] }];
  assert.equal(String(renderPhotographsSection(d)), '');
  assert.match(String(renderPhotographsPage(d)), /No photographs yet\./);
});

test('the page: every photograph by default, one figure each, sized, described and lazy', () => {
  const d = withPhotos();
  const page = String(renderPhotographsPage(d));
  assert.equal(figures(page), 6);
  assert.deepEqual(srcs(page), ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'].map(n => `media/photographs/test/${n}.jpg`), 'the data\'s order');
  for (const img of page.match(/<img\b[^>]*>/g)) {
    assert.match(img, /\swidth="\d+" height="\d+"/, img);
    assert.match(img, /\salt="Test photograph [a-z]\d"/, img);
    assert.match(img, /\sloading="lazy"/, img);
  }
  assert.match(page, /width="1600" height="2000"/, 'a portrait keeps its own size');
  assert.match(page, /<h2 class="photo-series__title" id="series-1-title">Series A<\/h2>/);
  assert.match(page, /<section class="photo-series" id="series-2" aria-labelledby="series-2-title">/);
  assert.match(page, /<span class="tag">Colour<\/span>/);
  assert.match(page, /<span class="tag">B&amp;W<\/span>/);
  assert.match(page, /<p class="photos-head__meta cam-label">6 photographs · 2 series<\/p>/);
  assert.match(page, /<button class="btn" type="button" data-print>Print \/ Save as PDF<\/button>/);
  assert.doesNotMatch(page, /All photographs/, 'no way back to all of them when all are shown');
});

test('?set= keeps the photographs tagged for that school, and counts them', () => {
  const d = withPhotos();
  const count = set => photoSeries(d, { set }).reduce((n, s) => n + s.photos.length, 0);
  assert.deepEqual([count(null), count('afi'), count('nyu'), count('famu')], [6, 4, 3, 0]);
  const afi = String(renderPhotographsPage(d, pageOptions('?set=afi')));
  assert.deepEqual(srcs(afi), ['a1', 'a2', 'b1', 'b2'].map(n => `media/photographs/test/${n}.jpg`));
  assert.match(afi, /<span>Photographs · AFI set<\/span>/);
  assert.match(afi, /4 photographs · 2 series/);
  assert.match(afi, /<a class="btn btn--ghost" href="photographs\.html">All photographs<\/a>/);
  // A series with nothing in the set drops out; the others keep their numbers (the page's anchors).
  const nyu = photoSeries(d, { set: 'nyu' });
  assert.deepEqual(nyu.map(s => [s.n, s.photos.length]), [[1, 2], [2, 1]]);
  const onlyB = structuredClone(d);
  onlyB.photographs.series[0].photos.forEach(p => { p.sets = []; });
  assert.deepEqual(photoSeries(onlyB, { set: 'afi' }).map(s => s.n), [2]);
  // A set nobody is tagged for: a page that says so, and no print button.
  const famu = String(renderPhotographsPage(d, { set: 'famu' }));
  assert.equal(figures(famu), 0);
  assert.match(famu, /No photographs are in the FAMU set yet\./);
  assert.doesNotMatch(famu, /<button[^>]*data-print>/);
});

test('pageOptions: known sets only, case-insensitive; captions and cover only on "1"', () => {
  assert.deepEqual(pageOptions(''), { set: null, badSet: null, captions: false, cover: false });
  assert.deepEqual(pageOptions('?set=AFI&captions=1&cover=1'), { set: 'afi', badSet: null, captions: true, cover: true });
  assert.deepEqual(Object.keys(SETS), ['afi', 'nyu', 'famu', 'lodz', 'bfa']);
  for (const set of Object.keys(SETS)) assert.equal(pageOptions(`?set=${set}`).set, set);
  for (const q of ['?set=constructor', '?set=__proto__', '?set=toString', '?set=afl']) {
    const o = pageOptions(q);
    assert.equal(o.set, null, q);
    assert.equal(o.badSet, q.slice(5).toLowerCase(), q);
  }
  assert.equal(pageOptions('?captions=true').captions, false);
  assert.equal(pageOptions('?cover=0').cover, false);
  // An unknown set shows everything, and says why (never a silently unfiltered "set").
  const page = String(renderPhotographsPage(withPhotos(), pageOptions('?set=afl')));
  assert.equal(figures(page), 6);
  assert.match(page, /There is no set called “afl”/);
  assert.equal(figures(renderPhotographsPage(withPhotos(), { set: 'nope' })), 6, 'called directly with an unknown set');
});

test('captions stay off unless ?captions=1 or photographs.captions', () => {
  const d = withPhotos();
  assert.doesNotMatch(String(renderPhotographsPage(d)), /<figcaption/);
  assert.doesNotMatch(String(renderPhotographsPage(d, { set: 'afi' })), /<figcaption/);
  const asked = String(renderPhotographsPage(d, { captions: true }));
  assert.deepEqual([...asked.matchAll(/<figcaption class="photo__caption">([^<]*)<\/figcaption>/g)].map(m => m[1]), ['Caption a2'], 'only photographs with a caption get one');
  d.photographs.captions = true;
  assert.match(String(renderPhotographsPage(d)), /<figcaption class="photo__caption">Caption a2<\/figcaption>/);
});

test('?cover=1: the name, the contact and the series before the photographs', () => {
  const d = withPhotos();
  assert.doesNotMatch(String(renderPhotographsPage(d)), /photos-cover/);
  const page = String(renderPhotographsPage(d, { cover: true, set: 'afi' }));
  const cover = page.slice(page.indexOf('<section class="photos-cover'), page.indexOf('</section>', page.indexOf('photos-cover')));
  assert.ok(page.indexOf('photos-cover') < page.indexOf('<figure'), 'the cover comes first');
  assert.match(cover, /<p class="photos-cover__name">Karan Chaudhary<\/p>/);
  assert.match(cover, /<a href="mailto:hello@example\.com">hello@example\.com<\/a>/);
  assert.match(cover, /Sample contact/, 'a placeholder contact keeps its badge');
  assert.match(cover, /Photographs · AFI/);
  assert.match(cover, /Series A<\/span> <span class="cam-label">2026 · Colour · 2 photographs/);
});

test('the home section: its head, the series, 4–6 photographs taken in turn, and the way to the page', () => {
  const d = withPhotos();
  const s = String(renderPhotographsSection(d));
  assert.match(s, new RegExp(`<span>Sc\\. ${scFor(d, 'photographs')}</span>`));
  assert.match(s, /<h2 class="section-head__title" id="photographs-title">Photographs<\/h2>/, 'the id #photographs is labelled by');
  assert.match(s, /6 photographs · 2 series/);
  assert.deepEqual([...s.matchAll(/<a href="(photographs\.html#series-\d)">([^<]*)<\/a>/g)].map(m => [m[1], m[2]]), [['photographs.html#series-1', 'Series A'], ['photographs.html#series-2', 'Series B']]);
  assert.match(s, /<a class="btn btn--ghost" href="photographs\.html">All photographs · print view <span aria-hidden="true">→<\/span><\/a>/);
  const thumbs = [...s.matchAll(/<img class="photo-teaser__img" src="media\/photographs\/test\/(\w+)\.jpg"/g)].map(m => m[1]);
  assert.deepEqual(thumbs, ['a1', 'b1', 'a2', 'b2', 'a3', 'a4'], 'every series\' first, then every second, …');
  assert.equal(teaserPhotos(photoSeries(d), 4).length, 4);
  assert.equal(teaserPhotos(photoSeries(d), 99).length, 6, 'never more than there are');
});

test('everything from the data is escaped; unsafe sources never render', () => {
  const d = withPhotos();
  const evil = '<img src=x onerror=alert(1)>"\'`&';
  Object.assign(d.photographs.series[0], { title: evil, note: evil });
  Object.assign(d.photographs.series[0].photos[0], { alt: evil, caption: evil });
  d.photographs.series[1].photos.push({ src: 'javascript:alert(1)', alt: 'x', w: 1, h: 1, sets: ['afi'] }, { src: '/media/root.jpg', alt: 'x', w: 1, h: 1 });
  d.person.name = evil;
  for (const out of [renderPhotographsSection(d), renderPhotographsPage(d, { captions: true, cover: true }), renderPhotographsPage(d, pageOptions(`?set=${encodeURIComponent(evil)}`))]) {
    const s = String(out);
    assert.ok(!s.includes(evil), 'the raw string never reaches the markup');
    assert.doesNotMatch(s, /<img src=x/, 'markup in the data stays text');
    assert.doesNotMatch(s, /javascript:|src="\//, 'no script or root-relative source');
    assert.match(s, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&#96;&amp;/);
  }
  assert.equal(figures(renderPhotographsPage(d)), 6, 'the unsafe photographs are left out, not shown broken');
});

test('the page carries a key of its markup: the same view, the same key; any change, another', () => {
  const key = s => /data-photos-key="([^"]+)"/.exec(String(s))?.[1];
  const d = withPhotos();
  assert.ok(key(renderPhotographsPage(d)));
  assert.equal(key(renderPhotographsPage(d)), key(renderPhotographsPage(structuredClone(d))));
  assert.notEqual(key(renderPhotographsPage(d)), key(renderPhotographsPage(d, { set: 'afi' })));
  assert.notEqual(key(renderPhotographsPage(d)), key(renderPhotographsPage(data)));
  const moved = structuredClone(d);
  moved.photographs.series[1].photos.reverse();
  assert.notEqual(key(renderPhotographsPage(d)), key(renderPhotographsPage(moved)));
});
