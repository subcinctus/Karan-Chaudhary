// Check plugin: the self-hosted type (assets/css/fonts.css, files under assets/fonts/).
//   static "fonts"
//     - No Google font host in any deployed file (the pages load nothing from a font service).
//     - Every url() in fonts.css is a vendored file (tools/vendor-manifest.json, "kind": "font") with its
//       manifest sha256, and every vendored font file is used; each face has its latin and latin-ext file.
//     - The faces cover every piece's meta.fonts exactly (core/canvas.js fontLoaded() needs the family,
//       weight and style) and every family, weight and style the CSS asks for; no IBM Plex Mono 600, which
//       the vendored camera kit's "600 14px" mono must keep synthesising.
//     - Every page links fonts.css (404.html from its head script) and preloads at most 3 fonts, each a
//       fonts.css file with as="font", type="font/woff2" and crossorigin.
//   browser "fonts": on the home page, a film page and the title study, no request goes to a Google font
//     host, the three families load within 3 s, each preloaded file is fetched once (its crossorigin
//     matches the face's request) and something on the page draws with it, and no console warning
//     mentions a preload.
// The helpers are exported for tools/test/fonts.test.mjs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/server.mjs';
import { fontFaceKey } from '../../assets/js/core/canvas.js';

export const FONTS_CSS = 'assets/css/fonts.css';
const GOOGLE = /fonts\.(?:googleapis|gstatic)\.com/;
/** Not a webfont: a generic family or a CSS-wide keyword (left to the system). */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'math', 'emoji', 'fangsong', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', '-apple-system']);
const KEYWORD = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const unquote = s => String(s ?? '').trim().replace(/^["']|["']$/g, '');
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const stripCss = css => css.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '));

/** The @font-face rules of a stylesheet: [{ family, weight, style, display, src: [url…], range, line }]. */
export function parseFaces(css) {
  const code = stripCss(css);
  return [...code.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const get = k => new RegExp(`(?:^|[;\\s])${k}\\s*:\\s*([^;]+)`, 'i').exec(m[1])?.[1].trim();
    return {
      family: unquote(get('font-family')), weight: get('font-weight') ?? '400', style: get('font-style') ?? 'normal',
      display: get('font-display') ?? null, src: [...(get('src') ?? '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(u => u[1]),
      range: get('unicode-range') ?? null, line: lineOf(code, m.index),
    };
  });
}

/** Custom properties a stylesheet defines (--font-display → its value). */
export function cssVars(css) {
  return Object.fromEntries([...stripCss(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)].map(m => [m[1], m[2].trim()]));
}

/** The first family a font-family value names, var(--…) resolved: a name, 'generic', or null (a CSS-wide keyword). */
export function firstFamily(value, vars = {}) {
  let v = String(value);
  for (let i = 0; i < 4 && /var\(/.test(v); i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (m, k, fb) => vars[k] ?? fb ?? '');
  const first = unquote(v.split(',')[0]);
  if (!first || KEYWORD.has(first.toLowerCase())) return null;
  return GENERIC.has(first.toLowerCase()) ? 'generic' : first;
}

const WEIGHT = v => (/^[1-9]00$/.test(v) ? v : v === 'normal' ? '400' : v === 'bold' ? '700' : null);
const STYLE = v => (/^(italic|oblique)\b/.test(v) ? 'italic' : v === 'normal' ? 'normal' : null);

/**
 * What each CSS rule asks of the type: [{ file, line, family, weight, style }] for every rule that sets a
 * font family, weight or style (null where the rule leaves it to inheritance). sources: [{ file, css }].
 */
export function cssUses(sources, vars = {}) {
  const uses = [];
  for (const { file, css } of sources) {
    const code = stripCss(css);
    const local = { ...vars, ...cssVars(code) };
    for (const m of code.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (/@font-face/.test(m[1])) continue;
      const use = { file, line: lineOf(code, m.index + m[1].length), family: null, weight: null, style: null };
      let set = false;
      for (const decl of m[2].split(';')) {
        const [prop, ...rest] = decl.split(':');
        const p = prop.trim().toLowerCase(), v = rest.join(':').trim().toLowerCase(), raw = rest.join(':').trim();
        if (!v) continue;
        if (p === 'font-family') { use.family = firstFamily(raw, local); set = true; }
        else if (p === 'font-weight') { use.weight = WEIGHT(v); set = true; }
        else if (p === 'font-style') { use.style = STYLE(v); set = true; }
        else if (p === 'font' && /\d(?:px|rem|em|%|pt|vw)/.test(v)) {
          // The shorthand: [style] [weight] size[/line-height] family-list.
          const k = fontFaceKey(raw);
          const list = raw.replace(/^.*?\d[\d.]*(?:px|rem|em|%|pt|vw)(?:\s*\/\s*[\w.%-]+)?\s+/, '');
          Object.assign(use, { family: firstFamily(list, local), weight: k.weight, style: k.style === 'normal' ? 'normal' : 'italic' });
          set = true;
        }
      }
      if (set && use.family !== 'generic') uses.push(use);
    }
  }
  return uses;
}

/** A face exists for the family, weight and style asked (null: left to inheritance, anything goes). */
export const covers = (faces, { family, weight, style }) =>
  faces.some(f => (!family || f.family === family) && (!weight || f.weight === weight) && (!style || f.style === style));

/**
 * Every piece's meta.fonts: { 'assets/js/pieces/title.js': [spec…] }. The pieces are imported in a child
 * Node process behind a minimal canvas stand-in, because the vendored kits draw into canvases as they load.
 */
export function pieceFonts(root = REPO_ROOT) {
  const files = fs.readdirSync(path.join(root, 'assets/js/pieces')).filter(f => f.endsWith('.js')).sort().map(f => `assets/js/pieces/${f}`);
  const script = `
    const noop = () => {};
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    const out = {};
    for (const f of JSON.parse(process.argv[1])) {
      try { const m = await import(new URL(f, ${JSON.stringify(pathToFileURL(root + path.sep).href)})); if (m.meta?.fonts) out[f] = m.meta.fonts; }
      catch (e) { out[f] = { error: String(e?.message ?? e).split('\\n')[0] }; }
    }
    process.stdout.write('\\n' + JSON.stringify(out));`;
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(files)], { cwd: root, encoding: 'utf8', timeout: 60000 });
  return JSON.parse(stdout.trim().split('\n').at(-1));
}

/** The vendored font files: { 'assets/fonts/…/x.woff2': sha256 } from tools/vendor-manifest.json. */
export function vendoredFonts(root = REPO_ROOT) {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'tools/vendor-manifest.json'), 'utf8'));
  const out = {};
  for (const pkg of man.packages ?? []) {
    if (pkg.kind !== 'font') continue;
    for (const [rel, sha] of Object.entries(pkg.files ?? {})) if (/\.woff2?$/.test(rel)) out[path.posix.join(pkg.dir, path.posix.basename(rel))] = sha;
  }
  return out;
}

/** The repo path a url() in fonts.css points at. */
export const fontPath = u => path.posix.normalize(path.posix.join(path.posix.dirname(FONTS_CSS), u.split(/[?#]/)[0]));

async function staticRun({ pass, fail, warn, info, read, exists, deployedFiles, loadData, splitComments }) {
  if (!exists(FONTS_CSS)) return fail(`${FONTS_CSS} is missing`);
  const css = read(FONTS_CSS);
  const faces = parseFaces(css);
  if (!faces.length) return fail(`${FONTS_CSS} has no @font-face rules`);
  const families = new Set(faces.map(f => f.family));
  let bad = 0;
  const err = m => { bad++; fail(m); };

  // 1. Nothing from a Google font host.
  const files = [...deployedFiles(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.xml', '.svg']), 'THIRD-PARTY-NOTICES.md'].filter(exists);
  const google = files.filter(f => GOOGLE.test(read(f)));
  if (google.length) err(`a Google font host (fonts.googleapis.com / fonts.gstatic.com) is named in ${google.join(', ')}: the type is self-hosted (${FONTS_CSS})`);
  else pass(`no Google font host in ${files.length} deployed files`);
  const data = await loadData();
  const credits = (data.colophon?.credits ?? []).map(c => (typeof c === 'string' ? c : c?.text ?? '')).join(' ');
  if (/Google Fonts/i.test(credits)) warn('data/portfolio.js colophon credits still say the type is served by Google Fonts: it is served from this site now (the credit should say so)');

  // 2. Every url() is a vendored file with its manifest hash, and every vendored file is used.
  const vendored = vendoredFonts();
  const used = new Set();
  for (const f of faces) {
    if (f.display !== 'swap') err(`${FONTS_CSS}:${f.line}: ${f.family} ${f.weight} ${f.style} has font-display ${f.display ?? '(none)'}, not swap`);
    if (!f.src.length || f.src.some(u => !/\.woff2$/.test(u))) err(`${FONTS_CSS}:${f.line}: ${f.family} ${f.weight} ${f.style} src must be woff2 file(s): ${f.src.join(', ') || '(none)'}`);
    for (const u of f.src) {
      const p = fontPath(u);
      used.add(p);
      if (/^(?:[a-z]+:|\/)/i.test(u)) err(`${FONTS_CSS}:${f.line}: ${u} is not a relative URL`);
      else if (!exists(p)) err(`${FONTS_CSS}:${f.line}: ${u} → ${p} does not exist (npm run vendor restores it)`);
      else if (!vendored[p]) err(`${FONTS_CSS}:${f.line}: ${p} is not in tools/vendor-manifest.json (a "kind": "font" package)`);
      else if (crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, p))).digest('hex') !== vendored[p]) err(`${p}: sha256 differs from tools/vendor-manifest.json (vendored files stay byte-identical)`);
    }
  }
  const unused = Object.keys(vendored).filter(p => !used.has(p));
  if (unused.length) err(`vendored font file(s) no @font-face uses: ${unused.join(', ')}`);
  const keyOf = f => `${f.family} ${f.weight} ${f.style}`;
  const bySubset = new Map();
  for (const f of faces) for (const u of f.src) {
    const sub = /-latin-ext-/.test(u) ? 'latin-ext' : /-latin-/.test(u) ? 'latin' : 'other';
    bySubset.set(keyOf(f), [...(bySubset.get(keyOf(f)) ?? []), sub]);
  }
  for (const [k, subs] of bySubset) if (!subs.includes('latin') || !subs.includes('latin-ext')) err(`${FONTS_CSS}: ${k} needs a latin and a latin-ext file (has ${subs.join(', ')})`);
  if (!bad) pass(`${faces.length} @font-face rules (${bySubset.size} faces × latin and latin-ext, font-display: swap) all point at vendored files with their manifest sha256; all ${Object.keys(vendored).length} vendored font files are used`);

  // 3. Coverage: every piece's meta.fonts exactly, every family, weight and style the CSS asks for.
  const before = bad;
  let pieces;
  try { pieces = pieceFonts(); } catch (e) { err(`could not read the pieces' meta.fonts: ${e.message.split('\n')[0]}`); pieces = {}; }
  let specs = 0;
  for (const [file, list] of Object.entries(pieces)) {
    if (!Array.isArray(list)) { err(`${file} does not import in Node (${list.error}): its meta.fonts were not checked`); continue; }
    for (const spec of list) {
      specs++;
      const k = fontFaceKey(spec);
      if (!faces.some(f => f.family === k.family && f.weight === k.weight && f.style === k.style)) err(`${file}: meta.fonts "${spec}" has no ${k.family} ${k.weight} ${k.style} face in ${FONTS_CSS} (fontLoaded() would stay false: fallback fonts, the recorder refuses)`);
    }
  }
  const tokens = exists('assets/css/tokens.css') ? cssVars(read('assets/css/tokens.css')) : {};
  for (const [k, v] of Object.entries(tokens).filter(([k]) => k.startsWith('--font-'))) {
    const fam = firstFamily(v, tokens);
    if (fam && fam !== 'generic' && !families.has(fam)) err(`assets/css/tokens.css ${k} asks for "${fam}", which ${FONTS_CSS} does not provide`);
  }
  const sources = deployedFiles(['.css']).filter(f => f !== FONTS_CSS).map(f => ({ file: f, css: read(f) }));
  for (const f of deployedFiles(['.html'])) {
    const html = read(f).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) sources.push({ file: f, css: splitComments(m[1], 'css').code });
  }
  const uses = cssUses(sources, tokens);
  for (const u of uses) {
    if (u.family && !families.has(u.family)) err(`${u.file}:${u.line}: font-family "${u.family}" is not a face ${FONTS_CSS} provides (the page would fall back)`);
    else if (!covers(faces, u)) err(`${u.file}:${u.line}: no face for ${u.family ?? 'any family'} ${u.weight ?? ''} ${u.style ?? ''} in ${FONTS_CSS} (the browser would synthesise it)`.replace(/\s+\(/, ' ('));
  }
  if (faces.some(f => f.family === 'IBM Plex Mono' && f.weight === '600')) err(`${FONTS_CSS} has an IBM Plex Mono 600 face: the vendored camera kit draws "600 14px" mono, which must stay synthesised (a real 600 changes the shot-card pixels)`);
  if (bad === before) pass(`faces cover ${specs} meta.fonts specs in ${Object.keys(pieces).length} pieces exactly and ${uses.length} font rules in ${new Set(uses.map(u => u.file)).size} stylesheets/pages; families ${[...families].join(', ')}; no IBM Plex Mono 600 (camera.js keeps synthesising it)`);

  // 4. Every page links fonts.css; at most 3 font preloads, each a fonts.css file with crossorigin.
  const before2 = bad;
  const pages = deployedFiles(['.html']);
  let preloads = 0;
  for (const f of pages) {
    const html = read(f);
    if (f === '404.html') {
      if (!/['"]assets\/css\/fonts\.css['"]/.test(html)) err('404.html does not load assets/css/fonts.css from its head script');
      continue;
    }
    const markup = html.replace(/<!--[\s\S]*?-->/g, '');
    const links = [...markup.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
    const href = l => /\bhref\s*=\s*"([^"]*)"/i.exec(l)?.[1] ?? '';
    const resolve = u => path.posix.normalize(path.posix.join(path.posix.dirname(f), u.split(/[?#]/)[0]));
    if (!links.some(l => /\brel\s*=\s*"stylesheet"/i.test(l) && resolve(href(l)) === FONTS_CSS)) err(`${f} does not link ${FONTS_CSS}`);
    const fontPre = links.filter(l => /\brel\s*=\s*"preload"/i.test(l) && /\bas\s*=\s*"font"/i.test(l));
    preloads += fontPre.length;
    if (fontPre.length > 3) err(`${f} preloads ${fontPre.length} fonts (at most 3)`);
    for (const l of fontPre) {
      if (!/\scrossorigin(?:[\s=>]|$)/i.test(l)) err(`${f}: font preload ${href(l)} has no crossorigin (it would be fetched twice)`);
      if (!/\btype\s*=\s*"font\/woff2"/i.test(l)) err(`${f}: font preload ${href(l)} has no type="font/woff2"`);
      if (!used.has(resolve(href(l)))) err(`${f}: font preload ${href(l)} is not a file ${FONTS_CSS} uses (it would never be used)`);
    }
    if (links.some(l => /\brel\s*=\s*"preload"/i.test(l) && /\.woff2/i.test(href(l)) && !/\bas\s*=\s*"font"/i.test(l))) err(`${f}: a woff2 preload without as="font"`);
  }
  if (bad === before2) pass(`${pages.length - 1} pages link ${FONTS_CSS} (404.html from its head script); ${preloads} font preloads, at most 3 per page, each a used fonts.css file with type and crossorigin`);
  info(`faces: ${[...bySubset.keys()].join(', ')}`);
}

/** A unicode-range ("U+0000-00FF,U+0131,…") as [[from, to], …] code points. */
const ranges = r => String(r ?? '').split(',').map(x => x.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16))).map(([a, b = a]) => [a, b]);

/**
 * In the page: which of the given faces something draws with. A face counts when visible text styled in
 * its family, weight and style holds a character of its unicode-range, or when a Player's piece names
 * it in meta.fonts (core/canvas.js loadFonts() asks for " ", so a canvas face is the latin file).
 */
function facesDrawn(wanted) {
  const first = s => s.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const keyOf = (family, weight, style) => `${family} ${weight} ${/italic|oblique/.test(style) ? 'italic' : 'normal'}`;
  const inRange = (text, rs) => { for (const ch of text) { const c = ch.codePointAt(0); if (rs.some(([a, b]) => c >= a && c <= b)) return true; } return false; };
  const used = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement, text = n.textContent;
    if (!el || !text.trim() || !el.checkVisibility({ visibilityProperty: true })) continue;
    const cs = getComputedStyle(el), key = keyOf(first(cs.fontFamily), cs.fontWeight, cs.fontStyle);
    wanted.forEach((w, i) => { if (w.key === key && inRange(text, w.ranges)) used.add(i); });
  }
  for (const spec of (window.__players ?? []).flatMap(p => p.meta?.fonts ?? [])) {
    const m = /^(.*?)\d[\d.]*(?:px|pt|em|rem)\s+(.+)$/.exec(spec);
    const head = (m?.[1] ?? '').trim().split(/\s+/);
    const key = keyOf(first(m?.[2] ?? ''), head.find(t => /^[1-9]00$/.test(t)) ?? (head.includes('bold') ? '700' : '400'), head.includes('italic') ? 'italic' : 'normal');
    wanted.forEach((w, i) => { if (w.key === key && w.ranges.some(([a, b]) => a <= 0x20 && b >= 0x20)) used.add(i); });
  }
  return [...used];
}

async function browserRun({ pass, fail, info, browser, watch, loadData, OPT }) {
  const { srv, browser: chromium, contextOptions } = browser();
  const data = await loadData();
  const film = (data.films ?? [])[0];
  const pages = [
    { name: 'index', path: 'index.html' },
    ...(film ? [{ name: `project-${film.slug}`, path: `project.html?slug=${encodeURIComponent(film.slug)}` }] : []),
    { name: 'study-title', path: 'studies/title.html' },
  ].filter(p => !OPT.only || OPT.only.some(o => p.name.includes(o)));
  const faces = parseFaces(fs.readFileSync(path.join(REPO_ROOT, FONTS_CSS), 'utf8'));
  const families = [...new Set(faces.map(f => f.family))];
  /** The fonts.css face a preloaded URL is (its family, weight, style and unicode-range). */
  const faceOf = u => faces.find(f => f.src.some(s => srv.url + fontPath(s) === u));
  let bad = 0;
  for (const p of pages) {
    const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
    // When each family first has a loaded face (ms from navigation start).
    await ctx.addInitScript(() => {
      window.__fontsAt = {};
      const mark = () => { for (const f of document.fonts) if (f.status === 'loaded') window.__fontsAt[f.family.replace(/["']/g, '')] ??= Math.round(performance.now()); };
      document.fonts.addEventListener('loadingdone', mark);
      document.fonts.ready.then(mark);
    });
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    const google = [], fetched = new Map(), notes = [];
    page.on('request', r => {
      const u = r.url();
      if (GOOGLE.test(u)) google.push(u);
      if (/\.woff2(?:[?#]|$)/.test(u)) fetched.set(u, (fetched.get(u) ?? 0) + 1);
    });
    page.on('console', m => { if (/preload/i.test(m.text())) notes.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
    try {
      await page.goto(srv.url + p.path, { waitUntil: 'load', timeout: 45000 });
      // Chrome reports an unused preload a few seconds after the load event: wait past it.
      await page.waitForTimeout(3600);
      const at = await page.evaluate(() => window.__fontsAt);
      const pre = (await page.$$eval('link[rel="preload"][as="font"]', ls => ls.map(l => l.href))).map(u => ({ u, face: faceOf(u) }));
      const wanted = pre.filter(x => x.face).map(({ face: f }) => ({ key: `${f.family} ${f.weight} ${f.style}`, ranges: ranges(f.range) }));
      const drawn = new Set((await page.evaluate(facesDrawn, wanted)).map(i => wanted[i].key + wanted[i].ranges[0].join()));
      const issues = [];
      if (google.length) issues.push(`${google.length} request(s) to a Google font host: ${google[0]}`);
      for (const fam of families) {
        if (at[fam] == null) issues.push(`${fam} never loaded`);
        else if (at[fam] > 3000) issues.push(`${fam} loaded at ${at[fam]} ms (> 3 s)`);
      }
      // Chrome binds a font preload to its @font-face as the stylesheet parses, so it never calls one unused:
      // a preload must be fetched once (the same credentials mode as the face's own request) and drawn with.
      for (const { u, face } of pre) {
        const name = u.slice(srv.url.length);
        if ((fetched.get(u) ?? 0) !== 1) issues.push(`preload ${name} fetched ${fetched.get(u) ?? 0}× (expected once: a crossorigin or URL mismatch double-fetches)`);
        if (!face) issues.push(`preload ${name} is not a ${FONTS_CSS} file`);
        else if (!drawn.has(`${face.family} ${face.weight} ${face.style}` + ranges(face.range)[0].join())) issues.push(`preload ${name}: nothing on the page draws with ${face.family} ${face.weight} ${face.style} in that subset (a download the page does not need)`);
      }
      if (notes.length) issues.push(`console: ${notes[0]}`);
      if (errors.length) issues.push(`${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
      if (issues.length) { bad++; fail(`${p.name}: ${issues.join('; ')}`); }
      else info(`${p.name}: ${families.map(f => `${f} ${at[f]} ms`).join(', ')}; ${fetched.size} font file(s) fetched; ${pre.length} preloaded, each fetched once and drawn with (${pre.map(x => `${x.face.family} ${x.face.weight}${x.face.style === 'italic' ? ' italic' : ''}`).join(', ') || 'none'})`);
    } catch (e) { bad++; fail(`${p.name}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
  if (!pages.length) return info('no page selected (--only)');
  if (!bad) pass(`${pages.map(p => p.name).join(', ')} at 1440×900: no Google font request; ${families.join(', ')} loaded within 3 s; every preload fetched once and drawn with; no preload warning`);
}

export const staticSections = [
  { name: 'fonts', title: 'Fonts: self-hosted files, hashes, coverage of CSS and meta.fonts, preloads', run: staticRun },
];
export const browserSections = [
  { name: 'fonts', title: 'Fonts in the browser: no Google requests, faces within 3 s, preloads used', run: browserRun },
];
