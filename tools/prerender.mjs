#!/usr/bin/env node
// Static content for crawlers and visitors without JavaScript. The home page's sections, its header nav
// and its menu sheet are rendered from data/portfolio.js by assets/js/site/main.js; this writes the same
// renderers' output (render.js, html.js and the feature modules: pure string builders that run in Node)
// between each pair of "prerender:NAME" / "/prerender:NAME" comment markers, so a text fetch reads the
// whole page and the scripts' re-render moves nothing. It also
//   - sets `hidden` on the home sections that wait for material (#reel, #photographs), as pruneSections() does;
//   - replaces <script type="application/ld+json" id="ld-person"> with the JSON-LD @graph (site/ld.js),
//     escaped as render.js setJsonLd() escapes it;
//   - writes a static filmography into project.html (hidden under html.js: project.js renders the film);
//   - fills photographs.html once that page exists;
//   - writes sitemap.xml: the home page, photographs.html once it has photographs, and the real films.
// Nothing else in a page changes, and a second run changes nothing.
//
//   node tools/prerender.mjs              rewrite the pages and sitemap.xml in place (npm run prerender)
//   node tools/prerender.mjs --out _site  write them into a staged copy instead (CI deploys that copy, so the
//                                         live site always follows data/portfolio.js)
//   node tools/prerender.mjs --check      write nothing; exit 1 when a file would change
//
// tools/checks/seo-static.mjs fails on a missing or unbalanced marker and on a generation error, and warns
// when the committed files are stale: an edit to data/portfolio.js in GitHub's web editor cannot run this.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/server.mjs';
import * as R from '../assets/js/site/render.js';
import { renderPhotographsSection, renderPhotographsPage } from '../assets/js/site/photographs.js';
import { siteLD } from '../assets/js/site/ld.js';

/** The header nav and the menu sheet on a page other than the home page (links to index.html#…). */
const AWAY = { nav: d => R.renderNav(d, { base: 'index.html' }), menu: d => R.renderMenu(d, { base: 'index.html' }) };

/**
 * The prerendered pages: what fills each marker (marker name → renderer of the data). Every marker in
 * `markers` must be in the page; an `optional` one may be; any other marker name is an error.
 */
export const PAGES = {
  'index.html': {
    required: true,
    markers: {
      nav: d => R.renderNav(d), menu: d => R.renderMenu(d),
      reel: d => R.renderReel(d), work: d => R.renderWork(d), photographs: d => renderPhotographsSection(d),
      studies: d => R.renderStudies(d), previs: d => R.renderPrevisShell(d), about: d => R.renderAbout(d),
      kit: d => R.renderKit(d), credits: d => R.renderCredits(d), contact: d => R.renderContact(d),
      colophon: d => R.renderColophon(d),
    },
  },
  'project.html': { required: true, markers: { films: d => filmography(d) }, optional: AWAY },
  'photographs.html': { required: false, markers: { photographs: d => renderPhotographsPage(d) }, optional: AWAY },
};

const MARK = /<!--\s*(\/?)prerender:([\w-]+)\s*-->/g;

/**
 * The marker pairs of a page in order: { name, from, to } with the content between them at from…to.
 * Throws on a marker that is unbalanced, nested or repeated.
 */
export function markers(file, src) {
  const pairs = [];
  let open = null;
  for (const m of src.matchAll(MARK)) {
    const [tag, close, name] = m;
    if (!close) {
      if (open) throw new Error(`${file}: prerender:${name} opens inside prerender:${open.name} (markers do not nest)`);
      if (pairs.some(p => p.name === name)) throw new Error(`${file}: prerender:${name} appears twice`);
      open = { name, from: m.index + tag.length };
    } else {
      if (open?.name !== name) throw new Error(`${file}: /prerender:${name} closes ${open ? `prerender:${open.name}` : 'no open marker'}`);
      pairs.push({ ...open, to: m.index });
      open = null;
    }
  }
  if (open) throw new Error(`${file}: prerender:${open.name} is never closed`);
  return pairs;
}

/** Markers on lines of their own stay there, indented like the opening one; inline markers stay inline. */
function layout(src, pair, body) {
  if (!/^\r?\n/.test(src.slice(pair.from, pair.to))) return body;
  const indent = /^[ \t]*/.exec(src.slice(src.lastIndexOf('\n', pair.from - 1) + 1))[0];
  return body ? `\n${indent}${body}\n${indent}` : `\n${indent}`;
}

/** Write each marker's renderer output between its markers. */
function fill(file, src, spec, data) {
  const pairs = markers(file, src);
  const names = pairs.map(p => p.name);
  const missing = Object.keys(spec.markers).filter(n => !names.includes(n));
  if (missing.length) throw new Error(`${file}: missing marker(s) ${missing.map(n => `prerender:${n}`).join(', ')}`);
  const renderers = { ...spec.optional, ...spec.markers };
  const unknown = names.filter(n => !renderers[n]);
  if (unknown.length) throw new Error(`${file}: unknown marker(s) ${unknown.map(n => `prerender:${n}`).join(', ')} (this page takes ${Object.keys(renderers).join(', ')})`);
  let out = '', at = 0;
  for (const p of pairs) {
    let body;
    try { body = String(renderers[p.name](data) ?? '').trim(); } catch (e) { throw new Error(`${file}: prerender:${p.name}: the renderer threw ${e.message}`); }
    out += src.slice(at, p.from) + layout(src, p, body);
    at = p.to;
  }
  return out + src.slice(at);
}

/** Set or clear the boolean `hidden` attribute on the element with this id (its opening tag only). */
function setHidden(file, src, id, hide) {
  const m = new RegExp(`<[a-z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`, 'i').exec(src);
  if (!m) throw new Error(`${file}: no element with id="${id}"`);
  const attr = /\shidden(?:="(?:hidden)?")?(?=[\s/>])/i;
  let tag = m[0];
  if (!hide) tag = tag.replace(attr, '');
  else if (!attr.test(tag)) tag = tag.replace(/\s*>$/, ' hidden>');
  return src.slice(0, m.index) + tag + src.slice(m.index + m[0].length);
}

/** The JSON-LD the page carries, as render.js setJsonLd() writes it (`<` escaped, so it cannot close the tag). */
export const ldJson = data => JSON.stringify(siteLD(data) ?? R.personLD(data)).replace(/</g, '\\u003c');

const LD = /<script\b[^>]*\sid="ld-person"[^>]*>[\s\S]*?<\/script>/i;
function setLd(file, src, data) {
  if (!LD.test(src)) throw new Error(`${file}: no <script type="application/ld+json" id="ld-person">`);
  const json = ldJson(data);
  const graph = JSON.parse(json);
  if (![graph, ...(graph['@graph'] ?? [])].some(n => n?.['@type'] === 'Person')) throw new Error(`${file}: the JSON-LD has no Person`);
  return src.replace(LD, () => `<script type="application/ld+json" id="ld-person">${json}</script>`);
}

/** project.html's static filmography: every film, linked, for crawlers and visitors without JavaScript. */
export function filmography(data) {
  const films = (data.films ?? []).filter(f => f?.slug);
  return R.html`
    <p class="cam-label">${data.person?.name} · ${data.person?.role}</p>
    <h1 class="film-missing__title">Selected work</h1>
    <p class="film-missing__text">The films on this site. Each one’s page holds its camera report, credits and frames.</p>
    <ol class="film-missing__list" role="list">${films.map((f, i) => R.html`
      <li><a href="project.html?slug=${encodeURIComponent(f.slug)}">${f.title}</a> <span class="cam-label">${[R.pad2(i + 1), f.year, f.format, f.role, R.filled(f.director) && `dir. ${f.director}`].filter(Boolean).join(' · ')}</span> ${R.badge(f, data)}${f.logline ? R.html`<p class="film-missing__text">${f.logline}</p>` : ''}</li>`)}
    </ol>
    <p><a class="btn" href="index.html#work">Back to selected work</a></p>`;
}

const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** sitemap.xml: the home page, photographs.html once it has photographs (and exists), the real films. */
export function sitemap(data, { photographs = false } = {}) {
  const urls = [[data.site?.url, '<changefreq>monthly</changefreq><priority>1.0</priority>']];
  if (photographs && R.hasPhotographs(data)) urls.push([R.absUrl(data, 'photographs.html'), '<priority>0.8</priority>']);
  for (const f of data.films ?? []) {
    if (f?.slug && f.placeholder !== true) urls.push([R.absUrl(data, `project.html?slug=${encodeURIComponent(f.slug)}`), '<priority>0.8</priority>']);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Written by tools/prerender.mjs from data/portfolio.js: the home page, photographs.html once it has
     photographs, and every film marked real (sample films carry noindex and are left out). -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, extra]) => `  <url><loc>${xml(loc)}</loc>${extra}</url>`).join('\n')}
</urlset>
`;
}

/**
 * Prerender the pages. `files` maps a page name (a key of PAGES) to its current HTML (a Map or an object);
 * returns a Map of every file to write: each page given, and sitemap.xml. Pure: reads and writes nothing.
 */
export function generate(data, files) {
  const pages = files instanceof Map ? files : new Map(Object.entries(files));
  const out = new Map();
  for (const [file, src] of pages) {
    const spec = PAGES[file];
    if (!spec) throw new Error(`${file}: not a prerendered page (${Object.keys(PAGES).join(', ')})`);
    let html = fill(file, src, spec, data);
    if (file === 'index.html') {
      for (const [id, hide] of Object.entries(R.hiddenSections(data))) html = setHidden(file, html, id, hide);
      html = setLd(file, html, data);
    }
    out.set(file, html);
  }
  out.set('sitemap.xml', sitemap(data, { photographs: pages.has('photographs.html') }));
  return out;
}

/** The pages as they are on disk (index.html and project.html must exist; photographs.html may). */
export function readPages(root = REPO_ROOT) {
  const pages = new Map();
  for (const [file, spec] of Object.entries(PAGES)) {
    const abs = path.join(root, file);
    if (fs.existsSync(abs)) pages.set(file, fs.readFileSync(abs, 'utf8'));
    else if (spec.required) throw new Error(`${file} is missing`);
  }
  return pages;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const i = argv.indexOf('--out');
  const outDir = i >= 0 ? argv[i + 1] : null;
  try {
    if (i >= 0 && (!outDir || outDir.startsWith('--'))) throw new Error('--out needs a directory (e.g. --out _site)');
    const { default: data } = await import(pathToFileURL(path.join(REPO_ROOT, 'data/portfolio.js')).href);
    let stale = 0;
    for (const [file, content] of generate(data, readPages())) {
      const abs = path.join(REPO_ROOT, file);
      const now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (check) { if (now !== content) { stale++; console.log(`stale     ${file}`); } continue; }
      if (!outDir && now === content) { console.log(`unchanged ${file}`); continue; }
      const dest = outDir ? path.resolve(outDir, file) : abs;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
      console.log(`${outDir ? 'wrote    ' : 'updated  '} ${path.relative(process.cwd(), dest) || dest}`);
    }
    if (check) {
      console.log(stale ? `${stale} file(s) out of date with data/portfolio.js: run npm run prerender` : 'prerendered files are up to date');
      process.exit(stale ? 1 : 0);
    }
  } catch (e) {
    console.error(`prerender: ${e.message}`);
    process.exit(1);
  }
}
