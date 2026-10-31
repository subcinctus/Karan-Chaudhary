#!/usr/bin/env node
// Prepare a film's real frames for the site: each source frame (a grab exported from the edit or the grade,
// in any format ffmpeg reads) becomes two JPEGs and a ready-to-paste entry for the film's `stills`.
//
//   node tools/stills.mjs <slug> <frame…> [--start N] [--out <dir>] [--dry-run]
//
// For each frame, in order, it writes
//   media/films/<slug>/still-NN.jpg        2800 px wide (or the frame's own width: never upscaled)
//   media/films/<slug>/still-NN-1400.jpg   1400 px wide (left out when the frame is no wider)
// (Lanczos, JPEG quality 3, the frame's own colours) and prints the block to paste into the film in
// data/portfolio.js: src, srcset (each file at its real width), aspect (from the pixels), a palette of six
// colours sampled from the frame, darkest → lightest (the frame card's chips), and alt and line left as
// TODO(owner): only the owner can say what a frame shows and how it was shot. The first frame of a new
// set is marked featured (the lead frame and the work card). NN continues after the stills already in the
// folder (--start sets it). --out writes somewhere else (a trial run); nothing is uploaded or deployed.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/server.mjs';
import { run, probe, hasFfmpeg, FFMPEG } from './lib/ffmpeg.mjs';

const SIZES = [2800, 1400];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const o = { slug: null, files: [], start: null, out: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--start') o.start = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!o.slug) o.slug = a;
    else o.files.push(a);
  }
  if (o.help) return o;
  if (!SLUG.test(o.slug ?? '')) throw new Error('the first argument is the film\'s slug (lowercase-kebab, as in data/portfolio.js)');
  if (!o.files.length) throw new Error('name at least one frame to prepare');
  if (o.start != null && !(Number.isInteger(o.start) && o.start > 0)) throw new Error('--start must be a whole number from 1');
  return o;
}

const relRepo = p => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const hex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * k colours that stand for the frame: k-means over its pixels ([r, g, b] 0–255), started from luminance
 * quantiles and run a fixed number of rounds, so the same frame always gives the same palette. Returned
 * darkest → lightest as #RRGGBB.
 */
export function framePalette(pixels, k = 6, rounds = 12) {
  if (!pixels.length) return [];
  const sorted = [...pixels].sort((a, b) => luma(a) - luma(b));
  let centres = Array.from({ length: k }, (_, i) => [...sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length))]]);
  for (let round = 0; round < rounds; round++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0, bd = Infinity;
      centres.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    centres = centres.map((c, j) => (sum[j][3] ? sum[j].slice(0, 3).map(v => v / sum[j][3]) : c));
  }
  return [...new Set(centres.sort((a, b) => luma(a) - luma(b)).map(hex))];
}

/** The `stills` entries for data/portfolio.js, as text to paste (paths relative to the site root). */
export function stillsBlock(entries, { featured = true } = {}) {
  const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const lines = entries.map((e, i) => [
    '      {',
    `        src: ${q(e.src)},`,
    `        srcset: [${e.srcset.map(q).join(', ')}],`,
    `        alt: 'TODO(owner): what the frame shows',`,
    `        aspect: ${e.aspect},`,
    `        line: 'TODO(owner): Sc. · lens · stop · EI · ${e.aspectLabel} · INT./EXT. DAY/NIGHT',`,
    `        palette: [${e.palette.map(q).join(', ')}],`,
    ...(featured && i === 0 ? ['        featured: true,'] : []),
    '      },',
  ].join('\n'));
  return `    stills: [\n${lines.join('\n')}\n    ],`;
}

/** The frame's pixels at 48 × 27 (an area average), for the palette. */
async function thumbPixels(file) {
  const { stdout } = await runRaw(['-v', 'error', '-i', file, '-vf', 'scale=48:27:flags=area,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-']);
  const out = [];
  for (let i = 0; i + 2 < stdout.length; i += 3) out.push([stdout[i], stdout[i + 1], stdout[i + 2]]);
  return out;
}
/** ffmpeg with binary stdout. */
function runRaw(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve({ stdout: Buffer.concat(out) }) : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().trim()}`))));
  });
}

export async function main(argv = process.argv.slice(2)) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`stills: ${e.message}\nUsage: node tools/stills.mjs <slug> <frame…> [--start N] [--out <dir>] [--dry-run]`); return 2; }
  if (o.help) { console.log('Usage: node tools/stills.mjs <slug> <frame…> [--start N] [--out <dir>] [--dry-run]'); return 0; }
  if (!hasFfmpeg()) { console.error('stills: ffmpeg was not found on PATH.'); return 1; }
  const missing = o.files.filter(f => !fs.existsSync(f));
  if (missing.length) { console.error(`stills: no such file: ${missing.join(', ')}`); return 2; }

  const dir = path.resolve(o.out ?? path.join(REPO_ROOT, 'media/films', o.slug));
  const taken = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => /^still-(\d+)\.jpg$/.exec(f)?.[1]).filter(Boolean).map(Number) : [];
  let n = o.start ?? (taken.length ? Math.max(...taken) + 1 : 1);
  if (!o.dryRun) fs.mkdirSync(dir, { recursive: true });

  const entries = [];
  for (const file of o.files) {
    const nn = String(n++).padStart(2, '0');
    const { width, height } = await probe(file);
    if (!width || !height) { console.error(`stills: ${file} has no picture ffmpeg can read`); return 1; }
    // A frame narrower than a size is not scaled up: that copy would repeat the larger one, so it is left out.
    const outs = SIZES.map(w => ({ w: Math.min(w, width), file: path.join(dir, w === SIZES[0] ? `still-${nn}.jpg` : `still-${nn}-${w}.jpg`) }))
      .filter((x, i, all) => !all.slice(0, i).some(y => y.w === x.w));
    console.log(`- ${file} (${width}×${height}) → ${outs.map(x => `${relRepo(x.file)} (${x.w} px)`).join(', ')}`);
    if (!o.dryRun) {
      for (const x of outs) {
        await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-frames:v', '1',
          '-vf', `scale=${x.w}:-1:flags=lanczos,format=yuvj420p`, '-q:v', '3', x.file]);
      }
    }
    const aspect = +(width / height).toFixed(3);
    const candidates = [...outs].reverse().map(x => `${relRepo(x.file)} ${x.w}w`);
    entries.push({ src: relRepo(outs[0].file), srcset: candidates, aspect, aspectLabel: `${aspect.toFixed(2)}:1`, palette: framePalette(await thumbPixels(file)) });
  }
  const featured = !taken.length;
  console.log(`\nPaste into the film "${o.slug}" in data/portfolio.js${featured ? '' : ' (add these to its stills)'}, then fill in each alt and line:\n`);
  console.log(stillsBlock(entries, { featured }));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), err => { console.error(err); process.exit(1); });
}
