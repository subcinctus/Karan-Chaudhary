// The Selected work index in Node (site/work-index.js): the view toggle, the table and its preview pane.
// Both renderers are also the prerender's input (tools/prerender.mjs), so they must run without a DOM,
// escape everything, keep the curated order (No 01–06 is the strip's counter), keep the plan's column
// set, and say SAMPLE where the data does.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../../data/portfolio.js';
import * as R from '../../assets/js/site/render.js';
import { renderWorkToggle, renderWorkIndex } from '../../assets/js/site/work-index.js';

const COLUMNS = ['No', 'Year', 'Title', 'Director', 'Production / Platform', 'Format', 'Aspect', 'Camera / Lens', 'Premiere'];

/** The table's rows: { film, cells: [[tag, class, inner]] } in document order. */
function rows(markup) {
  return [...String(markup).matchAll(/<tr class="work-index__row" data-film="([^"]*)">([\s\S]*?)<\/tr>/g)].map(([, film, body]) => ({
    film, cells: [...body.matchAll(/<(td|th) class="work-index__([a-z]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map(([, tag, cls, inner]) => [tag, cls, inner]),
  }));
}
const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** One real film with every column filled (test-only values, obviously fake). */
function real() {
  const d = structuredClone(data);
  Object.assign(d.films[1], {
    placeholder: false, director: 'Director Name A', production: 'Production A',
    premiere: { event: 'Festival A', year: 2026, url: 'https://example.com/a' },
    stills: [{ src: 'media/og/og-title.jpg', srcset: ['media/og/og-title.jpg 1200w'], alt: 'Frame A', aspect: 1.905, featured: true }],
  });
  return d;
}

test('the view toggle: a labelled group of two pressed-state buttons, Frames pressed', () => {
  const t = String(renderWorkToggle(data));
  assert.match(t, /^<div class="work-view" role="group" aria-label="Selected work view">/);
  const buttons = [...t.matchAll(/<button class="work-view__btn" type="button" data-view="(\w+)" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map(m => m.slice(1));
  assert.deepEqual(buttons, [['frames', 'true', 'Frames'], ['index', 'false', 'Index']]);
  assert.equal(String(renderWorkToggle({ ...data, films: [] })), '');
});

test('renderWork puts the toggle in the section head and the table after the frames', () => {
  const w = String(R.renderWork(data));
  assert.match(w, /<div class="section-head__tools"><div class="work-view" role="group"/);
  const grid = w.indexOf('<ol class="work-grid"'), table = w.indexOf('<div class="work-index"'), note = w.indexOf('class="work-note');
  assert.ok(grid > 0 && table > grid && note > table, 'grid → index → note');
});

test('a real table: a visually hidden caption, the column set in order, the title as the row header', () => {
  const t = String(renderWorkIndex(data));
  assert.match(t, /<table class="work-index__table">\s*<caption class="visually-hidden">Selected work: 6 films, one per row<\/caption>/);
  const head = [...t.matchAll(/<th class="work-index__[a-z]+" scope="col">([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(head, COLUMNS);
  for (const r of rows(t)) {
    assert.equal(r.cells.length, COLUMNS.length, r.film);
    const headers = r.cells.filter(([tag]) => tag === 'th');
    assert.equal(headers.length, 1, `${r.film}: one row header`);
    assert.equal(headers[0][1], 'film');
    assert.equal(r.cells.indexOf(headers[0]), COLUMNS.indexOf('Title'));
  }
  assert.equal((t.match(/scope="row"/g) ?? []).length, data.films.length);
});

test('rows follow the curated order, numbered like the strip, each with one link: its title', () => {
  const d = structuredClone(data);
  d.films.reverse();   // the order is the data's, whatever it is: never sorted by year
  const t = String(renderWorkIndex(d));
  const got = rows(t);
  assert.deepEqual(got.map(r => r.film), d.films.map(f => f.slug));
  assert.deepEqual(got.map(r => text(r.cells[0][2])), d.films.map((_, i) => String(i + 1).padStart(2, '0')));
  // The strip's cards carry the same numbers in the same order.
  const cards = [...String(R.renderWork(d)).matchAll(/<p class="work-card__slate cam-label"><span>(\d\d)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(cards, got.map(r => text(r.cells[0][2])));
  for (const [i, r] of got.entries()) {
    const f = d.films[i];
    const links = [...r.cells.map(c => c[2]).join('').matchAll(/<a\b[^>]*>/g)];
    assert.equal(links.length, 1, `${f.slug}: one link`);
    assert.equal(links[0][0], `<a class="work-index__link" href="project.html?slug=${encodeURIComponent(f.slug)}">`);
    assert.match(r.cells[2][2], new RegExp(`<span class="work-index__title">${f.title}</span></a>`));
  }
});

test('samples carry the SAMPLE badge; empty and template cells are a dash a screen reader skips', () => {
  const t = String(renderWorkIndex(data));
  const dash = '<span class="work-index__none" aria-hidden="true">—</span>';
  for (const r of rows(t)) {
    const cell = k => r.cells.find(c => c[1] === k)[2];
    assert.match(cell('film'), /<\/a> <span class="badge-sample"[^>]*>Sample<\/span>$/, r.film);
    for (const k of ['dir', 'prod', 'premiere']) assert.equal(cell(k), dash, `${r.film} ${k}`);
    assert.doesNotMatch(cell('dir') + cell('prod'), /Director Name|Production \/ School|Artist \/ Label|Agency \/ Client/);
  }
  const f = data.films[0];
  const first = rows(t)[0].cells;
  assert.deepEqual(first.filter(c => c[0] === 'td').map(c => text(c[2])), ['01', String(f.year), '—', '—', f.format, '2.39:1', `${f.camera.body}${f.lenses.set}`, '—']);
  assert.match(first.find(c => c[1] === 'kit')[2], new RegExp(`^<span class="work-index__line">${f.camera.body}</span><span class="work-index__line">${f.lenses.set}</span>$`));
});

test('a real film: no badge, its director, production and premiere (text, not a link)', () => {
  const d = real();
  const r = rows(renderWorkIndex(d))[1];
  const cell = k => r.cells.find(c => c[1] === k)[2];
  assert.doesNotMatch(cell('film'), /badge-sample/);
  assert.equal(cell('dir'), 'Director Name A');
  assert.equal(cell('prod'), 'Production A');
  assert.equal(cell('premiere'), 'Festival A · 2026');
});

test('the preview pane: aria-hidden, the first film letterboxed at its own aspect, its logline and move', () => {
  const t = String(renderWorkIndex(data));
  const pane = t.slice(t.indexOf('<div class="work-index__preview"'));
  const f = data.films[0];
  assert.match(pane, /^<div class="work-index__preview" aria-hidden="true">\s*<div class="work-index__gate">/);
  assert.match(pane, new RegExp(`<div class="work-index__shot frame" data-preview-frame data-film="${f.slug}" data-title="${f.title}" style="--ar:2\\.39;background:radial-gradient`));
  assert.doesNotMatch(pane, /<img/, 'a sample has no still in the markup: the procedural one is painted in the browser');
  assert.match(pane, new RegExp(`<p class="work-index__logline">${f.logline}</p>`));
  assert.match(pane, /<p class="work-index__meta cam-label">2\.39:1 · #027 Dolly in<\/p>/);
  // A real featured still is in the pane from the start, at its own aspect, decorative (alt "").
  const d = real();
  [d.films[0], d.films[1]] = [d.films[1], d.films[0]];
  const p = String(renderWorkIndex(d));
  assert.match(p, /data-preview-frame data-film="night-exterior-sample" data-title="Night Exterior" style="--ar:1\.905"><img src="media\/og\/og-title\.jpg" srcset="media\/og\/og-title\.jpg 1200w" sizes="clamp\(320px, 30vw, 640px\)" alt="" loading="lazy" decoding="async"><\/div>/);
});

test('everything from the data is escaped, and no URL is root-relative or a script', () => {
  const evil = '<img src=x onerror="alert(1)">&\'`';
  const d = structuredClone(data);
  Object.assign(d.films[0], { title: evil, director: evil, production: evil, format: evil, logline: evil, year: evil, camera: { body: evil }, lenses: { set: evil }, premiere: { event: evil, year: 2026 } });
  d.films[0].slug = `a"b<c`;
  const t = String(renderWorkIndex(d)) + String(renderWorkToggle(d));
  assert.doesNotMatch(t, /<img src=x|onerror="alert/);
  assert.ok(t.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&#96;'), 'escaped, not dropped');
  assert.match(t, /data-film="a&quot;b&lt;c"/);
  assert.match(t, /href="project\.html\?slug=a%22b%3Cc"/);
  const r = real();
  r.films[1].stills = [{ src: '/abs.jpg', alt: 'x', featured: true }, { src: 'javascript:alert(1)', alt: 'y' }];
  [r.films[0], r.films[1]] = [r.films[1], r.films[0]];
  const u = String(renderWorkIndex(r));
  assert.doesNotMatch(u, /(?:href|src|srcset)="\s*\/(?!\/)/);
  assert.doesNotMatch(u, /javascript:/i);
});

test('nothing to index, nothing rendered', () => {
  assert.equal(String(renderWorkIndex({ ...data, films: [] })), '');
  assert.equal(String(renderWorkIndex({})), '');
});
