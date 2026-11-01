// Check plugin (static + browser): Selected work's "Frames | Index" views (site/work-index.js, work.css,
// print.css) and the desktop layer's re-arm when the view changes (motion/index.js, motion/work.js).
//
//   static  work: renderWorkIndex is a real table (a caption, the nine scope="col" headings, one
//           th scope="row" per film holding the row's only link) and renderWork puts the toggle (a
//           labelled role="group" of two aria-pressed buttons) in the section head; for the real data
//           and the fixture; no root-relative or script URL.
//   browser work, on the index page:
//     1440×900, armed: Frames → Index drops html.work-rail and the work-rail ScrollTrigger, keeps focus
//       on the pressed button and the toggle where it was on screen, and stores the view; one row per
//       film, every one on the first screen when the nav's Work link lands the Index view; hovering row 2 puts film 2 in the pane (one [data-preview-frame], its picture not cropped)
//       and softens every other row, never the hovered one; Tab to a row puts its film in the pane and
//       blurs nothing; Motion off then leaves no inline motion style and no blur; a reload keeps the
//       view; Index → Frames re-pins the strip with the toggle still in its place; Motion off at the
//       end leaves no inline motion style in <main>.
//     1366×768: the pinned strip still fits after a round trip through the Index view.
//     390×844, touch: the toggle switches the views (Year, Title, Format, Aspect), no desktop layer; Tab
//       to each title draws its ring round the title's lines only (no empty line box after a wrapped one).
//     No JavaScript (the generated index.html): the table and every title show; the frames, the toggle
//       and the pane do not.
//     Print media: every column; the frames, the toggle and the pane are off the page.
//     The fixture at 1920×1080 (a real film with a featured still and filled credits): the pane shows the
//       real still, not cropped, and the row has no SAMPLE badge (screenshot fixture--work-index--…).
//     Hover previews (P1), the fixture at 1440×900 with the test clip (a VP9 copy: this Chromium has no
//       H.264 decoder; the reel check makes the same file) as films[0].preview: the
//       card shows its still without the camera move; hovering plays the muted clip and fades it in;
//       leaving fades it out, then pauses and unloads it (no src); under Motion off a hover plays nothing.
//   Screenshots: .artifacts/screens/work--index--{1440x900,390x844}.png.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const HEADINGS = ['No', 'Year', 'Title', 'Director', 'Production / Platform', 'Format', 'Aspect', 'Camera / Lens', 'Premiere'];
const ASPECT_TOLERANCE = 0.015;

/** Root-relative and script URLs in markup: attributes and every srcset candidate. */
function badUrls(markup) {
  const s = String(markup), hits = [];
  for (const m of s.matchAll(/\b(?:href|src|poster)\s*=\s*"\s*(?:\/(?!\/)|javascript:)[^"]*"/gi)) hits.push(m[0]);
  for (const m of s.matchAll(/\bsrcset\s*=\s*"([^"]*)"/g)) if (m[1].split(',').some(c => /^\/(?!\/)/.test(c.trim()))) hits.push(m[0]);
  return hits;
}

async function runStatic({ pass, fail, R, abs, loadData, fixture }) {
  const W = await import(pathToFileURL(abs('assets/js/site/work-index.js')).href);
  for (const [name, d] of [['data/portfolio.js', await loadData()], ['the fixture', fixture.fixtureData()]]) {
    const n = (d.films ?? []).length;
    const table = String(W.renderWorkIndex(d)), work = String(R.renderWork(d));
    const probs = [];
    if (!/<table class="work-index__table">\s*<caption class="visually-hidden">[^<]+<\/caption>/.test(table)) probs.push('no caption first in the table');
    const cols = [...table.matchAll(/<th class="work-index__[a-z]+" scope="col">([^<]*)<\/th>/g)].map(m => m[1]);
    if (cols.join('|') !== HEADINGS.join('|')) probs.push(`headings ${JSON.stringify(cols)}`);
    const rowHeads = [...table.matchAll(/<th class="work-index__film" scope="row"><a class="work-index__link" href="project\.html\?slug=[^"]+"><span class="work-index__title">/g)].length;
    if (rowHeads !== n) probs.push(`${rowHeads} th scope="row" title links for ${n} films`);
    if ((table.match(/<a\b/g) ?? []).length !== n) probs.push('a row holds a link other than its title');
    if (!/<div class="section-head__tools"><div class="work-view" role="group" aria-label="Selected work view"><button class="work-view__btn" type="button" data-view="frames" aria-pressed="true">Frames<\/button><button class="work-view__btn" type="button" data-view="index" aria-pressed="false">Index<\/button><\/div><\/div>/.test(work)) probs.push('the toggle is not in the section head');
    if (!/<div class="work-index__preview" aria-hidden="true">[\s\S]*data-preview-frame data-film=/.test(table)) probs.push('no aria-hidden preview pane with a [data-preview-frame]');
    probs.push(...badUrls(table + work).map(h => `URL ${h}`));
    if (probs.length) fail(`work index from ${name}: ${probs.join('; ')}`);
    else pass(`work index from ${name}: a table with a caption, the ${HEADINGS.length} headings and ${n} th scope="row" title links (the only links); the toggle in the section head; relative URLs only`);
  }
}

// ------------------------------------------------------------------------------------------------ browser

/** The view, the strip and the toggle, read from the page. */
const viewState = page => page.evaluate(() => {
  const root = document.documentElement, a = document.activeElement;
  const btn = v => document.querySelector(`.work-view [data-view="${v}"]`);
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  let stored = null;
  try { stored = localStorage.getItem('kc:work-view'); } catch { /* blocked */ }
  return {
    view: root.dataset.workView, stored, rail: root.classList.contains('work-rail'),
    trigger: !!window.__motion?.ScrollTrigger.getById('work-rail'), spacers: document.querySelectorAll('.pin-spacer').length,
    pinned: !!window.__motion?.ScrollTrigger.getById('work-rail')?.isActive,
    pressed: { frames: btn('frames')?.getAttribute('aria-pressed'), index: btn('index')?.getAttribute('aria-pressed') },
    focus: a?.matches?.('.work-view__btn') ? a.dataset.view : (a?.className || a?.tagName || null),
    tops: { frames: Math.round(btn('frames')?.getBoundingClientRect().top ?? NaN), index: Math.round(btn('index')?.getBoundingClientRect().top ?? NaN) },
    grid: shown(document.querySelector('#work .work-grid')), table: shown(document.querySelector('.work-index__table')),
    rows: [...document.querySelectorAll('tr.work-index__row')].filter(shown).length,
    // Rows wholly on the first screen, and where the last one ends.
    onScreen: [...document.querySelectorAll('tr.work-index__row')].filter(r => shown(r) && r.getBoundingClientRect().top >= 0 && r.getBoundingClientRect().bottom <= innerHeight + 0.5).length,
    lastBottom: Math.round(document.querySelector('tr.work-index__row:last-child')?.getBoundingClientRect().bottom ?? NaN),
  };
});

/** The pane and each row's softening (the title cell's filter and opacity). */
const paneState = page => page.evaluate(() => {
  const frames = [...document.querySelectorAll('.work-index__preview [data-preview-frame]')];
  const img = frames[0]?.querySelector('img');
  const r = img?.getBoundingClientRect();
  return {
    film: frames[0]?.dataset.film ?? null, frames: frames.length,
    logline: document.querySelector('.work-index__logline')?.textContent.trim() ?? '',
    img: img && img.complete && img.naturalWidth ? { src: img.currentSrc || img.src, box: r.width / r.height, nat: img.naturalWidth / img.naturalHeight } : null,
    rows: [...document.querySelectorAll('tr.work-index__row')].map(tr => {
      const cs = getComputedStyle(tr.querySelector('th'));
      return { film: tr.dataset.film, filter: cs.filter, opacity: Number(cs.opacity) };
    }),
  };
});

/** Inline styles the motion layer animates, left inside <main> or the header (as the motion section reads them). */
const motionLeftovers = page => page.evaluate(() => [...document.querySelectorAll('main [style], header [style]')]
  .filter(e => !e.closest('[data-study-host], .still-move, .player, canvas, .previs-slot__plan, svg'))
  .filter(e => /(^|;)\s*(transform|translate|rotate|scale|clip-path|opacity|visibility|--p[sxy])\s*:/.test(e.getAttribute('style')))
  .map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`));

const idle = page => page.evaluate(() => Promise.race([window.__motion?.idle, new Promise(r => setTimeout(r, 6000))])).then(() => page.waitForTimeout(400));
const armedNow = page => page.waitForFunction(() => window.__motion?.armed === true, null, { timeout: 15000 }).then(() => true, () => false);
/** Bring Selected work's head into the window, its top `off` px below the window's top. */
const toWork = (page, off) => page.evaluate(off => {
  const m = window.__motion, el = document.getElementById('work');
  if (m?.lenis) { m.lenis.resize(); m.lenis.scrollTo(el, { immediate: true, force: true, offset: -off }); m.ScrollTrigger.update(); } else scrollTo(0, el.getBoundingClientRect().top + scrollY - off);
}, off).then(() => page.waitForTimeout(500));

async function desktop(api, { films }) {
  const { pass, fail, browser, watch, abs } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  const tag = 'work 1440×900';
  const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const { errors } = watch(page, srv);
  try {
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    if (!(await armedNow(page))) return fail(`${tag}: the desktop layer did not arm within 15 s`);
    await idle(page);

    // 0. A block waiting for its entrance is transparent, never visibility: hidden (motion/*.js animate
    //    opacity): nothing leaves the Tab order or the accessibility tree, and Tab from the hero's call to
    //    action reaches the toggle before the first card.
    const hid = await page.evaluate(() => [...document.querySelectorAll('main a[href], main button, footer a[href], footer button')]
      .filter(e => e.getClientRects().length && getComputedStyle(e).visibility === 'hidden').map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)));
    await page.focus('.hero__cta');
    const order = [];
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement?.dataset.view ?? String(document.activeElement?.className ?? ''))); }
    if (hid.length || order.join() !== 'frames,index') fail(`${tag}: at arm ${hid.length} link(s) or button(s) are visibility: hidden (${hid.slice(0, 4).join(', ')}); Tab from the call to action reached ${order.join(' → ')}`);
    else pass(`${tag}: at arm no link or button is visibility: hidden, and Tab from the call to action reaches Frames, then Index, before the first card`);

    // 1. Frames → Index, from inside the pinned strip (the toggle is in the pinned box).
    await page.evaluate(() => {
      const m = window.__motion, st = m.ScrollTrigger.getById('work-rail');
      m.lenis.resize();
      if (st) m.lenis.scrollTo(st.start + 40, { immediate: true, force: true });
      m.ScrollTrigger.update();
    });
    await page.waitForTimeout(500);
    const s0 = await viewState(page);
    await page.click('.work-view [data-view="index"]');
    await idle(page);
    const s1 = await viewState(page);
    const p1 = [];
    if (!s0.rail || !s0.pinned) p1.push(`the strip was not pinned before (rail ${s0.rail}, pinned ${s0.pinned})`);
    if (s1.view !== 'index' || s1.stored !== 'index') p1.push(`view ${s1.view}, stored ${s1.stored}`);
    if (s1.rail || s1.trigger || s1.spacers) p1.push(`html.work-rail ${s1.rail}, work-rail trigger ${s1.trigger}, ${s1.spacers} pin spacer(s)`);
    if (s1.pressed.index !== 'true' || s1.pressed.frames !== 'false') p1.push(`aria-pressed ${JSON.stringify(s1.pressed)}`);
    if (s1.focus !== 'index') p1.push(`focus on ${s1.focus}`);
    if (Math.abs(s1.tops.index - s0.tops.index) > 8) p1.push(`the toggle moved ${s0.tops.index} → ${s1.tops.index} px`);
    if (s1.grid || !s1.table) p1.push(`grid shown ${s1.grid}, table shown ${s1.table}`);
    if (s1.rows !== films.length) p1.push(`${s1.rows} rows for ${films.length} films`);
    if (p1.length) fail(`${tag}: Frames → Index: ${p1.join('; ')}`);
    else pass(`${tag}: Frames → Index, clicked inside the pinned strip, unpins it (no html.work-rail, no work-rail ScrollTrigger, no pin spacer), shows ${s1.rows} rows, keeps focus on the pressed Index button and the toggle at ${s1.tops.index} px (was ${s0.tops.index}); stored in localStorage`);

    // 1b. The scannable view: the nav's Work link lands the Index with every row on the first screen under
    //     the head (rows 64–72 px, as planned), not a row cut off by the fold.
    await page.click('.site-nav a[href$="#work"]');
    await page.waitForTimeout(2500);
    const s1b = await viewState(page);
    if (s1b.onScreen !== s1b.rows) fail(`${tag}: the nav's Work link in the Index view shows ${s1b.onScreen} of ${s1b.rows} rows on the first screen (the last ends at ${s1b.lastBottom} px of 900)`);
    else pass(`${tag}: the nav's Work link in the Index view shows all ${s1b.rows} rows on the first screen (the last ends at ${s1b.lastBottom} px of 900)`);

    // 2. Hover row 2: its film in the pane, the other rows softened, the hovered one sharp.
    await page.locator('tr.work-index__row').nth(1).hover();
    const hovered = await page.waitForFunction(slug => document.querySelector('.work-index__preview [data-preview-frame]')?.dataset.film === slug
      && document.querySelector('.work-index__preview [data-preview-frame] img')?.complete, films[1].slug, { timeout: 15000 }).then(() => true, () => false);
    await page.waitForTimeout(700);
    const h = await paneState(page);
    const p2 = [];
    if (!hovered) p2.push(`the pane shows ${h.film}, not ${films[1].slug}`);
    if (h.frames !== 1) p2.push(`${h.frames} [data-preview-frame] elements`);
    if (h.logline !== (films[1].logline ?? '')) p2.push(`logline "${h.logline.slice(0, 40)}…"`);
    if (!h.img) p2.push('no picture in the pane');
    else if (Math.abs(h.img.box / h.img.nat - 1) > ASPECT_TOLERANCE) p2.push(`the pane's picture is cropped or stretched (box ${h.img.box.toFixed(3)} vs natural ${h.img.nat.toFixed(3)})`);
    const sharp = h.rows[1], soft = h.rows.filter((_, i) => i !== 1);
    if (sharp?.filter !== 'none' || sharp.opacity < 0.99) p2.push(`the hovered row is softened (${sharp?.filter}, ${sharp?.opacity})`);
    if (soft.some(r => !/blur\(1\.5px\)/.test(r.filter) || Math.abs(r.opacity - 0.5) > 0.05)) p2.push(`other rows: ${soft.map(r => `${r.filter} ${r.opacity}`).join(', ')}`);
    if (p2.length) fail(`${tag}: hover row 2: ${p2.join('; ')}`);
    else pass(`${tag}: hovering row 2 puts ${films[1].slug} in the pane (one frame, picture box ${h.img.box.toFixed(3)} vs natural ${h.img.nat.toFixed(3)}: not cropped) and softens the ${soft.length} other rows (blur 1.5px, opacity 0.5), never the hovered one`);
    await page.screenshot({ path: abs('.artifacts/screens/work--index--1440x900.png') });

    // 3. Keyboard: Tab from the toggle to row 1, then row 2; the pane follows, nothing blurs.
    const title = await page.locator('#work-title').boundingBox();
    await page.mouse.move(title.x + 10, title.y + 10);
    await page.locator('.work-view [data-view="index"]').focus();
    const tabbed = [];
    for (const i of [0, 1]) {
      await page.keyboard.press('Tab');
      await page.waitForFunction(slug => document.querySelector('.work-index__preview [data-preview-frame]')?.dataset.film === slug, films[i].slug, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(450);
      const k = await paneState(page);
      const on = await page.evaluate(() => document.activeElement?.closest('tr')?.dataset.film ?? document.activeElement?.className);
      tabbed.push({ on, pane: k.film, blurred: k.rows.filter(r => r.filter !== 'none' || r.opacity < 0.99).length });
    }
    if (tabbed.some((t, i) => t.on !== films[i].slug || t.pane !== films[i].slug || t.blurred)) fail(`${tag}: Tab: ${JSON.stringify(tabbed)}`);
    else pass(`${tag}: Tab to rows 1 and 2 puts each film in the pane; no row blurs on keyboard focus`);

    // 4. Motion off in the Index view: nothing left inline, no blur; back on.
    await page.locator('tr.work-index__row').nth(2).hover();
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-motion-toggle]').click());
    await page.waitForTimeout(700);
    const offLeft = await motionLeftovers(page);
    const offBlur = (await paneState(page)).rows.filter(r => r.filter !== 'none').length;
    if (offLeft.length || offBlur) fail(`${tag}: Motion off in the Index view left inline motion styles on ${[...new Set(offLeft)].slice(0, 4).join(', ') || 'nothing'} and ${offBlur} blurred row(s)`);
    else pass(`${tag}: Motion off in the Index view: no inline motion style in <main>, no row blurred under the pointer`);
    await page.evaluate(() => document.querySelector('[data-motion-toggle]').click());
    await armedNow(page);

    // 5. A reload keeps the view (html[data-work-view] from localStorage before the first paint).
    await page.reload({ waitUntil: 'load', timeout: 45000 });
    const early = await page.evaluate(() => document.documentElement.dataset.workView);
    await armedNow(page);
    await idle(page);
    const s5 = await viewState(page);
    if (early !== 'index' || s5.view !== 'index' || s5.rail || s5.trigger || s5.grid || !s5.table || s5.pressed.index !== 'true') fail(`${tag}: after a reload: ${JSON.stringify({ early, ...s5 })}`);
    else pass(`${tag}: a reload keeps the Index view (html[data-work-view] "index" at load, no strip, Index pressed)`);

    // 6. Index → Frames re-pins the strip; the toggle stays where it was.
    await toWork(page, 140);
    const s6a = await viewState(page);
    await page.click('.work-view [data-view="frames"]');
    await idle(page);
    const s6 = await viewState(page);
    const p6 = [];
    if (s6.view !== 'frames' || s6.stored !== 'frames' || !s6.rail || !s6.trigger || !s6.spacers) p6.push(`view ${s6.view}, stored ${s6.stored}, html.work-rail ${s6.rail}, trigger ${s6.trigger}, ${s6.spacers} pin spacer(s)`);
    if (s6.focus !== 'frames' || s6.pressed.frames !== 'true') p6.push(`focus on ${s6.focus}, aria-pressed ${JSON.stringify(s6.pressed)}`);
    if (Math.abs(s6.tops.frames - s6a.tops.frames) > 8) p6.push(`the toggle moved ${s6a.tops.frames} → ${s6.tops.frames} px`);
    if (!s6.grid || s6.table) p6.push(`grid shown ${s6.grid}, table shown ${s6.table}`);
    if (p6.length) fail(`${tag}: Index → Frames: ${p6.join('; ')}`);
    else pass(`${tag}: Index → Frames re-pins the strip (html.work-rail, the work-rail ScrollTrigger and its spacer) and keeps the visitor's place: the toggle stays at ${s6.tops.frames} px (was ${s6a.tops.frames}), focus on Frames`);

    // 7. Motion off after the round trip: nothing left inline.
    await page.evaluate(() => document.querySelector('[data-motion-toggle]').click());
    await page.waitForTimeout(700);
    const left = await motionLeftovers(page);
    if (left.length) fail(`${tag}: Motion off after the round trip left inline motion styles on ${[...new Set(left)].slice(0, 4).join(', ')}`);
    else pass(`${tag}: Motion off after Frames → Index → Frames leaves no inline motion style in <main> or the header`);
  } catch (e) {
    fail(`${tag}: ${e.message.split('\n')[0]}`);
  } finally {
    if (errors.length) fail(`${tag}: ${errors.length} console/page error(s): ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
}

async function shortScreen(api) {
  const { fail, browser, stripFits } = api;
  const { browser: chromium, contextOptions, srv } = browser();
  const tag = 'work 1366×768';
  const ctx = await chromium.newContext(contextOptions({ w: 1366, h: 768 }));
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  try {
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    if (!(await armedNow(page))) return fail(`${tag}: the desktop layer did not arm within 15 s`);
    await toWork(page, 0);
    for (const v of ['index', 'frames']) { await page.click(`.work-view [data-view="${v}"]`); await idle(page); }
    await stripFits(page, `${tag} after Frames → Index → Frames`);
  } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
}

async function phone(api, { films }) {
  const { pass, fail, browser, watch, abs } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  const tag = 'work 390×844 (touch)';
  const ctx = await chromium.newContext({ ...contextOptions({ w: 390, h: 844 }), hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  const { errors } = watch(page, srv);
  const asked = [];
  page.on('request', r => { if (/vendor\/(gsap|lenis)\//.test(r.url())) asked.push(r.url().split('/').pop()); });
  try {
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(800);
    await toWork(page, 80);
    await page.locator('.work-view [data-view="index"]').tap();
    await page.waitForTimeout(500);
    const s = await viewState(page);
    const cols = await page.evaluate(() => [...document.querySelectorAll('.work-index__table thead th')].filter(th => getComputedStyle(th).display !== 'none').map(th => th.textContent.trim()));
    await page.screenshot({ path: abs('.artifacts/screens/work--index--390x844.png') });
    // A keyboard on the phone layout: each title's ring traces the title's lines only, never an empty line
    // box after a wrapped title (a stray bracket down to the SAMPLE badge).
    const stray = [];
    await page.focus('.work-view [data-view="index"]');
    for (let k = 0; k < films.length; k++) {
      await page.keyboard.press('Tab');
      stray.push(...await page.evaluate(() => {
        const a = document.activeElement;
        const ringed = [a, a.querySelector('.work-index__title')].filter(e => e && getComputedStyle(e).outlineStyle !== 'none');
        return ringed.flatMap(e => [...e.getClientRects()].filter(r => r.width < 1 || r.height < 1).map(() => `${a.textContent.trim()} (${e === a ? 'link' : 'title'})`));
      }));
    }
    await page.locator('.work-view [data-view="frames"]').tap();
    await page.waitForTimeout(400);
    const back = await viewState(page);
    const probs = [];
    if (s.view !== 'index' || s.grid || !s.table || s.rows !== films.length || s.pressed.index !== 'true') probs.push(`Index: ${JSON.stringify(s)}`);
    if (cols.join('|') !== 'Year|Title|Format|Aspect') probs.push(`columns ${cols.join(', ')}`);
    if (stray.length) probs.push(`a focus ring traces an empty line box: ${stray.join(', ')}`);
    if (back.view !== 'frames' || !back.grid || back.table) probs.push(`back to Frames: ${JSON.stringify(back)}`);
    if (asked.length) probs.push(`requested ${asked.join(', ')}`);
    if (errors.length) probs.push(`${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
    if (probs.length) fail(`${tag}: ${probs.join('; ')}`);
    else pass(`${tag}: the toggle switches Frames ↔ Index (${s.rows} rows: ${cols.join(', ')}); no GSAP or Lenis; no errors`);
  } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
}

async function noScriptAndPrint(api, { data, films }) {
  const { pass, fail, browser } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  const P = await import('../prerender.mjs');
  const html = P.generate(data, P.readPages()).get('index.html');
  const url = srv.url + 'index.html';
  // Without JavaScript: the generated page, as a crawler or a visitor without scripts reads it.
  {
    const ctx = await chromium.newContext({ ...contextOptions({ w: 1440, h: 900 }), javaScriptEnabled: false });
    await ctx.route(url, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      const r = await page.evaluate(() => {
        const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
        const box = document.querySelector('#work [data-render="work"]').getBoundingClientRect().width;
        return {
          titles: [...document.querySelectorAll('.work-index__title')].filter(shown).map(e => e.textContent.trim()),
          cols: [...document.querySelectorAll('.work-index__table thead th')].filter(shown).length,
          width: document.querySelector('.work-index__table').getBoundingClientRect().width / box,
          grid: shown(document.querySelector('#work .work-grid')), toggle: shown(document.querySelector('.work-view')), pane: shown(document.querySelector('.work-index__preview')),
        };
      });
      const missing = films.map(f => f.title).filter(t => !r.titles.includes(t));
      if (missing.length || r.cols !== HEADINGS.length || r.width < 0.98 || r.grid || r.toggle || r.pane) fail(`work without JavaScript, 1440×900: titles missing ${JSON.stringify(missing)}; ${r.cols} columns at ${(r.width * 100).toFixed(0)} % of the width; grid ${r.grid}, toggle ${r.toggle}, pane ${r.pane} shown`);
      else pass(`work without JavaScript (the generated index.html), 1440×900: the index table, full width with all ${r.cols} columns, shows all ${r.titles.length} titles; the frames, the toggle and the pane stay hidden`);
    } catch (e) { fail(`work without JavaScript: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
  // Print: every column, the frames and the pane off the page.
  {
    const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
    await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await armedNow(page);
      await page.emulateMedia({ media: 'print' });
      const r = await page.evaluate(() => {
        const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
        return {
          cols: [...document.querySelectorAll('.work-index__table thead th')].filter(shown).length,
          rows: [...document.querySelectorAll('tr.work-index__row')].filter(shown).length,
          off: ['#work .work-grid', '.work-view', '.work-index__preview', '.site-header', '#studies', '#previs'].filter(s => shown(document.querySelector(s))),
          bg: getComputedStyle(document.body).backgroundColor,
          breaks: getComputedStyle(document.querySelector('tr.work-index__row')).breakInside,
        };
      });
      if (r.cols !== 9 || r.rows !== films.length || r.off.length || r.bg !== 'rgb(255, 255, 255)' || r.breaks !== 'avoid') fail(`work in print: ${JSON.stringify(r)}`);
      else pass(`work in print: white page, the table with all ${r.cols} columns and ${r.rows} rows (break-inside: avoid); the frames, the toggle, the pane, the header, the studies and the previs are off the page`);
    } catch (e) { fail(`work in print: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
}

async function withFixture(api) {
  const { pass, fail, browser, fixture } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  let fx;
  try { fx = fixture.fixtureData(); } catch (e) { return fail(`fixture: ${e.message.split('\n')[0]}`); }
  const film = fx.films?.[0];
  const still = (film?.stills ?? []).find(s => s.featured) ?? film?.stills?.[0];
  if (!film || !still) return fail('fixture: no film with a featured still');
  const tag = 'fixture work 1920×1080';
  const ctx = await chromium.newContext(contextOptions({ w: 1920, h: 1080 }));
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); localStorage.setItem('kc:work-view', 'index'); } catch { /* storage blocked */ } });
  try {
    await fixture.routeFixture(ctx, srv, fx);
    await fixture.stampFixture(ctx);
    const page = await ctx.newPage();
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    await armedNow(page);
    await toWork(page, 0);
    await page.locator('tr.work-index__row').nth(1).hover();
    await page.waitForTimeout(400);
    await page.locator('tr.work-index__row').nth(0).hover();
    await page.waitForFunction(slug => { const f = document.querySelector('.work-index__preview [data-preview-frame]'); return f?.dataset.film === slug && f.querySelector('img')?.complete; }, film.slug, { timeout: 15000 }).catch(() => {});
    // The shot: the section head over the table, the pointer on row 1.
    await page.evaluate(() => { const m = window.__motion; m?.lenis.scrollTo(document.getElementById('work-title'), { immediate: true, force: true, offset: -96 }); m?.ScrollTrigger.update(); });
    const first = await page.locator('tr.work-index__row').nth(0).boundingBox();
    await page.mouse.move(first.x + first.width * 0.4, first.y + first.height / 2);
    await page.waitForTimeout(700);
    const h = await paneState(page);
    const row = await page.evaluate(slug => {
      const tr = [...document.querySelectorAll('tr.work-index__row')].find(r => r.dataset.film === slug);
      return { badge: !!tr?.querySelector('.badge-sample'), dir: tr?.querySelector('.work-index__dir')?.textContent.trim(), premiere: tr?.querySelector('.work-index__premiere')?.textContent.trim() };
    }, film.slug);
    await page.screenshot({ path: fixture.fixtureShot('work-index--1920x1080') });
    const probs = [];
    if (h.film !== film.slug || !h.img || !h.img.src.endsWith(still.src)) probs.push(`pane ${h.film} ${h.img?.src ?? 'no picture'} (want ${still.src})`);
    else if (Math.abs(h.img.box / h.img.nat - 1) > ASPECT_TOLERANCE) probs.push(`the real still is cropped or stretched (box ${h.img.box.toFixed(3)} vs ${h.img.nat.toFixed(3)})`);
    if (row.badge) probs.push('a SAMPLE badge on the real film');
    if (row.dir !== film.director) probs.push(`director "${row.dir}"`);
    if (film.premiere && !row.premiere?.includes(film.premiere.event)) probs.push(`premiere "${row.premiere}"`);
    if (probs.length) fail(`${tag}: ${probs.join('; ')}`);
    else pass(`${tag}: the pane shows the real featured still (${still.src}, box ${h.img.box.toFixed(3)} vs natural ${h.img.nat.toFixed(3)}), the row reads "${row.dir}" and "${row.premiere}", no SAMPLE badge (${fixture.fixtureShot('work-index--1920x1080').split('/').slice(-2).join('/')})`);
  } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
}

async function previews(api, { films }) {
  const { pass, fail, skip, browser, fixture } = api;
  const clip = await fixture.ensureTestWebm().catch(() => null);   // the VP9 test clip: this Chromium has no H.264 decoder
  if (!clip) return skip('hover previews: skipped (no ffmpeg to make the test clip)');
  const { srv, browser: chromium, contextOptions } = browser();
  const slug = films[0].slug, tag = 'fixture hover preview 1440×900';
  let fx;
  try { fx = fixture.fixtureData({ films: { [slug]: { preview: { src: clip } } } }); } catch (e) { return fail(`${tag}: ${e.message.split('\n')[0]}`); }
  const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
  const read = page => page.evaluate(slug => {
    const frame = document.querySelector(`.work-card__link[data-film="${slug}"] [data-card-frame]`), v = frame?.querySelector('video.work-card__preview');
    return { move: !!frame?.querySelector('.still-move'), still: !!frame?.querySelector(':scope > img'), video: !!v, src: v?.getAttribute('src') ?? null,
      paused: v ? v.paused : null, time: v ? Math.round(v.currentTime * 100) / 100 : null, ready: v?.readyState ?? null, muted: v?.muted ?? null,
      opacity: v ? Number(getComputedStyle(v).opacity) : null };
  }, slug);
  try {
    await fixture.routeFixture(ctx, srv, fx);
    await fixture.stampFixture(ctx);
    const page = await ctx.newPage();
    const { errors } = api.watch(page, srv);
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    await armedNow(page);
    await toWork(page, 0);
    const link = page.locator(`.work-card__link[data-film="${slug}"]`);
    await page.waitForFunction(slug => document.querySelector(`.work-card__link[data-film="${slug}"] [data-card-frame]`)?.classList.contains('has-piece'), slug, { timeout: 15000 });
    await link.hover();
    const played = await page.waitForFunction(slug => document.querySelector(`.work-card__link[data-film="${slug}"] video.is-playing`), slug, { timeout: 10000 }).then(() => true, () => false);
    await page.waitForTimeout(900);
    const on = await read(page);
    const title = await page.locator('#work-title').boundingBox();
    await page.mouse.move(title.x + 10, title.y + 10);
    await page.waitForTimeout(700);
    const off = await read(page);
    await page.evaluate(() => document.querySelector('[data-motion-toggle]').click());
    await page.waitForTimeout(700);
    await link.hover();
    await page.waitForTimeout(800);
    const still = await read(page);
    const probs = [];
    if (on.move || !on.still) probs.push(`the card ${on.move ? 'still has its camera move' : 'has no still'}`);
    if (!played || on.paused !== false || !(on.time > 0) || on.src !== clip || on.muted !== true || on.opacity < 0.99) probs.push(`hover: ${JSON.stringify(on)}`);
    if (off.src !== null || off.paused !== true || off.ready !== 0 || off.opacity > 0.01) probs.push(`after leaving: ${JSON.stringify(off)}`);
    if (still.src !== null || still.paused === false) probs.push(`Motion off, hover: ${JSON.stringify(still)}`);
    if (errors.length) probs.push(`${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
    if (probs.length) fail(`${tag}: ${probs.join('; ')}`);
    else pass(`${tag}: the card shows its still without the camera move; a hover plays the muted clip (t ${on.time} s, opacity ${on.opacity}); leaving fades it out and unloads it (no src, readyState 0); under Motion off a hover plays nothing`);
  } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
}

async function runBrowser(api) {
  const { OPT, skip, loadData, abs } = api;
  if (OPT.only && !OPT.only.some(o => 'index'.includes(o))) return skip('skipped: --only does not name the index page');
  const data = await loadData();
  const films = data.films ?? [];
  if (films.length < 2) return skip('skipped: fewer than two films');
  fs.mkdirSync(abs('.artifacts/screens'), { recursive: true });
  await desktop(api, { films });
  await shortScreen(api);
  await phone(api, { films });
  await noScriptAndPrint(api, { data, films });
  await withFixture(api);
  await previews(api, { films });
}

export const staticSections = [
  { name: 'work', title: 'Selected work index: the table, its caption and row headers, the toggle (site/work-index.js)', run: runStatic },
];
export const browserSections = [
  { name: 'work', title: 'Selected work views: Frames ↔ Index on the desktop layer, the pane, rack focus, keyboard, reload, 1366, 390, no JS, print', run: runBrowser },
];
