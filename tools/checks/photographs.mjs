// Check plugin (static + browser): Photographs (site/photographs.js, photographs-main.js, photographs.css,
// photographs.html). They stay hidden until data/portfolio.js has real photographs, so the browser half
// renders the fixture's two series (tools/lib/fixture.mjs) as well as the real data.
//
//   static  photographs:
//     - photographs.html exists (CI stages it), holds its prerender:photographs marker, links
//       photographs.css and boots photographs-main.js;
//     - while the data has no photographs: the page carries robots noindex, its prerendered content
//       says "No photographs yet." and the home page's section renders nothing;
//     - the renderers' markup for the real data and the fixture (every photograph, a set, captions, the
//       cover page): relative URLs only, every photograph an <img> with width, height, alt and
//       loading="lazy", one figure per photograph of the view, no caption unless asked for, 4–6 teaser
//       photographs. The per-school counts are the data section's (tools/lib/schema.mjs warnings).
//   browser photographs, on the index and photographs.html, at the first desktop and phone viewports:
//     - real data: #photographs and its nav and menu items stay hidden, nothing replaces the prerendered
//       page, which says "No photographs yet." and is noindex;
//     - the fixture: the section shows its series and 4–6 photographs and links to the page; the nav and
//       menu items show; the page shows both series, one figure per photograph, two columns from 900 px and
//       one on phones, every photograph whole (box aspect within 1.5 % of the file's), no caption, no
//       robots noindex; ?set=afi, ?captions=1, ?cover=1 and an unknown set; screenshots fixture--photographs…;
//     - print (the fixture, desktop): under print media every figure has break-after: page and the page's
//       chrome is off the paper; "Print / Save as PDF" (by keyboard) loads every photograph before it opens
//       the print dialog; page.pdf() has one page per photograph (plus the cover page with ?cover=1), under
//       15 MB (AFI's limit), saved as .artifacts/screens/fixture--photographs-*.pdf.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ASPECT_TOLERANCE = 0.015;
/** AFI: "one merged PDF … 15 MB or smaller" (https://conservatory.afi.com/admissions-requirements/, checked 2026-10). */
const PDF_LIMIT = 15e6;

/** Root-relative and script URLs in markup. */
function badUrls(markup) {
  return [...String(markup).matchAll(/\b(?:href|src)\s*=\s*"\s*(?:\/(?!\/)|javascript:)[^"]*"/gi)].map(m => m[0]);
}
/** The <img> tags of some markup that lack a width, a height, an alt or loading="lazy". */
const loose = markup => [...String(markup).matchAll(/<img\b[^>]*>/g)].map(m => m[0])
  .filter(t => !/\swidth="\d+"/.test(t) || !/\sheight="\d+"/.test(t) || !/\salt="/.test(t) || !/\sloading="lazy"/.test(t));
const figures = markup => (String(markup).match(/<figure class="photo__figure">/g) ?? []).length;

async function runStatic({ pass, fail, warn, info, R, abs, exists, read, loadData, fixture }) {
  const P = await import('../prerender.mjs');
  const PH = await import(pathToFileURL(abs('assets/js/site/photographs.js')).href);
  const data = await loadData();
  const file = 'photographs.html';
  if (!exists(file)) return fail(`${file} is missing (CI's staging step requires it; tools/prerender.mjs fills it)`);
  const src = read(file);

  // 1. The page.
  let names = [];
  try { names = P.markers(file, src).map(p => p.name); } catch (e) { fail(e.message); }
  const head = src.slice(0, src.search(/<\/head>/i));
  const probs = [];
  if (!names.includes('photographs')) probs.push('no prerender:photographs marker');
  if (!/<link rel="stylesheet" href="assets\/css\/photographs\.css">/.test(head)) probs.push('does not link assets/css/photographs.css (for every medium: its print rules make the PDF)');
  if (!/<script type="module" src="assets\/js\/site\/photographs-main\.js"><\/script>/.test(src)) probs.push('does not load assets/js/site/photographs-main.js');
  if (probs.length) fail(`${file}: ${probs.join('; ')}`);
  else pass(`${file}: prerender markers ${names.join(', ')}; links photographs.css and boots photographs-main.js`);

  // 2. Nothing to show yet: a page that says so, kept out of search, and no home section.
  const noindex = /<meta name="robots" content="noindex">/.test(head);
  let out = null;
  try { out = P.generate(data, P.readPages()).get(file) ?? ''; } catch (e) { info(`the prerendered page is not checked here: tools/prerender.mjs cannot generate the pages (the seo-static section says why): ${e.message}`); }
  if (!R.hasPhotographs(data)) {
    const section = String(PH.renderPhotographsSection(data));
    const issues = [];
    if (!noindex) issues.push(`${file} has no <meta name="robots" content="noindex"> in its head`);
    if (out != null && !/No photographs yet\./.test(out)) issues.push(`the prerendered ${file} does not say "No photographs yet."`);
    if (section) issues.push('renderPhotographsSection() renders a section without photographs');
    if (issues.length) fail(`no photographs yet: ${issues.join('; ')}`);
    else pass(`no photographs yet: ${file} says "No photographs yet." and is noindex; the home page's #photographs and its links stay hidden`);
  } else if (noindex) {
    warn(`${file} still carries robots noindex though data/portfolio.js has photographs: drop the tag (tools/prerender.mjs should write it only while there are none)`);
  } else pass(`${file} has photographs and is open to search engines`);

  // 3. The renderers' markup, for the real data and the fixture.
  const fx = fixture.fixtureData();
  const count = (d, set) => PH.photoSeries(d, { set }).reduce((n, s) => n + s.photos.length, 0);
  const views = [
    ['data/portfolio.js', data, {}],
    ['the fixture', fx, {}],
    ['the fixture ?set=afi', fx, { set: 'afi' }],
    ['the fixture ?captions=1&cover=1', fx, { captions: true, cover: true }],
  ];
  const bad = [];
  for (const [name, d, opts] of views) {
    const page = String(PH.renderPhotographsPage(d, opts));
    const want = count(d, opts.set ?? null);
    for (const h of badUrls(page)) bad.push(`${name}: ${h}`);
    for (const t of loose(page)) bad.push(`${name}: ${t.slice(0, 80)}… needs width, height, alt and loading="lazy"`);
    if (figures(page) !== want) bad.push(`${name}: ${figures(page)} figures for ${want} photographs`);
    const captions = (page.match(/<figcaption/g) ?? []).length;
    if (!opts.captions && captions) bad.push(`${name}: ${captions} caption(s) without ?captions=1 or photographs.captions`);
  }
  const teaser = String(PH.renderPhotographsSection(fx));
  const thumbs = (teaser.match(/<img\b/g) ?? []).length;
  for (const h of badUrls(teaser)) bad.push(`the fixture's home section: ${h}`);
  if (thumbs < Math.min(4, count(fx)) || thumbs > 6) bad.push(`the fixture's home section shows ${thumbs} photographs (4–6)`);
  if (!/id="photographs-title"/.test(teaser) || !/href="photographs\.html"/.test(teaser)) bad.push('the fixture\'s home section lacks its heading id "photographs-title" or its link to photographs.html');
  if (bad.length) fail(`photographs markup: ${bad.slice(0, 6).join('; ')}`);
  else pass(`photographs markup (the real data; the fixture's ${count(fx)} photographs, its AFI set of ${count(fx, 'afi')}, with captions and the cover): relative URLs, every photograph sized, described and lazy, one figure each, captions only when asked for; the home section ${thumbs} photographs`);
  info('The photograph counts each school asks for (AFI 8–12 with portraits, NYU ≤ 10, FAMU 10–15, Łódź 10 or 2 × 5, BFA 10–12) are checked against data/portfolio.js in the data section (tools/lib/schema.mjs).');
}

// ------------------------------------------------------------------------------------------------ browser

/** The index, settled (the main title is skipped: it plays once per session). */
async function openIndex(ctx, api) {
  const { srv } = api.browser();
  const page = await ctx.newPage();
  const { errors } = api.watch(page, srv);
  await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
  await api.settle(page, { name: 'index', path: 'index.html' }, { reduced: false });
  return { page, errors };
}

/**
 * photographs.html, settled: it loads no desktop motion layer, so api.settle() would wait for one in vain.
 * Records whether photographs-main.js replaced the prerendered content (__rerendered).
 */
async function openPhotographs(ctx, api, query = '') {
  const { srv } = api.browser();
  const page = await ctx.newPage();
  const { errors } = api.watch(page, srv);
  await page.addInitScript(() => {
    window.__rerendered = false;
    new MutationObserver(ms => {
      if (document.readyState !== 'loading' && ms.some(m => m.target.matches?.('[data-photographs]'))) window.__rerendered = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(srv.url + `photographs.html${query}`, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { page, errors };
}

/** Every photograph of a scope in view once (they load lazily), then loaded. */
const loadAll = (page, scope) => page.evaluate(async sel => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const imgs = () => [...document.querySelectorAll(`${sel} img`)];
  for (const img of imgs()) { img.scrollIntoView({ block: 'center' }); await wait(60); }
  const t0 = performance.now();
  while (imgs().some(i => !i.complete) && performance.now() - t0 < 10000) await wait(100);
  scrollTo(0, 0);
  await wait(200);
  return imgs().filter(i => !i.naturalWidth).map(i => i.getAttribute('src'));
}, scope);

/** Each photograph's box against its file, and its width/height attributes against the file. */
const shapes = (page, scope) => page.evaluate(sel => [...document.querySelectorAll(`${sel} img`)].map(i => {
  const b = i.getBoundingClientRect(), nat = i.naturalWidth / i.naturalHeight;
  return { src: i.getAttribute('src'), box: b.width / b.height, nat, attr: Number(i.getAttribute('width')) / Number(i.getAttribute('height')), w: Math.round(b.width) };
}), scope);

const pageFacts = page => page.evaluate(() => {
  const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const grid = document.querySelector('.photo-grid');
  return {
    title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    empty: shown(document.querySelector('.photos-empty')) ? document.querySelector('.photos-empty').textContent.trim() : null,
    series: [...document.querySelectorAll('.photo-series__title')].map(h => h.textContent.trim()),
    figures: document.querySelectorAll('.photo__figure').length,
    captions: document.querySelectorAll('.photo__caption').length,
    columns: grid ? getComputedStyle(grid).columnCount : null,
    cover: shown(document.querySelector('.photos-cover')),
    note: document.querySelector('.photos-head__note')?.textContent.trim() ?? null,
    meta: document.querySelector('.photos-head__meta')?.textContent.trim() ?? null,
    slate: document.querySelector('.photos-head__slate')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    print: shown(document.querySelector('[data-print]')),
    rerendered: window.__rerendered,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
});

/** The home page's section and its nav and menu items. */
const sectionFacts = page => page.evaluate(() => {
  const sec = document.getElementById('photographs');
  const item = sel => document.querySelector(sel)?.closest('li');
  return {
    hidden: !sec || sec.hidden || !sec.getBoundingClientRect().height,
    navHidden: !!item('.site-nav a[href$="#photographs"]')?.hidden,
    menuHidden: !!item('.menu__list a[href$="#photographs"]')?.hidden,
    series: [...(sec?.querySelectorAll('.photo-teaser__series a') ?? [])].map(a => a.textContent.trim()),
    thumbs: sec?.querySelectorAll('.photo-teaser__img').length ?? 0,
    link: !!sec?.querySelector('a[href="photographs.html"]'),
    sc: sec?.querySelector('.section-head__slate span')?.textContent.trim() ?? '',
  };
});

/** The pages of a PDF: its page objects (not the /Pages tree). */
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;

async function runBrowser(api) {
  const { OPT, pass, fail, skip, info, browser, fixture, abs } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  if (OPT.only && !OPT.only.some(o => 'index'.includes(o) || 'photographs'.includes(o))) return skip('skipped: --only names neither the index nor photographs');
  const PH = await import(pathToFileURL(abs('assets/js/site/photographs.js')).href);
  const vps = OPT.viewports;
  const desktop = vps.find(([w]) => w >= 1024) ?? vps[0], phone = vps.find(([w]) => w < 720) ?? null;
  const clean = (errors, tag) => (errors.length ? fail(`${tag}: ${errors.length} console/page error(s): ${errors.slice(0, 4).join(' | ')}`) : pass(`${tag}: no console or page errors`));
  const newContext = async ([w, h, dpr = 1], data = null, reduced = false) => {
    const ctx = await chromium.newContext({ ...contextOptions({ w, h, dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' }), hasTouch: w < 720 });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
    if (data) { await fixture.routeFixture(ctx, srv, data); await fixture.stampFixture(ctx); }
    return ctx;
  };
  const fx = fixture.fixtureData();
  const total = set => PH.photoSeries(fx, { set }).reduce((n, s) => n + s.photos.length, 0);
  const seriesTitles = PH.photoSeries(fx).map(s => s.title);

  // --- The real data: no photographs, so nothing of them shows.
  for (const vp of [desktop, phone].filter(Boolean)) {
    const tag = `real data ${vp[0]}×${vp[1]}`;
    const ctx = await newContext(vp);
    try {
      const { page, errors } = await openIndex(ctx, api);
      const s = await sectionFacts(page);
      if (!s.hidden || !s.navHidden || !s.menuHidden || s.thumbs) fail(`${tag}: the home page shows Photographs without any (section hidden ${s.hidden}, nav item hidden ${s.navHidden}, menu item hidden ${s.menuHidden}, ${s.thumbs} photograph(s))`);
      else pass(`${tag}: #photographs and its nav and menu items stay hidden`);
      const { page: pp, errors: perr } = await openPhotographs(ctx, api);
      const f = await pageFacts(pp);
      if (f.empty !== 'No photographs yet.' || f.robots !== 'noindex' || f.figures || f.print || f.overflow) fail(`${tag}: photographs.html reads ${JSON.stringify(f.empty)}, robots ${f.robots}, ${f.figures} figure(s), print button ${f.print}, overflow ${f.overflow}`);
      else if (f.rerendered) fail(`${tag}: photographs-main.js replaced the prerendered page with the same content (its photographs would load twice)`);
      else pass(`${tag}: photographs.html says "${f.empty}", robots noindex, no print button; the prerendered copy stays in place`);
      clean([...errors, ...perr], tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- The fixture: the home section, the nav and menu items, and the page.
  for (const vp of [desktop, phone].filter(Boolean)) {
    const [w, h] = vp, tag = `fixture ${w}×${h}`;
    const ctx = await newContext(vp, fx);
    try {
      const { page, errors } = await openIndex(ctx, api);
      const s = await sectionFacts(page);
      const unloaded = await loadAll(page, '#photographs');
      const sh = await shapes(page, '#photographs');
      const cropped = sh.filter(x => Math.abs(x.box / x.nat - 1) > ASPECT_TOLERANCE);
      if (s.hidden || s.navHidden || s.menuHidden || !s.link || s.thumbs < 4 || s.thumbs > 6 || s.series.join('|') !== seriesTitles.join('|')) fail(`${tag}: home section ${JSON.stringify(s)}`);
      else if (unloaded.length || cropped.length) fail(`${tag}: home section photographs not loaded ${JSON.stringify(unloaded)} or not whole ${JSON.stringify(cropped.map(x => `${x.src} ${x.box.toFixed(3)} vs ${x.nat.toFixed(3)}`))}`);
      else pass(`${tag}: the home page shows Photographs (${s.sc}) with ${s.series.join(' and ')}, ${s.thumbs} photographs whole at their own aspects and the link to the page; the nav and menu items show`);
      await page.locator('#photographs').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.locator('#photographs').screenshot({ path: fixture.fixtureShot(`photographs-section--${w}x${h}`) });

      const { page: pp, errors: perr } = await openPhotographs(ctx, api);
      const f = await pageFacts(pp);
      const missing = await loadAll(pp, '.photos');
      const ps = await shapes(pp, '.photos');
      const notWhole = ps.filter(x => Math.abs(x.box / x.nat - 1) > ASPECT_TOLERANCE);
      const wrongSize = ps.filter(x => Math.abs(x.attr / x.nat - 1) > ASPECT_TOLERANCE);
      const cols = w >= 900 ? '2' : '1';
      const issues = [];
      if (f.series.join('|') !== seriesTitles.join('|')) issues.push(`series ${JSON.stringify(f.series)}`);
      if (f.figures !== total(null)) issues.push(`${f.figures} figures for ${total(null)} photographs`);
      if (f.captions) issues.push(`${f.captions} caption(s) by default`);
      if (f.columns !== cols) issues.push(`column-count ${f.columns} (want ${cols})`);
      if (f.robots) issues.push(`robots ${f.robots} with photographs to show`);
      if (!f.print) issues.push('no Print / Save as PDF button');
      if (f.overflow) issues.push('horizontal overflow');
      if (missing.length) issues.push(`photographs that did not load: ${missing.join(', ')}`);
      if (notWhole.length) issues.push(`photographs not whole: ${notWhole.map(x => `${x.src} ${x.box.toFixed(3)} vs ${x.nat.toFixed(3)}`).join(', ')}`);
      if (issues.length) fail(`${tag} photographs.html: ${issues.join('; ')}`);
      else pass(`${tag} photographs.html: ${f.series.length} series, ${f.figures} photographs in ${f.columns} column(s), each whole (box within ${ASPECT_TOLERANCE * 100} % of its file's aspect, ${Math.min(...ps.map(x => x.w))}–${Math.max(...ps.map(x => x.w))} px wide), no captions, indexable, "${f.meta}"`);
      if (wrongSize.length) fail(`${tag}: width/height in the data do not match the file for ${wrongSize.map(x => x.src).join(', ')} (the page would shift as they load)`);
      // A full-page capture does not wait for off-screen photographs to be decoded again: decode them in paint.
      await pp.evaluate(() => { for (const i of document.images) i.decoding = 'sync'; });
      await pp.screenshot({ path: fixture.fixtureShot(`photographs--${w}x${h}`), fullPage: true });
      clean([...errors, ...perr], tag);

      // The options, on the desktop.
      if (vp === desktop) {
        const checks = [
          ['?set=afi', g => g.figures === total('afi') && /Photographs · AFI set$/.test(g.slate ?? '') && !g.note, g => `${g.figures} photographs, "${g.slate}", "${g.meta}"`],
          ['?captions=1', g => g.captions === PH.photoSeries(fx).flatMap(s => s.photos).filter(p => p.caption).length && g.captions > 0, g => `${g.captions} caption(s)`],
          ['?cover=1&set=afi', g => g.cover && g.figures === total('afi'), g => `the cover page shows, ${g.figures} photographs`],
          ['?set=nope', g => g.figures === total(null) && /no set called “nope”/.test(g.note ?? ''), g => `"${g.note}", ${g.figures} photographs`],
        ];
        for (const [q, ok, say] of checks) {
          const { page: qp, errors: qerr } = await openPhotographs(ctx, api, q);
          const g = await pageFacts(qp);
          if (!ok(g)) fail(`${tag} ${q}: ${JSON.stringify(g)}`);
          else pass(`${tag} ${q}: ${say(g)}`);
          if (q === '?cover=1&set=afi') await qp.screenshot({ path: fixture.fixtureShot(`photographs-cover--${w}x${h}`) });
          clean(qerr, `${tag} ${q}`);
          await qp.close();
        }
      }
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- Print: one photograph to a page, and the PDF.
  {
    const tag = `fixture print ${desktop[0]}×${desktop[1]}`;
    const ctx = await newContext(desktop, fx);
    try {
      // The print button, by keyboard, while the photographs are still arriving (the server answers each
      // one 1.5 s late): the print dialog opens only once every one has loaded.
      const slow = async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); };
      const isPhoto = u => /\/media\/.+\.(?:jpe?g|webp)$/.test(u.pathname);
      await ctx.route(isPhoto, slow);
      const bp = await ctx.newPage();
      const { errors: berr } = api.watch(bp, srv);
      await bp.goto(srv.url + 'photographs.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await bp.waitForSelector('[data-print]');
      await bp.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push([...document.querySelectorAll('.photo__img')].filter(i => !i.complete || !i.naturalWidth).length); });
      const waiting = await bp.evaluate(() => [...document.querySelectorAll('.photo__img')].filter(i => !i.complete).length);
      await bp.locator('[data-print]').focus();
      await bp.keyboard.press('Enter');
      const status = await bp.locator('[data-print-status]').textContent();
      await bp.waitForFunction(() => window.__printed.length > 0, null, { timeout: 30000 });
      const printed = await bp.evaluate(() => ({ calls: window.__printed, focus: document.activeElement?.matches('[data-print]') ?? false, busy: document.querySelector('[data-print]')?.getAttribute('aria-busy'), status: document.querySelector('[data-print-status]')?.textContent }));
      if (!waiting) fail(`${tag}: every photograph had loaded before the button was pressed, so the wait was not exercised`);
      else if (printed.calls[0] !== 0 || !printed.focus || printed.busy || printed.status) fail(`${tag}: Print / Save as PDF opened the dialog with ${printed.calls[0]} photograph(s) still loading (focus on the button ${printed.focus}, aria-busy ${printed.busy}, status "${printed.status}")`);
      else pass(`${tag}: Print / Save as PDF (Enter), pressed with ${waiting} photograph(s) still arriving, said "${status}" and opened the print dialog only once every one had loaded; focus stays on the button`);
      clean(berr, `${tag} print button`);
      await ctx.unroute(isPhoto, slow);
      await bp.close();

      const { page, errors } = await openPhotographs(ctx, api);
      await page.emulateMedia({ media: 'print' });
      const p = await page.evaluate(() => ({
        breaks: [...document.querySelectorAll('.photo__figure')].map(f => getComputedStyle(f).breakAfter),
        chrome: ['.site-header', '.site-footer', '.photos-head', '.photo-series__head', '.progress'].filter(sel => [...document.querySelectorAll(sel)].some(el => el.getClientRects().length)),
      }));
      if (p.breaks.length !== total(null) || p.breaks.some(b => b !== 'page')) fail(`${tag}: print media: break-after ${JSON.stringify(p.breaks)}`);
      else if (p.chrome.length) fail(`${tag}: print media: ${p.chrome.join(', ')} still on the paper`);
      else pass(`${tag}: print media: all ${p.breaks.length} figures break-after: page; the header, the page's head, the series heads and the footer stay off the paper`);
      await page.emulateMedia({ media: null });   // page.pdf() prints with whatever media is emulated

      for (const [q, want] of [['', total(null)], ['?set=afi', total('afi')], ['?set=afi&cover=1', total('afi') + 1]]) {
        const { page: qp, errors: qerr } = q ? await openPhotographs(ctx, api, q) : { page, errors: [] };
        // The fixture's stamp hangs off <html>, after the page, where print leaves nothing: it moves to the top of
        // <main>, so every page of the fixture's PDF is framed "FIXTURE DATA" too.
        await qp.evaluate(() => { const st = document.getElementById('kc-fixture-stamp'); if (st) document.querySelector('main').prepend(st); });
        await qp.evaluate(() => dispatchEvent(new Event('beforeprint')));
        await qp.waitForFunction(() => [...document.querySelectorAll('.photo__img')].every(i => i.complete && i.naturalWidth), null, { timeout: 15000 });
        const pdf = await qp.pdf({ format: 'A4' });
        const pages = pdfPages(pdf);
        const name = `photographs${q ? `-${q.slice(1).replace(/[=&]/g, '-')}` : ''}`;
        fs.writeFileSync(fixture.fixtureShot(name).replace(/\.png$/, '.pdf'), pdf);
        const what = `${want - (q.includes('cover') ? 1 : 0)} photographs${q.includes('cover') ? ' + the cover page' : ''}`;
        if (pages !== want || pdf.length >= PDF_LIMIT) fail(`${tag} ${q || '(every photograph)'}: the PDF has ${pages} page(s) for ${what} and weighs ${(pdf.length / 1e6).toFixed(2)} MB (limit ${PDF_LIMIT / 1e6} MB)`);
        else pass(`${tag} ${q || '(every photograph)'}: the A4 PDF has ${pages} pages for ${what}, ${(pdf.length / 1e6).toFixed(2)} MB (under ${PDF_LIMIT / 1e6} MB) → .artifacts/screens/fixture--${name}.pdf`);
        if (q) { clean(qerr, `${tag} ${q}`); await qp.close(); }
      }
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- Reduced motion: nothing on the page moves.
  {
    const tag = `fixture reduced motion ${desktop[0]}×${desktop[1]}`;
    const ctx = await newContext(desktop, fx, true);
    try {
      const { page, errors } = await openPhotographs(ctx, api);
      const r = await page.evaluate(() => ({ anims: document.getAnimations().length, motion: document.documentElement.dataset.motion }));
      if (r.anims || r.motion !== 'off') fail(`${tag}: ${r.anims} running animation(s), data-motion "${r.motion}"`);
      else pass(`${tag}: nothing animates; data-motion "off"`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
  info('PDF pages are counted from the file\'s /Type /Page objects; the PDFs carry the fixture\'s red "FIXTURE DATA" frame on every page.');
}

export const staticSections = [{ name: 'photographs', title: 'Photographs: the page, the empty state, the renderers\' markup', run: runStatic }];
export const browserSections = [{ name: 'photographs', title: 'Photographs (fixture): hidden without photographs; the section, the page, the options, print and the PDF', run: runBrowser }];
