#!/usr/bin/env node
// Site verification (spec §9). Static checks run anywhere (CI); browser checks drive Chromium through
// the GitHub Pages sub-path server; media checks probe rendered clips.
//
//   node tools/check.mjs                 static + browser (+ media when ffprobe and files exist)
//   node tools/check.mjs --no-browser    static only (CI-safe: no Playwright, no network)
//
// Options
//   --media                 always run the ffprobe checks (fail if ffprobe is missing)
//   --allow-offline-fonts   Google Fonts failures are warnings, not failures
//   --only <text>           browser: only pages whose name contains <text> (comma list allowed)
//   --viewports 390x844,…   browser: viewports (default 390x844,768x1024,1440x900)
//   --skip <section,…>      skip sections (urls,links,banned,licences,data,shotlist,seo,sitemap,
//                           contrast,assets,screens,determinism,reduced,keyboard,crawl,media)
//   --json <file>           also write the full report as JSON
//   --gpu                   use the host GPU instead of SwiftShader
//
// Exit code 1 when anything FAILs. WARN and SKIP never fail the run; every skip says why.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/server.mjs';

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OPT = {
  browser: !has('--no-browser'),
  media: has('--media'),
  offlineFonts: has('--allow-offline-fonts'),
  only: val('--only', null)?.split(',').filter(Boolean) ?? null,
  viewports: val('--viewports', '390x844,768x1024,1440x900').split(',').map(s => s.split('x').map(Number)),
  skip: new Set(val('--skip', '').split(',').filter(Boolean)),
  json: val('--json', null),
  gpu: has('--gpu'),
};

// ---------------------------------------------------------------- reporting
const results = [];
let current = 'general';
const rec = (level, msg, section = current) => { results.push({ section, level, msg }); };
const pass = m => rec('PASS', m), fail = m => rec('FAIL', m), warn = m => rec('WARN', m), skip = m => rec('SKIP', m), info = m => rec('INFO', m);

async function section(name, title, fn) {
  current = name;
  const t0 = Date.now();
  process.stdout.write(`\n== ${title}\n`);
  if (OPT.skip.has(name)) { skip('skipped: --skip ' + name); flush(name); return; }
  try { await fn(); } catch (e) { fail(`crashed: ${e?.stack?.split('\n').slice(0, 4).join(' | ') ?? e}`); }
  flush(name, Date.now() - t0);
}
function flush(name, ms) {
  const mine = results.filter(r => r.section === name);
  for (const r of mine) console.log(`  ${r.level.padEnd(4)} ${r.msg}`);
  if (!mine.length) console.log('  INFO nothing to report');
  if (ms > 2000) console.log(`  (${(ms / 1000).toFixed(1)} s)`);
}

// ---------------------------------------------------------------- file helpers
const R = (...p) => path.join(REPO_ROOT, ...p);
const exists = p => fs.existsSync(R(p));
const read = p => fs.readFileSync(R(p), 'utf8');
const relp = abs => path.relative(REPO_ROOT, abs).split(path.sep).join('/');
function walk(dir, filter = () => true, out = []) {
  const abs = R(dir);
  if (!fs.existsSync(abs)) return out;
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const p = path.posix.join(dir, d.name);
    if (d.isDirectory()) walk(p, filter, out); else if (filter(p)) out.push(p);
  }
  return out;
}
/** Every file that is deployed (spec §1 "Deployed"), by extension. */
function deployedFiles(exts) {
  const top = ['index.html', 'project.html', '404.html', 'site.webmanifest', 'sitemap.xml'].filter(exists);
  const dirs = ['assets', 'data', 'studies'].flatMap(d => walk(d));
  return [...top, ...dirs].filter(f => exts.some(e => f.endsWith(e)));
}

/**
 * Replace comments with spaces (newlines kept, so line numbers survive). Strings, template literals
 * and regex literals are kept. mode 'js' | 'css'. Also returns the comment text for licence checks.
 */
export function splitComments(src, mode = 'js') {
  let code = '', comments = '';
  let i = 0, prevSig = '';
  const n = src.length;
  const blank = s => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2), j = end < 0 ? n : end + 2;
      comments += src.slice(i, j) + '\n'; code += blank(src.slice(i, j)); i = j; continue;
    }
    if (mode === 'js' && c === '/' && d === '/') {
      const end = src.indexOf('\n', i), j = end < 0 ? n : end;
      comments += src.slice(i, j) + '\n'; code += blank(src.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'" || (mode === 'js' && c === '`')) {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (c !== '`' && src[j] === '\n') break; j++; }
      code += src.slice(i, j + 1); i = j + 1; prevSig = c; continue;
    }
    if (mode === 'js' && c === '/' && (prevSig === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || /\b(return|typeof|case|in|of)$/.test(code.trimEnd()))) {
      // regex literal
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
        j++;
      }
      code += src.slice(i, j + 1); i = j + 1; prevSig = '/'; continue;
    }
    code += c;
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return { code, comments };
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------------------------------------------------------------- static: URLs
const ROOT_REL = {
  attr: /\b(?:href|src|srcset|action|poster|data-src|data-poster)\s*=\s*["']\/(?!\/)/g,
  cssUrl: /url\(\s*["']?\/(?!\/)/g,
  cssImport: /@import\s+["']\/(?!\/)/g,
  jsCall: /(?:\bfrom\s*|\bimport\s*\(\s*|\bfetch\s*\(\s*|\bnew\s+URL\s*\(\s*|\.(?:href|src|poster)\s*=\s*|\b(?:href|src|poster|video|url|start_url)\s*:\s*)["'`]\/(?!\/)/g,
  jsLiteral: /["'`]\/(?:assets|data|media|studies|previs|index\.html|project\.html|404\.html|sitemap\.xml|site\.webmanifest)\b/g,
};
async function checkUrls() {
  const files = deployedFiles(['.html', '.css', '.js', '.mjs', '.webmanifest']);
  let bad = 0;
  for (const f of files) {
    const src = read(f);
    const hits = [];
    const scan = (text, res) => { for (const re of res) for (const m of text.matchAll(re)) hits.push(lineOf(text, m.index)); };
    if (f.endsWith('.css')) scan(splitComments(src, 'css').code, [ROOT_REL.cssUrl, ROOT_REL.cssImport]);
    else if (f.endsWith('.js') || f.endsWith('.mjs')) scan(splitComments(src, 'js').code, [ROOT_REL.attr, ROOT_REL.jsCall, ROOT_REL.jsLiteral, ROOT_REL.cssUrl]);
    else if (f.endsWith('.webmanifest')) {
      const j = JSON.parse(src);
      for (const u of [j.start_url, j.scope, ...(j.icons ?? []).map(i => i.src)]) if (typeof u === 'string' && /^\/(?!\/)/.test(u)) hits.push(`"${u}"`);
    } else {
      const noComments = src.replace(/<!--[\s\S]*?-->/g, s => s.replace(/[^\n]/g, ' '));
      scan(noComments, [ROOT_REL.attr, ROOT_REL.cssUrl]);
      // Every srcset candidate (not only the first) and <meta http-equiv="refresh" content="0;url=/…">.
      for (const m of noComments.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*"([^"]*)"/gi)) {
        if (m[1].split(',').some(c => /^\/(?!\/)/.test(c.trim()))) hits.push(lineOf(noComments, m.index));
      }
      for (const m of noComments.matchAll(/<meta\b[^>]*http-equiv\s*=\s*"refresh"[^>]*>/gi)) {
        if (/\burl\s*=\s*['"]?\/(?!\/)/i.test(m[0])) hits.push(lineOf(noComments, m.index));
      }
      // Inline scripts: 404.html computes its base at runtime from location.pathname (allowed).
      if (!f.endsWith('404.html')) {
        for (const m of noComments.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
          const off = m.index + m[0].indexOf(m[1]);
          const { code } = splitComments(m[1], 'js');
          for (const re of [ROOT_REL.jsCall, ROOT_REL.jsLiteral]) for (const h of code.matchAll(re)) hits.push(lineOf(noComments, off + h.index));
        }
      }
    }
    if (hits.length) { bad++; fail(`${f}: root-relative URL at ${[...new Set(hits)].join(', ')} (must be relative: the site lives under /Karan-Chaudhary/)`); }
  }
  if (!bad) pass(`no root-relative URLs in ${files.length} deployed html/css/js/manifest files`);
}

// ---------------------------------------------------------------- static: local references in HTML
async function checkStaticLinks() {
  const pages = deployedFiles(['.html']).filter(f => !f.endsWith('404.html'));
  let missing = 0, total = 0;
  for (const f of pages) {
    // Markup only: comments and inline scripts (their templates are checked in the browser crawl) are dropped.
    const html = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/g)) {
      const u = m[1].trim();
      if (!u || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u) || u.includes('${')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), u.split(/[?#]/)[0]));
      if (!target || target.startsWith('..')) continue;
      total++;
      const abs = R(target);
      const ok = fs.existsSync(abs) && (fs.statSync(abs).isFile() || fs.existsSync(path.join(abs, 'index.html')));
      if (!ok) { missing++; fail(`${f}: "${u}" → ${target} does not exist`); }
    }
  }
  if (!missing) pass(`${total} relative href/src references in ${pages.length} HTML files resolve to files`);
  if (exists('site.webmanifest')) {
    const j = JSON.parse(read('site.webmanifest'));
    for (const i of j.icons ?? []) if (i.src && !/^[a-z]+:/i.test(i.src) && !exists(i.src)) fail(`site.webmanifest: icon ${i.src} does not exist`);
  }
}

// ---------------------------------------------------------------- static: banned clock / randomness APIs
const PURE_CORE = ['time', 'prng', 'color', 'optics', 'presets', 'params', 'canvas', 'grain', 'gl'].map(m => `assets/js/core/${m}.js`);
const BANNED = [
  [/\bMath\s*\.\s*random\b/g, 'Math.random'],
  [/\bDate\s*\.\s*now\b|\bnew\s+Date\b|(?<![.\w])Date\s*\(/g, 'Date'],
  [/\bperformance\s*\.\s*now\b/g, 'performance.now'],
  [/\bsetTimeout\b/g, 'setTimeout'],
  [/\bsetInterval\b/g, 'setInterval'],
  [/\brequestAnimationFrame\b/g, 'requestAnimationFrame'],
  // Not in the spec's list, but the same failure mode (output that depends on something other than t/seed).
  [/\brequestIdleCallback\b/g, 'requestIdleCallback'],
  [/\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\b/g, 'crypto random'],
];
async function checkBanned() {
  const files = [...walk('assets/js/pieces', f => f.endsWith('.js')), ...PURE_CORE.filter(exists), ...walk('assets/js/vendor', f => f.endsWith('.js'))];
  if (!files.length) return skip('skipped: no piece or core files found');
  let bad = 0;
  for (const f of files) {
    const src = read(f), lines = src.split('\n');
    const { code } = splitComments(src, 'js');
    for (const [re, name] of BANNED) {
      for (const m of code.matchAll(re)) {
        const ln = lineOf(code, m.index);
        // No escape hatch: the rule for these folders is absolute. Real-time UI helpers (hover loops,
        // timers) belong in assets/js/site/ or assets/js/ui/, which drive a piece through seek(t).
        const marked = /check:allow-clock/.test(lines[ln - 1] ?? '') ? ' (a "check:allow-clock" comment does not exempt these folders: move the real-time helper to assets/js/site/ or assets/js/ui/)' : '';
        bad++; fail(`${f}:${ln} uses ${name}${marked || ' (pieces, vendored cells and pure core modules must be pure functions of t; use core/prng.js and the Player\'s clock)'}`);
      }
    }
  }
  if (!bad) pass(`no Math.random/Date/performance.now/timers/rAF in ${files.length} pieces, vendored and pure core modules`);
}

// ---------------------------------------------------------------- static: Motion Prompt licence lines
const MP_ID = /#(0(?:0[1-9]|[1-9]\d)|1[01]\d|120)(?![\w])/g;   // #001–#120 (not #000 or hex colours like #0C0D10)
const LICENCE = /Motion Prompt #(\d{3}) · MIT License \(c\) 2026 Shohei Ohtaki · https:\/\/showheyohtaki\.github\.io\/motion-prompt\/#(\d{3})/g;
const VENDORED = { 'assets/js/vendor/motion-prompt/camera.js': ['027', '030', '031', '032', '033', '043'], 'assets/js/vendor/motion-prompt/motion.js': ['005'] };
async function checkLicences() {
  const files = [...walk('assets', f => /\.(m?js|css)$/.test(f)), ...walk('tools', f => /\.m?js$/.test(f) && !f.endsWith('tools/check.mjs'))];
  let citing = 0, bad = 0;
  for (const f of files) {
    const src = read(f);
    const { comments } = splitComments(src, f.endsWith('.css') ? 'css' : 'js');
    const cited = new Set([...comments.matchAll(MP_ID)].map(m => m[1]));
    const lic = new Set();
    for (const m of src.matchAll(LICENCE)) {
      if (m[1] !== m[2]) { bad++; fail(`${f}: licence line for #${m[1]} links to #${m[2]}`); }
      lic.add(m[1]);
    }
    const required = new Set([...(VENDORED[f] ?? [])]);
    for (const id of required) if (!lic.has(id)) { bad++; fail(`${f}: vendored element #${id} has no licence line`); }
    if (!cited.size) continue;
    citing++;
    if (!lic.size) { bad++; fail(`${f}: cites Motion Prompt ${[...cited].map(i => '#' + i).join(' ')} in comments but has no licence line (${f.endsWith('.css') ? '/* … */' : '// …'} "Motion Prompt #ID · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#ID")`); continue; }
    const missing = [...cited].filter(id => !lic.has(id));
    if (missing.length) warn(`${f}: cites ${missing.map(i => '#' + i).join(' ')} without its own licence line (fine for passing mentions; add one if its numbers are used)`);
  }
  if (!exists('THIRD-PARTY-NOTICES.md')) { bad++; fail('THIRD-PARTY-NOTICES.md is missing'); }
  else if (!/MIT License/i.test(read('THIRD-PARTY-NOTICES.md'))) { bad++; fail('THIRD-PARTY-NOTICES.md does not contain the MIT licence text'); }
  info('data/portfolio.js is content (it names moves for the cards) and is not required to carry licence lines');
  if (!bad) pass(`licence lines present: ${citing} code files cite Motion Prompt IDs, all carry the MIT line; vendored #005 #027 #030 #031 #032 #033 #043 covered`);
}

// ---------------------------------------------------------------- static: data/portfolio.js
let DATA = null;
async function loadData() {
  if (DATA) return DATA;
  DATA = (await import(pathToFileURL(R('data/portfolio.js')).href)).default;
  return DATA;
}
const HEX = /^#[0-9a-f]{6}$/i;
const MOVES = new Set(['027', '030', '031', '032', '033', '043']);
const PATH_KEYS = new Set(['src', 'poster', 'video', 'cv', 'href', 'image', 'ogImage', 'shotlist', 'still', 'file']);
async function checkData() {
  if (!exists('data/portfolio.js')) return fail('data/portfolio.js is missing');
  let d;
  try { d = await loadData(); } catch (e) { return fail(`data/portfolio.js does not import: ${e.message}`); }
  let errs = 0;
  const bad = m => { errs++; fail(m); };
  const s = d.site ?? {};
  if (!/^https:\/\/.+\/$/.test(s.url ?? '')) bad(`site.url must be an absolute https URL ending in "/" (got ${JSON.stringify(s.url)})`);
  for (const k of ['title', 'description']) if (typeof s[k] !== 'string' || !s[k].trim()) bad(`site.${k} is missing`);
  if (!d.person?.name) bad('person.name is missing');

  const films = Array.isArray(d.films) ? d.films : [];
  if (!films.length) bad('films is empty (the work grid needs at least one record)');
  const slugs = new Set();
  films.forEach((f, i) => {
    const at = `films[${i}]${f?.slug ? ` (${f.slug})` : ''}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug ?? '')) bad(`${at}: slug must be lowercase-kebab (got ${JSON.stringify(f.slug)})`);
    if (slugs.has(f.slug)) bad(`${at}: duplicate slug`);
    slugs.add(f.slug);
    if (!f.title) bad(`${at}: title is missing`);
    if (!(typeof f.aspect === 'number' && Number.isFinite(f.aspect) && f.aspect >= 1 && f.aspect <= 4)) bad(`${at}: aspect must be a number between 1 and 4 (got ${JSON.stringify(f.aspect)})`);
    if (f.frameRate != null && !(typeof f.frameRate === 'number' && f.frameRate > 0)) bad(`${at}: frameRate must be a number`);
    if (f.year != null && !Number.isInteger(f.year)) bad(`${at}: year must be a whole number`);
    if (!Array.isArray(f.palette) || f.palette.length < 2) bad(`${at}: palette must be an array of hex colours`);
    else {
      f.palette.forEach((c, j) => { if (!HEX.test(c)) bad(`${at}: palette[${j}] ${JSON.stringify(c)} is not #RRGGBB`); });
      if (f.palette.length !== 5) warn(`${at}: palette has ${f.palette.length} colours (cards and stills expect 5, darkest → lightest)`);
    }
    const mv = String(f.move ?? '').replace(/^#/, '');
    if (!MOVES.has(mv)) bad(`${at}: move ${JSON.stringify(f.move)} is not one of #027 #030 #031 #032 #033 #043`);
    for (const [k, arr] of [['stills', f.stills], ['bts', f.bts]]) {
      if (arr != null && !Array.isArray(arr)) { bad(`${at}: ${k} must be an array`); continue; }
      (arr ?? []).forEach((st, j) => {
        if (!st?.src) bad(`${at}: ${k}[${j}] has no src`);
        if (!st?.alt || !String(st.alt).trim()) bad(`${at}: ${k}[${j}] needs alt text`);
        if (st?.aspect != null && !(typeof st.aspect === 'number' && st.aspect > 0)) bad(`${at}: ${k}[${j}].aspect must be a number`);
      });
    }
  });
  (d.credits ?? []).forEach((c, i) => { if (c.year != null && !Number.isInteger(c.year)) bad(`credits[${i}]: year must be a whole number`); });
  if (d.contact?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contact.email)) bad(`contact.email ${JSON.stringify(d.contact.email)} is not an email address`);
  for (const [id, m] of Object.entries(d.previs?.media ?? {})) if (!/^PV-\d{3}$/.test(id)) warn(`previs.media key ${id} does not look like a shot id (PV-010…)`);

  // Paths: every non-null media/link path is relative and exists.
  let paths = 0;
  const seen = new WeakSet();
  const visit = (v, at, key) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return; seen.add(v);
      for (const [k, x] of Object.entries(v)) visit(x, Array.isArray(v) ? `${at}[${k}]` : `${at}.${k}`, Array.isArray(v) ? key : k);
      return;
    }
    if (typeof v !== 'string' || !PATH_KEYS.has(key)) return;
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(v)) return;
    if (v.startsWith('/')) return bad(`${at}: "${v}" is root-relative; use a relative path`);
    const file = v.split(/[?#]/)[0];
    if (!file) return;
    paths++;
    if (!exists(file)) bad(`${at}: "${v}" does not exist`);
  };
  visit(d, 'data', '');
  if (!errs) pass(`schema ok: ${films.length} films (unique slugs, hex palettes, numeric aspects, moves in #027/#030/#031/#032/#033/#043); ${paths} media/link paths exist`);

  // Placeholder report.
  let ph = 0;
  const where = new Map();
  const count = (v, top) => {
    if (!v || typeof v !== 'object') return;
    if (v.placeholder === true) { ph++; where.set(top, (where.get(top) ?? 0) + 1); }
    for (const [k, x] of Object.entries(v)) count(x, top ?? k);
  };
  count(d, null);
  const todos = (read('data/portfolio.js').match(/TODO\(owner\)/g) ?? []).length;
  const repoTodos = deployedFiles(['.html', '.js', '.css']).filter(f => f !== 'data/portfolio.js').reduce((n, f) => n + (read(f).match(/TODO\(owner\)/g) ?? []).length, 0);
  info(`placeholders: ${ph} record(s) with placeholder:true (${[...where].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); ${todos} TODO(owner) in data/portfolio.js${repoTodos ? `, ${repoTodos} elsewhere` : ''}`);
  if (ph && d.site?.showPlaceholderBadges === false) warn('site.showPlaceholderBadges is false while placeholder records remain: sample content would look real');
}

// ---------------------------------------------------------------- static: previs shot list in sync with its generator
function deepDiff(a, b, at = '') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${at || '(root)'}: ${JSON.stringify(a)?.slice(0, 60)} ≠ ${JSON.stringify(b)?.slice(0, 60)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${at}: array vs object`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const r = deepDiff(a[k], b[k], at ? `${at}.${k}` : k); if (r) return r; }
  return null;
}
async function checkShotlist() {
  const gen = 'tools/previs-shotlist.mjs', file = 'previs/shotlist.json';
  if (!exists(gen) && !exists(file)) return skip(`skipped: neither ${gen} nor ${file} exists yet`);
  if (!exists(file)) return skip(`skipped: ${file} not generated yet (run npm run previs:shotlist)`);
  let committed;
  try { committed = JSON.parse(read(file)); } catch (e) { return fail(`${file} is not valid JSON: ${e.message}`); }
  if (!Array.isArray(committed.shots)) fail(`${file}: "shots" must be an array`);
  if (!exists(gen)) return skip(`skipped sync: ${gen} not found (${file} parses, ${committed.shots?.length ?? 0} shots)`);
  let fresh = null, how = '';
  const src = read(gen);
  if (/export\s+(?:async\s+)?function\s+generate\b|export\s*\{[^}]*\bgenerate\b/.test(src)) {
    const mod = await import(pathToFileURL(R(gen)).href);
    fresh = await mod.generate();
    how = 'generate()';
  } else {
    const out = execFileSync(process.execPath, [R(gen), '--stdout'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000 });
    fresh = JSON.parse(out);
    how = '--stdout';
  }
  if (typeof fresh === 'string') fresh = JSON.parse(fresh);
  const diff = deepDiff(JSON.parse(JSON.stringify(fresh)), committed);
  if (diff) fail(`${file} is out of date with ${gen} (${how}): first difference at ${diff}. Run npm run previs:shotlist.`);
  else pass(`${file} matches ${gen} ${how} (${committed.shots.length} shots)`);
  const ids = new Set((committed.shots ?? []).map(s => s.id));
  const d = await loadData().catch(() => null);
  for (const id of Object.keys(d?.previs?.media ?? {})) if (!ids.has(id)) warn(`data previs.media has ${id}, which is not in ${file}`);
}

// ---------------------------------------------------------------- static: SEO tags and JSON-LD
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|mdash|ndash|middot|nbsp);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
  if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', middot: '·', nbsp: '\u00a0' }[k];
});
function metaContent(html, attr, name) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const a = new RegExp(`\\b${attr}\\s*=\\s*"${name.replace(/[.:]/g, '\\$&')}"`, 'i');
    if (a.test(tag)) { const c = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag); return c ? decode(c[1]) : null; }
  }
  return undefined;
}
async function checkSeo() {
  if (!exists('index.html')) return skip('skipped: index.html not found');
  const html = read('index.html');
  const d = await loadData();
  const s = d.site;
  let errs = 0;
  const eq = (label, got, want) => {
    if (got === undefined) { errs++; fail(`index.html: ${label} is missing (expected "${want}")`); }
    else if (got !== want) { errs++; fail(`index.html: ${label} is "${got}", data.site says "${want}"`); }
  };
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  eq('<title>', title ? decode(title[1].trim()) : undefined, s.title);
  eq('meta description', metaContent(html, 'name', 'description'), s.description);
  eq('og:title', metaContent(html, 'property', 'og:title'), s.title);
  eq('og:description', metaContent(html, 'property', 'og:description'), s.description);
  eq('og:url', metaContent(html, 'property', 'og:url'), s.url);
  eq('twitter:title', metaContent(html, 'name', 'twitter:title'), s.title);
  eq('twitter:description', metaContent(html, 'name', 'twitter:description'), s.description);
  eq('twitter:card', metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
  if (s.themeColor) eq('theme-color', metaContent(html, 'name', 'theme-color'), s.themeColor);
  const ogImg = s.ogImage ?? 'media/og/og-title.jpg';
  eq('og:image', metaContent(html, 'property', 'og:image'), s.url + ogImg);
  const canon = /<link\b[^>]*\brel\s*=\s*"canonical"[^>]*>/i.exec(html);
  eq('link rel=canonical', canon ? /\bhref\s*=\s*"([^"]*)"/i.exec(canon[0])?.[1] : undefined, s.url);
  const lang = /<html\b[^>]*\blang\s*=\s*"([^"]+)"/i.exec(html)?.[1];
  if (s.lang && lang !== s.lang) { errs++; fail(`index.html: <html lang="${lang}"> but data.site.lang is "${s.lang}"`); }
  if (!exists(ogImg)) warn(`${ogImg} does not exist yet (npm run og); social previews will be blank`);

  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) { errs++; fail('index.html: no JSON-LD block'); }
  let person = null;
  blocks.forEach((b, i) => {
    try {
      const j = JSON.parse(b[1]);
      for (const node of [j, ...(j['@graph'] ?? [])]) if (node?.['@type'] === 'Person') person = node;
    } catch (e) { errs++; fail(`index.html: JSON-LD block ${i + 1} does not parse: ${e.message}`); }
  });
  if (blocks.length && !person) { errs++; fail('index.html: JSON-LD has no Person'); }
  if (person) {
    if (person.name !== d.person.name) { errs++; fail(`JSON-LD Person.name "${person.name}" ≠ data.person.name "${d.person.name}"`); }
    if (person.url !== s.url) { errs++; fail(`JSON-LD Person.url "${person.url}" ≠ data.site.url "${s.url}"`); }
    const sameAs = (d.person.sameAs ?? []).filter(Boolean);
    if (JSON.stringify(person.sameAs ?? []) !== JSON.stringify(sameAs)) warn(`JSON-LD Person.sameAs ${JSON.stringify(person.sameAs ?? [])} differs from data.person.sameAs ${JSON.stringify(sameAs)}`);
  }
  for (const f of ['project.html', ...walk('studies', x => x.endsWith('.html'))].filter(exists)) {
    const h = read(f);
    if (!/<title>[^<]+<\/title>/i.test(h)) { errs++; fail(`${f}: no <title>`); }
    if (metaContent(h, 'name', 'description') == null) warn(`${f}: no meta description`);
  }
  if (!errs) pass(`static <title>, description, canonical, OG and Twitter tags match data.site; JSON-LD (${blocks.length} block) parses, Person matches`);
}

// ---------------------------------------------------------------- static: sitemap
async function checkSitemap() {
  if (!exists('sitemap.xml')) return warn('sitemap.xml not found (search engines will not discover project pages)');
  const xml = read('sitemap.xml');
  const d = await loadData();
  const locs = new Set([...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => decode(m[1])));
  const want = [d.site.url, ...(d.films ?? []).map(f => `${d.site.url}project.html?slug=${f.slug}`)];
  const missing = want.filter(u => !locs.has(u));
  for (const u of missing) fail(`sitemap.xml does not list ${u}`);
  const extra = [...locs].filter(u => !want.includes(u));
  if (extra.length) warn(`sitemap.xml lists URLs that are not the home page or a film: ${extra.join(', ')}`);
  for (const u of locs) if (!u.startsWith(d.site.url)) fail(`sitemap.xml: ${u} is outside ${d.site.url}`);
  if (!missing.length) pass(`sitemap.xml lists the home page and all ${d.films.length} project slugs`);
}

// ---------------------------------------------------------------- static: token contrast
async function checkContrast() {
  if (!exists('assets/css/tokens.css')) return skip('skipped: assets/css/tokens.css not found');
  const { contrastRatio } = await import(pathToFileURL(R('assets/js/core/color.js')).href);
  const css = splitComments(read('assets/css/tokens.css'), 'css').code;
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? css;
  const tok = {};
  for (const m of root.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi)) {
    let h = m[2]; if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join('');
    tok[m[1]] ??= h;
  }
  const text = ['paper', 'paper-2', 'paper-3', 'tungsten', 'daylight', 'sample'].filter(k => tok[k]);
  const bgs = ['ink-0', 'ink-1', 'ink-2', 'ink-3'].filter(k => tok[k]);
  if (!text.length || !bgs.length) return skip('skipped: tokens.css has no --paper*/--ink-* hex tokens');
  const rows = [];
  let errs = 0;
  for (const t of text) for (const b of bgs) {
    const r = contrastRatio(tok[t], tok[b]);
    rows.push(`${t}/${b} ${r.toFixed(2)}`);
    if (r < 4.5) {
      // --ink-3 is the raised/hover surface: report, but only the page and surface backgrounds are hard requirements.
      if (b === 'ink-3') warn(`--${t} on --${b}: ${r.toFixed(2)}:1 < 4.5:1 (avoid ${t} text on raised/hover surfaces)`);
      else { errs++; fail(`--${t} (${tok[t]}) on --${b} (${tok[b]}): ${r.toFixed(2)}:1 < 4.5:1`); }
    }
  }
  if (!errs) pass(`text tokens ≥ 4.5:1 on ink-0/1/2: ${rows.filter(r => !r.includes('/ink-3')).join(', ')}`);
}

// ---------------------------------------------------------------- static: generated assets
async function checkAssets() {
  const studies = walk('studies', f => f.endsWith('.html')).map(f => path.posix.basename(f, '.html')).filter(id => !id.startsWith('_'));
  const missing = [];
  let errs = 0;
  for (const id of studies) if (!exists(`media/studies/${id}/poster.webp`)) missing.push(id);
  for (const f of walk('media/studies', x => /poster\.(webp|jpg)$/.test(x))) {
    const size = fs.statSync(R(f)).size;
    if (f.endsWith('.webp') && size > 120 * 1024) { errs++; fail(`${f} is ${(size / 1024).toFixed(0)} KB > 120 KB (re-record; the recorder tunes quality to fit)`); }
  }
  if (missing.length) warn(`no poster yet for ${missing.join(', ')} (npm run record:posters)`);
  else if (studies.length) pass(`posters present for ${studies.length} studies, all WebP ≤ 120 KB`);
  if (exists('media/og/og-title.jpg')) {
    const size = fs.statSync(R('media/og/og-title.jpg')).size;
    if (size > 250 * 1024) { errs++; fail(`media/og/og-title.jpg is ${(size / 1024).toFixed(0)} KB > 250 KB`); }
    else pass(`media/og/og-title.jpg ${(size / 1024).toFixed(0)} KB ≤ 250 KB`);
  } else warn('media/og/og-title.jpg missing (npm run og)');
  if (!exists('assets/icons/apple-touch-icon.png')) warn('assets/icons/apple-touch-icon.png missing (npm run og)');
  // Stale renders (local only: a CI checkout gives every file the same mtime).
  if (!process.env.CI) {
    const mt = p => (exists(p) ? fs.statSync(R(p)).mtimeMs : 0);
    const stale = [];
    const pairs = [['media/og/og-title.jpg', ['assets/js/pieces/title.js']], ['assets/icons/apple-touch-icon.png', ['assets/icons/favicon.svg']],
      ...studies.map(id => [`media/studies/${id}/poster.webp`, [`assets/js/pieces/${id}.js`, `studies/${id}.html`]])];
    for (const [out, srcs] of pairs) {
      if (!exists(out)) continue;
      const newer = srcs.filter(s => mt(s) > mt(out));
      if (newer.length) stale.push(`${out} (older than ${newer.join(', ')})`);
    }
    if (stale.length) warn(`renders older than their source, re-run npm run record:posters / npm run og: ${stale.join('; ')}`);
  }
  const shipped = walk('media/previs', f => f.endsWith('.png'));
  if (shipped.length) info(`${shipped.length} PNG frame(s) under media/previs/ (git-ignored; never deployed; run npm run previs:encode)`);
}

// ---------------------------------------------------------------- browser
let PW = null;
async function browserSetup() {
  const { startServer } = await import('./lib/server.mjs');
  const { launch, contextOptions } = await import('./lib/playwright.mjs');
  const srv = await startServer();
  // Software 2D canvas: Chrome demotes an accelerated canvas to CPU raster after the first readback,
  // so the first toDataURL() would differ from later ones by anti-aliasing (seen as a false
  // determinism failure). The recorder uses the same flag.
  const browser = await launch({ gpu: OPT.gpu, args: ['--disable-accelerated-2d-canvas'] });
  PW = { srv, browser, contextOptions };
  return PW;
}

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
/** Attach error collection; classifies Google Fonts failures (warnings with --allow-offline-fonts). */
function watch(page, srv, { expect404 = null } = {}) {
  const errors = [], fontIssues = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text(), u = m.location()?.url ?? '';
    if (FONT_HOSTS.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(t)) fontIssues.push(`console: ${t}`);
    else if (expect404 && /404/.test(t) && /Failed to load resource/.test(t) && (!u || u.startsWith(expect404))) { /* the 404 page itself */ }
    else errors.push(`console: ${t}`);
  });
  page.on('requestfailed', r => {
    const u = r.url(), why = r.failure()?.errorText ?? '';
    if (FONT_HOSTS.test(u)) fontIssues.push(`requestfailed: ${u} ${why}`);
    else if (/ERR_ABORTED/.test(why) && /\.(mp4|webm)(\?|$)/.test(u)) { /* media preload cancelled by the browser */ }
    else errors.push(`requestfailed: ${u} ${why}`);
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(srv.origin) || r.status() < 400) return;
    if (expect404 && u.split('#')[0] === expect404) return;
    errors.push(`HTTP ${r.status()}: ${u.slice(srv.origin.length)}`);
  });
  return { errors, fontIssues };
}

async function pagesToVisit() {
  const list = [];
  if (exists('index.html')) list.push({ name: 'index', path: 'index.html' });
  if (exists('project.html')) {
    const d = await loadData().catch(() => null);
    for (const f of d?.films ?? []) list.push({ name: `project-${f.slug}`, path: `project.html?slug=${encodeURIComponent(f.slug)}` });
  }
  for (const f of walk('studies', x => x.endsWith('.html')).sort()) list.push({ name: `study-${path.posix.basename(f, '.html')}`, path: f, study: true });
  list.push({ name: '404', path: 'no-such-scene/take-1/', is404: true });
  return OPT.only ? list.filter(p => OPT.only.some(o => p.name.includes(o))) : list;
}

/** Wait for the page to settle: preloader lifted, study READY, fonts ready. */
async function settle(page, p, { reduced }) {
  await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (p.study) await page.waitForFunction(() => window.READY === true || window.STAGE_ERROR != null || document.querySelector('[data-stage-host]')?.dataset.state === 'error', null, { timeout: 45000 }).catch(() => {});
  if (p.path.startsWith('index')) await page.waitForFunction(() => !document.documentElement.classList.contains('is-preloading'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(reduced ? 400 : 900);
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await wait(140); }
    scrollTo(0, document.documentElement.scrollHeight); await wait(250);
    scrollTo(0, 0); await wait(300);
  });
}

/**
 * Full-page screenshot in bands of ≤ 4000 px. One capture of a very tall page repeats its top half
 * past ~8k px under SwiftShader (texture limit), so bands are captured separately and stacked with
 * ffmpeg (vstack). The bands are kept as <name>-01.png … too: they are legible when reviewed.
 */
async function fullPageShot(page, file, w) {
  const total = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  const BAND = 4000;
  if (total <= BAND) return page.screenshot({ path: file, fullPage: true });
  const parts = [];
  for (let y = 0, i = 1; y < total; y += BAND, i++) {
    const part = file.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: part, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(BAND, total - y) } });
    parts.push(part);
  }
  try {
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', ...parts.flatMap(p => ['-i', p]),
      '-filter_complex', `vstack=inputs=${parts.length}`, '-frames:v', '1', file], { stdio: 'ignore' });
  } catch { /* no ffmpeg: the bands stand in for the full page */ }
}

const CRAWL = new Set();
let screenCount = 0;

async function checkScreens() {
  const { srv, browser, contextOptions } = PW;
  const pages = await pagesToVisit();
  const dir = R('.artifacts/screens');
  fs.mkdirSync(dir, { recursive: true });
  const reducedFindings = [], redraws = [];
  const fontNotes = new Set();
  let errPages = 0, overflowPages = 0;
  for (const p of pages) {
    for (const [w, h] of OPT.viewports) {
      const tag = `${p.name}--${w}x${h}`;
      const tPage = Date.now();
      // Pass 1: normal motion. Errors, overflow, above-the-fold screenshot.
      {
        const ctx = await browser.newContext(contextOptions({ w, h }));
        const page = await ctx.newPage();
        const url = srv.url + p.path;
        const { errors, fontIssues } = watch(page, srv, { expect404: p.is404 ? url : null });
        try {
          const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
          if (p.is404 && res?.status() !== 404) errors.push(`expected HTTP 404 for ${p.path}, got ${res?.status()}`);
          if (!p.is404 && res && res.status() !== 200) errors.push(`HTTP ${res.status()} for ${p.path}`);
          await settle(page, p, { reduced: false });
          const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
          if (ov.sw > ov.iw + 1) { overflowPages++; fail(`${tag}: horizontal overflow (scrollWidth ${ov.sw} > ${ov.iw})`); }
          await page.screenshot({ path: path.join(dir, `${tag}.png`) });
          screenCount++;
          if (!p.is404) for (const href of await page.$$eval('a[href]', as => as.map(a => a.href))) CRAWL.add(href);
          if (p.is404) {
            const home = await page.$eval('[data-home]', a => a.getAttribute('href')).catch(() => null);
            if (home !== '/Karan-Chaudhary/') fail(`404: home link computes to ${JSON.stringify(home)}, expected "/Karan-Chaudhary/" under the sub-path`);
          }
        } catch (e) { errors.push(`navigation: ${e.message.split('\n')[0]}`); }
        for (const f of fontIssues) fontNotes.add(f.slice(0, 160));
        if (fontIssues.length && !OPT.offlineFonts) errors.push(...fontIssues.slice(0, 2).map(f => `${f} (pass --allow-offline-fonts when offline)`));
        if (errors.length) { errPages++; fail(`${tag}: ${errors.length} error(s): ${[...new Set(errors)].slice(0, 4).join(' | ')}`); }
        await ctx.close();
      }
      // Pass 2: reduced motion. Full-page screenshot after scrolling through (lazy players init),
      // plus the reduced-motion assertions.
      if (!OPT.skip.has('reduced')) {
        const ctx = await browser.newContext(contextOptions({ w, h, reducedMotion: 'reduce' }));
        const page = await ctx.newPage();
        const url = srv.url + p.path;
        const { errors, fontIssues } = watch(page, srv, { expect404: p.is404 ? url : null });
        // Record every intro class the page ever sets on <html>, from before the first inline script runs,
        // so a preloader or shutter that flashes and is removed again is still caught.
        await page.addInitScript(() => {
          window.__introSeen = [];
          // <html> may not exist yet when this runs: watch the whole document.
          new MutationObserver(() => {
            for (const c of document.documentElement?.classList ?? []) if (/preload|shutter/.test(c) && !window.__introSeen.includes(c)) window.__introSeen.push(c);
          }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        });
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 45000 });
          await settle(page, p, { reduced: true });
          await scrollThrough(page);
          await page.waitForTimeout(300);
          const r = await page.evaluate(() => {
            const root = document.documentElement;
            const visible = el => {
              const cs = getComputedStyle(el), b = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && b.width > 0 && b.height > 0
                && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth;
            };
            const effOpacity = el => { let o = 1; for (let e = el; e && e !== document; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
            const intro = [...document.querySelectorAll('[data-preloader], .preloader, [data-shutter], .shutter')].filter(visible).map(e => e.className || e.tagName);
            const anims = document.getAnimations().map(a => a.animationName || a.id || a.constructor.name || 'animation');
            const who = p => p.id ?? p.meta?.id ?? (p.host && (p.host.id || p.host.getAttribute('aria-label') || [...p.host.attributes].map(a => a.name).find(n => n.startsWith('data-') && n !== 'data-state') || p.host.className)) ?? '?';
            const players = (window.__players ?? []).map(p => ({ id: String(who(p)).slice(0, 40), state: p.state, frames: p.frames, shown: Boolean(p.host?.getClientRects().length) }));
            const dim = [...document.querySelectorAll('main, [data-reveal]')].filter(e => getComputedStyle(e).display !== 'none' && effOpacity(e) < 0.99)
              .map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${effOpacity(e).toFixed(2)}`);
            return { classes: [...new Set([...root.classList].filter(c => /preload|shutter/.test(c)).concat(window.__introSeen ?? []))], intro, anims, players, dim };
          });
          // Static players must not keep drawing: sample the frame counters again after a quiet second.
          await page.waitForTimeout(1000);
          const later = await page.evaluate(() => (window.__players ?? []).map(p => p.frames));
          const issues = [];
          if (r.classes.length) issues.push(`html had intro class(es) ${r.classes.join(' ')} (the preloader/shutter must never show under reduced motion)`);
          if (r.intro.length) issues.push(`intro visible: ${r.intro.join(', ')}`);
          if (r.anims.length) issues.push(`${r.anims.length} running animation(s): ${[...new Set(r.anims)].slice(0, 4).join(', ')}`);
          r.players.forEach((pl, i) => {
            if (pl.state === 'static' || pl.state === 'interactive') {
              if (later[i] != null && later[i] !== pl.frames) issues.push(`player ${pl.id} kept drawing (${pl.frames} → ${later[i]} frames in 1 s)`);
              else if (pl.frames < 1) issues.push(`player ${pl.id} ${pl.state} but drew no frame`);
              else if (pl.frames > 1) redraws.push(`${pl.id}@${p.name.replace(/^study-/, '')} ${w}w ×${pl.frames}`);
            } else if (pl.state === 'idle' || pl.state === 'loading') {
              reducedFindings.push(`${tag}: player ${pl.id} still ${pl.state} after scrolling through${pl.shown ? '' : ' (host not rendered: display:none)'}`);
            } else issues.push(`player ${pl.id} in state ${pl.state}`);
          });
          if (r.dim.length) issues.push(`content not fully opaque: ${r.dim.slice(0, 4).join(', ')}`);
          if (issues.length) fail(`${tag} reduced motion: ${issues.join('; ')}`);
          await fullPageShot(page, path.join(dir, `${tag}--full.png`), w);
          screenCount++;
          if (fontIssues.length && !OPT.offlineFonts) errors.push(fontIssues[0]);
          rec('INFO', `${tag}: ${r.players.length} player(s) ${r.players.map(pl => `${pl.id}:${pl.state}/${pl.frames}`).join(' ') || ''}`.trim(), 'reduced');
        } catch (e) { errors.push(`navigation: ${e.message.split('\n')[0]}`); }
        if (errors.length) { errPages++; fail(`${tag} reduced motion: ${[...new Set(errors)].slice(0, 3).join(' | ')}`); }
        await ctx.close();
      }
      console.log(`  ...  ${tag} (${((Date.now() - tPage) / 1000).toFixed(1)} s)`);
    }
  }
  if (fontNotes.size) (OPT.offlineFonts ? warn : info)(`Google Fonts unreachable on ${fontNotes.size} request(s): ${[...fontNotes][0]}`);
  for (const f of reducedFindings) warn(f);
  if (redraws.length) warn(`reduced motion: ${redraws.length} static player(s) drew the resolved frame more than once before settling (spec says exactly 1; usually a resize redraw of the same frame): ${redraws.join(', ')}`);
  if (!errPages) pass(`${pages.length} pages × ${OPT.viewports.length} viewports: zero console/page errors and failed requests`);
  if (!overflowPages) pass('no horizontal overflow at any viewport');
  if (!OPT.skip.has('reduced') && !results.some(r => r.section === 'screens' && r.level === 'FAIL' && /reduced motion/.test(r.msg))) {
    pass('reduced motion: no preloader/shutter, no running animations, players static and not redrawing, content opaque');
  }
  info(`${screenCount} screenshots in .artifacts/screens/ (<page>--<w>x<h>.png above the fold with motion; --full.png full page, reduced motion)`);
}

async function checkDeterminism() {
  const { srv, browser, contextOptions } = PW;
  const studies = walk('studies', f => f.endsWith('.html')).sort()
    .filter(f => !OPT.only || OPT.only.some(o => `study-${path.posix.basename(f, '.html')}`.includes(o)));
  if (!studies.length) return skip('skipped: no studies/*.html pages');
  const FPS = 24;
  // Wide (2.4:1) is the full check; tall (3:4, the phone layout's code path) repeats t1,t2,t1 at three times.
  const LAYOUTS = [{ name: 'wide', W: 480, H: 200, full: true }, { name: 'tall', W: 240, H: 320, full: false }];
  for (const f of studies) {
    const id = path.posix.basename(f, '.html');
    const open = async (W, H) => {
      const ctx = await browser.newContext(contextOptions({ w: W, h: H }));
      const page = await ctx.newPage();
      const { errors, fontIssues } = watch(page, srv);
      await page.goto(`${srv.url}${f}?record&w=${W}&h=${H}&fps=${FPS}&seed=1`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForFunction(() => window.READY === true || window.STAGE_ERROR != null, null, { timeout: 60000 });
      const m = await page.evaluate(() => ({ err: window.STAGE_ERROR ?? null, meta: window.__meta ?? null, n: window.N_FRAMES }));
      return { ctx, page, errors, fontIssues, m };
    };
    const hashAt = (page, t) => page.evaluate(t => {
      window.__seek(t);
      return (document.querySelector('canvas.stage-record') || document.querySelector('canvas')).toDataURL('image/png');
    }, t).then(u => crypto.createHash('sha256').update(u).digest('hex').slice(0, 16));
    for (const L of LAYOUTS) {
      let a, b;
      try {
        a = await open(L.W, L.H);
        if (a.m.err) { fail(`${id} (${L.name}): STAGE_ERROR ${String(a.m.err).split('\n')[0]}`); await a.ctx.close(); break; }
        const d = a.m.meta?.duration ?? 0;
        const all = d > 0 ? [0, 0.25 * d, 0.5 * d, 0.9 * d, d].map(t => Math.round(t * 1000) / 1000) : [0];
        const ts = L.full ? all : [...new Set([all[0], all[2], all.at(-1)].filter(t => t != null))];
        const first = {};
        let mismatch = null;
        for (let i = 0; i < ts.length; i++) {
          const t1 = ts[i], t2 = ts[(i + 1) % ts.length];
          const h1 = await hashAt(a.page, t1); await hashAt(a.page, t2); const h1b = await hashAt(a.page, t1);
          first[t1] ??= h1;
          if (h1 !== h1b || first[t1] !== h1) mismatch ??= `seek ${t1}, ${t2}, ${t1} gave ${h1} then ${h1b}`;
        }
        await a.ctx.close();
        const errs = [...a.errors];
        let freshBad = [], fresh = {}, describeBad = null;
        if (L.full) {
          b = await open(L.W, L.H);
          for (const t of [...ts].reverse()) fresh[t] = await hashAt(b.page, t);
          await b.ctx.close();
          errs.push(...b.errors);
          freshBad = ts.filter(t => fresh[t] !== first[t]);
          // describe(params) is the piece's text alternative; it must not change between loads either.
          if ((a.m.meta?.describe ?? '') !== (b.m.meta?.describe ?? '')) describeBad = `describe() differs between loads: "${String(a.m.meta?.describe).slice(0, 50)}" vs "${String(b.m.meta?.describe).slice(0, 50)}"`;
        }
        if (errs.length) fail(`${id} (record mode, ${L.name}): ${errs.slice(0, 3).join(' | ')}`);
        if (L.full && a.m.meta && a.m.meta.fontsOk === false) (OPT.offlineFonts ? warn : fail)(`${id}: canvas fonts did not load in record mode (fallback fonts${OPT.offlineFonts ? '' : '; pass --allow-offline-fonts when offline'})`);
        if (L.full && (!Number.isInteger(a.m.n) || a.m.n < 1)) fail(`${id}: N_FRAMES ${a.m.n} is not a positive integer`);
        if (a.m.meta?.layout && a.m.meta.layout !== L.name) warn(`${id}: a ${L.W}×${L.H} record reports layout "${a.m.meta.layout}", expected "${L.name}"`);
        if (mismatch) fail(`${id} (${L.name} ${L.W}×${L.H}): not deterministic: ${mismatch}`);
        else if (freshBad.length) fail(`${id} (${L.name}): a fresh load renders differently at t = ${freshBad.join(', ')} (${freshBad.map(t => `${first[t]} vs ${fresh[t]}`).join('; ')})`);
        else if (describeBad) fail(`${id}: ${describeBad}`);
        else {
          const distinct = new Set(Object.values(first)).size;
          pass(`${id} (${L.name} ${L.W}×${L.H}): deterministic at t = ${ts.join(', ')} (seek t1,t2,t1${L.full ? ', a fresh load and describe()' : ''} agree; ${distinct} distinct frame${distinct === 1 ? '' : 's'}; ${Object.values(first)[0]}…)`);
        }
      } catch (e) {
        fail(`${id} (${L.name}): ${e.message.split('\n')[0]}`);
        await a?.ctx.close().catch(() => {});
        await b?.ctx.close().catch(() => {});
      }
    }
  }
}

async function checkKeyboard() {
  const { srv, browser, contextOptions } = PW;
  const all = await pagesToVisit();
  const targets = all.filter(p => p.name === 'index' || p.name.startsWith('project-')).slice(0, 2);
  const studies = all.filter(p => p.study);
  if (!targets.length && !studies.length) return skip('skipped: no pages to test');
  const outline = el => el.evaluate(e => { const cs = getComputedStyle(e); return { style: cs.outlineStyle, width: cs.outlineWidth, shadow: cs.boxShadow }; });

  for (const p of [...targets, ...studies]) {
    const ctx = await browser.newContext(contextOptions({ w: 1440, h: 900 }));
    const page = await ctx.newPage();
    try {
      await page.goto(srv.url + p.path, { waitUntil: 'load', timeout: 45000 });
      await settle(page, p, { reduced: false });
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      await page.keyboard.press('Tab');
      const first = await page.evaluateHandle(() => document.activeElement);
      const desc = await first.evaluate(e => ({ cls: String(e.className), tag: e.tagName, text: e.textContent.trim().slice(0, 40), href: e.getAttribute?.('href') }));
      const isSkip = /skip-link/.test(desc.cls) || (desc.tag === 'A' && /^#/.test(desc.href ?? '') && /skip/i.test(desc.text));
      if (!isSkip) fail(`${p.name}: first Tab focuses ${desc.tag.toLowerCase()}.${desc.cls.split(' ')[0]} "${desc.text}", not the skip link`);
      else {
        const o = await outline(first);
        if (o.style === 'none' || o.width === '0px') fail(`${p.name}: focused skip link has no outline (outline-style ${o.style})`);
        else pass(`${p.name}: first Tab focuses the skip link ("${desc.text}"), outline ${o.style} ${o.width}`);
      }

      if (!p.study) continue;
      const hasSlider = await page.$('[data-controls] input[type=range], aside input[type=range]');
      if (!hasSlider) { skip(`${p.name}: skipped slider test: no range input in the controls`); continue; }
      // Tab until a slider has focus (the way a keyboard user reaches it).
      let found = false;
      for (let i = 0; i < 80 && !found; i++) {
        await page.keyboard.press('Tab');
        found = await page.evaluate(() => document.activeElement?.matches?.('input[type=range]') ?? false);
      }
      if (!found) { fail(`${p.name}: no range input reachable with Tab within 80 presses`); continue; }
      const slider = await page.evaluateHandle(() => document.activeElement);
      const read = () => page.evaluate(() => {
        const s = document.activeElement;
        const live = s.closest('[data-controls], aside, form')?.querySelector('[aria-live]') ?? document.querySelector('[aria-live]');
        return { label: s.labels?.[0]?.textContent.trim() ?? s.getAttribute('aria-label') ?? s.id, value: s.value, max: s.max, valuetext: s.getAttribute('aria-valuetext'), live: live?.textContent ?? null, hasLive: Boolean(live) };
      });
      const before = await read();
      if (!before.valuetext) fail(`${p.name}: slider "${before.label}" has no aria-valuetext`);
      if (!before.hasLive) fail(`${p.name}: no aria-live region in the study controls`);
      const key = Number(before.value) >= Number(before.max) ? 'ArrowLeft' : 'ArrowRight';
      const t0 = Date.now();
      await page.keyboard.press(key);
      let after = before, liveMs = null, textMs = null;
      while (Date.now() - t0 < 900) {
        after = await read();
        if (textMs == null && after.valuetext !== before.valuetext) textMs = Date.now() - t0;
        if (liveMs == null && after.live && after.live !== before.live) liveMs = Date.now() - t0;
        if (textMs != null && liveMs != null) break;
        await page.waitForTimeout(25);
      }
      const o = await outline(slider);
      const probs = [];
      if (textMs == null) probs.push(`aria-valuetext did not change after ${key}`);
      if (before.hasLive && (liveMs == null || liveMs > 600)) probs.push(`live region ${liveMs == null ? 'did not update' : `updated after ${liveMs} ms`} (limit 600 ms)`);
      if (o.style === 'none' || o.width === '0px') probs.push(`focused slider has no outline (${o.style})`);
      if (probs.length) fail(`${p.name}: slider "${before.label}": ${probs.join('; ')}`);
      else pass(`${p.name}: ${key} on "${before.label}": "${before.valuetext}" → "${after.valuetext}" in ${textMs} ms, live region in ${liveMs} ms ("${after.live.slice(0, 60)}"), outline ${o.style}`);
    } catch (e) {
      fail(`${p.name}: ${e.message.split('\n')[0]}`);
    } finally { await ctx.close(); }
  }
}

async function checkCrawl() {
  const { srv } = PW;
  if (!CRAWL.size) return skip('skipped: no links collected (screens section skipped or no pages)');
  const urls = [...new Set([...CRAWL].map(u => u.split('#')[0]))].filter(u => u.startsWith(srv.url) || u === srv.url.slice(0, -1));
  const external = [...CRAWL].filter(u => /^https?:/.test(u) && !u.startsWith(srv.origin));
  let bad = 0;
  await Promise.all(urls.map(async u => {
    const r = await fetch(u, { redirect: 'follow' }).catch(e => ({ status: `error ${e.message}` }));
    if (r.status !== 200) { bad++; fail(`${u.slice(srv.origin.length)} → ${r.status}`); }
  }));
  const offBase = [...CRAWL].filter(u => u.startsWith(srv.origin) && !u.startsWith(srv.url));
  for (const u of new Set(offBase)) { bad++; fail(`link outside the sub-path: ${u.slice(srv.origin.length)} (root-relative href?)`); }
  if (!bad) pass(`${urls.length} internal links return 200`);
  if (external.length) info(`${new Set(external).size} external link(s) not fetched (offline-safe)`);
}

// ---------------------------------------------------------------- media (ffprobe)
function hasFfprobe() { try { execFileSync(process.env.FFPROBE || 'ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }
async function checkMedia() {
  const clips = walk('.artifacts/clips', f => /\.(mp4|webm)$/.test(f));
  // .artifacts is a dot-dir; walk() skips dot entries below the root only.
  const media = walk('media', f => /\.(mp4|webm)$/.test(f)).filter(f => !/^media\/previs\/[^/]+\//.test(f));
  const images = ['media/og/og-title.jpg', 'assets/icons/apple-touch-icon.png', ...walk('media/studies', f => /poster\.(webp|jpg)$/.test(f))].filter(exists);
  if (!OPT.media && !clips.length && !media.length) return skip('skipped: no clips in .artifacts/clips or media/ (record one with npm run record -- <id>)');
  if (!hasFfprobe()) return (OPT.media ? fail : skip)(`${OPT.media ? '' : 'skipped: '}ffprobe not found on PATH`);
  const { probe } = await import('./lib/ffmpeg.mjs');
  const { checkFaststart } = await import('./lib/mp4.mjs');
  let bad = 0;
  for (const f of [...clips, ...media]) {
    const pr = await probe(R(f));
    const side = f.replace(/\.(mp4|webm)$/, '.json');
    const meta = exists(side) ? JSON.parse(read(side)) : null;
    const probs = [];
    const want = f.endsWith('.mp4') ? 'h264' : 'vp9';
    if (pr.codec_name !== want) probs.push(`codec ${pr.codec_name} (expected ${want})`);
    if (pr.pix_fmt !== 'yuv420p') probs.push(`pix_fmt ${pr.pix_fmt}`);
    if (pr.width % 2 || pr.height % 2) probs.push(`odd size ${pr.width}×${pr.height}`);
    for (const k of ['color_space', 'color_primaries', 'color_transfer']) if (pr[k] !== 'bt709') probs.push(`${k} ${pr[k] ?? 'untagged'}`);
    if (f.endsWith('.mp4') && !checkFaststart(R(f)).ok) probs.push('not faststart (moov after mdat)');
    if (meta) {
      if (Math.abs(pr.fps - meta.fps) > 0.01) probs.push(`fps ${pr.fps} ≠ ${meta.fps}`);
      if (Math.abs(pr.duration - meta.duration) > 1 / meta.fps + 1e-3) probs.push(`duration ${pr.duration.toFixed(3)} s ≠ ${meta.duration.toFixed(3)} s ±1 frame`);
      if (meta.metaDuration != null && Math.abs(meta.duration - meta.metaDuration) > 1 / meta.fps + 1e-3) info(`${f}: recorded ${meta.duration.toFixed(2)} s of a ${meta.metaDuration} s piece (--seconds)`);
      if (meta.w !== pr.width || meta.h !== pr.height) probs.push(`size ${pr.width}×${pr.height} ≠ ${meta.w}×${meta.h}`);
    }
    if (probs.length) { bad++; fail(`${f}: ${probs.join('; ')}`); }
    else pass(`${f}: ${pr.codec_name} yuv420p ${pr.width}×${pr.height} ${+pr.fps.toFixed(3)} fps ${pr.duration.toFixed(3)} s bt709${f.endsWith('.mp4') ? ' faststart' : ''}${meta ? ' (matches sidecar)' : ' (no sidecar: duration not compared)'}`);
  }
  for (const f of images) {
    const pr = await probe(R(f));
    const want = f.endsWith('og-title.jpg') ? [1200, 630] : f.endsWith('apple-touch-icon.png') ? [180, 180] : null;
    if (want && (pr.width !== want[0] || pr.height !== want[1])) { bad++; fail(`${f}: ${pr.width}×${pr.height}, expected ${want.join('×')}`); }
    else info(`${f}: ${pr.width}×${pr.height}, ${(fs.statSync(R(f)).size / 1024).toFixed(0)} KB`);
  }
  if (!bad && (clips.length || media.length)) pass(`${clips.length + media.length} clip(s) pass h264/vp9, yuv420p, even size, fps, duration, bt709 and faststart checks`);
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
console.log(`check: ${OPT.browser ? 'static + browser' : 'static only (--no-browser)'} · ${REPO_ROOT}`);
await section('urls', 'Relative URLs', checkUrls);
await section('links', 'Local references in HTML', checkStaticLinks);
await section('banned', 'Determinism grep (pieces, vendored cells, pure core)', checkBanned);
await section('licences', 'Motion Prompt licence lines', checkLicences);
await section('data', 'data/portfolio.js schema and placeholders', checkData);
await section('shotlist', 'Previs shot list in sync', checkShotlist);
await section('seo', 'SEO tags and JSON-LD', checkSeo);
await section('sitemap', 'Sitemap', checkSitemap);
await section('contrast', 'Token contrast', checkContrast);
await section('assets', 'Generated assets (posters, OG, icon)', checkAssets);

if (OPT.browser) {
  let ready = false;
  await section('browser', 'Browser setup', async () => {
    try { await browserSetup(); ready = true; pass(`Chromium via ${PW.srv.url}`); }
    catch (e) { fail(`cannot start the browser checks: ${e.message.split('\n')[0]} (use --no-browser for static checks only)`); }
  });
  if (ready) {
    try {
      await section('screens', `Pages × viewports (${OPT.viewports.map(v => v.join('×')).join(', ')}): errors, overflow, reduced motion, screenshots`, checkScreens);
      await section('determinism', 'Determinism in record mode (sha256 of the canvas)', checkDeterminism);
      await section('keyboard', 'Keyboard: skip link, slider valuetext and live region, focus ring', checkKeyboard);
      await section('crawl', 'Internal link crawl', checkCrawl);
    } finally {
      await PW.browser.close().catch(() => {});
      await PW.srv.close().catch(() => {});
    }
  }
  await section('media', 'Media (ffprobe)', checkMedia);
} else if (OPT.media || hasFfprobe()) {
  await section('media', 'Media (ffprobe)', checkMedia);
} else {
  await section('media', 'Media (ffprobe)', async () => skip('skipped: ffprobe not on PATH (pass --media to require it)'));
}

const count = l => results.filter(r => r.level === l).length;
const fails = results.filter(r => r.level === 'FAIL');
console.log(`\n== Summary (${((Date.now() - t0) / 1000).toFixed(1)} s): ${count('PASS')} pass, ${fails.length} fail, ${count('WARN')} warn, ${count('SKIP')} skipped`);
for (const f of fails) console.log(`  FAIL [${f.section}] ${f.msg}`);
if (OPT.json) {
  fs.mkdirSync(path.dirname(path.resolve(OPT.json)), { recursive: true });
  fs.writeFileSync(path.resolve(OPT.json), JSON.stringify({ options: { ...OPT, skip: [...OPT.skip] }, results }, null, 2) + '\n');
  console.log(`report: ${OPT.json}`);
}
process.exit(fails.length ? 1 : 0);
