#!/usr/bin/env node
// Encode Unreal Movie Render Queue PNG sequences into web previs clips.
//
//   node tools/encode-previs.mjs [--only PV-010,PV-020] [--fps 24] [--force] [--dry-run]
//
// For every folder media/previs/<id>/ holding a numbered PNG sequence (e.g. 0000.png, 0001.png … or
// PV-010.0001.png …) it writes
//   media/previs/<id>.mp4   H.264 yuv420p, 1920 wide, CRF 20, BT.709 matrix + tags, faststart
//   media/previs/<id>.jpg   poster at 40 % of the shot, 1280 wide
// with the arguments from previs/README.md:
//   ffmpeg -y -framerate 24 -i media/previs/<id>/%04d.png \
//     -vf "scale=1920:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
//     -c:v libx264 -preset slow -crf 20 -movflags +faststart \
//     -colorspace bt709 -color_primaries bt709 -color_trc bt709 -an media/previs/<id>.mp4
// and then prints the `previs.media` block to paste into data/portfolio.js.
// The PNG folders are git-ignored and never deployed; only the .mp4 and .jpg ship.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/server.mjs';
import { encodeSequence, probe, run, hasFfmpeg, FFMPEG, BT709_TAGS } from './lib/ffmpeg.mjs';
import { checkFaststart } from './lib/mp4.mjs';

const PREVIS_DIR = path.join(REPO_ROOT, 'media/previs');
const MAX_BYTES = 4 * 1024 * 1024;   // repo-weight budget per clip

function parseArgs(argv) {
  const o = { fps: 24, force: false, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--fps') o.fps = Number(argv[++i]);
    else if (a === '--only') o.only = String(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isFinite(o.fps) || o.fps <= 0) throw new Error('--fps must be a positive number');
  return o;
}

/**
 * Find the numbered PNG sequence in a folder.
 * Returns { pattern, start, count, gaps[] } or null. The longest run of one prefix/padding wins.
 */
export function findSequence(dir) {
  const groups = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = /^(.*?)(\d+)\.png$/i.exec(f);
    if (!m) continue;
    const [, prefix, digits] = m;
    const key = `${prefix}\u0000${digits.length}`;
    if (!groups.has(key)) groups.set(key, { prefix, pad: digits.length, frames: [] });
    groups.get(key).frames.push(Number(digits));
  }
  let best = null;
  for (const g of groups.values()) if (!best || g.frames.length > best.frames.length) best = g;
  if (!best) return null;
  best.frames.sort((a, b) => a - b);
  const start = best.frames[0], end = best.frames.at(-1);
  const have = new Set(best.frames), gaps = [];
  for (let n = start; n <= end; n++) if (!have.has(n)) gaps.push(n);
  const esc = best.prefix.replace(/%/g, '%%');
  return { pattern: path.join(dir, `${esc}%0${best.pad}d.png`), start, end, count: best.frames.length, gaps };
}

/** Same encode as lib/ffmpeg encodeSequence, for sequences whose first frame is above 4 (ffmpeg's auto-detect range). */
async function encodeFromStart({ pattern, start, fps, out }) {
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-start_number', String(start), '-i', pattern,
    '-vf', 'scale=1920:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', ...BT709_TAGS, '-an', out]);
  const { duration } = await probe(out);
  const poster = out.replace(/\.mp4$/, '.jpg');
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', String(duration * 0.4), '-i', out, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', poster]);
  return { video: out, poster };
}

const relRepo = p => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const newest = dir => Math.max(...fs.readdirSync(dir).map(f => fs.statSync(path.join(dir, f)).mtimeMs));

async function shotIds() {
  const file = path.join(REPO_ROOT, 'previs/shotlist.json');
  if (fs.existsSync(file)) {
    try { return (JSON.parse(fs.readFileSync(file, 'utf8')).shots ?? []).map(s => s.id).filter(Boolean); } catch { /* fall through */ }
  }
  try {
    const data = (await import(pathToFileURL(path.join(REPO_ROOT, 'data/portfolio.js')).href)).default;
    return Object.keys(data.previs?.media ?? {});
  } catch { return []; }
}

/** The `media: { … }` block for data/portfolio.js (every shot id; null until it has a clip, or if it failed this run). */
export function mediaBlock(ids, failed = []) {
  const lines = ids.map(id => {
    const mp4 = path.join(PREVIS_DIR, `${id}.mp4`), jpg = path.join(PREVIS_DIR, `${id}.jpg`);
    const ok = !failed.includes(id);
    const v = ok && fs.existsSync(mp4) ? `'${relRepo(mp4)}'` : 'null';
    const p = ok && fs.existsSync(jpg) ? `'${relRepo(jpg)}'` : 'null';
    return `      '${id}': { video: ${v}, poster: ${p} },`;
  });
  return `    media: {\n${lines.join('\n')}\n    },`;
}

export async function main(argv = process.argv.slice(2)) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`encode-previs: ${e.message}`); return 2; }
  if (o.help) { console.log('Usage: node tools/encode-previs.mjs [--only PV-010,PV-020] [--fps 24] [--force] [--dry-run]'); return 0; }

  const ids = await shotIds();
  const dirs = fs.existsSync(PREVIS_DIR)
    ? fs.readdirSync(PREVIS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
    : [];
  const todo = dirs.filter(d => !o.only || o.only.includes(d));
  if (!todo.length) {
    console.log(`encode-previs: no PNG sequences found in ${relRepo(PREVIS_DIR)}/<shot-id>/ (render them with Movie Render Queue first; see previs/README.md).`);
  } else if (!hasFfmpeg()) {
    console.error('encode-previs: ffmpeg was not found on PATH.');
    return 1;
  }

  const failed = [];
  for (const id of todo) {
    const dir = path.join(PREVIS_DIR, id);
    const seq = findSequence(dir);
    if (!seq) { console.warn(`- ${id}: no numbered PNG frames in ${relRepo(dir)}/, skipped`); continue; }
    if (ids.length && !ids.includes(id)) console.warn(`  note: ${id} is not a shot id in previs/shotlist.json (${ids.join(', ')})`);
    if (seq.gaps.length) {
      // ffmpeg's image2 demuxer stops at the first missing number, so the clip would silently end early.
      failed.push(id);
      console.error(`  FAIL ${id}: ${seq.gaps.length} frame(s) missing from ${seq.start}–${seq.end} (e.g. ${seq.gaps.slice(0, 5).join(', ')}); re-render them, then run again`);
      continue;
    }
    const out = path.join(PREVIS_DIR, `${id}.mp4`);
    if (!o.force && fs.existsSync(out) && fs.statSync(out).mtimeMs > newest(dir)) {
      console.log(`- ${id}: ${relRepo(out)} is newer than its frames, skipped (--force to re-encode)`);
      continue;
    }
    console.log(`- ${id}: ${seq.count} frames (${seq.start}–${seq.end}) @ ${o.fps} fps → ${relRepo(out)}`);
    if (o.dryRun) continue;
    try {
      const r = seq.start <= 4
        ? await encodeSequence({ pattern: seq.pattern, fps: o.fps, out })
        : await encodeFromStart({ pattern: seq.pattern, start: seq.start, fps: o.fps, out });
      const pr = await probe(r.video);
      const size = fs.statSync(r.video).size;
      const fast = checkFaststart(r.video).ok;
      console.log(`  ${pr.codec_name} ${pr.pix_fmt} ${pr.width}×${pr.height} ${pr.fps} fps ${pr.duration.toFixed(2)} s, ${(size / 1048576).toFixed(2)} MB, ${pr.color_space}, faststart ${fast ? 'yes' : 'NO'}; poster ${relRepo(r.poster)}`);
      if (size > MAX_BYTES) console.warn(`  warning: ${id}.mp4 is over 4 MB; consider a shorter shot or a higher CRF`);
    } catch (e) {
      failed.push(id);
      console.error(`  FAIL ${id}: ${e.message.split('\n')[0]}`);
    }
  }

  const all = [...new Set([...ids, ...dirs])];
  if (all.length) {
    console.log('\nPaste into data/portfolio.js → previs:\n');
    console.log(mediaBlock(all, failed));
    console.log('\nThen run `npm run check`.');
  }
  if (failed.length) console.error(`\nencode-previs: ${failed.length} shot(s) failed: ${failed.join(', ')} (left as null above)`);
  return failed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), err => { console.error(err); process.exit(1); });
}
