// Fixture data for the browser checks: the real data/portfolio.js with tools/test/fixtures/full.mjs merged
// over it, served to a page in place of the real file, so the blocks the site hides until they are real
// (reel and shot index, crew, laurels, real frames, grade, photographs) can be rendered and tested without
// committing fake content or media. Node only (Playwright side); nothing here is deployed.
//
//   import { fixtureData, routeFixture, stampFixture, ensureTestClip, ensureTestWebm } from './lib/fixture.mjs';
//   const data = await routeFixture(page, srv);       // the page now imports the fixture as its data
//   await stampFixture(page);                         // "FIXTURE DATA" banner on every screenshot
//   const clip = await ensureTestClip();              // '.artifacts/fixtures/reel.mp4', or null (no ffmpeg)
//   const webm = await ensureTestWebm();              // '.artifacts/fixtures/reel.webm': what Playwright's Chromium plays
//   await page.screenshot({ path: fixtureShot('index--1440x900') });

import fs from 'node:fs';
import path from 'node:path';
import real from '../../data/portfolio.js';
import fixture, { TEST_CLIP } from '../test/fixtures/full.mjs';
import { REPO_ROOT } from './server.mjs';
import { FFMPEG, BT709_TAGS, YUV709, hasFfmpeg, run } from './ffmpeg.mjs';

/** The generated test reel, relative to the site root: the fixture's reel.src, served at srv.url + FIXTURE_CLIP. */
export const FIXTURE_CLIP = TEST_CLIP;
/** The same test reel as VP9, for the browser checks: Playwright's Chromium build has no H.264 decoder. */
export const FIXTURE_WEBM = '.artifacts/fixtures/reel.webm';

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
 * screenshot or PDF can never pass for the site. Outside <main> and the header, aria-hidden, and never in
 * the way of a click:
 *   - a frame fixed to the window, with the label at its foot: every screenshot, and every printed page
 *     (its id outranks a page's print rules that keep everything but <main> off the paper; it sits before
 *     <body>, so a page break after the last of the content leaves no page for it alone);
 *   - a frame down the whole page, with the label again at the foot of every window's height: a full-page
 *     capture, and each band of one, is stamped below its first screen too (not printed).
 * A modal <dialog> (the frame lightbox, the menu sheet) is drawn in the top layer, over any z-index: while
 * one is open the fixed stamp moves into it, so a screenshot of the dialog carries it too.
 */
export async function stampFixture(target) {
  await target.addInitScript(() => {
    const RED = '#E5484D';
    const span = css => { const el = document.createElement('span'); el.style.cssText = `position:absolute;${css}`; return el; };
    const label = () => Object.assign(span(`right:12px;padding:6px 10px;background:${RED};color:#fff;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;white-space:nowrap`), { textContent: 'FIXTURE DATA · not the site' });
    const stamp = () => {
      if (document.getElementById('kc-fixture-stamp')) return;
      const frame = document.createElement('div');
      frame.id = 'kc-fixture-stamp';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-shadow:inset 0 0 0 3px ${RED}`;
      const tag = label();
      tag.style.bottom = '12px';
      frame.append(tag);
      // Down the page: thin red strips at both sides and the foot, and a label at the foot of every window's
      // height (strips, not one box the size of the page: that would make a full-page capture crawl).
      const page = document.createElement('div');
      page.id = 'kc-fixture-page';
      page.setAttribute('aria-hidden', 'true');
      page.style.cssText = 'position:absolute;top:0;left:0;right:0;height:0;z-index:2147483646;pointer-events:none';
      const sides = [span(`left:0;top:0;width:3px;background:${RED}`), span(`right:0;top:0;width:3px;background:${RED}`)];
      const foot = span(`left:0;right:0;height:3px;background:${RED}`);
      const labels = [];
      page.append(...sides, foot);
      const css = document.createElement('style');
      css.textContent = '@media print { #kc-fixture-stamp { display: block !important; } #kc-fixture-page { display: none !important; } }';
      document.head.append(css);
      document.documentElement.insertBefore(page, document.body);
      document.documentElement.insertBefore(frame, document.body);
      // As long as the page (measured without the strips), one label per window height.
      const fit = () => {
        page.hidden = true;
        const h = document.documentElement.scrollHeight, vh = innerHeight, n = Math.max(1, Math.ceil(h / vh));
        page.hidden = false;
        for (const s of sides) s.style.height = `${h}px`;
        foot.style.top = `${h - 3}px`;
        while (labels.length > n) labels.pop().remove();
        while (labels.length < n) { const l = label(); labels.push(l); page.append(l); }
        labels.forEach((l, k) => { l.style.top = `${Math.min(h, (k + 1) * vh) - 36}px`; });
      };
      fit();
      new ResizeObserver(fit).observe(document.body);
      addEventListener('resize', fit);
    };
    const follow = () => {
      const frame = document.getElementById('kc-fixture-stamp');
      const dialog = [...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')).pop();
      if (!frame || frame.parentNode === (dialog ?? document.documentElement)) return;
      if (dialog) dialog.append(frame); else document.documentElement.insertBefore(frame, document.body);
    };
    new MutationObserver(follow).observe(document, { subtree: true, attributes: true, attributeFilter: ['open'] });
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

/**
 * The fixture reel as Playwright's Chromium can play it (that build has no H.264 decoder, and a <video> it
 * cannot decode still reads back the currentTime it was given): the same 20 s testsrc2 pattern as a 640×360
 * VP9 WebM (yuv420p, BT.709) with a keyframe every second. Made once, into .artifacts/fixtures/ (git-ignored).
 * Resolves to FIXTURE_WEBM, or null when ffmpeg is missing.
 */
export async function ensureTestWebm({ force = false } = {}) {
  const abs = path.join(REPO_ROOT, FIXTURE_WEBM);
  if (!force && fs.existsSync(abs) && fs.statSync(abs).size > 0) return FIXTURE_WEBM;
  if (!hasFfmpeg()) return null;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs.replace(/\.webm$/, `.${process.pid}.tmp.webm`);   // renamed when complete: never a half-written clip
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-t', '20',
    '-vf', YUV709, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '400k', '-g', '24',
    ...BT709_TAGS, '-an', tmp]);
  fs.renameSync(tmp, abs);
  return FIXTURE_WEBM;
}
