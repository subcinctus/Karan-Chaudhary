#!/usr/bin/env node
// Tour: a recorded walk through the site as a desktop visitor meets it, for review. The real site data
// (never the fixture), motion on, a fine pointer, deviceScaleFactor 1 and a fresh browser context per
// size (clean localStorage and sessionStorage). Each size is one page and so one Playwright video: the
// match cut and the pager are same-tab navigations, which stay in the same file.
//
//   flock .artifacts/browser.lock npm run tour
//   node tools/tour.mjs [--sizes 1920x1080,1440x900] [--out .artifacts/tour] [--only <beat,…>] [--keep-webm]
//
// The tool does not take the browser lock itself. Run it under flock as above, so it never shares the
// CPUs with another Chromium job: the video is captured in real time.
//
// Beats (--only takes their numbers or names; a beat gets to its page by itself). Each pause holds
// 1.2–2 s and saves a viewport still, <out>/<w>x<h>/NN-<beat>[-<what>].png:
//   01 hero       the home page at rest, the main title on its last frame
//   02 strip      the wheel down into the pinned work strip, and through it
//   03 index      Frames → Index, a slow glide over three rows (rack focus, the preview pane), → Frames
//   04 studies    the header's Studies link, then the pointer on a study
//   05 credits    the Credits link, a turn of the wheel through the roll, then the header's Contact pill
//   06 match-cut  the Work link, the first card hovered and clicked: the match cut into its film page
//   07 lightbox   frame 01 opened, → three times, i for the info panel, Esc
//   08 sequence   the scene sequence, then the lighting plot
//   09 pager      the pager's next film
//
// Input is trusted and paced like a person's, so Lenis and GSAP behave as they do for one: wheel bursts
// (CDP mouseWheel, 80 px notches 48 ms apart, each sent without waiting for its ack), pointer glides in
// 16 ms steps (CDP mouseMoved) and keys through page.keyboard. Headless Chromium draws no system cursor
// into its frames, so the tour draws an arrow at the pointer (in the video and the stills only).
//
// Software rendering (SwiftShader) draws canvases at ~5–9 fps here, which would make the live pieces
// look choppy for reasons a real GPU does not have. So the main title is shown at rest (sessionStorage
// kc:titles, as on a second visit) and each study Player is held on its poster frame once it has drawn:
// everything that moves in the video is the page itself (scroll, the pin, hovers, the Index, the match
// cut, the lightbox). The page is composited by Chromium's own software compositor, which keeps up with
// the wheel at about 20 fps (SwiftShader's GL managed about 4 at 1920×1080).
//
// Output: <out>/tour-<w>x<h>.mp4 (H.264 yuv420p with BT.709 tags, faststart, starting at the site's
// first frame), the stills, and <out>/contact-<w>x<h>.jpg with every still on one sheet. --keep-webm
// keeps Playwright's raw recording too (<out>/tour-<w>x<h>.webm). Playwright holds each frame it is
// sent for a whole number of 40 ms video frames, so motion plays a little slow when frames come faster
// than that (0.88× against an on-screen clock here); pauses keep their length. Each beat has a timeout
// and logs what it waits for; a failed beat is reported, with a still of where it stopped, and the tour
// goes on from where it can. Exit 1 when a beat failed, a page logged a console error or page error, or
// a video came out wrong.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, REPO_ROOT } from './lib/server.mjs';
import { launch, contextOptions, collectErrors } from './lib/playwright.mjs';
import { FFMPEG, YUV709, BT709_TAGS, run, probe, hasFfmpeg } from './lib/ffmpeg.mjs';
import { checkFaststart } from './lib/mp4.mjs';

const USAGE = `Usage: node tools/tour.mjs [--sizes 1920x1080,1440x900] [--out .artifacts/tour] [--only <beat,…>] [--keep-webm]
  beats: 01 hero, 02 strip, 03 index, 04 studies, 05 credits, 06 match-cut, 07 lightbox, 08 sequence, 09 pager
  Run it under the browser lock: flock .artifacts/browser.lock npm run tour`;

// Pacing: a hand on a mouse, not a script.
const NOTCH = 80, NOTCH_MS = 48, FLICK = 25;   // wheel: px per event, ms between events, events per flick
const STEP_MS = 16;                             // pointer glides: one mouseMoved a frame
const HOLD = 1500;                              // each pause (1.2–2 s)
const WAIT_MS = 15000, BEAT_MS = 60000;         // the longest single wait, the longest beat

// The site's hooks the tour drives (assets/js/site/{main,work-index,match-cut,lightbox,project,film-facts}.js).
const SEL = {
  toggle: view => `#work .work-view__btn[data-view="${view}"]`,
  row: '#work tr.work-index__row',
  pane: '.work-index__preview [data-preview-frame]',
  card: '#work a.work-card__link',
  frame: '[data-lightbox="frames"][data-lightbox-index="0"]',
  anyFrame: '[data-lightbox][data-lightbox-index]',
  next: '.film__pager-link--next',
  contact: '.site-header__contact',
  nav: id => `.site-nav a[href$="#${id}"]`,
};

// The pointer the tour draws (an arrow, tip at the hot spot).
const ARROW = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M3 2v15.6l4-3.8 2.7 6.3 2.7-1.2-2.7-6.2H15z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>')}")`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const easeInOut = k => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const secs = ms => `${(ms / 1000).toFixed(1)} s`;
const rel = p => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') ? p : r; };
const pad2 = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- arguments
export function parseArgs(argv) {
  const o = { sizes: [[1920, 1080], [1440, 900]], out: path.join(REPO_ROOT, '.artifacts/tour'), only: null, keepWebm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { o.help = true; continue; }
    if (a === '--keep-webm') { o.keepWebm = true; continue; }
    const [k, inline] = a.split(/=(.*)/s);
    if (!['--sizes', '--out', '--only'].includes(k)) throw new Error(`unknown option ${a}`);
    const v = inline ?? argv[++i];
    if (v == null || v.startsWith('--')) throw new Error(`${k} needs a value`);
    if (k === '--out') o.out = path.resolve(process.cwd(), v);
    else if (k === '--only') o.only = v.split(',').map(s => s.trim()).filter(Boolean);
    else {
      o.sizes = v.split(',').map(s => {
        const m = /^(\d+)x(\d+)$/.exec(s.trim());
        if (!m) throw new Error(`--sizes: "${s}" is not WxH`);
        return [Number(m[1]), Number(m[2])];
      });
    }
  }
  for (const [w] of o.sizes) if (w < 1024) throw new Error(`--sizes: ${w} px is narrower than the desktop layout (1024 px and up), which the tour walks`);
  const bad = (o.only ?? []).filter(s => !BEATS.some(b => matches(b, s)));
  if (bad.length) throw new Error(`--only: no beat "${bad.join('", "')}"`);
  return o;
}
/** A beat named on the command line by number ("3", "03"), name ("index") or both ("03-index"). */
const matches = ([n, name], s) => s === name || s === `${n}-${name}` || Number(s) === Number(n);

// ---------------------------------------------------------------- in the page
/**
 * Runs in every document of the tour before the site's scripts (context.addInitScript): the main title
 * at rest, the study Players held on their poster frames, and the pointer drawn.
 */
function prepare({ arrow }) {
  // main.js plays the title once per session: this is a second visit's hero.
  try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked: the title plays */ }
  // A Player (window.__players, core/player.js) that has drawn is paused on its poster frame, the frame
  // the recorder writes as its poster. The hero's title is left alone.
  const held = new WeakSet();
  setInterval(() => {
    for (const p of window.__players ?? []) {
      if (held.has(p) || !(p.frames > 0) || p.host?.closest?.('[data-hero]')) continue;
      held.add(p);
      p.pause();
      if (Number.isFinite(p.meta?.posterTime)) p.seek(p.meta.posterTime);
    }
  }, 100);
  // For the match cut's report: did the page being left offer a view transition (kc:tour:swap)?
  addEventListener('pageswap', e => { try { sessionStorage.setItem('kc:tour:swap', e.viewTransition ? 'offered' : 'none'); } catch { /* blocked */ } });
  let pointer = null;
  addEventListener('mousemove', e => {
    if (!pointer?.isConnected) {
      pointer = document.createElement('div');
      pointer.setAttribute('aria-hidden', 'true');
      pointer.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;margin:-2px 0 0 -3px;pointer-events:none;background:${arrow} 0 0 / 22px 22px no-repeat`;
      document.documentElement.append(pointer);
    }
    pointer.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  }, { capture: true, passive: true });
}

// ---------------------------------------------------------------- a beat's hands
let partial = false;   // a "· waiting for … " line is open on stdout

/**
 * What a beat does with the page: trusted input, logged waits, pauses with stills. Every call checks
 * first that its beat is still running, so a beat that timed out cannot act inside the next one.
 */
function beatKit(T, n, name) {
  const { page } = T;
  const state = { dead: false };
  const live = () => { if (state.dead) throw new Error('the beat is over'); };
  const say = s => console.log(`    ${s}`);
  const warn = s => { T.warns.push(`${n} ${name}: ${s}`); say(`! ${s}`); };
  const pause = async ms => { live(); await sleep(ms); };
  // Input goes out without waiting for its ack (the pacing is the sleeps); an error still surfaces in acked().
  const fire = (method, params) => { const p = T.cdp.send(method, params); p.catch(() => {}); return p; };
  const acked = async sends => { const no = (await Promise.allSettled(sends)).find(r => r.status === 'rejected'); if (no) throw no.reason; };

  /** Run `work` with a log line that says what it waits for and how long it took. */
  async function logged(label, work) {
    live();
    process.stdout.write(`    · ${label} … `);
    partial = true;
    const t0 = Date.now();
    try {
      const v = await work;
      console.log(secs(Date.now() - t0));
      return v;
    } catch (e) {
      console.log('no');
      throw new Error(`${label}: ${e.message.split('\n')[0]}`);
    } finally { partial = false; }
  }
  /** Wait for fn(arg) to be truthy in the page; returns its value. soft: a warning instead of a failure. */
  async function until(label, fn, arg = null, { ms = WAIT_MS, soft = false } = {}) {
    try {
      return await logged(label, page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(h => h.jsonValue()));
    } catch (e) {
      if (!soft || state.dead) throw e;
      warn(e.message);
      return null;
    }
  }
  const rearmed = () => logged('the motion layer re-armed (window.__motion.idle)',
    page.evaluate(() => Promise.race([window.__motion?.idle, new Promise(r => setTimeout(r, 6000))])));

  /** The viewport box of the nth match of sel, or null (none, or no box). */
  const rect = (sel, nth = 0) => page.evaluate(([s, i]) => {
    const r = document.querySelectorAll(s)[i]?.getBoundingClientRect();
    return r?.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  }, [sel, nth]);
  const scrollTop = () => page.evaluate(() => scrollY);
  /**
   * Until the page has stopped moving for 200 ms, or ms have passed. Only Lenis' own easing counts as
   * moving: after a re-arm it can report a native scroll ('native') for good.
   */
  const settled = (ms = 5000) => page.evaluate(ms => new Promise(done => {
    const end = Date.now() + ms;
    let last = scrollY, still = 0;
    const t = setInterval(() => {
      const moving = Math.abs(scrollY - last) > 0.5 || window.__motion?.lenis?.isScrolling === 'smooth';
      last = scrollY;
      still = moving ? 0 : still + 1;
      if (still >= 4 || Date.now() > end) { clearInterval(t); done(); }
    }, 50);
  }), ms);

  /** Glide the pointer to (x, y) in 16 ms steps, eased in and out as a hand moves a mouse. */
  async function glide(x, y, ms) {
    live();
    const x0 = T.mx, y0 = T.my;
    ms ??= Math.min(1100, Math.max(450, 280 + Math.hypot(x - x0, y - y0) * 0.6));
    const steps = Math.max(1, Math.round(ms / STEP_MS)), sends = [];
    for (let i = 1; i <= steps; i++) {
      live();
      const k = easeInOut(i / steps);
      T.mx = x0 + (x - x0) * k; T.my = y0 + (y - y0) * k;
      sends.push(fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: T.mx, y: T.my }));
      await sleep(STEP_MS);
    }
    await acked(sends);
  }
  /** Glide onto the nth match of sel (fx, fy: where on it), wheeling it into view first if it is off screen. */
  async function glideTo(sel, { nth = 0, fx = 0.5, fy = 0.5, ms } = {}) {
    let r = await rect(sel, nth);
    if (r && (r.y + r.h * fy < 12 || r.y + r.h * fy > T.h - 12)) { await wheelTo(sel, { nth, at: Math.round(T.h * 0.3) }); r = await rect(sel, nth); }
    if (!r) throw new Error(`no ${sel}${nth ? ` (#${nth + 1})` : ''} on the page`);
    await glide(Math.min(T.w - 6, Math.max(6, r.x + r.w * fx)), Math.min(T.h - 6, Math.max(6, r.y + r.h * fy)), ms);
  }
  /** A left click where the pointer is. */
  async function click() {
    live();
    const at = { x: T.mx, y: T.my, button: 'left', clickCount: 1 };
    await fire('Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...at });
    await sleep(70);
    await fire('Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...at });
  }
  /** Scroll dy px with the wheel where the pointer is: 80 px notches 48 ms apart, a new flick every 25. */
  async function wheel(dy) {
    live();
    const count = Math.max(1, Math.ceil(Math.abs(dy) / NOTCH)), d = dy / count, sends = [];
    for (let i = 0; i < count; i++) {
      live();
      if (i && i % FLICK === 0) await sleep(280);
      sends.push(fire('Input.dispatchMouseEvent', { type: 'mouseWheel', x: T.mx, y: T.my, deltaX: 0, deltaY: d }));
      await sleep(NOTCH_MS);
    }
    await acked(sends);
  }
  /** Wheel until the page's scroll position is y (a couple of corrections; it stops where the page ends). */
  async function wheelToY(y) {
    for (let i = 0; i < 3; i++) {
      const from = await scrollTop();
      if (Math.abs(y - from) < 8) return;
      await wheel(y - from);
      await settled();
      if (Math.abs(await scrollTop() - from) < 2) return;
    }
  }
  /** Wheel until the nth match of sel has its top `at` px below the top of the window (or the page ends). */
  async function wheelTo(sel, { nth = 0, at = 96 } = {}) {
    for (let i = 0; i < 3; i++) {
      const r = await rect(sel, nth);
      if (!r) throw new Error(`no ${sel} on the page`);
      if (Math.abs(r.y - at) < 24) return;
      const from = await scrollTop();
      await wheel(r.y - at);
      await settled();
      if (Math.abs(await scrollTop() - from) < 2) return;
    }
  }
  const key = async k => { live(); await page.keyboard.press(k); };

  /** A viewport still: <dir>/NN-<beat>[-<what>].png. */
  async function shot(what = '') {
    const file = path.join(T.dir, `${n}-${name}${what ? `-${what}` : ''}.png`);
    await page.screenshot({ path: file });
    T.stills.push({ file, label: `${n} ${name}${what ? ` · ${what}` : ''}` });
    say(`▣ ${path.basename(file)}`);
  }
  /** Stay put for ms, with a still once the UI's own animations (≤ 450 ms) have landed. */
  async function hold(what = '', ms = HOLD) {
    live();
    const t0 = Date.now();
    await sleep(Math.min(500, ms / 2));
    await shot(what);
    await sleep(Math.max(0, ms - (Date.now() - t0)));
  }

  /** A new document in the page: input goes to it, the pointer is drawn where it is, the layer arms. */
  async function arrived() {
    const old = T.cdp;
    T.cdp = await T.context.newCDPSession(page);
    old?.detach().catch(() => {});
    await fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: T.mx, y: T.my });
    await until('the desktop motion layer armed (window.__motion.armed)', () => window.__motion?.armed === true);
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
  }
  const go = async url => { await logged(`opening ${url}`, page.goto(T.srv.url + url, { waitUntil: 'load' })); await arrived(); };
  /** Click where the pointer is and wait for the page it opens (the same tab, so the video goes on). */
  async function follow(test, label) {
    await logged(label, Promise.all([page.waitForURL(test, { timeout: 20000 }), click()]));
    await arrived();
  }
  const where = () => new URL(page.url()).pathname;
  /** The beat starts on the home page (it is already there unless an earlier beat failed or --only). */
  const home = async () => { if (!/\/(index\.html)?$/.test(where())) await go('index.html'); };
  /** The beat starts on a film page: the first film's, when the match cut did not bring it there. */
  const film = async () => { if (!where().endsWith('/project.html')) await go(`project.html?slug=${encodeURIComponent(T.data.films?.[0]?.slug ?? '')}`); };

  /**
   * The header slides away on the way down (motion/nav.js); a visitor brings it back with a flick of the
   * wheel up. nav.js can hide it again while the page is still easing up, so each flick waits for the page
   * to come to rest, up to three flicks.
   */
  async function header() {
    const away = () => page.evaluate(() => document.documentElement.classList.contains('header-away'));
    if (!(await away())) return;
    try {
      await logged('the header back (a flick of the wheel up)', (async () => {
        for (let i = 0; i < 3 && await away(); i++) { await wheel(-2 * NOTCH); await settled(); }
        if (await away()) throw new Error('still away after three flicks');
        await sleep(450);   // its slide in
      })());
    } catch (e) { if (state.dead) throw e; warn(e.message); }
  }
  /** A visitor's jump to #id through a link (the header's nav by default): the site's own eased anchor scroll. */
  async function jump(id, via = SEL.nav(id)) {
    await header();
    const r = await rect(via);
    if (!r || r.y < 0) { warn(`no ${via} on screen: the wheel instead`); await wheelTo(`#${id}`, { at: 72 }); return; }
    await glideTo(via);
    await pause(200);
    await click();
    await until(`#${id} under the header`, id => {
      const el = document.getElementById(id);
      if (!el) return false;
      const top = el.getBoundingClientRect().top, line = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const room = document.documentElement.scrollHeight - innerHeight - scrollY;
      return Math.abs(top - line) < 40 || (top > line && room < 4);   // or as close as the end of the page allows
    }, id, { ms: 8000 });
    await settled();
  }
  /** Press the Selected work toggle for view v ('frames' or 'index') and let the layer re-arm for it. */
  async function view(v) {
    const btn = SEL.toggle(v), r = await rect(btn);
    if (!r) throw new Error(`no ${btn} on the page`);
    if (r.y < 60 || r.y > T.h - 60) await wheelTo(btn, { at: Math.round(T.h * 0.15) });
    await glideTo(btn, { ms: 800 });
    await pause(250);
    await click();
    await until(`html[data-work-view="${v}"]`, v => document.documentElement.dataset.workView === v, v);
    await rearmed();
    await settled();
  }

  return { page, state, say, warn, pause, logged, until, rect, settled, glide, glideTo, click, wheel, wheelToY, wheelTo, key, hold, go, arrived, follow, home, film, jump, view };
}

// ---------------------------------------------------------------- beats
/** [number, name, run(b, T)], in tour order. */
const BEATS = [
  ['01', 'hero', async (b, T) => {
    await b.home();
    await b.until('the main title on its last frame', () => (window.__players ?? []).some(p => p.host?.closest?.('[data-hero]') && p.frames > 0), null, { soft: true });
    await b.glide(T.w * 0.64, T.h * 0.6, 1000);
    await b.hold('', 1800);
  }],

  ['02', 'strip', async (b, T) => {
    await b.home();
    // The strip asks for every card's still ahead of time (kc:prime-work); a gate waits for its still.
    await b.until('the work stills painted', () => {
      const f = [...document.querySelectorAll('#work .work-card__frame')];
      return f.length > 0 && f.every(x => x.classList.contains('has-piece'));
    }, null, { soft: true, ms: 10000 });
    const rail = await b.until('the pinned work strip (ScrollTrigger "work-rail")', () => {
      const st = window.__motion?.ScrollTrigger?.getById('work-rail');
      return st ? { start: st.start, end: st.end } : null;
    });
    await b.glide(T.w * 0.62, T.h * 0.5);
    await b.wheelToY(rail.start + 1);
    await b.hold();
    await b.wheel((rail.end - rail.start) * 0.5);
    await b.settled();
    await b.hold('middle', 1200);
    await b.wheelToY(rail.end - 1);
    await b.hold('end', 1400);
  }],

  ['03', 'index', async (b) => {
    await b.home();
    await b.view('index');
    // Slowly down the first three rows: the pane follows the pointer, the other rows go out of focus.
    const rows = await b.page.$$eval(SEL.row, trs => trs.slice(0, 3).map(tr => tr.dataset.film));
    if (!rows.length) throw new Error(`no ${SEL.row} in the Index`);
    for (const [i, slug] of rows.entries()) {
      await b.glideTo(SEL.row, { nth: i, fx: 0.3, ms: 900 });
      await b.until(`the preview pane on ${slug}`, s => [...document.querySelectorAll('.work-index__preview [data-preview-frame]')].some(f => f.dataset.film === s), slug, { soft: true, ms: 4000 });
      if (i === 1) await b.hold('', 1200); else await b.pause(900);
    }
    await b.view('frames');
    await b.until('the strip pinned again', () => Boolean(window.__motion?.ScrollTrigger?.getById('work-rail')), null, { soft: true, ms: 5000 });
    await b.hold('frames', 1200);
  }],

  ['04', 'studies', async (b) => {
    await b.home();
    await b.jump('studies');
    const id = await b.page.$$eval('#studies [data-study]', els => els[0]?.id ?? null);
    if (!id) throw new Error('no study in #studies');
    await b.wheelTo(`#${id}`, { at: 88 });
    const host = `#${id} [data-study-host]`;
    await b.until(`the ${id} Player drawn and held on its poster frame`, s => {
      const el = document.querySelector(s), p = (window.__players ?? []).find(x => x.host === el);
      return Boolean(p && p.frames > 0 && el.dataset.want === 'pause');
    }, host, { soft: true });
    await b.glideTo(host, { fx: 0.42, fy: 0.55, ms: 1000 });
    await b.hold('', 1600);
  }],

  ['05', 'credits', async (b, T) => {
    await b.home();
    await b.jump('credits');
    await b.hold('', 1400);
    await b.wheel(T.h * 0.85);   // the roll: credits brighten as they rise out of the bottom mask
    await b.settled();
    await b.hold('roll', 1200);
    await b.jump('contact', SEL.contact);   // the header's Contact pill
    await b.hold('contact', 1600);
  }],

  ['06', 'match-cut', async (b) => {
    await b.home();
    await b.jump('work');
    // The card carries the still; leave the visitor in Frames (an earlier beat may have stopped in the Index).
    if (await b.page.evaluate(() => document.documentElement.dataset.workView) === 'index') await b.view('frames');
    const rail = await b.page.evaluate(() => { const st = window.__motion?.ScrollTrigger?.getById('work-rail'); return st ? st.start : null; });
    if (rail != null) await b.wheelToY(rail + 1);
    const slug = await b.page.$eval(SEL.card, a => a.dataset.film);
    await b.until(`the ${slug} card painted`, s => [...document.querySelectorAll('#work a.work-card__link')].find(a => a.dataset.film === s)?.querySelector('.work-card__frame')?.classList.contains('has-piece'), slug, { soft: true, ms: 8000 });
    await b.glideTo(`${SEL.card} .work-card__frame`, { fx: 0.55, ms: 1000 });
    await b.hold('hover', 1200);
    await b.follow(u => u.pathname.endsWith('/project.html') && u.searchParams.get('slug') === slug, `the film page for ${slug}`);
    const vt = await b.until('html[data-vt] (pagereveal)', () => document.documentElement.dataset.vt ?? null, null, { soft: true, ms: 5000 });
    const swap = await b.page.evaluate(() => { try { return sessionStorage.getItem('kc:tour:swap'); } catch { return null; } });
    if (vt === 'on') b.say('· html[data-vt]="on": the page arrived by the match cut');
    else b.warn(`html[data-vt]="${vt}": the film page arrived without the match cut (the index's pageswap: ${swap === 'offered' ? 'a view transition was offered' : 'no view transition'})`);
    await b.hold('', 1800);
  }],

  ['07', 'lightbox', async (b, T) => {
    await b.film();
    const first = (await b.rect(SEL.frame)) ? SEL.frame : SEL.anyFrame;
    await b.wheelTo(first, { at: Math.round(T.h * 0.2) });
    await b.until('frame 01 painted', s => { const i = document.querySelector(s)?.querySelector('img'); return Boolean(i?.complete && i.naturalWidth); }, first, { soft: true, ms: 8000 });
    await b.glideTo(first, { ms: 900 });
    await b.pause(500);   // project.js fetches lightbox.js when the pointer first reaches a frame
    await b.click();
    await b.until('the lightbox open (dialog.lightbox[open], html.modal-open)', () => Boolean(document.querySelector('dialog.lightbox[open]')) && document.documentElement.classList.contains('modal-open'));
    await b.until('its picture', () => { const i = document.querySelector('dialog.lightbox[open] [data-lb-img]'); return Boolean(i?.complete && i.naturalWidth); }, null, { soft: true, ms: 6000 });
    await b.hold('', 1400);
    const total = Number(await b.page.$eval('dialog.lightbox [data-lb-total]', el => el.textContent)) || 1;
    for (let i = 0; i < 3; i++) { await b.key('ArrowRight'); await b.pause(750); }
    const want = pad2(Math.min(4, total));   // no wrap: a set of three stops on its last frame
    await b.until(`frame ${want} of ${pad2(total)}`, w => document.querySelector('dialog.lightbox [data-lb-n]')?.textContent === w, want, { soft: true, ms: 3000 });
    await b.hold(want, 1200);
    await b.key('i');
    await b.until('the info panel (#lightbox-info)', () => document.getElementById('lightbox-info')?.hidden === false);
    await b.hold('info', 1500);
    await b.key('Escape');
    await b.until('the lightbox closed, focus back on the frame', s => !document.querySelector('dialog.lightbox[open]') && !document.documentElement.classList.contains('modal-open') && document.activeElement === document.querySelector(s), first, { soft: true });
    await b.pause(600);
  }],

  ['08', 'sequence', async (b) => {
    await b.film();
    if (await b.rect('.sequence')) {
      await b.wheelTo('.sequence', { at: 90 });
      await b.until('the sequence painted', () => [...document.querySelectorAll('.sequence .frame')].every(f => f.querySelector('img')?.complete), null, { soft: true, ms: 8000 });
      await b.glideTo('.sequence .frame', { nth: 1, ms: 900 });
      await b.hold('', 1500);
    } else b.warn('this film has no .sequence');
    if (await b.rect('.film-plot')) {
      await b.wheelTo('.film-plot', { at: 90 });
      await b.until('the lighting plot drawn', () => (document.querySelector('.film-plot__svg')?.childElementCount ?? 0) > 2, null, { soft: true, ms: 8000 });
      await b.glideTo('.film-plot__svg', { fx: 0.5, fy: 0.45, ms: 1000 });
      await b.hold('plot', 1600);
    } else b.warn('this film has no .film-plot');
  }],

  ['09', 'pager', async (b, T) => {
    await b.film();
    if (!(await b.rect(SEL.next))) throw new Error(`no ${SEL.next} in the pager`);
    await b.wheelTo('.film__pager', { at: Math.round(T.h * 0.42) });
    const title = `${SEL.next} .film__pager-title`;   // onto the film's name, not the middle of the link's box
    await b.glideTo((await b.rect(title)) ? title : SEL.next, { ms: 1000 });
    await b.hold('', 1200);
    const slug = await b.page.$eval(SEL.next, a => new URL(a.href).searchParams.get('slug'));
    await b.follow(u => u.pathname.endsWith('/project.html') && u.searchParams.get('slug') === slug, `the next film (${slug})`);
    await b.hold('next', 1800);
  }],
];

/** Run one beat under its timeout; a failure is logged with a still of where it stopped. */
async function runBeat(T, [n, name, fn], log) {
  const b = beatKit(T, n, name), t0 = Date.now(), from = log.length;
  console.log(`  ${n} ${name}`);
  let timer = 0, ok = true;
  try {
    const work = fn(b, T);
    work.catch(() => {});   // a beat cut off by its timeout may still reject later
    await Promise.race([work, new Promise((_, no) => { timer = setTimeout(() => no(new Error(`timed out after ${secs(BEAT_MS)}`)), BEAT_MS); })]);
  } catch (e) {
    ok = false;
    b.state.dead = true;
    if (partial) { console.log('…'); partial = false; }
    T.failed.push(`${n} ${name}: ${e.message}`);
    console.log(`    ✗ ${e.message}`);
    const file = path.join(T.dir, `${n}-${name}-failed.png`);
    await T.page.screenshot({ path: file }).then(() => T.stills.push({ file, label: `${n} ${name} · FAILED` })).catch(() => {});
  } finally { clearTimeout(timer); b.state.dead = true; }
  for (const e of log.slice(from)) console.log(`    ${e.startsWith('requestfailed:') ? '·' : '!'} ${e}`);
  T.beats.push({ n, name, ok, ms: Date.now() - t0 });
  console.log(`  ${ok ? '✓' : '✗'} ${n} ${name} ${secs(Date.now() - t0)}`);
}

// ---------------------------------------------------------------- one size
async function tour(browser, srv, { w, h, data, opt, tmp }) {
  const tag = `${w}x${h}`, dir = path.join(opt.out, tag);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d\d-.*\.png$/.test(f)) fs.rmSync(path.join(dir, f));   // the last run's stills
  console.log(`\ntour ${tag} → ${rel(dir)}`);
  const context = await browser.newContext({ ...contextOptions({ w, h }), recordVideo: { dir: path.join(tmp, tag), size: { width: w, height: h } } });
  await context.addInitScript(prepare, { arrow: ARROW });
  const page = await context.newPage();
  const log = collectErrors(page);
  const T = { tag, w, h, dir, srv, data, context, page, cdp: null, mx: w * 0.6, my: h * 0.7, stills: [], beats: [], failed: [], warns: [], problems: [] };
  const video = page.video();
  const t0 = Date.now();
  try {
    T.cdp = await context.newCDPSession(page);
    // A white pre-roll: the site's first frame is the first dark one, easy to find (and cut to) in the video.
    await page.setContent('<!doctype html><html style="background:#fff"></html>');
    await sleep(500);
    await runBeat(T, ['00', 'load', b => b.go('index.html')], log);
    for (const beat of BEATS) if (!opt.only || opt.only.some(s => matches(beat, s))) await runBeat(T, beat, log);
  } catch (e) {
    T.problems.push(`${tag}: ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();   // finishes the video
  }
  T.recorded = Date.now() - t0;
  T.webm = await video?.path().catch(() => null);
  T.errors = log.filter(e => !e.startsWith('requestfailed:'));
  return T;
}

// ---------------------------------------------------------------- contact sheet
/** Every still of a run on one labelled sheet, in tour order: <out>/contact-<w>x<h>.jpg. */
async function sheet(browser, srv, T, file) {
  if (!T.stills.length) throw new Error('no stills to put on it');
  const ctx = await browser.newContext(contextOptions({ w: 1920, h: 1080 }));
  try {
    const page = await ctx.newPage();
    await page.route(`${srv.url}__tour/*`, r => r.fulfill({ path: T.stills[Number(path.posix.basename(new URL(r.request().url()).pathname, '.png'))].file }));
    const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
    const cols = T.stills.length > 12 ? 5 : 4;
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${srv.url}">
<link rel="stylesheet" href="assets/css/fonts.css"><link rel="stylesheet" href="assets/css/tokens.css">
<style>
  body { margin: 0; padding: 20px; background: var(--ink-1); color: var(--paper-2); font: 13px/1.4 var(--font-mono); }
  h1 { margin: 0 0 14px; font: 500 14px/1.2 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--paper); }
  ol { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 16px 12px; margin: 0; padding: 0; list-style: none; }
  img { display: block; width: 100%; height: auto; outline: 1px solid var(--line); }
  p { margin: 6px 0 0; }
</style></head><body>
<h1>Tour · ${T.w}×${T.h} · ${T.stills.length} stills · ${T.beats.filter(x => x.ok).length}/${T.beats.length} steps ok</h1>
<ol>${T.stills.map((s, i) => `<li><img src="__tour/${i}.png" alt=""><p>${esc(s.label)}</p></li>`).join('')}</ol>
</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true });
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------- video
/** Seconds into a raw recording where the site first paints: the first dark frame after the white pre-roll. */
async function firstFrame(webm) {
  const file = webm.replace(/\.webm$/, '.luma.txt');
  await run(FFMPEG, ['-v', 'error', '-i', webm, '-vf', `signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${file}`, '-f', 'null', '-']);
  let t = 0, white = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const pts = /pts_time:([\d.]+)/.exec(line), y = /YAVG=([\d.]+)/.exec(line);
    if (pts) t = Number(pts[1]);
    else if (y && Number(y[1]) > 160) white = true;
    else if (y && white && Number(y[1]) < 100) return t;
  }
  return 0;
}

/** The raw recording → <out>/tour-<w>x<h>.mp4: from the site's first frame, H.264 yuv420p, BT.709, faststart. */
async function encode(T, opt) {
  if (!T.webm || !fs.existsSync(T.webm)) throw new Error('no recording');
  T.mp4 = path.join(opt.out, `tour-${T.tag}.mp4`);
  T.leadIn = await firstFrame(T.webm);
  // Playwright's VP8 is BT.601: YUV709 converts the matrix as well as tagging it.
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', T.leadIn.toFixed(3), '-i', T.webm, '-vf', YUV709,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...BT709_TAGS,
    '-movflags', '+faststart', '-an', T.mp4]);
  if (opt.keepWebm) fs.copyFileSync(T.webm, path.join(opt.out, `tour-${T.tag}.webm`));
  const p = T.probe = await probe(T.mp4);
  T.faststart = checkFaststart(T.mp4).ok;
  const wrong = [
    p.codec_name !== 'h264' && `codec ${p.codec_name}`, p.pix_fmt !== 'yuv420p' && `pixels ${p.pix_fmt}`,
    [p.color_space, p.color_primaries, p.color_transfer].some(c => c !== 'bt709') && `colour ${p.color_space}/${p.color_primaries}/${p.color_transfer}`,
    !T.faststart && 'moov after mdat',
  ].filter(Boolean);
  if (wrong.length) T.problems.push(`${rel(T.mp4)}: ${wrong.join(', ')}`);
}

// ---------------------------------------------------------------- main
function report(runs) {
  console.log('\n== Tour');
  for (const T of runs) {
    console.log(`${T.tag}: ${T.beats.filter(x => x.ok).length}/${T.beats.length} steps ok · ${T.stills.length} stills · ${T.errors.length} console/page errors · ${T.warns.length} warnings · recorded in ${secs(T.recorded ?? 0)}`);
    if (T.probe) {
      const p = T.probe, mb = (fs.statSync(T.mp4).size / 1048576).toFixed(1);
      console.log(`  video  ${rel(T.mp4)}  ${p.duration.toFixed(1)} s from ${T.leadIn.toFixed(2)} s of the raw recording · ${p.width}×${p.height} ${p.fps} fps ${p.codec_name} ${p.pix_fmt} ${p.color_space}/${p.color_primaries}/${p.color_transfer} · ${T.faststart ? 'faststart' : 'moov after mdat'} · ${mb} MB`);
    }
    console.log(`  stills ${rel(T.dir)}/ (${T.stills.length})`);
    if (T.sheet && fs.existsSync(T.sheet)) console.log(`  sheet  ${rel(T.sheet)}`);
    console.log(`  beats  ${T.beats.map(x => `${x.n} ${x.name} ${secs(x.ms)}${x.ok ? '' : ' ✗'}`).join(' · ')}`);
    for (const f of [...T.failed, ...T.problems]) console.log(`  FAIL  ${f}`);
    for (const e of T.errors) console.log(`  ERROR ${e}`);
    for (const w of T.warns) console.log(`  WARN  ${w}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  let opt;
  try { opt = parseArgs(argv); } catch (e) { console.error(`tour: ${e.message}\n\n${USAGE}`); return 2; }
  if (opt.help) { console.log(USAGE); return 0; }
  if (!hasFfmpeg()) { console.error('tour: ffmpeg was not found on PATH (it converts the videos and finds their first frame).'); return 1; }
  const data = (await import(pathToFileURL(path.join(REPO_ROOT, 'data/portfolio.js')).href)).default;
  fs.mkdirSync(opt.out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-tour-'));
  const runs = [];
  let srv, browser;
  try {
    srv = await startServer();
    // Software 2D canvas, as in check.mjs and record.mjs (an accelerated one blurs 3–30× slower under
    // SwiftShader), and Chromium's own software compositor: SwiftShader's GL composites a 1920×1080 page
    // at about 4 fps here and falls behind the wheel, the software compositor at about 20 fps. WebGL
    // still runs on SwiftShader.
    browser = await launch({ args: ['--disable-accelerated-2d-canvas', '--disable-gpu-compositing'] });
    for (const [w, h] of opt.sizes) runs.push(await tour(browser, srv, { w, h, data, opt, tmp }));
    for (const T of runs) {
      T.sheet = path.join(opt.out, `contact-${T.tag}.jpg`);
      await sheet(browser, srv, T, T.sheet).catch(e => T.problems.push(`contact sheet: ${e.message.split('\n')[0]}`));
    }
  } finally {
    await browser?.close();
    await srv?.close();
  }
  // Encoded once the browser has gone: x264 would take the CPUs from a recording in progress.
  for (const T of runs) await encode(T, opt).catch(e => T.problems.push(`video: ${e.message.split('\n')[0]}`));
  fs.rmSync(tmp, { recursive: true, force: true });
  report(runs);
  return runs.some(T => T.failed.length || T.problems.length || T.errors.length) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), err => { console.error(err); process.exit(1); });
}
