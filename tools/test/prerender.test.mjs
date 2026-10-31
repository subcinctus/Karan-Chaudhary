// tools/prerender.mjs: the static pages crawlers and visitors without JavaScript read. It must be
// idempotent, escape everything, change nothing outside its markers (and the two hidden flags and the
// JSON-LD script), write JSON-LD that parses and cannot close its <script>, and list only real films.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import data from '../../data/portfolio.js';
import { generate, readPages, markers, sitemap, filmography, ldJson, PAGES } from '../prerender.mjs';
import { pageText, jsonLdBlocks } from '../checks/seo-static.mjs';
import { videoObjectLD } from '../../assets/js/site/reel-data.js';
import { fixtureData } from '../lib/fixture.mjs';
import { REPO_ROOT } from '../lib/server.mjs';

const pages = readPages();
const LD = /<script\b[^>]*\sid="ld-person"[^>]*>[\s\S]*?<\/script>/i;
/** A page with everything the prerender may write blanked out: marker contents, the JSON-LD, the two hidden flags. */
const outside = s => s
  .replace(/(<!--\s*prerender:([\w-]+)\s*-->)[\s\S]*?(<!--\s*\/prerender:\2\s*-->)/g, '$1$3')
  .replace(LD, '<ld>')
  .replace(/(<section\b[^>]*\sid="(?:reel|photographs)"[^>]*?)\s+hidden(?=[\s>])/g, '$1');
const sectionTag = (html, id) => new RegExp(`<section\\b[^>]*\\sid="${id}"[^>]*>`).exec(html)[0];
const ldOf = html => jsonLdBlocks(LD.exec(html)[0])[0];
/** The entities html.js esc() writes. */
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#96);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#96': '`' })[e]);

test('the pages carry every marker, balanced, and nothing else is a marker', () => {
  for (const [file, src] of pages) {
    const names = markers(file, src).map(p => p.name);
    for (const n of Object.keys(PAGES[file].markers)) assert.ok(names.includes(n), `${file}: prerender:${n}`);
  }
  assert.deepEqual(markers('index.html', pages.get('index.html')).map(p => p.name),
    ['nav', 'menu', 'reel', 'work', 'photographs', 'studies', 'previs', 'about', 'kit', 'credits', 'contact', 'colophon']);
  const bad = {
    'open twice': '<!-- prerender:films --><!-- prerender:films -->',
    'never closed': '<!-- prerender:films -->',
    'stray close': 'x <!-- /prerender:films -->',
    'nested': '<!-- prerender:films --><!-- prerender:nav --><!-- /prerender:nav --><!-- /prerender:films -->',
    'crossed': '<!-- prerender:films --><!-- /prerender:nav -->',
  };
  for (const [what, src] of Object.entries(bad)) assert.throws(() => markers('project.html', src), /prerender:/, what);
  assert.throws(() => generate(data, { 'project.html': '<main></main>' }), /missing marker\(s\) prerender:films/);
  assert.throws(() => generate(data, { 'project.html': '<!-- prerender:films --><!-- /prerender:films --><!-- prerender:flims --><!-- /prerender:flims -->' }), /unknown marker\(s\) prerender:flims/);
  assert.throws(() => generate(data, { 'other.html': '' }), /not a prerendered page/);
});

test('generate() is idempotent, on the real data and on the full fixture', () => {
  for (const d of [data, fixtureData()]) {
    const once = generate(d, pages);
    const twice = generate(d, new Map([...once].filter(([f]) => f.endsWith('.html'))));
    for (const [file, content] of once) assert.equal(twice.get(file), content, file);
  }
});

test('only the marker contents, the hidden flags and the JSON-LD change', () => {
  for (const d of [data, fixtureData()]) {
    for (const [file, content] of generate(d, pages)) {
      if (!file.endsWith('.html')) continue;
      assert.equal(outside(content), outside(pages.get(file)), file);
    }
  }
  // Markers on lines of their own keep them; inline markers stay inline.
  const index = generate(data, pages).get('index.html');
  assert.match(index, /\n( +)<!-- prerender:nav -->\n\1<ul role="list">.*<\/ul>\n\1<!-- \/prerender:nav -->/);
  assert.match(index, /data-render="reel"><!-- prerender:reel --><!-- \/prerender:reel --><\/div>/, 'an empty section stays :empty');
});

test('the home sections that wait for material are hidden until the data has it', () => {
  const plain = generate(data, pages).get('index.html');
  assert.match(sectionTag(plain, 'reel'), /\shidden>/);
  assert.match(sectionTag(plain, 'photographs'), /\shidden>/);
  assert.match(plain, /<li hidden><a href="#reel">Reel<\/a><\/li>/);
  const full = fixtureData();
  const shown = generate(full, pages).get('index.html');
  assert.doesNotMatch(sectionTag(shown, 'reel'), /\shidden\b/);
  assert.doesNotMatch(sectionTag(shown, 'photographs'), /\shidden\b/);
  assert.match(shown, /<li><a href="#reel">Reel<\/a><\/li>/);
  // And back: the flag returns when the material goes.
  assert.match(sectionTag(generate(data, new Map([['index.html', shown]])).get('index.html'), 'reel'), /\shidden>/);
});

test('a malicious film title, name and e-mail are escaped in the pages and the JSON-LD', () => {
  const evil = '</script><script>alert(1)</script><img src=x onerror="alert(2)">&\'`';
  const d = fixtureData();   // films[0] is real, so its title reaches the JSON-LD ItemList
  d.films[0].title = evil;
  d.films[0].logline = evil;
  d.films[1].title = evil;
  d.person.name = evil;
  d.contact.email = `x"><script>alert(3)</script>@example.com`;
  const out = generate(d, pages);
  for (const [file, content] of out) {
    const body = content.replace(LD, '');
    assert.doesNotMatch(body, /<script>alert|<img src=x|onerror="alert/, file);
  }
  assert.ok(out.get('index.html').includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), 'escaped, not dropped');
  assert.ok(out.get('project.html').includes('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;&amp;&#39;&#96;'));
  const ld = LD.exec(out.get('index.html'))[0];
  const inner = ld.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  assert.doesNotMatch(inner, /</, 'every < in the JSON-LD is \\u003c');
  const graph = JSON.parse(inner)['@graph'];
  assert.equal(graph.find(n => n['@type'] === 'Person').name, evil);
  assert.equal(graph.find(n => n['@type'] === 'ItemList').itemListElement[0].item.name, evil);
});

test('the JSON-LD @graph: Person #person, WebSite, real films only, a VideoObject when the reel has one', () => {
  for (const d of [data, fixtureData()]) {
    const json = ldJson(d);
    assert.doesNotMatch(json, /<\//);
    const g = JSON.parse(json)['@graph'];
    const type = t => g.filter(n => n['@type'] === t);
    assert.equal(type('Person').length, 1);
    assert.equal(type('Person')[0]['@id'], `${d.site.url}#person`);
    assert.equal(type('WebSite')[0].publisher['@id'], `${d.site.url}#person`);
    const real = d.films.filter(f => f.placeholder !== true).map(f => f.title);
    assert.deepEqual(type('ItemList').flatMap(l => l.itemListElement.map(e => e.item.name)), real);
    assert.equal(type('VideoObject').length, videoObjectLD(d) ? 1 : 0);
    assert.ok(g.every(n => !('@context' in n)), 'one @context, on the graph');
    // The page carries exactly this, as render.js setJsonLd() writes it.
    const block = ldOf(generate(d, pages).get('index.html'));
    assert.equal(block.raw, json);
  }
  assert.equal(JSON.parse(ldJson(data))['@graph'].some(n => n['@type'] === 'ItemList'), false, 'no ItemList while every film is a sample');
});

test('the static index reads as text; the static filmography names every film', () => {
  const out = generate(data, pages);
  const text = pageText(out.get('index.html'), decode);
  for (const w of [data.person.name, data.person.role, ...data.films.map(f => f.title), 'Filmography', data.contact.email]) assert.ok(text.includes(w), w);
  for (const w of ['Reel 1', '000', 'TC 00']) assert.ok(!text.includes(w), w);
  const films = String(filmography(data));
  for (const f of data.films) assert.ok(films.includes(`href="project.html?slug=${encodeURIComponent(f.slug)}"`), f.slug);
  assert.match(out.get('project.html'), /<section class="film-static container"><!-- prerender:films --><p class="cam-label">/);
});

test('sitemap.xml lists the home page, photographs.html once it has photographs, and only real films', () => {
  const base = data.site.url;
  const locs = xml => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs(sitemap(data)), [base]);
  const d = fixtureData();
  assert.deepEqual(locs(sitemap(d)), [base, `${base}project.html?slug=${d.films[0].slug}`]);
  assert.deepEqual(locs(sitemap(d, { photographs: true })), [base, `${base}photographs.html`, `${base}project.html?slug=${d.films[0].slug}`]);
  d.films[0].slug = 'a&b';
  assert.ok(sitemap(d).includes(`${base}project.html?slug=a%26b`));
  assert.match(sitemap(data), /^<\?xml version="1.0" encoding="UTF-8"\?>\n[\s\S]*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal(generate(data, pages).get('sitemap.xml'), sitemap(data, { photographs: pages.has('photographs.html') }));
});

test('the CLI writes a staged copy with --out (as CI does) and leaves the repo alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
  const before = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'tools/prerender.mjs'), '--out', dir], { cwd: REPO_ROOT, encoding: 'utf8' });
  const want = generate(data, pages);
  for (const [file, content] of want) assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), content, file);
  assert.equal(fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8'), before);
  assert.throws(() => execFileSync(process.execPath, [path.join(REPO_ROOT, 'tools/prerender.mjs'), '--out'], { cwd: REPO_ROOT, stdio: 'pipe' }), /--out needs a directory/);
  fs.rmSync(dir, { recursive: true, force: true });
});
