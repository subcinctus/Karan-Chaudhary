// Check plugin (static + browser): the film page (project.html?slug=…), as the plan's "Film page" describes it.
//
//   static  film: the film page's markup (render.js renderProject, and the frame cards project.js adds) holds
//           no root-relative or script URL, for the real data and for the fixture.
//   browser film, on the first sample film that has a sequence and a plot, at every --viewports size:
//     - no console errors; no frame is cropped: every .frame img box is within 1.5 % of its natural aspect;
//     - the crew block's "Photographed by" line and DP row; the plot SVG's title and desc (and a plan that
//       fits: its view stays under 30 m across); the sample badges ("Sample sequence", "Sample plot",
//       "Placeholder still") visible.
//     At the desktop and the phone sizes, the lightbox: frame 02 opens it at "02 / 0N", focus on Close,
//     html.modal-open, the live region; → / ← (no wrap), Home / End, i (the info panel and its DP-first
//     credit), a swipe on phones; Esc closes, html.modal-open goes, focus is back on the button that opened
//     it; Lenis stopped while it is open (desktop); no object URL left behind; the sequence opens its own
//     set. Under Motion off it opens and steps without animating. Once: the work card on the index, the lead
//     frame and frame 01 show one procedural image (a 24 × 10 luminance signature; frame 02 is the control).
//   A fixture run (tools/lib/fixture.mjs: real-still stand-ins, crew names, camera lines, palettes, srcset,
//   a real sequence and plot, laurels, references, a grade and a previs comparison) renders it all, with
//   "fixture--film…" screenshots; its wipes sit after the plot and move by mouse, keyboard and a touch tap,
//   never by a vertical swipe.

import { pathToFileURL } from 'node:url';

const ASPECT_TOLERANCE = 0.015;

/** Root-relative and script URLs in markup: attributes, every srcset candidate, CSS url(). */
function badUrls(markup) {
  const s = String(markup), hits = [];
  for (const m of s.matchAll(/\b(?:href|src|poster|action|data-src)\s*=\s*"\s*(?:\/(?!\/)|javascript:)[^"]*"/gi)) hits.push(m[0]);
  for (const m of s.matchAll(/\bsrcset\s*=\s*"([^"]*)"/g)) if (m[1].split(',').some(c => /^\/(?!\/)/.test(c.trim()))) hits.push(m[0]);
  for (const m of s.matchAll(/url\(\s*['"]?\/(?!\/)[^)]*\)/g)) hits.push(m[0]);
  return hits;
}

async function runStatic({ pass, fail, R, abs, loadData, fixture }) {
  const FC = await import(pathToFileURL(abs('assets/js/site/frame-card.js')).href);
  const FF = await import(pathToFileURL(abs('assets/js/site/film-facts.js')).href);
  const sets = [['data/portfolio.js', await loadData()], ['the fixture', fixture.fixtureData()]];
  let pages = 0;
  for (const [name, d] of sets) {
    const films = d.films ?? [];
    const bad = [];
    films.forEach((f, i) => {
      const markup = String(R.renderProject(f, d, { prev: films[i - 1] ?? null, next: films[i + 1] ?? null, index: i })) + String(FC.renderFrameCards(f)) + String(FF.renderGradeShell(f, d));
      pages++;
      for (const h of badUrls(markup)) bad.push(`${f.slug}: ${h}`);
    });
    if (bad.length) fail(`film page markup from ${name} has root-relative or script URLs: ${bad.slice(0, 6).join('; ')}`);
    else pass(`film page markup from ${name} (${films.length} films: report, credits, frames, sequence, plot, wipes, references) has only relative and https URLs`);
  }
  if (!pages) fail('no film pages to render (data/portfolio.js films is empty)');
}

// ------------------------------------------------------------------------------------------------ browser

/** Scroll through the page so every frame comes near and paints; wait for the placeholders. */
async function paintAll(page) {
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const go = y => (window.__motion?.lenis ? window.__motion.lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y));
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.8)) { go(y); await wait(160); }
    go(document.documentElement.scrollHeight);
    const t0 = performance.now();
    const pending = () => [...document.querySelectorAll('[data-paint]')].some(g => !g.querySelector('img')?.complete)
      || [...document.querySelectorAll('.frame img')].some(i => !i.complete);
    while (pending() && performance.now() - t0 < 25000) await wait(200);
    go(0);
    await wait(400);
  });
}

/** Every loaded .frame img: its box aspect against its natural aspect. */
const frameAspects = page => page.evaluate(() => [...document.querySelectorAll('.frame img')].filter(i => i.complete && i.naturalWidth && i.getBoundingClientRect().height > 0).map(i => {
  const r = i.getBoundingClientRect(), b = i.closest('[data-lightbox]');
  const where = i.closest('.film__frame') ? 'lead frame' : b ? `${b.dataset.lightbox} ${Number(b.dataset.lightboxIndex) + 1}` : 'frame';
  return { where, box: r.width / r.height, nat: i.naturalWidth / i.naturalHeight };
}));

function checkAspects(list, tag, { pass, fail }) {
  const off = list.filter(a => Math.abs(a.box / a.nat - 1) > ASPECT_TOLERANCE);
  if (!list.length) fail(`${tag}: no frame images loaded`);
  else if (off.length) fail(`${tag}: frame(s) cropped or stretched (box vs natural aspect beyond ${ASPECT_TOLERANCE * 100} %): ${off.map(a => `${a.where} ${a.box.toFixed(3)} vs ${a.nat.toFixed(3)}`).join('; ')}`);
  else pass(`${tag}: ${list.length} frame images, none cropped (box within ${ASPECT_TOLERANCE * 100} % of the natural aspect; worst ${(Math.max(...list.map(a => Math.abs(a.box / a.nat - 1))) * 100).toFixed(2)} %)`);
}

/** A 24 × 10 luminance signature of an image (any size: the same picture gives the same signature). */
const signature = (page, selector) => page.evaluate(async sel => {
  const img = document.querySelector(sel);
  if (!img) return null;
  await img.decode?.().catch(() => {});
  if (!img.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = 24; c.height = 10;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, 24, 10);
  const d = x.getImageData(0, 0, 24, 10).data, out = [];
  for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  return out;
}, selector);
const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

/** Text and visibility of what the film page shows (crew, plot, badges). */
const pageFacts = page => page.evaluate(() => {
  const seen = el => !!el && el.getClientRects().length > 0 && (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true);
  const svg = document.querySelector('.film-plot__svg');
  const vb = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [];
  return {
    credit: document.querySelector('.film__credit')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    rows: [...document.querySelectorAll('.film__crew .report__row')].map(r => [r.querySelector('dt')?.textContent.trim(), r.querySelector('dd')?.textContent.trim()]),
    plot: svg ? { title: svg.querySelector('title')?.textContent ?? '', desc: svg.querySelector('desc')?.textContent ?? '', rings: svg.querySelectorAll('circle').length, width: vb[2] ?? 0, labelled: svg.getAttribute('aria-labelledby') ?? '' } : null,
    badges: Object.fromEntries(['Sample sequence', 'Sample plot', 'Placeholder still', 'Sample'].map(t => [t, [...document.querySelectorAll('.badge-sample')].filter(b => b.textContent.trim() === t).some(seen)])),
  };
});

/** The lightbox's state, read from the page. */
const lightboxState = page => page.evaluate(() => {
  const dlg = document.querySelector('dialog.lightbox');
  const a = document.activeElement;
  return {
    open: !!dlg?.open, label: dlg?.getAttribute('aria-label') ?? null,
    counter: dlg?.querySelector('.lightbox__count')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    live: dlg?.querySelector('[aria-live]')?.textContent ?? null,
    modal: document.documentElement.classList.contains('modal-open'),
    focus: a ? { close: a.matches('[data-lb-close]'), scope: a.dataset?.lightbox ?? null, index: a.dataset?.lightboxIndex ?? null } : null,
    info: dlg ? { expanded: dlg.querySelector('[data-lb-info]')?.getAttribute('aria-expanded'), shown: !dlg.querySelector('#lightbox-info')?.hidden, text: dlg.querySelector('#lightbox-info')?.textContent.replace(/\s+/g, ' ').trim() ?? '' } : null,
    lenis: window.__motion?.lenis ? window.__motion.lenis.isStopped : null,
    // Script animations only (WAAPI): CSS transitions are the stylesheets' business, held at 0.01 ms under Motion off.
    animations: dlg ? dlg.getAnimations({ subtree: true }).filter(a => a.constructor.name === 'Animation').length : 0,
  };
});

/** Track object URLs from page start: [live URLs created after the mark that no <img> uses]. */
const URL_TRACKER = () => {
  const made = new Set(), gone = new Set();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = o => { const u = create(o); if (window.__lbMark) made.add(u); return u; };
  URL.revokeObjectURL = u => { gone.add(u); return revoke(u); };
  window.__lbLeaks = () => {
    const used = new Set([...document.querySelectorAll('img')].flatMap(i => [i.src, i.currentSrc]));
    return [...made].filter(u => !gone.has(u) && !used.has(u));
  };
};

const counterOf = (i, n) => `${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;

async function runBrowser(api) {
  const { OPT, pass, fail, skip, info, browser, watch, settle, loadData, fixture, read, exists, fullPageShot } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  const data = await loadData();
  const films = data.films ?? [];
  const film = films.find(f => f.placeholder && f.sequences?.length && f.lightingPlot) ?? films.find(f => f.lightingPlot || f.sequences?.length) ?? films[0];
  if (!film) return skip('skipped: no films in data/portfolio.js');
  const name = `project-${film.slug}`;
  if (OPT.only && !OPT.only.some(o => name.includes(o) || 'film'.includes(o))) return skip(`skipped: --only does not name ${name}`);
  const FC = await import(pathToFileURL(api.abs('assets/js/site/frame-card.js')).href);
  const frames = FC.frameItems(film), n = frames.length;
  const sequence = (film.sequences ?? []).find(q => Array.isArray(q?.frames) && q.frames.length);
  const person = data.person?.name;
  // Lenis stops for html.modal-open once motion/smooth.js holds on it (its hold() names the class).
  const smoothHolds = exists('assets/js/site/motion/smooth.js') && /modal-open/.test(read('assets/js/site/motion/smooth.js'));
  const vps = OPT.viewports;
  const desktop = vps.find(([w]) => w >= 1024) ?? null, phone = vps.find(([w]) => w < 720) ?? null;

  const openFilm = async (ctx, slug, tag) => {
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    await page.goto(srv.url + `project.html?slug=${encodeURIComponent(slug)}`, { waitUntil: 'load', timeout: 45000 });
    await settle(page, { name: `project-${slug}`, path: 'project.html' }, { reduced: false });
    await paintAll(page);
    return { page, errors, tag };
  };
  const clean = (errors, tag) => (errors.length ? fail(`${tag}: ${errors.length} console/page error(s): ${errors.slice(0, 4).join(' | ')}`) : pass(`${tag}: no console or page errors`));

  // --- Every viewport: frames, crew, plot, badges (and the lightbox at the desktop and phone sizes).
  for (const vp of vps) {
    const [w, h, dpr] = vp, tag = `${film.slug} ${w}×${h}${dpr > 1 ? `@${dpr}` : ''}`;
    const touch = w < 720;
    const ctx = await chromium.newContext({ ...contextOptions({ w, h, dpr }), hasTouch: touch });
    await ctx.addInitScript(URL_TRACKER);
    try {
      const { page, errors } = await openFilm(ctx, film.slug, tag);
      checkAspects(await frameAspects(page), tag, api);
      const facts = await pageFacts(page);
      const own = person && FC.isOwnDP(film);
      if (own) {
        const dpRow = facts.rows.find(([k]) => k === 'Director of Photography');
        if (facts.credit !== `Photographed by ${person}` || dpRow?.[1] !== person) fail(`${tag}: crew block reads "${facts.credit}" with DP row ${JSON.stringify(dpRow ?? null)} (want "Photographed by ${person}" and "Director of Photography: ${person}")`);
        else pass(`${tag}: crew block: "${facts.credit}", Director of Photography ${person} (${facts.rows.length} row(s), filled names only)`);
      }
      if (film.lightingPlot) {
        const p = facts.plot;
        const want = `Lighting plot: ${film.title}${film.lightingPlot.scene ? `, ${film.lightingPlot.scene}` : ''}`;
        if (!p) fail(`${tag}: no .film-plot__svg`);
        else if (p.title !== want || p.desc.length < 40 || !p.labelled.includes('desc')) fail(`${tag}: plot SVG title "${p.title}" (want "${want}"), desc ${p.desc.length} chars, aria-labelledby "${p.labelled}"`);
        else if (!p.rings || !(p.width > 0 && p.width < 30)) fail(`${tag}: the plan did not fit: ${p.rings} rings, a view ${p.width.toFixed(1)} m across (a label too long for its place zooms the plan out)`);
        else pass(`${tag}: plot SVG has title "${p.title}" and a ${p.desc.length}-character desc; the plan spans ${p.width.toFixed(1)} m`);
      }
      const wanted = ['Placeholder still', ...(sequence?.placeholder ? ['Sample sequence'] : []), ...(film.lightingPlot?.placeholder ? ['Sample plot'] : []), ...(film.placeholder ? ['Sample'] : [])];
      const hidden = wanted.filter(t => !facts.badges[t]);
      if (hidden.length) fail(`${tag}: badge(s) not visible: ${hidden.join(', ')}`);
      else pass(`${tag}: sample badges visible: ${wanted.join(', ')}`);

      if ((vp === desktop || vp === phone) && n > 1) {
        await lightbox(page, { tag, touch, n, film, sequence, smoothHolds, api });
      }
      clean(errors, tag);
    } catch (e) {
      fail(`${tag}: ${e.message.split('\n')[0]}`);
    } finally { await ctx.close(); }
  }

  // --- Motion off: the lightbox opens and steps without animating.
  if (desktop && n > 1) {
    const [w, h] = desktop, tag = `${film.slug} ${w}×${h} Motion off`;
    const ctx = await chromium.newContext(contextOptions({ w, h }));
    await ctx.addInitScript(() => { try { localStorage.setItem('kc:motion', 'off'); } catch { /* storage blocked */ } });
    try {
      const page = await ctx.newPage();
      const { errors } = watch(page, srv);
      await page.goto(srv.url + `project.html?slug=${encodeURIComponent(film.slug)}`, { waitUntil: 'load', timeout: 45000 });
      await settle(page, { name, path: 'project.html' }, { reduced: true });
      const opener = page.locator('.stills [data-lightbox="frames"][data-lightbox-index="1"]');
      await opener.scrollIntoViewIfNeeded();
      await opener.click();
      await page.waitForSelector('dialog.lightbox[open]', { timeout: 10000 });
      const a = (await lightboxState(page)).animations;
      await page.keyboard.press('ArrowRight');
      const b = (await lightboxState(page)).animations;
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.lightbox[open]'), null, { timeout: 3000 });
      if (a || b) fail(`${tag}: the lightbox animates under Motion off (${a} animation(s) on open, ${b} on →)`);
      else pass(`${tag}: the lightbox opens, steps and closes without animating`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- Seed parity: the work card, the lead frame and frame 01 are one picture (the placeholder film).
  if (!FC.frameItems(film)[0]?.placeholder) info(`seed parity: ${film.slug} has real stills (no procedural frame to compare)`);
  else {
    const [w, h] = desktop ?? vps[0];
    const ctx = await chromium.newContext(contextOptions({ w, h }));
    await ctx.addInitScript(() => { try { sessionStorage.setItem('kc:titles', '1'); } catch { /* storage blocked */ } });
    try {
      const page = await ctx.newPage();
      await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
      await settle(page, { name: 'index', path: 'index.html' }, { reduced: false });
      const card = `a.work-card__link[data-film="${film.slug}"] .work-card__frame img`;
      await page.locator(`a.work-card__link[data-film="${film.slug}"]`).scrollIntoViewIfNeeded();
      await page.waitForFunction(sel => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0; }, card, { timeout: 20000 });
      const cardSig = await signature(page, card);
      const { page: fp } = await openFilm(ctx, film.slug, 'parity');
      const hero = await signature(fp, '[data-film-hero] img');
      const f1 = await signature(fp, '.stills [data-lightbox="frames"][data-lightbox-index="0"] img');
      const f2 = await signature(fp, '.stills [data-lightbox="frames"][data-lightbox-index="1"] img');
      if (!cardSig || !hero || !f1 || !f2) fail(`seed parity: missing image(s): card ${!!cardSig}, lead frame ${!!hero}, frame 01 ${!!f1}, frame 02 ${!!f2}`);
      else {
        const same = Math.max(diff(cardSig, hero), diff(hero, f1), diff(cardSig, f1)), other = diff(hero, f2);
        const msg = `card ↔ lead frame ${diff(cardSig, hero).toFixed(1)}, lead frame ↔ frame 01 ${diff(hero, f1).toFixed(1)}, card ↔ frame 01 ${diff(cardSig, f1).toFixed(1)}; frame 02 (control) ${other.toFixed(1)} (mean luminance difference, 0–255)`;
        if (same > 6 || other < same * 2) fail(`seed parity: the work card, the lead frame and frame 01 are not one picture: ${msg}`);
        else pass(`seed parity: the work card, the lead frame and frame 01 show one procedural image: ${msg}`);
      }
    } catch (e) { fail(`seed parity: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- The fixture: everything the samples leave hidden, filled in.
  let fx;
  try { fx = fixture.fixtureData(); } catch (e) { return fail(`fixture: ${e.message.split('\n')[0]}`); }
  const ff = fx.films?.[0];
  if (!ff) return skip('fixture: no film');
  for (const vp of [desktop, phone].filter(Boolean)) {
    const [w, h, dpr] = vp, tag = `fixture ${ff.slug} ${w}×${h}`;
    const ctx = await chromium.newContext({ ...contextOptions({ w, h, dpr }), hasTouch: w < 720 });
    try {
      await fixture.routeFixture(ctx, srv, fx);
      await fixture.stampFixture(ctx);
      const { page, errors } = await openFilm(ctx, ff.slug, tag);
      checkAspects(await frameAspects(page), tag, api);
      const got = await page.evaluate(() => ({
        rows: Object.fromEntries([...document.querySelectorAll('.film__crew .report__row')].map(r => [r.querySelector('dt').textContent.trim(), r.querySelector('dd').textContent.trim()])),
        laurels: [...document.querySelectorAll('.film__laurel-title')].map(e => e.textContent.trim()),
        refs: document.querySelectorAll('.film__ref').length,
        lines: [...document.querySelectorAll('.stills .still__line')].map(e => e.textContent.trim()),
        chips: [...document.querySelectorAll('.stills .chips')].map(e => e.children.length),
        srcset: [...document.querySelectorAll('.stills img[srcset]')].length,
        seq: [...document.querySelectorAll('.sequence .frame img')].length,
        plot: document.querySelector('.film-plot__svg title')?.textContent ?? '',
        sample: [...document.querySelectorAll('.film__head .badge-sample')].length,
      }));
      const reals = (ff.stills ?? []).filter(s => s?.src);
      const probs = [];
      for (const [k, v] of [['Director', ff.director], ['Director of Photography', person], ['Camera operator', person], ['Lighting', `Designed by ${person}`], ...(ff.crew ?? []).filter(c => c.name).map(c => [c.role, c.name])]) {
        if (got.rows[k] !== v) probs.push(`crew ${k}: ${JSON.stringify(got.rows[k] ?? null)} (want ${JSON.stringify(v)})`);
      }
      if (got.laurels.length !== (ff.awards ?? []).length) probs.push(`${got.laurels.length} laurel(s) (want ${(ff.awards ?? []).length})`);
      if (got.refs !== (ff.references ?? []).length) probs.push(`${got.refs} reference(s) (want ${(ff.references ?? []).length})`);
      if (got.lines.join('|') !== reals.map(s => s.line).join('|')) probs.push(`camera lines ${JSON.stringify(got.lines)}`);
      if (got.chips.some((c, i) => c !== Math.min(6, reals[i]?.palette?.length ?? 0))) probs.push(`palette chips ${JSON.stringify(got.chips)}`);
      if (got.srcset !== reals.filter(s => s.srcset?.length).length) probs.push(`${got.srcset} frame(s) with srcset (want ${reals.filter(s => s.srcset?.length).length})`);
      if (got.seq !== (ff.sequences?.[0]?.frames ?? []).length) probs.push(`${got.seq} real sequence frame(s) (want ${(ff.sequences?.[0]?.frames ?? []).length})`);
      if (!got.plot.startsWith('Lighting plot:')) probs.push(`plot title "${got.plot}"`);
      if (got.sample) probs.push('the film head shows a Sample badge on a real film');
      if (probs.length) fail(`${tag}: ${probs.join('; ')}`);
      else pass(`${tag}: crew (${Object.keys(got.rows).length} rows, the owner as DP, operator and lighting designer), ${got.laurels.length} laurel(s), ${got.refs} references, ${got.lines.length} camera lines with palette chips, ${got.srcset} srcset frames, a ${got.seq}-frame real sequence and the plot render; no Sample badge on the real film`);
      await wipes(page, { tag, touch: w < 720, fx: ff, api });
      await fullPageShot(page, fixture.fixtureShot(`film--${w}x${h}`), w);
      const opener = page.locator('.stills [data-lightbox="frames"][data-lightbox-index="0"]');
      await opener.scrollIntoViewIfNeeded();
      await opener.click();
      await page.waitForSelector('dialog.lightbox[open]', { timeout: 10000 });
      await page.keyboard.press('i');
      await page.waitForTimeout(700);
      const st = await lightboxState(page);
      if (!st.info?.shown || !st.info.text.includes(FC.frameCredit(ff, fx)) || !st.info.text.includes(reals[0].line)) fail(`${tag}: lightbox info panel reads "${st.info?.text}" (want the credit "${FC.frameCredit(ff, fx)}" and the camera line)`);
      else pass(`${tag}: lightbox info panel: "${FC.frameCredit(ff, fx)}" and "${reals[0].line}"`);
      await page.screenshot({ path: fixture.fixtureShot(`lightbox-info--${w}x${h}`) });
      await page.keyboard.press('Escape');
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
}

/** The before/after wipes on the fixture's film: placed after the plot, moved by mouse, keys and a tap. */
async function wipes(page, { tag, touch, fx, api }) {
  const { pass, fail } = api;
  const want = ['grade', 'previsCompare'].filter(k => fx[k]).length;
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-film-plot], [data-wipe-block], .film__refs')].map(e => (e.matches('[data-film-plot]') ? 'plot' : e.matches('.film__refs') ? 'references' : 'wipe')));
  if (order.filter(o => o === 'wipe').length !== want || order.join(',') !== ['plot', ...Array(want).fill('wipe'), 'references'].join(',')) return fail(`${tag}: wipes: page order ${order.join(' → ')} (want plot → ${want} wipe(s) → references)`);
  const read = () => page.evaluate(() => {
    const w = document.querySelector('[data-wipe]'), i = w.querySelector('input[type="range"]');
    return { v: Number(i.value), css: getComputedStyle(w).getPropertyValue('--wipe').trim(), clip: getComputedStyle(w.querySelector('.wipe__b')).clipPath, text: i.getAttribute('aria-valuetext') };
  });
  const frame = page.locator('[data-wipe-frame]').first();
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  const y = box.y + box.height / 2, x = f => box.x + box.width * f;
  const got = [];
  if (!touch) {
    await page.mouse.move(x(0.25), y); await page.mouse.down(); await page.mouse.move(x(0.5), y, { steps: 4 }); await page.mouse.move(x(0.75), y, { steps: 4 }); await page.mouse.up();
    got.push(['drag to 75 %', await read(), 75]);
  } else {
    const touchAt = (ps) => page.evaluate(({ ps, b }) => {
      const el = document.querySelector('[data-wipe-frame]');
      for (const [type, fx, dy] of ps) el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: b.x + b.width * fx, clientY: b.y + b.height / 2 + dy }));
    }, { ps, b: box });
    await touchAt([['pointerdown', 0.3, 0], ['pointerup', 0.3, 0]]);
    got.push(['tap at 30 %', await read(), 30]);
    await touchAt([['pointerdown', 0.6, 0], ['pointermove', 0.61, 30], ['pointermove', 0.62, 60], ['pointercancel', 0.62, 60]]);
    got.push(['a vertical swipe', await read(), 30]);
  }
  await page.locator('[data-wipe] input[type="range"]').first().focus();
  await page.keyboard.press('Home');
  got.push(['Home', await read(), 0]);
  await page.keyboard.press('ArrowRight');
  got.push(['→', await read(), 1]);
  await page.keyboard.press('End');
  got.push(['End', await read(), 100]);
  const bad = got.filter(([, r, v]) => r.v !== v || r.css !== `${v}%` || !r.clip.includes(`${v}%`) || !r.text.startsWith(`${v} %`));
  if (bad.length) fail(`${tag}: wipe: ${bad.map(([k, r, v]) => `${k}: value ${r.v}, --wipe ${r.css}, clip ${r.clip} (want ${v})`).join('; ')}`);
  else pass(`${tag}: ${want} wipe(s) after the plot; ${got.map(([k, r]) => `${k} → ${r.v}`).join(', ')}; aria-valuetext "${got.at(-1)[1].text}"`);
}

/** Drive the lightbox on an open film page. */
async function lightbox(page, { tag, touch, n, film, sequence, smoothHolds, api }) {
  const { pass, fail, warn } = api;
  const FC = await import(pathToFileURL(api.abs('assets/js/site/frame-card.js')).href);
  const data = await api.loadData();
  const opener = page.locator('.stills [data-lightbox="frames"][data-lightbox-index="1"]');
  await opener.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__lbMark = true; });
  if (touch) await opener.tap(); else await opener.click();
  await page.waitForSelector('dialog.lightbox[open]', { timeout: 10000 });
  await page.waitForTimeout(700);
  const s0 = await lightboxState(page);
  const probs = [];
  if (s0.counter !== counterOf(2, n)) probs.push(`counter "${s0.counter}" (want "${counterOf(2, n)}")`);
  if (s0.label !== `Frames: ${film.title}`) probs.push(`aria-label "${s0.label}"`);
  if (!s0.focus?.close) probs.push('focus is not on Close');
  if (!s0.modal) probs.push('html.modal-open is not set');
  if (!/^Frame 2 of \d+: ./.test(s0.live ?? '')) probs.push(`live region "${s0.live}"`);
  if (probs.length) fail(`${tag}: lightbox opened wrong: ${probs.join('; ')}`);
  else pass(`${tag}: frame 02 opens the lightbox at "${s0.counter}", focus on Close, html.modal-open set, live "${s0.live}"`);
  if (s0.lenis !== null) {
    if (s0.lenis === true) pass(`${tag}: Lenis is stopped while the lightbox is open`);
    else (smoothHolds ? fail : warn)(`${tag}: Lenis keeps running under the lightbox${smoothHolds ? '' : ' (motion/smooth.js hold() does not name html.modal-open yet: the plan gives that line to the Home unit)'}`);
  }

  const seq = [];
  const press = async key => { await page.keyboard.press(key); await page.waitForTimeout(120); seq.push(`${key} ${(await lightboxState(page)).counter}`); };
  await press('ArrowRight');
  for (let i = 0; i < n; i++) await press('ArrowRight');
  const atEnd = (await lightboxState(page)).counter;
  await press('Home');
  await press('ArrowLeft');
  const atStart = (await lightboxState(page)).counter;
  await press('End');
  if (atEnd !== counterOf(n, n) || atStart !== counterOf(1, n) || (await lightboxState(page)).counter !== counterOf(n, n)) fail(`${tag}: keys: ${seq.join(', ')}`);
  else pass(`${tag}: → and ← step without wrapping, Home and End jump (${seq.join(', ')})`);

  if (touch) {
    const swipe = dx => page.evaluate(d => {
      const stage = document.querySelector('.lightbox__stage'), r = stage.getBoundingClientRect(), y = r.top + r.height / 2, x = r.left + r.width / 2;
      const ev = (type, cx) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y }));
      ev('pointerdown', x); ev('pointerup', x + d);
    }, dx);
    await swipe(80);
    const back = (await lightboxState(page)).counter;
    await swipe(-30);
    const small = (await lightboxState(page)).counter;
    if (back !== counterOf(n - 1, n) || small !== back) fail(`${tag}: swipe right gave "${back}" (want "${counterOf(n - 1, n)}"), a 30 px swipe gave "${small}" (want no step)`);
    else pass(`${tag}: a swipe of 80 px steps back, one of 30 px does nothing`);
  }

  await page.keyboard.press('i');
  await page.waitForTimeout(400);
  const si = await lightboxState(page);
  const credit = FC.frameCredit(film, data);
  if (si.info?.expanded !== 'true' || !si.info.shown || !si.info.text.startsWith(credit)) fail(`${tag}: i: info panel ${JSON.stringify(si.info)} (want it shown, starting "${credit}")`);
  else pass(`${tag}: i opens the info panel: "${si.info.text.slice(0, 90)}"`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.lightbox[open]'), null, { timeout: 3000 }).catch(() => {});
  const s1 = await lightboxState(page);
  if (s1.open || s1.modal || s1.focus?.scope !== 'frames' || s1.focus?.index !== '1') fail(`${tag}: after Esc: open ${s1.open}, html.modal-open ${s1.modal}, focus on ${JSON.stringify(s1.focus)} (want the frame 02 button)`);
  else pass(`${tag}: Esc closes it, html.modal-open goes, focus is back on the frame 02 button`);
  if (s1.lenis === true) fail(`${tag}: Lenis is still stopped after the lightbox closed`);
  await page.waitForTimeout(400);
  const leaks = await page.evaluate(() => window.__lbLeaks?.() ?? []);
  if (leaks.length) fail(`${tag}: ${leaks.length} object URL(s) made while the lightbox was open were neither revoked nor shown`);
  else pass(`${tag}: every object URL the lightbox made was revoked (or is shown on the page)`);

  if (sequence) {
    const sOpen = page.locator('[data-lightbox="sequence-0"][data-lightbox-index="0"]');
    await sOpen.scrollIntoViewIfNeeded();
    if (touch) await sOpen.tap(); else await sOpen.click();
    await page.waitForSelector('dialog.lightbox[open]', { timeout: 10000 });
    await page.keyboard.press('End');
    const s2 = await lightboxState(page);
    const m = sequence.frames.length;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.lightbox[open]'), null, { timeout: 3000 }).catch(() => {});
    const s3 = await lightboxState(page);
    if (s2.label !== `Sequence: ${film.title}` || s2.counter !== counterOf(m, m) || s3.focus?.scope !== 'sequence-0') fail(`${tag}: sequence lightbox: label "${s2.label}", End → "${s2.counter}" (want "${counterOf(m, m)}"), focus back on ${JSON.stringify(s3.focus)}`);
    else pass(`${tag}: the sequence opens its own set ("${s2.label}", End → "${s2.counter}") and focus returns to its frame`);
  }
}

export const staticSections = [{ name: 'film', title: 'Film page renderers: relative URLs only (data and fixture)', run: runStatic }];
export const browserSections = [{ name: 'film', title: 'Film page: frames never cropped, lightbox, crew, plot, badges, seed parity, fixture', run: runBrowser }];
