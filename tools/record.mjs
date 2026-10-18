#!/usr/bin/env node
// Recorder: renders the code pieces frame by frame through the GitHub Pages sub-path server and
// pipes the frames to ffmpeg. Nothing depends on real-time playback, so no frame can be dropped.
//
//   node tools/record.mjs <target…> [options]
//
// Targets
//   title | focus | light | colour | <id>   studies/<id>.html in ?record mode
//   shotcard:027                            the shot-language card for one move, in the palette and
//                                           aspect of the film in data/portfolio.js that uses it
//   still:<slug>:<i>                        procedural still i of a film (studies/still.html)
//   all                                     every studies/*.html except _template (default: posters)
//   og                                      media/og/og-title.jpg: the title at t = 7.0, 1200×630, wide
//   icons                                   assets/icons/apple-touch-icon.png from favicon.svg at 180²
//   path/to/page.html                       any page that follows Motion Prompt's make-your-own
//                                           contract (READY / N_FRAMES / renderFrame(i) [/ prepareFrame(i)])
//
// Options
//   --w --h            canvas size (default: the piece's meta.record, else 1920×1080)
//   --fps              frame rate (default meta.record.fps)
//   --seconds          clip length (default meta.duration)
//   --subframes S      S sub-frames per frame, averaged with tmix (motion blur). Needs __seek.
//   --formats          comma list of poster,mp4,webm,sheet (default mp4,webm; `all` → poster)
//   --crf              x264 CRF (default 18)
//   --params '<json>'  fixed params (disables the piece's scripted demo), merged over target params
//   --seed             PRNG seed (default 1; stills default to hashString(slug + i))
//   --layout wide|tall  force the layout
//   --out DIR          clip directory (default .artifacts/clips)
//   --poster-dir DIR   poster root (default media/studies); posters go to DIR/<name>/poster.{webp,jpg}
//   --poster-kb N      WebP poster budget in KB (default 120); quality is stepped down to fit
//   --mp-page N        page number passed to a Motion Prompt page (?page=N&render=1)
//   --gpu              use the host GPU instead of SwiftShader
//   --allow-fallback-fonts   record even if a canvas font did not load (otherwise refused)
//
// Every run fails on any console error, page error or failed request, on STAGE_ERROR, and on
// fallback fonts. A sidecar <clip>.json records what was rendered (check --media reads it).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, REPO_ROOT } from './lib/server.mjs';
import { launch, contextOptions, collectErrors } from './lib/playwright.mjs';
import { startEncoder, encodePoster, probe, contactSheet, hasFfmpeg } from './lib/ffmpeg.mjs';
import { checkFaststart } from './lib/mp4.mjs';

const USAGE = `Usage: node tools/record.mjs <title|focus|light|colour|shotcard:027|still:<slug>:<i>|_template|all|og|icons|page.html>…
  [--w N --h N --fps N --seconds S --subframes S --formats poster,mp4,webm,sheet --crf 18
   --params '<json>' --seed N --layout wide|tall --out .artifacts/clips --poster-dir media/studies
   --poster-kb 120 --mp-page N --gpu --allow-fallback-fonts]`;

// ---------------------------------------------------------------- arguments
const FLAGS = new Set(['gpu', 'allow-fallback-fonts', 'help', 'quiet']);
export function parseArgs(argv) {
  const o = { targets: [], formats: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { o.help = true; continue; }
    if (!a.startsWith('--')) { o.targets.push(a); continue; }
    let [k, v] = a.slice(2).split(/=(.*)/s);
    if (FLAGS.has(k)) { o[camel(k)] = v == null ? true : v !== 'false'; continue; }
    if (v == null) {
      if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`);
      v = argv[++i];
    }
    o[camel(k)] = v;
  }
  for (const k of ['w', 'h', 'fps', 'seconds', 'subframes', 'crf', 'seed', 'posterKb', 'mpPage']) {
    if (o[k] == null) continue;
    const n = Number(o[k]);
    if (!Number.isFinite(n)) throw new Error(`--${k} must be a number (got "${o[k]}")`);
    o[k] = n;
  }
  if (o.formats != null) {
    o.formats = String(o.formats).split(',').map(s => s.trim()).filter(Boolean);
    const bad = o.formats.filter(f => !['poster', 'mp4', 'webm', 'sheet'].includes(f));
    if (bad.length) throw new Error(`unknown format(s): ${bad.join(', ')} (use poster,mp4,webm,sheet)`);
  }
  if (o.params != null) {
    try { o.params = JSON.parse(o.params); } catch (e) { throw new Error(`--params is not valid JSON: ${e.message}`); }
    if (!o.params || typeof o.params !== 'object' || Array.isArray(o.params)) throw new Error('--params must be a JSON object');
  }
  if (o.layout && !['wide', 'tall'].includes(o.layout)) throw new Error('--layout must be wide or tall');
  return o;
}
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Same encoding as core/stage.js encodeParams(): base64url of UTF-8 JSON without padding. */
export const encodeParams = obj => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

const rel = p => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') ? p : r; };
const kb = n => `${(n / 1024).toFixed(1)} KB`;
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- data helpers
let dataCache = null;
async function loadData() {
  if (dataCache) return dataCache;
  const file = path.join(REPO_ROOT, 'data/portfolio.js');
  if (!fs.existsSync(file)) throw new Error('data/portfolio.js not found');
  dataCache = (await import(pathToFileURL(file).href)).default;
  return dataCache;
}
/** FNV-1a + fmix, identical to core/prng.js hashString (imported so the two cannot drift). */
async function hashString(s) {
  const { hashString: h } = await import(pathToFileURL(path.join(REPO_ROOT, 'assets/js/core/prng.js')).href);
  return h(s);
}
const moveKey = m => String(m ?? '').replace(/^#/, '').padStart(3, '0');

export function studyIds() {
  const dir = path.join(REPO_ROOT, 'studies');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.startsWith('_')).map(f => f.slice(0, -5)).sort();
}

/**
 * Expand a CLI target into a job: { name, page (repo-relative html), params, seed, kind }.
 * kind: 'stage' (core/stage.js harness) | 'mp' (Motion Prompt page) | 'og' | 'icons'.
 */
export async function resolveTarget(target, opt) {
  if (target === 'og') return { kind: 'og', name: 'og-title', page: 'studies/title.html' };
  if (target === 'icons') return { kind: 'icons', name: 'apple-touch-icon', page: 'assets/icons/favicon.svg' };
  if (target.endsWith('.html')) {
    const abs = path.resolve(process.cwd(), target);
    if (!abs.startsWith(REPO_ROOT + path.sep)) throw new Error(`${target}: pages must live inside the repo so the sub-path server can serve them`);
    if (!fs.existsSync(abs)) throw new Error(`${target}: file not found`);
    const page = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    const isStudy = page.startsWith('studies/');
    return { kind: isStudy ? 'stage' : 'mp', name: path.basename(page, '.html'), page };
  }
  const [id, ...rest] = target.split(':');
  if (!/^[a-z_][a-z0-9_-]*$/i.test(id)) throw new Error(`unknown target "${target}"`);
  const job = { kind: 'stage', name: id, page: `studies/${id}.html`, params: {} };
  if (id === 'shotcard' && rest.length) {
    const k = moveKey(rest[0]);
    if (!/^\d{3}$/.test(k)) throw new Error(`shotcard:${rest[0]}: give a move number such as shotcard:027`);
    const data = await loadData();
    const film = (data.films ?? []).find(f => moveKey(f.move) === k);
    job.name = `shotcard-${k}`;
    job.params = { move: `#${k}`, ...(film ? { palette: film.palette, aspect: film.aspect } : {}) };
    if (film?.aspect > 0) job.aspect = film.aspect;
    if (!film) console.warn(`  note: no film in data/portfolio.js uses move #${k}; recording it in the default palette`);
  } else if (id === 'still') {
    if (rest.length < 2) throw new Error('still targets look like still:<slug>:<i>');
    const [slug, iStr] = rest;
    const i = Number(iStr);
    if (!Number.isInteger(i) || i < 0) throw new Error(`still:${slug}:${iStr}: the index must be a whole number ≥ 0`);
    const data = await loadData();
    const film = (data.films ?? []).find(f => f.slug === slug);
    if (!film) throw new Error(`still:${slug}: no film with slug "${slug}" in data/portfolio.js (slugs: ${(data.films ?? []).map(f => f.slug).join(', ')})`);
    const kinds = film.stillKinds ?? [];
    job.name = `still-${slug}-${i}`;
    job.params = { slug, i, index: i, palette: film.palette, aspect: film.aspect, ...(kinds.length ? { kind: kinds[i % kinds.length] } : {}) };
    job.seed = await hashString(slug + i);
    if (film.aspect > 0) job.aspect = film.aspect;
    if (film.stills?.[i]?.src) console.warn(`  note: ${slug} already has a real still #${i} (${film.stills[i].src}); the procedural one is not shown on the site`);
  } else if (rest.length) {
    throw new Error(`"${target}": only shotcard:<move> and still:<slug>:<i> take a suffix`);
  }
  return job;
}

function assertPage(job) {
  const abs = path.join(REPO_ROOT, job.page);
  if (!fs.existsSync(abs)) {
    const hint = job.page.startsWith('studies/')
      ? ` The study page has not been written yet (copy studies/_template.html; see .claude/skills/code-cinema). Existing studies: ${['_template', ...studyIds()].join(', ')}.`
      : '';
    throw new Error(`${job.page} does not exist.${hint}`);
  }
}

// ---------------------------------------------------------------- browser helpers
const CANVAS_JS = `(document.querySelector('canvas.stage-record') || document.getElementById('c') || document.querySelector('canvas'))`;

/** Open a page in a fresh context and wait for READY. Returns { page, ctx, errors, meta, contract }. */
async function openStage(browser, srv, job, { w, h, fps, seed, params, layout, t, mpPage }) {
  const ctx = await browser.newContext(contextOptions({ w: Math.max(w ?? 0, 64), h: Math.max(h ?? 0, 64) }));
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const q = new URLSearchParams();
  if (job.kind === 'mp') {
    q.set('page', String(mpPage ?? 1)); q.set('render', '1');
  } else {
    q.set('record', '');
    if (w) q.set('w', String(w));
    if (h) q.set('h', String(h));
    if (fps) q.set('fps', String(fps));
    if (seed != null) q.set('seed', String(seed));
    if (params && Object.keys(params).length) q.set('params', encodeParams(params));
    if (layout) q.set('layout', layout);
    if (t != null) q.set('t', String(t));
  }
  const url = srv.url + job.page + '?' + q.toString().replace(/^record=(&|$)/, 'record$1');
  const res = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  if (!res || res.status() >= 400) throw new Error(`${job.page}: HTTP ${res?.status() ?? 'no response'}`);
  try {
    await page.waitForFunction(() => window.READY === true || window.STAGE_ERROR != null, null, { timeout: 120000, polling: 50 });
  } catch {
    throw new Error(`${job.page}: window.READY never became true within 120 s${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`);
  }
  const info = await page.evaluate(`({
    stageError: window.STAGE_ERROR ?? null,
    meta: window.__meta ?? null,
    nFrames: window.N_FRAMES, fps: window.FPS ?? null,
    hasSeek: typeof window.__seek === 'function', hasRenderFrame: typeof window.renderFrame === 'function',
    hasPrepare: typeof window.prepareFrame === 'function',
    canvas: (c => c ? { w: c.width, h: c.height } : null)(${CANVAS_JS}),
  })`);
  if (info.stageError) throw new Error(`${job.page}: STAGE_ERROR\n    ${String(info.stageError).split('\n').slice(0, 6).join('\n    ')}`);
  if (!info.canvas) throw new Error(`${job.page}: no <canvas> on the page`);
  if (!info.hasSeek && !info.hasRenderFrame) throw new Error(`${job.page}: neither __seek(t) nor renderFrame(i) is defined`);
  assertNoErrors(errors, job.page);
  return { page, ctx, errors, info, url };
}

function assertNoErrors(errors, where) {
  if (errors.length) throw new Error(`${where}: ${errors.length} browser error(s)\n    ${errors.slice(0, 12).join('\n    ')}`);
}

function assertFonts(info, job, opt) {
  const m = info.meta;
  if (!m || m.fontsOk == null) return;   // Motion Prompt pages: READY already waits for fonts
  if (!m.fontsOk) {
    const msg = `${job.page}: canvas fonts did not load (${(m.fonts ?? []).join(' | ')}). Fallback fonts would be recorded.`;
    if (!opt.allowFallbackFonts) throw new Error(`${msg}\n    Check the network (Google Fonts) or pass --allow-fallback-fonts for a draft.`);
    console.warn(`  warning: ${msg} (continuing: --allow-fallback-fonts)`);
  }
}

/** Seek to t (or render frame i on a Motion Prompt page) and return the canvas as a PNG Buffer. */
async function grab(page, info, { t, i }) {
  const b64 = await page.evaluate(async ([t, i, useSeek]) => {
    if (useSeek) window.__seek(t);
    else { if (window.prepareFrame) await window.prepareFrame(i); window.renderFrame(i); }
    const c = document.querySelector('canvas.stage-record') || document.getElementById('c') || document.querySelector('canvas');
    return c.toDataURL('image/png').slice('data:image/png;base64,'.length);
  }, [t ?? 0, i ?? 0, info.hasSeek && t != null]);
  return Buffer.from(b64, 'base64');
}

// ---------------------------------------------------------------- outputs
/** Encode a poster PNG to WebP within a byte budget (stepping quality, then width) plus a JPEG. */
export async function writePoster(png, dir, { budgetKB = 120, jpgBudgetKB = 200, width } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const webp = path.join(dir, 'poster.webp'), jpg = path.join(dir, 'poster.jpg');
  const budget = budgetKB * 1024;
  // Prefer a slightly smaller poster at good quality over a full-size one at visibly low quality:
  // step quality 82 → 64 at each width first, and only then go below 64 at the smallest width.
  const plan = [];
  for (const scale of width ? [1, 0.85, 0.7] : [1]) for (const q of [82, 76, 70, 64]) plan.push([scale, q]);
  for (const q of [58, 52, 46, 40]) plan.push([width ? 0.7 : 1, q]);
  if (width) for (const q of [64, 52, 40]) plan.push([0.55, q]);
  let chosen = null;
  for (const [scale, q] of plan) {
    const wv = width && scale < 1 ? Math.round(width * scale / 2) * 2 : null;
    await encodePoster(png, { webp, webpQuality: q, ...(wv ? { width: wv } : {}) });
    const size = fs.statSync(webp).size;
    chosen = { q, size, width: wv };
    if (size <= budget) break;
  }
  if (chosen.size > budget) throw new Error(`poster.webp is ${kb(chosen.size)} even at quality 40; budget ${budgetKB} KB`);
  let jq = 3, jsize = 0;
  for (; jq <= 8; jq++) {
    await encodePoster(png, { jpg, jpgQ: jq, ...(chosen.width ? { width: chosen.width } : {}) });
    jsize = fs.statSync(jpg).size;
    if (jsize <= jpgBudgetKB * 1024) break;
  }
  return { webp, jpg, webpQuality: chosen.q, webpSize: chosen.size, jpgQ: Math.min(jq, 8), jpgSize: jsize, width: chosen.width };
}

async function writeJpegWithin(png, file, budgetKB) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let q = 2; q <= 12; q++) {
    await encodePoster(png, { jpg: file, jpgQ: q });
    const size = fs.statSync(file).size;
    if (size <= budgetKB * 1024) return { q, size };
  }
  throw new Error(`${rel(file)} stays above ${budgetKB} KB even at q 12`);
}

// ---------------------------------------------------------------- jobs
async function recordStage(browser, srv, job, opt) {
  assertPage(job);
  const formats = opt.formats ?? (opt.all ? ['poster'] : ['mp4', 'webm']);
  const params = { ...(job.params ?? {}), ...(opt.params ?? {}) };
  const seed = opt.seed ?? job.seed ?? 1;
  // Film-bound targets (shotcard:<move>, still:<slug>:<i>) default to the film's delivery aspect, so the
  // clip or poster is the frame itself rather than the piece's letterboxed default canvas.
  let { w, h } = opt;
  if (job.aspect && h == null) { w ??= 1280; h = Math.max(2, Math.round(w / job.aspect / 2) * 2); }
  const { page, ctx, errors, info } = await openStage(browser, srv, job, {
    w, h, fps: opt.fps, seed, params, layout: opt.layout, mpPage: opt.mpPage,
  });
  try {
    assertFonts(info, job, opt);
    const m = info.meta ?? {};
    const W = info.canvas.w, H = info.canvas.h;
    const fps = info.fps ?? opt.fps ?? m.fps ?? 30;
    const label = `${job.name} ${W}×${H}`;
    log(`● ${label}  (${job.page}${m.title ? ` · ${m.title}` : ''}${m.fontsOk ? ' · fonts ok' : ''})`);
    const results = { name: job.name, page: job.page, w: W, h: H };

    if (formats.includes('poster')) {
      const pt = m.posterTime ?? 0;
      const png = await grab(page, info, info.hasSeek ? { t: pt } : { i: Math.round(pt * fps) });
      assertNoErrors(errors, job.page);
      const dir = path.resolve(opt.posterDir ? path.resolve(process.cwd(), opt.posterDir) : path.join(REPO_ROOT, 'media/studies'), job.name);
      const p = await writePoster(png, dir, { budgetKB: opt.posterKb ?? 120, width: W });
      log(`  poster  t=${pt}s → ${rel(p.webp)} (${kb(p.webpSize)}, q${p.webpQuality}${p.width && p.width !== W ? `, ${p.width}px wide` : ''}) + ${rel(p.jpg)} (${kb(p.jpgSize)}, q:v ${p.jpgQ})`);
      results.poster = p;
    }

    const clipFormats = formats.filter(f => f === 'mp4' || f === 'webm');
    const wantSheet = formats.includes('sheet');
    if (clipFormats.length || wantSheet) {
      const S = Math.max(1, Math.round(opt.subframes ?? m.record?.subframes ?? 1));
      if (S > 1 && !info.hasSeek) throw new Error(`${job.page}: --subframes needs __seek(t); this page only has renderFrame(i)`);
      const duration = opt.seconds ?? m.duration ?? (info.nFrames ? info.nFrames / fps : 0);
      const N = opt.seconds != null ? Math.max(1, Math.round(opt.seconds * fps)) : Math.max(1, info.nFrames ?? Math.round(duration * fps));
      if (!info.hasSeek && N > (info.nFrames ?? N)) throw new Error(`${job.page}: --seconds asks for ${N} frames but the page has N_FRAMES ${info.nFrames}`);
      const outDir = path.resolve(process.cwd(), opt.out ?? path.join(REPO_ROOT, '.artifacts/clips'));
      const base = path.join(outDir, `${job.name}-${W}x${H}-${fps}`);
      const encFormats = clipFormats.length ? clipFormats : ['mp4'];
      const enc = startEncoder({ fps, subframes: S, out: base, formats: encFormats, crf: opt.crf ?? 18, tune: m.record?.tune ?? 'film' });
      const t0 = Date.now();
      let encodeError = null;
      enc.process.on('close', code => { if (code) encodeError = new Error(`ffmpeg exited ${code}`); });
      try {
        for (let i = 0; i < N; i++) {
          for (let k = 0; k < S; k++) {
            const png = info.hasSeek ? await grab(page, info, { t: (i + k / S) / fps }) : await grab(page, info, { i });
            if (encodeError) throw encodeError;
            await enc.write(png);
          }
          if (errors.length) assertNoErrors(errors, `${job.page} (frame ${i})`);
          if (process.stdout.isTTY && ((i + 1) % 12 === 0 || i + 1 === N)) process.stdout.write(`\r  frames ${i + 1}/${N}`);
        }
      } catch (err) {
        enc.process.kill('SIGKILL');
        throw err;
      }
      if (process.stdout.isTTY) process.stdout.write('\n');
      await enc.end();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const files = encFormats.map(f => `${base}.${f}`);
      for (const f of files) {
        const pr = await probe(f);
        const extra = f.endsWith('.mp4') ? `, faststart ${checkFaststart(f).ok ? 'yes' : 'NO'}` : '';
        log(`  ${path.extname(f).slice(1).padEnd(6)} ${N} frames${S > 1 ? ` ×${S} sub` : ''} @ ${fps} fps → ${rel(f)} (${kb(fs.statSync(f).size)}, ${pr.codec_name} ${pr.pix_fmt} ${pr.width}×${pr.height}, ${pr.duration.toFixed(3)} s, ${pr.color_space}${extra})`);
      }
      // Sidecar for `check --media`: what was rendered, so the probe can be compared with it.
      fs.writeFileSync(`${base}.json`, JSON.stringify({
        id: m.id ?? job.name, name: job.name, page: job.page, w: W, h: H, fps, frames: N, subframes: S,
        duration: N / fps, metaDuration: m.duration ?? null, seed, params: m.params ?? params, fixedParams: m.fixedParams ?? null,
        formats: encFormats, recordedWith: 'tools/record.mjs',
      }, null, 2) + '\n');
      log(`  encoded in ${secs} s`);
      results.clips = files;
      if (wantSheet) {
        const sheet = `${base}-sheet.png`;
        await contactSheet(files[0], sheet);
        log(`  sheet  → ${rel(sheet)}`);
        results.sheet = sheet;
        if (!clipFormats.length) for (const f of files) fs.rmSync(f, { force: true });   // sheet only
      }
    }
    assertNoErrors(errors, job.page);
    return results;
  } finally {
    await ctx.close();
  }
}

async function recordOg(browser, srv, job, opt) {
  assertPage(job);
  const w = 1200, h = 630, t = 7.0;
  const { page, ctx, errors, info } = await openStage(browser, srv, job, { w, h, fps: 24, seed: opt.seed ?? 1, layout: 'wide', t });
  try {
    assertFonts(info, job, opt);
    const png = await grab(page, info, { t });
    assertNoErrors(errors, job.page);
    const out = path.join(REPO_ROOT, 'media/og/og-title.jpg');
    const r = await writeJpegWithin(png, out, 250);
    const pr = await probe(out);
    log(`● og  title t=${t}s ${pr.width}×${pr.height} → ${rel(out)} (${kb(r.size)}, q:v ${r.q})`);
    return { name: 'og', file: out };
  } finally { await ctx.close(); }
}

async function recordIcons(browser, srv) {
  const svg = path.join(REPO_ROOT, 'assets/icons/favicon.svg');
  if (!fs.existsSync(svg)) throw new Error('assets/icons/favicon.svg does not exist yet');
  const ctx = await browser.newContext(contextOptions({ w: 180, h: 180 }));
  try {
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    // Opaque ink background: iOS fills transparent touch icons with black anyway.
    await page.setContent(`<!doctype html><html><head><base href="${srv.url}"></head><body style="margin:0;background:#07080A">
      <img src="assets/icons/favicon.svg" width="180" height="180" style="display:block" alt=""></body></html>`);
    await page.waitForFunction(() => { const i = document.querySelector('img'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
    assertNoErrors(errors, 'favicon.svg');
    const out = path.join(REPO_ROOT, 'assets/icons/apple-touch-icon.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 180, height: 180 }, omitBackground: false });
    const pr = await probe(out);
    log(`● icons favicon.svg → ${rel(out)} (${pr.width}×${pr.height}, ${kb(fs.statSync(out).size)})`);
    return { name: 'icons', file: out };
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------- main
export async function main(argv = process.argv.slice(2)) {
  let opt;
  try { opt = parseArgs(argv); } catch (e) { console.error(`record: ${e.message}\n\n${USAGE}`); return 2; }
  if (opt.help || !opt.targets.length) { console.log(USAGE); return opt.help ? 0 : 2; }
  if (!hasFfmpeg()) { console.error('record: ffmpeg was not found on PATH (needed for every output). Install ffmpeg 6+ with libx264, libvpx-vp9 and libwebp.'); return 1; }

  // Expand targets; `all` = every study page except _template.
  const jobs = [];
  const failures = [];
  for (const t of opt.targets) {
    if (t === 'all') {
      const ids = studyIds();
      if (!ids.length) { failures.push({ target: 'all', error: 'no studies/*.html pages found' }); continue; }
      opt.all = true;
      for (const id of ids) jobs.push({ kind: 'stage', name: id, page: `studies/${id}.html`, params: {} });
      continue;
    }
    try { jobs.push(await resolveTarget(t, opt)); } catch (e) { failures.push({ target: t, error: e.message }); }
  }
  if ((opt.w == null) !== (opt.h == null) && jobs.some(j => j.kind === 'stage')) {
    console.warn('record: only one of --w/--h given; the other comes from the piece (meta.record)');
  }

  let srv, browser;
  const done = [];
  try {
    if (jobs.length) {
      srv = await startServer();
      // Software 2D canvas, always (2D and WebGL pieces alike; WebGL is unaffected): an accelerated
      // canvas is demoted to CPU raster after the first readback, which would make frame 0 differ
      // (anti-aliasing) from every later frame; and under SwiftShader it makes ctx.filter blurs 3–30×
      // slower (a shot card: 330 ms vs 10 ms a frame; its rack-focus move: 3.6 s vs 1.0 s).
      browser = await launch({ gpu: Boolean(opt.gpu), args: ['--disable-accelerated-2d-canvas'] });
    }
    for (const job of jobs) {
      try {
        if (job.kind === 'og') done.push(await recordOg(browser, srv, job, opt));
        else if (job.kind === 'icons') done.push(await recordIcons(browser, srv));
        else done.push(await recordStage(browser, srv, job, opt));
      } catch (e) {
        failures.push({ target: job.name, error: e.message });
        console.error(`✗ ${job.name}: ${e.message}`);
      }
    }
  } finally {
    await browser?.close();
    await srv?.close();
  }
  console.log(`\nrecord: ${done.length} done, ${failures.length} failed`);
  for (const f of failures) console.error(`  FAIL ${f.target}: ${f.error.split('\n')[0]}`);
  return failures.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), err => { console.error(err); process.exit(1); });
}
