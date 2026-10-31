// Fixture data for the browser checks: the real data/portfolio.js with tools/test/fixtures/full.mjs merged
// over it, served to a page in place of the real file, so the blocks the site hides until they are real
// (reel and shot index, crew, laurels, real frames, grade, photographs) can be rendered and tested without
// committing fake content or media. Node only (Playwright side); nothing here is deployed.
//
//   import { fixtureData, routeFixture, stampFixture, ensureTestClip } from './lib/fixture.mjs';
//   const data = await routeFixture(page, srv);       // the page now imports the fixture as its data
//   await stampFixture(page);                         // "FIXTURE DATA" banner on every screenshot
//   const clip = await ensureTestClip();              // '.artifacts/fixtures/reel.mp4', or null (no ffmpeg)
//   await page.screenshot({ path: fixtureShot('index--1440x900') });

import fs from 'node:fs';
import path from 'node:path';
import real from '../../data/portfolio.js';
import fixture, { TEST_CLIP } from '../test/fixtures/full.mjs';
import { REPO_ROOT } from './server.mjs';
import { FFMPEG, BT709_TAGS, YUV709, hasFfmpeg, run } from './ffmpeg.mjs';

/** The generated test reel, relative to the site root: the fixture's reel.src, served at srv.url + FIXTURE_CLIP. */
export const FIXTURE_CLIP = TEST_CLIP;

const isPlain = v => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge `over` into `target` in place: objects key by key; an array of records with slugs (films) takes an
 * object of patches keyed by slug; any other array or value replaces what is there.
 */
function mergeInto(target, over) {
  for (const [k, v] of Object.entries(over ?? {})) {
    const t = target[k];
    if (Array.isArray(t) && isPlain(v) && t.every(r => r?.slug)) {
      for (const [slug, patch] of Object.entries(v)) {
        const rec = t.find(r => r.slug === slug);
        if (!rec) throw new Error(`fixture: no film with slug "${slug}" in data/portfolio.js (slugs: ${t.map(r => r.slug).join(', ')})`);
        mergeInto(rec, patch);
      }
    } else if (isPlain(t) && isPlain(v)) mergeInto(t, v);
    else target[k] = structuredClone(v);
  }
  return target;
}

/**
 * A fresh copy of the real data with the fixture (then `extra`, by the same rules) merged over it. The fixture
 * patches the first two films whatever their slugs, so it survives the samples being replaced.
 */
export function fixtureData(extra = {}) {
  return mergeInto(mergeInto(structuredClone(real), fixture(real)), extra);
}

/**
 * Serve `data` (default: fixtureData()) as data/portfolio.js to a Page or BrowserContext, so every page and
 * study it opens imports the fixture instead of the real file. Resolves to the data served.
 */
export async function routeFixture(target, srv, data = fixtureData()) {
  const url = srv.url + 'data/portfolio.js';
  const body = `export default ${JSON.stringify(data)};\n`;
  await target.route(u => u.href.split(/[?#]/)[0] === url, r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body }));
  return data;
}

/**
 * Pin a "FIXTURE DATA" banner and a red frame on every page a Page or BrowserContext opens, so a fixture
 * screenshot can never pass for the site. Fixed, outside <main> and the header, aria-hidden, and never in
 * the way of a click.
 */
export async function stampFixture(target) {
  await target.addInitScript(() => {
    const stamp = () => {
      if (document.getElementById('kc-fixture-stamp')) return;
      const frame = document.createElement('div');
      frame.id = 'kc-fixture-stamp';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-shadow:inset 0 0 0 3px #E5484D';
      const label = document.createElement('span');
      label.textContent = 'FIXTURE DATA · not the site';
      label.style.cssText = 'position:absolute;right:12px;bottom:12px;padding:6px 10px;background:#E5484D;color:#fff;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;white-space:nowrap';
      frame.append(label);
      document.documentElement.append(frame);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stamp, { once: true });
    else stamp();
  });
}

/** Absolute path for a fixture screenshot: .artifacts/screens/fixture--<name>.png (the folder is made). */
export function fixtureShot(name) {
  const dir = path.join(REPO_ROOT, '.artifacts/screens');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `fixture--${name}.png`);
}

/**
 * The fixture reel: a 20 s 1280×720 24 fps H.264 (yuv420p, BT.709, faststart) test pattern from ffmpeg's
 * testsrc2, with a keyframe every second so seeking lands quickly. Made once, into .artifacts/fixtures/
 * (git-ignored). Resolves to FIXTURE_CLIP, or null when ffmpeg is missing.
 */
export async function ensureTestClip({ force = false } = {}) {
  const abs = path.join(REPO_ROOT, FIXTURE_CLIP);
  if (!force && fs.existsSync(abs) && fs.statSync(abs).size > 0) return FIXTURE_CLIP;
  if (!hasFfmpeg()) return null;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs.replace(/\.mp4$/, `.${process.pid}.tmp.mp4`);   // renamed when complete: never a half-written clip
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-t', '20',
    '-vf', YUV709, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '24', '-pix_fmt', 'yuv420p',
    ...BT709_TAGS, '-movflags', '+faststart', '-an', tmp]);
  fs.renameSync(tmp, abs);
  return FIXTURE_CLIP;
}
