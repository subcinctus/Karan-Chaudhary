// The section renderers in Node. They are also the prerender's input (tools/prerender.mjs), so they must
// run without a DOM, escape everything, never emit a root-relative URL, keep the film page in order and
// hide what the data does not have yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import data from '../../data/portfolio.js';
import * as H from '../../assets/js/site/html.js';
import * as R from '../../assets/js/site/render.js';
import * as FF from '../../assets/js/site/film-facts.js';
import { REPO_ROOT } from '../lib/server.mjs';

/** The site data with everything that is empty today filled in. Test-only values, obviously fake. */
function full() {
  const d = structuredClone(data);
  d.reel = { ...d.reel, provider: 'vimeo', id: '123456789', poster: 'media/og/og-title.jpg', updated: '2026-10', shots: [{ t: '0:12', title: 'Shot A' }] };
  d.person.tenFilms = [{ title: 'Film Title A', year: 1970, dp: 'Name A', note: 'a note' }];
  d.photographs = { captions: false, series: [{ title: 'Series A', kind: 'bw', photos: [{ src: 'media/og/og-title.jpg', alt: 'Photo A', w: 1200, h: 630 }] }] };
  Object.assign(d.films[0], {
    madeAt: { type: 'school', name: 'School A', note: 'year two' }, aiUse: 'none', premiere: { event: 'Festival A', year: 2026, url: 'https://example.com/a' },
    stills: [{ src: 'media/og/og-title.jpg', srcset: ['media/og/og-title.jpg 1200w'], alt: 'Frame A', aspect: 1.9, featured: true }],
    bts: [{ src: 'media/og/og-title.jpg', alt: 'On set', caption: 'Crew Name A' }], watch: 'https://example.com/watch',
  });
  return d;
}

/** Every section and page body the renderers produce for d. */
function everything(d) {
  return {
    nav: R.renderNav(d), menu: R.renderMenu(d), navAway: R.renderNav(d, { base: 'index.html' }), menuAway: R.renderMenu(d, { base: 'index.html' }),
    reel: R.renderReel(d), work: R.renderWork(d), studies: R.renderStudies(d), previs: R.renderPrevisShell(d), about: R.renderAbout(d),
    kit: R.renderKit(d), credits: R.renderCredits(d), contact: R.renderContact(d), colophon: R.renderColophon(d), colophonAway: R.renderColophon(d, { replay: false }),
    films: d.films.map((f, i) => R.renderProject(f, d, { prev: d.films[i - 1] ?? null, next: d.films[i + 1] ?? null, index: i })).join(''),
    missing: R.renderNotFound('no-such-film', d),
  };
}

/** Root-relative URLs in markup: attributes, every srcset candidate, CSS url(). */
function rootRelative(markup) {
  const s = String(markup), hits = [];
  for (const m of s.matchAll(/\b(?:href|src|poster|action|data-src)\s*=\s*"\s*\/(?!\/)[^"]*"/g)) hits.push(m[0]);
  for (const m of s.matchAll(/\bsrcset\s*=\s*"([^"]*)"/g)) if (m[1].split(',').some(c => /^\/(?!\/)/.test(c.trim()))) hits.push(m[0]);
  for (const m of s.matchAll(/url\(\s*['"]?\/(?!\/)[^)]*\)/g)) hits.push(m[0]);
  return hits;
}

test('render.js re-exports every shared primitive from html.js', () => {
  for (const [k, v] of Object.entries(H)) assert.equal(R[k], v, `R.${k}`);
});

test('a malicious title, logline, name and e-mail are escaped everywhere', () => {
  const evil = '<img src=x onerror="alert(1)">&\'`';
  const d = full();
  Object.assign(d.films[0], { title: evil, logline: evil, lighting: evil, director: evil });
  d.films[1].title = evil;   // reaches film 0's pager and film 2's
  d.credits[0].title = evil;
  d.person.name = evil;
  d.person.tenFilms[0].title = evil;
  d.contact.email = `x"><script>alert(1)</script>@example.com`;
  d.studies[0].title = evil;
  for (const [name, out] of Object.entries(everything(d))) {
    const s = String(out);
    assert.doesNotMatch(s, /<img src=x|<script|onerror="alert/i, name);
  }
  const film = String(R.renderProject(d.films[0], d, { prev: null, next: d.films[1], index: 0 }));
  assert.ok(film.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&#96;'), 'the title is escaped, not dropped');
});

test('no rendered section emits a root-relative or script URL, whatever the data says', () => {
  for (const d of [data, full()]) for (const [name, out] of Object.entries(everything(d))) assert.deepEqual(rootRelative(out), [], name);
  const d = full();
  Object.assign(d.films[0], {
    watch: '/watch', stills: [{ src: '/a.jpg', alt: 'a' }, { src: 'javascript:alert(1)', alt: 'b' }],
    bts: [{ src: '//cdn.example.com/x.jpg', alt: 'c' }, { src: '/b.jpg', alt: 'd' }], premiere: { event: 'Festival A', year: 2026, url: '/fest' },
  });
  d.films[1].stills = [{ src: 'media/og/og-title.jpg', srcset: ['/a.jpg 1400w', 'media/og/og-title.jpg 2800w'], alt: 'e', featured: true }];
  d.contact.socials = [{ label: 'Bad', url: '/me' }, { label: 'Script', url: 'javascript:alert(1)' }];
  d.contact.cv = '/cv.pdf';
  d.person.portrait = { src: '/portrait.jpg', alt: 'f' };
  d.studies[0].href = '/studies/focus.html';
  d.colophon.credits = [{ text: 'x', links: [{ label: 'Bad', href: '/x' }] }];
  for (const [name, out] of Object.entries(everything(d))) {
    assert.deepEqual(rootRelative(out), [], name);
    assert.doesNotMatch(String(out), /javascript:/i, name);
  }
  assert.equal(H.srcsetOf({ srcset: ['a.jpg 1400w', '/b.jpg 2800w', 'javascript:x 1x', 'c.jpg 2x', 'd.jpg wide', 'e.jpg'] }), 'a.jpg 1400w, c.jpg 2x, e.jpg');
});

test('every study block and study page carries the AI study label', () => {
  const out = String(R.renderStudies(data));
  const blocks = out.split('<article class="study-block').slice(1);
  assert.equal(blocks.length, data.studies.length);
  for (const b of blocks) assert.match(b, new RegExp(`</h3>\\s*<p class="tag study-block__kind">${H.STUDY_LABEL}</p>`));
  const pages = fs.readdirSync(path.join(REPO_ROOT, 'studies')).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 6);
  for (const f of pages) {
    const page = fs.readFileSync(path.join(REPO_ROOT, 'studies', f), 'utf8');
    assert.match(page, new RegExp(`</h1>\\s*<p class="[^"]*\\bstudy-block__kind\\b[^"]*">${H.STUDY_LABEL}</p>`), f);
  }
  assert.equal(H.STUDY_LABEL, 'Interactive study · code written with AI assistance · not camera work');
});

test('camera-report rows for Made at, Premiere and AI use show only once filled', () => {
  const f = structuredClone(data.films[0]);
  const rows = () => Object.fromEntries(R.filmReport(f).filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => [k, String(v)]));
  for (const k of ['Made at', 'Premiere', 'AI use', 'Director', 'Production']) assert.ok(!(k in rows()), `${k} hidden on the sample`);
  assert.doesNotMatch(String(H.camReport(R.filmReport(f))), /Made at|AI use|Premiere|Director Name/);

  f.madeAt = { type: 'school', name: 'School name', note: null };   // template text is left out
  assert.equal(rows()['Made at'], 'School');
  f.madeAt = { type: 'school', name: 'School A', note: 'year two' };
  assert.equal(rows()['Made at'], 'School · School A · year two');
  f.madeAt = { type: 'commissioned', name: 'Client A' };
  assert.equal(rows()['Made at'], 'Commissioned · Client A');
  f.madeAt = { type: 'independent' };
  assert.equal(rows()['Made at'], 'Independent');
  f.madeAt = { type: 'something else', name: 'X' };
  assert.ok(!('Made at' in rows()));

  f.aiUse = 'none';
  assert.equal(rows()['AI use'], 'None');
  f.aiUse = 'Rotoscoping clean-up in two shots.';
  assert.equal(rows()['AI use'], 'Rotoscoping clean-up in two shots.');
  f.aiUse = '  ';
  assert.ok(!('AI use' in rows()));

  f.premiere = { event: 'Festival A', year: 2026 };
  assert.equal(rows().Premiere, 'Festival A · 2026');
  f.premiere = { event: 'Festival A', year: 2026, url: 'https://example.com/a' };
  assert.equal(rows().Premiere, '<a href="https://example.com/a" rel="noopener">Festival A · 2026</a>');
  f.premiere = { event: 'Festival A', year: 2026, url: 'javascript:alert(1)' };
  assert.equal(rows().Premiere, 'Festival A · 2026');
  const order = R.filmReport(f).map(([k]) => k);
  assert.ok(order.indexOf('Production') < order.indexOf('Made at') && order.indexOf('Runtime') < order.indexOf('Premiere') && order.at(-1) === 'AI use');
});

test('renderProject keeps the page order, the feature blocks in their places', () => {
  for (const d of [data, full()]) {
    d.films.forEach((f, i) => {
      const out = String(R.renderProject(f, d, { prev: d.films[i - 1] ?? null, next: d.films[i + 1] ?? null, index: i }));
      // Each block's own markup (the feature modules' output, once they render anything) at its place.
      const parts = [
        ['head', '<header class="film__head'], ['lead frame', 'data-film-hero'], ['report', '<section class="film__report'],
        ['crew', String(FF.renderCrew(f, d))], ['notes', '<section class="film__notes'], ['palette', 'class="palette"'],
        ['laurels', String(FF.renderLaurels(f, d))], ['enquiries', String(FF.renderEnquiries(f, d))],
        ['sequence', String(FF.renderSequenceShell(f, d))], ['frames', '<section class="film__stills'],
        ['plot', String(FF.renderPlotShell(f, d))], ['grade', String(FF.renderGradeShell(f, d))],
        ['references', String(FF.renderReferences(f, d))],
        ['bts', (f.bts ?? []).length ? '<section class="film__bts' : ''], ['pager', '<nav class="film__pager'],
      ].filter(([, s]) => s.trim());
      let at = -1;
      for (const [name, s] of parts) {
        const i2 = out.indexOf(s.trim(), at + 1);
        assert.ok(i2 > at, `${f.slug}: ${name} comes after the block before it`);
        at = i2;
      }
      // The credits sit with the camera report (left column); laurels and enquiries with the notes.
      const facts = out.slice(out.indexOf('<div class="film__facts">'), out.indexOf('<section class="film__notes'));
      assert.ok(facts.includes('film__report') && facts.includes(String(FF.renderCrew(f, d)).trim()));
    });
  }
  // A real featured still is in the lead frame from the first paint (no waiting for project.js).
  const d = full();
  const out = String(R.renderProject(d.films[0], d, { prev: null, next: d.films[1], index: 0 }));
  assert.match(out, /data-film-hero[^>]*><img src="media\/og\/og-title\.jpg" srcset="media\/og\/og-title\.jpg 1200w" sizes="100vw" alt="Frame A"/);
  assert.doesNotMatch(String(R.renderProject(data.films[1], data, { prev: null, next: null, index: 1 })), /data-film-hero[^>]*><img/);
});

test('scene numbers count only the sections that show', () => {
  const ids = ['reel', 'work', 'photographs', 'studies', 'previs', 'about', 'kit', 'credits', 'contact'];
  const scs = d => Object.fromEntries(ids.map(id => [id, H.scFor(d, id)]));
  assert.deepEqual(scs(data), { reel: '01', work: '01', photographs: '02', studies: '02', previs: '03', about: '04', kit: '05', credits: '05', contact: '06' });
  const withReel = structuredClone(data);
  withReel.reel = { ...withReel.reel, provider: 'youtube', id: 'abcdef123' };
  assert.deepEqual(scs(withReel), { reel: '01', work: '02', photographs: '03', studies: '03', previs: '04', about: '05', kit: '06', credits: '06', contact: '07' });
  assert.deepEqual(scs(full()), { reel: '01', work: '02', photographs: '03', studies: '04', previs: '05', about: '06', kit: '07', credits: '07', contact: '08' });
  assert.match(String(R.renderWork(data)), /<span>Sc\. 01<\/span>/);
  assert.match(String(R.renderContact(data)), /Sc\. 06 · Contact/);
  assert.match(String(R.renderWork(full())), /<span>Sc\. 02<\/span>/);
});

test('sections that wait for material render nothing until the data has it', () => {
  assert.equal(String(R.renderReel(data)), '');
  assert.match(String(R.renderReel(full())), /id="reel-title"[\s\S]*data-reel-frame/);
  assert.equal(H.hasPhotographs(data), false);
  assert.equal(H.hasPhotographs(full()), true);
  assert.equal(H.hasPhotographs({ photographs: { series: [{ photos: [{ src: '/root.jpg' }] }] } }), false);
  assert.deepEqual(H.hiddenSections(data), { reel: true, photographs: true });
  assert.doesNotMatch(String(R.renderAbout(data)), /about__films/);
  assert.match(String(R.renderAbout(full())), /about__films"><p class="cam-label">Reference films<\/p>[\s\S]*Film Title A[\s\S]*1970 · DP Name A · a note/);
  const ten = full();
  ten.person.tenFilms = Array.from({ length: 10 }, (_, i) => ({ title: `Film ${i + 1}` }));
  assert.match(String(R.renderAbout(ten)), />Ten films</);
});

test('the section head holds tools in its slate row', () => {
  const plain = String(H.sectionHead({ sc: '01', label: 'Selected work', title: 'Selected work', id: 'work-title' }));
  assert.match(plain, /<p class="section-head__slate cam-label"><span>Sc\. 01<\/span>/);
  const tools = String(H.sectionHead({ sc: '01', label: 'Selected work', title: 'Selected work', id: 'work-title', tools: H.html`<div role="group" aria-label="View">x</div>` }));
  assert.match(tools, /<div class="section-head__slate cam-label"><span>Sc\. 01<\/span>[\s\S]*<div class="section-head__tools"><div role="group" aria-label="View">x<\/div><\/div><\/div>\s*<h2/);
  assert.doesNotMatch(tools, /<p class="section-head__slate/);
});

/** Just the DOM calls pruneSections makes, built from nav and menu markup. */
function fakePage(markup) {
  const sections = Object.fromEntries(['reel', 'photographs', 'work'].map(id => [id, {
    attrs: new Set(), toggleAttribute(n, on) { if (on) this.attrs.add(n); else this.attrs.delete(n); },
  }]));
  const anchors = [...String(markup).matchAll(/<li( hidden)?><a href="([^"]*)">(?:<span class="cam-label" aria-hidden="true">([^<]*)<\/span>)?/g)].map(m => {
    const li = { hidden: Boolean(m[1]) }, label = m[3] == null ? null : { textContent: m[3] };
    return { hash: m[2].slice(m[2].indexOf('#')), li, label, closest: () => li, querySelector: () => label };
  });
  const state = () => anchors.map(a => [a.hash, a.li.hidden, a.label?.textContent ?? null]);
  return { sections, state, document: { getElementById: id => sections[id] ?? null, querySelectorAll: () => anchors } };
}
function prune(d, page) {
  const before = globalThis.document;
  globalThis.document = page.document;
  try { R.pruneSections(d); } finally { globalThis.document = before; }
}

test('pruneSections hides the waiting sections and their links, and agrees with the prerendered lists', () => {
  for (const [from, to] of [[full(), data], [data, full()], [data, data]]) {
    for (const base of ['', 'index.html']) {
      const page = fakePage(String(R.renderNav(from, { base })) + String(R.renderMenu(from, { base })));
      prune(to, page);
      prune(to, page);   // idempotent
      const want = fakePage(String(R.renderNav(to, { base })) + String(R.renderMenu(to, { base }))).state();
      assert.deepEqual(page.state(), want, `${base || 'index'}: links and scene labels match the lists rendered for that data`);
      const off = H.hiddenSections(to);
      assert.equal(page.sections.reel.attrs.has('hidden'), off.reel);
      assert.equal(page.sections.photographs.attrs.has('hidden'), off.photographs);
      assert.equal(page.sections.work.attrs.size, 0, 'other sections are left alone');
    }
  }
  const nav = String(R.renderNav(data));
  assert.doesNotMatch(nav, /#contact/, 'Contact is the header pill, not a nav link');
  assert.match(String(R.renderMenu(data)), /href="#contact"><span class="cam-label" aria-hidden="true">Sc\. 06<\/span>Contact/);
});
