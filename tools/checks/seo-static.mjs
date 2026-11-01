// Check plugin: what crawlers and visitors without JavaScript get (tools/prerender.mjs).
//   static "seo-static"
//     - The prerender markers are present and balanced in index.html and project.html (photographs.html
//       too once it exists), and tools/prerender.mjs generate() succeeds (FAIL otherwise). Committed files
//       that differ from its output are stale: a WARN naming npm run prerender, never a FAIL, because an
//       edit made in GitHub's web editor cannot run it and CI regenerates the files into _site anyway.
//     - The index that ships (generate()'s output) reads as text: its stripped text holds the name, the
//       role, every film title, "Filmography" and the email, and none of the decoration ("Reel 1", "000",
//       "TC 00"). The static project.html names every film.
//     - JSON-LD parses and holds no "</": a Person (#person), an ItemList of exactly the real films, and a
//       VideoObject exactly when a real reel (not placeholder: true), its poster and its upload date exist, with
//       Clip offsets ascending.
//     - Speculation rules parse and never prerender (that would start a page's Players unseen).
//     - sitemap.xml: the home page, photographs.html once it has photographs, and only the real films.
//   browser "static-content" (the generated index.html, served in place of the committed file)
//     - JavaScript off, 1440×900: the film titles and the email are visible and nothing overflows sideways
//       (full-page screenshot .artifacts/screens/nojs--index--1440x900.png).
//     - JavaScript on: the layout shift from the first paint through main.js's re-render and, at 1440 with
//       motion on, the desktop layer's arm (it pins the work strip above every later section) totals at most
//       0.02: from the top (1440 and 390), and arriving on #work, #about, #credits and #contact (1440 with
//       motion on: every film page's Contact pill leads to index.html#contact), on #about, #credits and
//       #contact (1440, reduced motion), and on #about and #contact (390). An arrival must also end on its
//       target, under the header (its top within 6 px of scroll-padding-top).
//     - An arrival on #contact the visitor scrolls away from before the previs plans load (previs.js held
//       2.5 s) stays where the visitor went: nothing aims at the hash again under them. A key pressed
//       while the arrival is held back for its type ends the hold: Tab never focuses an invisible link.
// The text helper is exported for tools/test/prerender.test.mjs.

import fs from 'node:fs';

/** The text a fetch without JavaScript reads: comments, scripts, styles and tags removed, entities decoded. */
export function pageText(html, decode = s => s) {
  const text = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decode(text).replace(/\s+/g, ' ').trim();
}

/** Every JSON-LD block of a page: [{ raw, json | error }]. */
export function jsonLdBlocks(html) {
  return [...String(html).matchAll(/<script\b[^>]*\btype\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(m => {
    try { return { raw: m[1], json: JSON.parse(m[1]) }; } catch (e) { return { raw: m[1], error: e.message }; }
  });
}

const nodesOf = j => [j, ...(Array.isArray(j?.['@graph']) ? j['@graph'] : [])].filter(n => n && typeof n === 'object');
const typed = (nodes, t) => nodes.filter(n => [].concat(n['@type']).includes(t));

async function staticRun({ pass, fail, warn, info, R, read, exists, deployedFiles, loadData, decode }) {
  let P;
  try { P = await import('../prerender.mjs'); } catch (e) { return fail(`tools/prerender.mjs does not import: ${e.message.split('\n')[0]}`); }
  const data = await loadData();

  // 1. Markers, generation, sync.
  let pages;
  try { pages = P.readPages(); } catch (e) { return fail(`prerender pages: ${e.message}`); }
  let bad = 0;
  const counts = [];
  for (const [file, src] of pages) {
    try {
      const names = P.markers(file, src).map(p => p.name);
      const spec = P.PAGES[file];
      const missing = Object.keys(spec.markers).filter(n => !names.includes(n));
      const unknown = names.filter(n => !spec.markers[n] && !spec.optional?.[n]);
      if (missing.length) { bad++; fail(`${file}: missing prerender marker(s) ${missing.join(', ')}`); }
      if (unknown.length) { bad++; fail(`${file}: unknown prerender marker(s) ${unknown.join(', ')}`); }
      counts.push(`${file} ${names.length}`);
    } catch (e) { bad++; fail(e.message); }
  }
  if (bad) return;
  let out;
  try { out = P.generate(data, pages); } catch (e) { return fail(`tools/prerender.mjs generate() failed: ${e.message}`); }
  pass(`prerender markers present and balanced (${counts.join(', ')}); generate() writes ${[...out.keys()].join(', ')}`);
  const stale = [...out].filter(([f, c]) => !exists(f) || read(f) !== c).map(([f]) => f);
  if (stale.length) warn(`stale: ${stale.join(', ')} ${stale.length === 1 ? 'differs' : 'differ'} from what data/portfolio.js renders: run npm run prerender (CI regenerates them into _site, so the deployed site is current)`);
  else pass(`committed ${[...out.keys()].join(', ')} are in sync with data/portfolio.js`);

  // 2. The static index reads as text; the static project.html names every film.
  const index = out.get('index.html');
  const text = pageText(index, decode);
  const films = (data.films ?? []).filter(f => f?.title);
  const want = [data.person?.name, data.person?.role, ...films.map(f => f.title), 'Filmography', data.contact?.email].filter(Boolean);
  const missing = want.filter(w => !text.includes(w));
  const decor = ['Reel 1', '000', 'TC 00'].filter(w => text.includes(w));
  if (missing.length) fail(`static index.html text lacks ${missing.map(w => `"${w}"`).join(', ')}`);
  if (decor.length) fail(`static index.html text contains decoration ${decor.map(w => `"${w}"`).join(', ')} (keep it in data-* attributes, printed by CSS)`);
  if (!missing.length && !decor.length) pass(`static index.html reads as text (${text.length} characters): the name, role, ${films.length} film titles, "Filmography" and the email; no "Reel 1", "000" or "TC 00"`);
  const projectText = pageText(out.get('project.html') ?? '', decode);
  const unlisted = films.filter(f => !projectText.includes(f.title)).map(f => f.title);
  if (unlisted.length) fail(`static project.html does not name ${unlisted.join(', ')}`);
  else pass(`static project.html names all ${films.length} films (its filmography, hidden under html.js)`);

  // 3. JSON-LD.
  const errs = [];
  const blocks = [...out].filter(([f]) => f.endsWith('.html')).flatMap(([f, html]) => jsonLdBlocks(html).map(b => ({ ...b, file: f })));
  for (const b of blocks) {
    if (b.error) errs.push(`${b.file}: JSON-LD does not parse: ${b.error}`);
    if (/<\//.test(b.raw)) errs.push(`${b.file}: JSON-LD holds "</" (escape "<" as \\u003c)`);
  }
  const ld = blocks.find(b => b.file === 'index.html' && b.json)?.json;
  const nodes = nodesOf(ld);
  const person = typed(nodes, 'Person')[0];
  if (!person) errs.push('index.html: JSON-LD has no Person');
  else if (!String(person['@id'] ?? '').endsWith('#person')) errs.push(`index.html: the Person's @id is ${JSON.stringify(person['@id'])}, expected …#person`);
  const real = films.filter(f => f.placeholder !== true).map(f => f.title);
  const list = typed(nodes, 'ItemList')[0];
  const listed = (list?.itemListElement ?? []).map(e => e?.item?.name);
  if (JSON.stringify(listed) !== JSON.stringify(real)) errs.push(`index.html: the ItemList names ${JSON.stringify(listed)}, the real films are ${JSON.stringify(real)} (sample films never enter it)`);
  const r = data.reel ?? {};
  // A reel still marked as a sample is tagged Sample on the page, and never published as a real video.
  const wantVideo = r.placeholder !== true && R.hasReel(data) && !!R.safeUrl(r.poster) && !!r.uploadDate;
  const videos = typed(nodes, 'VideoObject');
  if (wantVideo && videos.length !== 1) errs.push(`index.html: the reel has a poster and an upload date but the JSON-LD has ${videos.length} VideoObject(s) (reel-data.js videoObjectLD)`);
  if (!wantVideo && videos.length) errs.push(`index.html: a VideoObject without a real, playable reel with a poster and an upload date${r.placeholder === true ? ' (reel.placeholder is still true: the page tags the reel Sample)' : ''}`);
  for (const v of videos) {
    const clips = [].concat(v.hasPart ?? []).filter(c => [].concat(c?.['@type']).includes('Clip'));
    const starts = clips.map(c => Number(c.startOffset));
    if (starts.some((s, i) => !Number.isFinite(s) || (i && s <= starts[i - 1]))) errs.push(`index.html: VideoObject Clip startOffsets are not ascending numbers: ${starts.join(', ')}`);
    const backwards = clips.filter(c => c.endOffset != null && !(Number(c.endOffset) > Number(c.startOffset)));
    if (backwards.length) errs.push(`index.html: ${backwards.length} Clip(s) end before they start`);
  }
  for (const e of errs) fail(e);
  if (!errs.length) pass(`JSON-LD parses, holds no "</": ${nodes.map(n => [].concat(n['@type']).join('/')).filter(Boolean).join(', ')}${videos.length ? ` (${[].concat(videos[0].hasPart ?? []).length} Clips ascending)` : ` (no VideoObject: ${!R.hasReel(data) ? 'no reel yet' : r.placeholder === true ? 'the reel is still a sample' : 'no poster or upload date'})`}; the ItemList ${real.length ? `names the ${real.length} real film(s)` : 'is left out while every film is a sample'}`);

  // 4. Speculation rules: prefetch only.
  let rules = 0;
  const ruleErrs = [];
  for (const f of deployedFiles(['.html'])) {
    for (const m of read(f).matchAll(/<script\b[^>]*\btype\s*=\s*"speculationrules"[^>]*>([\s\S]*?)<\/script>/gi)) {
      rules++;
      let j;
      try { j = JSON.parse(m[1]); } catch (e) { ruleErrs.push(`${f}: speculation rules do not parse: ${e.message}`); continue; }
      if ('prerender' in j) ruleErrs.push(`${f}: speculation rules prerender (that would start the page's Players unseen): prefetch only`);
    }
  }
  for (const e of ruleErrs) fail(e);
  if (!ruleErrs.length) pass(`${rules} speculation-rules block(s) parse and only prefetch`);

  // 5. The sitemap generate() writes.
  const map = out.get('sitemap.xml') ?? '';
  const locs = [...map.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => decode(m[1]));
  const base = data.site?.url ?? '';
  const filmUrl = f => new URL(`project.html?slug=${encodeURIComponent(f.slug)}`, base).href;
  const wantLocs = [base, ...(R.hasPhotographs(data) && pages.has('photographs.html') ? [new URL('photographs.html', base).href] : []),
    ...(data.films ?? []).filter(f => f?.slug && f.placeholder !== true).map(filmUrl)];
  if (!/^<\?xml[^>]*\?>\s*(?:<!--[\s\S]*?-->\s*)?<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(map)) fail('sitemap.xml is not a sitemaps.org urlset');
  else if (JSON.stringify(locs) !== JSON.stringify(wantLocs)) fail(`sitemap.xml lists ${JSON.stringify(locs)}, expected ${JSON.stringify(wantLocs)}`);
  else pass(`sitemap.xml lists ${locs.length} URL(s): the home page${wantLocs.length > 1 ? ', ' : ''}${locs.slice(1).map(u => u.slice(base.length)).join(', ')} (sample films left out)`);
  info(`${stale.length ? 'run npm run prerender to refresh the committed files' : 'tools/prerender.mjs --check passes'}; CI writes the same output into _site`);
}

async function browserRun({ pass, fail, info, browser, watch, loadData, fullPageShot, abs, OPT, DESKTOP_WAIT }) {
  if (OPT.only && !OPT.only.some(o => 'index'.includes(o))) return info('skipped: the index page is not selected (--only)');
  const { srv, browser: chromium, contextOptions } = browser();
  const data = await loadData();
  const P = await import('../prerender.mjs');
  const html = P.generate(data, P.readPages()).get('index.html');
  const url = srv.url + 'index.html';
  const serve = ctx => ctx.route(url, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  const films = (data.films ?? []).map(f => f.title).filter(Boolean);
  const email = data.contact?.email;

  // 1. JavaScript off.
  {
    const ctx = await chromium.newContext({ ...contextOptions({ w: 1440, h: 900 }), javaScriptEnabled: false });
    await serve(ctx);
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(({ films, email }) => {
        const shown = el => { const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        // Without JavaScript the work section is the index table (work.css hides the frames grid).
        const titles = [...document.querySelectorAll('.work-card__title, .work-index__title')].filter(shown).map(el => el.textContent.trim());
        const mail = [...document.querySelectorAll('a[href^="mailto:"]')].filter(shown).map(a => a.textContent.trim());
        return { missing: films.filter(t => !titles.includes(t)), mail: mail.includes(email), sw: document.documentElement.scrollWidth, iw: innerWidth, js: document.documentElement.classList.contains('js') };
      }, { films, email });
      const shot = abs('.artifacts/screens/nojs--index--1440x900.png');
      fs.mkdirSync(abs('.artifacts/screens'), { recursive: true });
      await fullPageShot(page, shot, 1440);
      const issues = [];
      if (r.js) issues.push('html.js is set with JavaScript off');
      if (r.missing.length) issues.push(`film titles not visible: ${r.missing.join(', ')}`);
      if (email && !r.mail) issues.push(`the email ${email} is not a visible link`);
      if (r.sw > r.iw + 1) issues.push(`horizontal overflow (scrollWidth ${r.sw} > ${r.iw})`);
      // With JavaScript off, Chromium refuses the module scripts and their preloads ("csp"): that is the point.
      const real = errors.filter(e => !/^requestfailed: \S+\.js csp$/.test(e));
      if (real.length) issues.push(`${real.length} error(s): ${real.slice(0, 2).join(' | ')}`);
      if (issues.length) fail(`index without JavaScript, 1440×900: ${issues.join('; ')}`);
      else pass(`index without JavaScript, 1440×900: ${films.length} film titles and the email visible, no horizontal overflow (.artifacts/screens/nojs--index--1440x900.png)`);
    } catch (e) { fail(`index without JavaScript: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }

  // 2. JavaScript on: the layout shift until the scripts have rendered the same sections again and, on a
  //    desktop with motion on, until the motion layer has armed: its pinned work strip adds a spacer above
  //    every later section, so a jump into the page is only safe if it is put back in that same frame.
  //    Arriving on a section puts prerendered content on screen while main.js replaces it, so a markup
  //    difference would show too.
  const runs = [
    { w: 1440, h: 900 }, { w: 390, h: 844 },
    ...['#work', '#studies', '#previs', '#about', '#credits', '#contact'].map(hash => ({ w: 1440, h: 900, hash })),
    ...['#about', '#credits', '#contact'].map(hash => ({ w: 1440, h: 900, hash, reduced: true })),
    ...['#previs', '#about', '#contact'].map(hash => ({ w: 390, h: 844, hash })),
  ];
  for (const { w, h, hash = '', reduced = false } of runs) {
    const tag = `${w}×${h}${hash ? ` ${hash}` : ''}${reduced ? ' (reduced motion)' : ''}`;
    const ctx = await chromium.newContext(contextOptions({ w, h, reducedMotion: reduced ? 'reduce' : 'no-preference' }));
    await serve(ctx);
    await ctx.addInitScript(() => {
      window.__shifts = []; window.__rerender = null;
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, at: Math.round(e.startTime), what: (e.sources ?? []).map(s => (s.node ? `${s.node.nodeName.toLowerCase()}.${String(s.node.className || '').split(' ')[0]}` : '?')).slice(0, 3).join(' ') });
      }).observe({ type: 'layout-shift', buffered: true });
      // The parser inserts the prerendered sections while loading; main.js replaces them afterwards.
      new MutationObserver(ms => {
        if (window.__rerender == null && document.readyState !== 'loading' && ms.some(m => m.target.matches?.('[data-render="work"]'))) window.__rerender = Math.round(performance.now());
      }).observe(document, { childList: true, subtree: true });
    });
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    try {
      await page.goto(url + hash, { waitUntil: 'load', timeout: 45000 });
      await page.waitForFunction(() => window.__rerender != null, null, { timeout: 15000 });
      // The desktop layer (when it applies) arms after the page: wait for it and its first idle.
      await page.waitForFunction(DESKTOP_WAIT, null, { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => Promise.race([window.__motion?.idle, new Promise(r => setTimeout(r, 4000))])).catch(() => {});
      await page.waitForTimeout(1500);
      const r = await page.evaluate(hash => {
        let el = null;
        try { el = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch { /* bad hash */ }
        const line = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        return { shifts: window.__shifts, rerender: window.__rerender, armed: Boolean(window.__motion?.armed), top: el ? Math.round(el.getBoundingClientRect().top) : null, line };
      }, hash);
      const cls = r.shifts.reduce((s, e) => s + e.value, 0);
      const worst = [...r.shifts].sort((a, b) => b.value - a.value).slice(0, 3).map(e => `${e.value.toFixed(4)} at ${e.at} ms ${e.what}`).join('; ');
      const through = `main.js's re-render at ${r.rerender} ms${r.armed ? ' and the motion layer\'s arm' : ''}`;
      if (errors.length) fail(`index with JavaScript, ${tag}: ${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
      if (hash && (r.top == null || Math.abs(r.top - r.line) > 6)) fail(`${tag}: the arrival ended with ${hash} at ${r.top} px, not under the header (${r.line} px)`);
      if (cls > 0.02) fail(`${tag}: layout shift ${cls.toFixed(4)} > 0.02 from the first paint through ${through} (${worst})`);
      else pass(`${tag}: layout shift ${cls.toFixed(4)} ≤ 0.02 from the first paint through ${through}, and 1.5 s after${hash ? `; ${hash} lands at ${r.top} px` : ''} (${r.shifts.length} shift(s)${worst ? `: ${worst}` : ''})`);
    } catch (e) { fail(`index with JavaScript, ${tag}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }

  // 3. An arrival the visitor leaves before the previs plans are in (a slow network: previs.js held 2.5 s).
  //    main.js aims at the hash again once they are; someone who has scrolled away stays where they went.
  {
    const tag = '1440×900 #contact, scrolled away before the previs plans load';
    const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
    await serve(ctx);
    await ctx.route(u => u.pathname.endsWith('/assets/js/site/previs.js'), async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
    await ctx.addInitScript(() => addEventListener('kc:content', e => { if (e.detail?.scope?.matches?.('[data-previs-grid]')) window.__plans = true; }));
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    try {
      await page.goto(url + '#contact', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains('is-arriving'), null, { timeout: 10000 });
      const top = () => page.evaluate(() => Math.round(document.getElementById('contact').getBoundingClientRect().top));
      const landed = await top();
      await page.mouse.move(700, 450);
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(80); }
      await page.waitForTimeout(700);
      const left = await top();
      await page.waitForFunction(() => window.__plans, null, { timeout: 15000 });
      await page.waitForTimeout(2500);   // aim() waits for any scroll to end (up to 1.6 s) before it cuts
      const end = await top();
      if (errors.length) fail(`${tag}: ${errors.length} error(s): ${errors.slice(0, 2).join(' | ')}`);
      if (left - landed < 800) fail(`${tag}: the wheel did not move the page (#contact at ${landed} px, then ${left} px)`);
      else if (Math.abs(end - left) > 40) fail(`${tag}: once the plans were in, the page moved #contact from ${left} px to ${end} px under a visitor who had scrolled away from it`);
      else pass(`${tag}: #contact landed at ${landed} px; the visitor scrolled it to ${left} px and it stays there (${end} px) after the plans load`);
    } catch (e) { fail(`index with JavaScript, ${tag}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }

  // 4. A key pressed while an arrival is held back for its type (the faces held 3 s): the hold ends, so
  //    the focus Tab gives (the email link) is never on an invisible page.
  {
    const tag = '1440×900 #contact, Tab while the type loads';
    const ctx = await chromium.newContext(contextOptions({ w: 1440, h: 900 }));
    await serve(ctx);
    await ctx.route(u => u.pathname.endsWith('.woff2'), async r => { await new Promise(res => setTimeout(res, 3000)); await r.continue().catch(() => {}); });
    const page = await ctx.newPage();
    try {
      await page.goto(url + '#contact', { waitUntil: 'commit', timeout: 45000 });
      await page.waitForFunction(() => document.documentElement.classList.contains('is-arriving'), null, { timeout: 10000 });
      // Once the page has been parsed (and the browser has set Tab's starting point at the target), well
      // inside the 1.5 s cap.
      await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout: 10000 });
      await page.waitForTimeout(250);
      const before = await page.evaluate(() => document.documentElement.classList.contains('is-arriving'));
      await page.keyboard.press('Tab');
      await page.waitForTimeout(120);
      const r = await page.evaluate(() => {
        const a = document.activeElement;
        let op = 1;
        for (let e = a; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
        return { held: document.documentElement.classList.contains('is-arriving'), what: a ? `${a.tagName.toLowerCase()} "${a.textContent.trim().slice(0, 24)}"` : 'nothing', op };
      });
      if (!before) fail(`${tag}: the hold had ended before the key (the type was held 3 s; the cap is 1.5 s)`);
      else if (r.held || r.op < 1 || r.what.startsWith('body')) fail(`${tag}: focus is on ${r.what} at opacity ${r.op}${r.held ? ' while the page is still held back' : ''}`);
      else pass(`${tag}: the hold ends at the key; focus is on ${r.what}, at opacity 1`);
    } catch (e) { fail(`index with JavaScript, ${tag}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
}

export const staticSections = [
  { name: 'seo-static', title: 'Static content and SEO: prerender markers and sync, page text, JSON-LD, speculation rules, sitemap', run: staticRun },
];
export const browserSections = [
  { name: 'static-content', title: 'Static content in the browser: no-JS index at 1440, layout shift through the re-render and the motion layer\'s arm (from the top, and arriving on a section), 1440 and 390', run: browserRun },
];
