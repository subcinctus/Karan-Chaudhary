// The self-hosted type: assets/css/fonts.css must offer exactly the faces the site draws with, so every
// piece's meta.fonts finds its face (core/canvas.js fontLoaded(): exact family, weight and style; the
// recorder refuses fallback fonts) and every family, weight and style the CSS asks for exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from '../lib/server.mjs';
import { fontFaceKey } from '../../assets/js/core/canvas.js';
import { parseFaces, cssVars, cssUses, firstFamily, covers, pieceFonts, vendoredFonts, fontPath, FONTS_CSS } from '../checks/fonts.mjs';

const read = p => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const faces = parseFaces(read(FONTS_CSS));
const key = f => `${f.family} ${f.weight} ${f.style}`;
const tokens = cssVars(read('assets/css/tokens.css'));

test('fonts.css offers exactly the faces the site used from Google Fonts, latin and latin-ext each', () => {
  // Cormorant Garamond 400/500/600 and 400 italic, Inter Tight 400/500/600, IBM Plex Mono 400/500. No Plex
  // Mono 600: the vendored camera kit draws "600 14px" mono and must keep synthesising it.
  assert.deepEqual([...new Set(faces.map(key))].sort(), [
    'Cormorant Garamond 400 italic', 'Cormorant Garamond 400 normal', 'Cormorant Garamond 500 normal', 'Cormorant Garamond 600 normal',
    'IBM Plex Mono 400 normal', 'IBM Plex Mono 500 normal',
    'Inter Tight 400 normal', 'Inter Tight 500 normal', 'Inter Tight 600 normal',
  ]);
  for (const f of faces) {
    assert.equal(f.display, 'swap', key(f));
    assert.equal(f.src.length, 1, key(f));
    assert.match(f.src[0], /^\.\.\/fonts\/[a-z-]+\/[a-z-]+-latin(?:-ext)?-[1-9]00-(?:normal|italic)\.woff2$/, key(f));
    assert.ok(f.range, `${key(f)} has a unicode-range`);
  }
  for (const k of new Set(faces.map(key))) {
    const subsets = faces.filter(f => key(f) === k).map(f => (/-latin-ext-/.test(f.src[0]) ? 'latin-ext' : 'latin'));
    assert.deepEqual(subsets, ['latin-ext', 'latin'], `${k}: latin-ext first, then latin (the later rule wins where the ranges overlap)`);
    // document.fonts.load(spec) asks for " " by default: the latin file must cover U+0020, so it loads.
    assert.match(faces.find(f => key(f) === k && !/-latin-ext-/.test(f.src[0])).range, /^U\+0000-00FF,/, k);
  }
});

test('every url() in fonts.css is a vendored file with its manifest hash, and every vendored font is used', () => {
  const vendored = vendoredFonts();
  const used = faces.flatMap(f => f.src.map(fontPath));
  assert.deepEqual([...used].sort(), Object.keys(vendored).sort());
  for (const p of used) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, p))).digest('hex'), vendored[p], p);
  for (const dir of new Set(used.map(p => path.posix.dirname(p)))) assert.match(read(`${dir}/LICENSE`), /SIL Open Font License/, dir);
});

test("every piece's meta.fonts has its exact face (family, weight, style)", () => {
  const pieces = pieceFonts();
  const names = Object.keys(pieces);
  for (const id of ['title', 'focus', 'light', 'colour', 'shotcard', 'still', '_template']) assert.ok(names.includes(`assets/js/pieces/${id}.js`), id);
  let n = 0;
  for (const [file, specs] of Object.entries(pieces)) {
    assert.ok(Array.isArray(specs), `${file} imports in Node (${specs?.error})`);
    for (const spec of specs) {
      n++;
      const k = fontFaceKey(spec);
      assert.ok(faces.some(f => f.family === k.family && f.weight === k.weight && f.style === k.style), `${file}: "${spec}" → ${k.family} ${k.weight} ${k.style}`);
    }
  }
  assert.ok(n >= 13, `${n} specs`);
});

test('every family, weight and style the CSS asks for exists', () => {
  const families = new Set(faces.map(f => f.family));
  for (const [k, v] of Object.entries(tokens).filter(([k]) => k.startsWith('--font-'))) assert.ok(families.has(firstFamily(v, tokens)), `tokens.css ${k}`);
  const css = fs.readdirSync(path.join(REPO_ROOT, 'assets/css')).filter(f => f.endsWith('.css') && f !== 'fonts.css')
    .map(f => ({ file: `assets/css/${f}`, css: read(`assets/css/${f}`) }));
  const pages = ['index.html', 'project.html', '404.html', ...fs.readdirSync(path.join(REPO_ROOT, 'studies')).filter(f => f.endsWith('.html')).map(f => `studies/${f}`)];
  for (const p of pages) for (const m of read(p).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css.push({ file: p, css: m[1] });
  const uses = cssUses(css, tokens);
  assert.ok(uses.length > 50, `${uses.length} rules`);
  assert.ok(uses.some(u => u.family === 'Cormorant Garamond' && u.style === 'italic'), 'the italic display rules are seen');
  for (const u of uses) {
    assert.ok(!u.family || families.has(u.family), `${u.file}:${u.line} family ${u.family}`);
    assert.ok(covers(faces, u), `${u.file}:${u.line} ${u.family ?? '*'} ${u.weight ?? '*'} ${u.style ?? '*'}`);
  }
});

test('the coverage rules catch a missing face, a stray family and a synthesised style', () => {
  assert.equal(firstFamily('var(--font-mono)', tokens), 'IBM Plex Mono');
  assert.equal(firstFamily('var(--nope, "Inter Tight"), sans-serif', tokens), 'Inter Tight');
  assert.equal(firstFamily('ui-monospace, monospace'), 'generic');
  assert.equal(firstFamily('inherit'), null);
  const uses = cssUses([{ file: 'x.css', css: `
    .a { font-family: var(--font-mono); font-style: italic; }
    .b { font-family: var(--font-mono); font-weight: 600; }
    .c { font-family: "Cormorant"; }
    .d { font: italic 400 1rem/1.2 var(--font-display); }
    .e { font-weight: 600; }
    .f { font-family: system-ui; font-weight: 800; }` }], tokens);
  const at = sel => uses.find(u => u.line === sel);
  assert.equal(uses.length, 5, 'the system-ui rule is not a webfont rule');
  assert.equal(covers(faces, at(2)), false, 'Plex Mono italic would be synthesised');
  assert.equal(covers(faces, at(3)), false, 'Plex Mono 600 would be synthesised');
  assert.equal(at(4).family, 'Cormorant', 'a family fonts.css does not provide is reported by name');
  assert.deepEqual(at(5), { file: 'x.css', line: 5, family: 'Cormorant Garamond', weight: '400', style: 'italic' });
  assert.equal(covers(faces, at(5)), true);
  assert.equal(covers(faces, at(6)), true, 'a weight alone: some family has a 600');
  assert.equal(faces.some(f => f.family === 'IBM Plex Mono' && f.weight === '600'), false);
  const k = fontFaceKey('600 14px "IBM Plex Mono", ui-monospace, monospace');
  assert.equal(faces.some(f => f.family === k.family && f.weight === k.weight), false, "the camera kit's mono stays synthesised");
});

test('each page preloads at most three fonts, the ones its first screen draws with, all with crossorigin', () => {
  const preloads = p => [...read(p).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b[^>]*\brel="preload"[^>]*>/g)].map(m => m[0]).filter(l => /\bas="font"/.test(l));
  const hrefs = p => preloads(p).map(l => /\bhref="([^"]*)"/.exec(l)[1]);
  assert.deepEqual(hrefs('index.html'), [
    'assets/fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2',
    'assets/fonts/ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2',
    'assets/fonts/inter-tight/inter-tight-latin-500-normal.woff2',
  ]);
  assert.deepEqual(hrefs('project.html'), [
    'assets/fonts/cormorant-garamond/cormorant-garamond-latin-400-normal.woff2',
    'assets/fonts/cormorant-garamond/cormorant-garamond-latin-400-italic.woff2',
    'assets/fonts/ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2',
  ]);
  const used = new Set(faces.flatMap(f => f.src.map(fontPath)));
  for (const p of ['index.html', 'project.html', 'photographs.html'].filter(f => fs.existsSync(path.join(REPO_ROOT, f)))) {
    assert.ok(preloads(p).length <= 3, p);
    for (const l of preloads(p)) {
      assert.match(l, /\scrossorigin[\s>]/, `${p}: ${l}`);
      assert.match(l, /\btype="font\/woff2"/, `${p}: ${l}`);
      assert.ok(used.has(/\bhref="([^"]*)"/.exec(l)[1]), `${p}: ${l} is a fonts.css file`);
    }
  }
  // The title's own faces are the home page's preloads.
  const title = pieceFonts()['assets/js/pieces/title.js'].map(s => fontFaceKey(s)).map(k => `${k.family} ${k.weight} ${k.style}`).sort();
  const pre = hrefs('index.html').map(h => faces.find(f => fontPath(f.src[0]) === h)).map(key).sort();
  assert.deepEqual(pre, title);
});

test('no page loads type from a font service; every page links fonts.css, 404.html from its root', () => {
  const pages = ['index.html', 'project.html', ...fs.readdirSync(path.join(REPO_ROOT, 'studies')).filter(f => f.endsWith('.html')).map(f => `studies/${f}`)];
  for (const p of [...pages, '404.html']) assert.doesNotMatch(read(p), /fonts\.(?:googleapis|gstatic)\.com/, p);
  for (const p of pages) {
    const href = p.startsWith('studies/') ? '../assets/css/fonts.css' : 'assets/css/fonts.css';
    assert.ok(read(p).includes(`<link rel="stylesheet" href="${href}">`), p);
  }
  assert.match(read('404.html'), /css\.href = base \+ 'assets\/css\/fonts\.css'/);
});
