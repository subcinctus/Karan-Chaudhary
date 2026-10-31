// Check plugin (static + browser): the match cut between the index and the film pages, as the plan's
// "Match cut" describes it (assets/js/site/match-cut.js, assets/css/transitions.css, shutter.js).
//
//   static  transitions: @view-transition only under prefers-reduced-motion: no-preference; no transition
//           animation in transitions.css runs past 0.8 s; index.html and project.html link the stylesheet
//           and set html[data-vt] on pagereveal.
//   browser transitions (SKIP where this Chromium has no cross-document view transitions):
//     - a work card's click: the film page arrives with html[data-vt="on"], the "film-still" group carries
//       the card's still (sessionStorage kc:vt, a JPEG of the procedural still, or the real still's URL with
//       the fixture), every transition animation ends by 0.8 s, kc:shutter is never set and the page never
//       starts covered; the hand-off image goes once the film's own still is in (desktop and phone);
//     - an Index row's link (when the Index view exists): its preview pane's frame is the one carried;
//     - the film page holds its first paint for project.js (blocking="render") only for that hand-off, with
//       the lead frame named at pagereveal; the pager to the next film: a plain root fade (no film-still
//       group, no hand-off, the first paint not held);
//     - back to the index (back/forward cache or not): no element keeps the name;
//     - Motion off: the card's click arrives with "none" (the index skips the transition before it is
//       captured, so Chromium offers the film page none) and the film page's link back arrives "skipped"
//       (the index's head script skips it); a reduced-motion context: "none" both ways;
//     - with CSSViewTransitionRule deleted (a browser without the feature): the shutter runs again.

const LIMIT_MS = 800;
const PAGES = ['index.html', 'project.html'];

/** Every block of a stylesheet (comments stripped), at-rules included: [{ at: [enclosing preludes], head, body }]. */
function blocks(css) {
  const out = [], open = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { open.push({ head: css.slice(start, i).trim(), from: i + 1 }); start = i + 1; }
    else if (css[i] === '}') {
      const b = open.pop();
      if (b) out.push({ at: open.map(o => o.head), head: b.head, body: css.slice(b.from, i) });
      start = i + 1;
    } else if (css[i] === ';') start = i + 1;
  }
  return out;
}
const ms = t => (/ms$/.test(t) ? parseFloat(t) : parseFloat(t) * 1000);
/** A rule's longest end: delay + duration, from `animation` (first time is the duration, the second the delay) or the longhands. */
function endOf(body) {
  const shorthand = /(?:^|;)\s*animation\s*:([^;]*)/.exec(body)?.[1] ?? '';
  const times = shorthand.match(/-?[\d.]+m?s\b/g) ?? [];
  const dur = /animation-duration\s*:\s*([\d.]+m?s)/.exec(body)?.[1] ?? times[0] ?? '0s';
  const delay = /animation-delay\s*:\s*(-?[\d.]+m?s)/.exec(body)?.[1] ?? times[1] ?? '0s';
  return ms(dur) + ms(delay);
}

async function runStatic({ pass, fail, read, exists, splitComments }) {
  const file = 'assets/css/transitions.css';
  if (!exists(file)) return fail(`${file} is missing`);
  const all = blocks(splitComments(read(file), 'css').code);
  const opt = all.filter(b => b.head.startsWith('@view-transition'));
  const bare = opt.filter(b => !b.at.some(h => /^@media\b.*prefers-reduced-motion\s*:\s*no-preference/.test(h)));
  if (!opt.length) fail(`${file} has no @view-transition rule (the cross-document transition never runs)`);
  else if (bare.length) fail(`${file}: ${bare.length} @view-transition rule(s) outside @media (prefers-reduced-motion: no-preference)`);
  else pass(`${file}: @view-transition only under prefers-reduced-motion: no-preference (${opt.length} rule)`);

  const timed = all.filter(b => b.head.includes('::view-transition')).map(b => ({ selector: b.head.replace(/\s+/g, ' '), end: endOf(b.body) }));
  const longest = timed.reduce((a, b) => (b.end > a.end ? b : a), { selector: 'none', end: 0 });
  if (longest.end > LIMIT_MS) fail(`${file}: ${longest.selector} runs to ${longest.end} ms (a transition blocks input while it runs: ${LIMIT_MS} ms at most)`);
  else pass(`${file}: the longest transition animation ends at ${longest.end} ms (${longest.selector}; ${LIMIT_MS} ms at most)`);

  const missing = PAGES.filter(p => !exists(p) || !/href="assets\/css\/transitions\.css"/.test(read(p)) || !/addEventListener\('pagereveal'[\s\S]{0,400}?dataset\.vt/.test(read(p)));
  if (missing.length) fail(`${missing.join(', ')}: must link assets/css/transitions.css and set html[data-vt] on pagereveal`);
  else pass(`${PAGES.join(' and ')} link transitions.css and set html[data-vt] on pagereveal`);
}

// ------------------------------------------------------------------------------------------------ browser

/**
 * On every page: whether it arrived covered by the shutter (at DOMContentLoaded), and on pagereveal what the
 * view transition was: its named groups, its last animation's end, whether it ran (ready) or was skipped.
 */
const PROBE = () => {
  const root = () => document.documentElement;   // not there yet when this runs
  document.addEventListener('DOMContentLoaded', () => { window.__covered = root().classList.contains('shutter-cover'); }, { once: true });
  addEventListener('pageshow', e => { window.__persisted = e.persisted; });
  addEventListener('pagereveal', e => {
    const vt = e.viewTransition;
    // A film page holds its first paint for project.js only for a hand-off: then the lead frame is named by now.
    const pj = document.querySelector('script[src$="site/project.js"]');
    const p = window.__vt = { has: !!vt, handoff: root().classList.contains('vt-handoff'), handoffImg: !!document.querySelector('.film__handoff'),
      hold: pj ? pj.getAttribute('blocking') : undefined, lead: document.querySelector('[data-film-hero]')?.style.viewTransitionName ?? null };
    if (!vt) return;
    vt.ready.then(() => {
      const anims = document.getAnimations().filter(a => String(a.effect?.pseudoElement ?? '').startsWith('::view-transition'));
      p.groups = [...new Set(anims.map(a => /^::view-transition-group\((.+)\)$/.exec(a.effect.pseudoElement)?.[1]).filter(Boolean))];
      p.end = Math.max(0, ...anims.map(a => a.effect.getComputedTiming().endTime));
      p.ready = 'ran';
    }, err => { p.ready = `skipped (${err?.name ?? err})`; });
  });
};

async function runBrowser(api) {
  const { OPT, pass, fail, skip, info, browser, watch, settle, fixture } = api;
  const { srv, browser: chromium, contextOptions } = browser();
  if (OPT.only && !OPT.only.some(o => 'index'.includes(o) || 'project'.includes(o))) return skip('skipped: --only names neither the index nor a film page');
  const vps = OPT.viewports;
  const desktop = vps.find(([w]) => w >= 1024) ?? vps[0], phone = vps.find(([w]) => w < 720) ?? null;
  const clean = (errors, tag) => (errors.length ? fail(`${tag}: ${errors.length} console/page error(s): ${errors.slice(0, 4).join(' | ')}`) : pass(`${tag}: no console or page errors`));

  /** A context with the probe, the main title skipped, and every write to kc:shutter / kc:vt recorded. */
  const newContext = async ([w, h, dpr], { reduced = false, motionOff = false, noRule = false, data = null } = {}) => {
    const ctx = await chromium.newContext({ ...contextOptions({ w, h, dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' }), hasTouch: w < 720 });
    const writes = [];
    await ctx.exposeBinding('__kcStore', (_src, k, v) => { writes.push({ k, v }); });
    await ctx.addInitScript(({ motionOff, noRule }) => {
      try { sessionStorage.setItem('kc:titles', '1'); if (motionOff) localStorage.setItem('kc:motion', 'off'); } catch { /* storage blocked */ }
      if (noRule) delete window.CSSViewTransitionRule;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (/^kc:(shutter|vt)$/.test(k)) window.__kcStore?.(k, String(v).slice(0, 120));
        return set.call(this, k, v);
      };
    }, { motionOff, noRule });
    await ctx.addInitScript(PROBE);
    if (data) { await fixture.routeFixture(ctx, srv, data); await fixture.stampFixture(ctx); }
    return { ctx, writes };
  };
  const openIndex = async ctx => {
    const page = await ctx.newPage();
    const { errors } = watch(page, srv);
    await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 45000 });
    await settle(page, { name: 'index', path: 'index.html' }, { reduced: false });
    return { page, errors };
  };
  /** Run a navigation: requests it cancels on the page being left (a module still on its way) are not errors. */
  const departing = async (errors, go) => {
    const mark = errors.length;
    const out = await go();
    for (let i = errors.length - 1; i >= mark; i--) if (/^requestfailed: .* net::ERR_ABORTED/.test(errors[i])) errors.splice(i, 1);
    return out;
  };
  /** Click a link (once its frame shows a still, when asked, and the page has stopped loading); wait for the next page and its transition. */
  const follow = async (page, errors, selector, { still = null, url = /project\.html\?slug=/ } = {}) => {
    const link = page.locator(selector).first();
    await link.scrollIntoViewIfNeeded();
    if (still) await page.waitForFunction(sel => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0; }, still, { timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const from = page.url();
    await departing(errors, async () => {
      await link.click();
      await page.waitForURL(u => u.href !== from && url.test(u.href), { timeout: 20000 });
      await page.waitForFunction(() => document.documentElement.dataset.vt && window.__vt && (!window.__vt.has || window.__vt.ready), null, { timeout: 15000 });
    });
    return page.evaluate(() => ({ vt: document.documentElement.dataset.vt, ...window.__vt, covered: window.__covered, persisted: window.__persisted ?? false }));
  };

  // Does this Chromium run cross-document view transitions?
  {
    const ctx = await chromium.newContext(contextOptions({ w: desktop[0], h: desktop[1] }));
    const page = await ctx.newPage();
    await page.goto(srv.url + '404.html', { waitUntil: 'load' }).catch(() => {});
    const ok = await page.evaluate(() => 'CSSViewTransitionRule' in window && 'onpagereveal' in window).catch(() => false);
    await ctx.close();
    if (!ok) return skip('skipped: this Chromium has no cross-document view transitions (CSSViewTransitionRule / pagereveal)');
  }

  // --- Motion on: the card's still carries into the lead frame, the pager fades, the way back keeps no name.
  for (const vp of [desktop, phone].filter(Boolean)) {
    const [w, h] = vp, tag = `${w}×${h}`;
    const { ctx, writes } = await newContext(vp);
    try {
      const { page, errors } = await openIndex(ctx);
      const slug = await page.evaluate(() => document.querySelectorAll('a.work-card__link')[1]?.dataset.film);
      const a = await follow(page, errors, `a.work-card__link[data-film="${slug}"]`, { still: `a.work-card__link[data-film="${slug}"] .work-card__frame img` });
      const vt = writes.find(x => x.k === 'kc:vt');
      const probs = [];
      if (a.vt !== 'on' || a.ready !== 'ran') probs.push(`html[data-vt]="${a.vt}", transition ${a.ready ?? 'none'}`);
      if (!a.groups?.includes('film-still') || !a.handoff || !a.handoffImg) probs.push(`groups ${JSON.stringify(a.groups)}, vt-handoff ${a.handoff}, hand-off image ${a.handoffImg}`);
      if (!(a.end <= LIMIT_MS)) probs.push(`the transition runs to ${a.end} ms`);
      if (!vt || !vt.v.startsWith(`{"slug":"${slug}","src":"data:image/jpeg;base64,`)) probs.push(`kc:vt ${JSON.stringify(vt?.v ?? null)} (want the slug and a JPEG of the card's still)`);
      if (a.hold !== 'render' || a.lead !== 'film-still') probs.push(`at pagereveal project.js blocking ${JSON.stringify(a.hold ?? null)} and the lead frame named ${JSON.stringify(a.lead)} (want "render": the first paint waits for the frame the cut lands on)`);
      if (writes.some(x => x.k === 'kc:shutter') || a.covered) probs.push(`the shutter ran (kc:shutter ${writes.some(x => x.k === 'kc:shutter')}, arrived covered ${a.covered})`);
      if (probs.length) fail(`${tag} card → ${slug}: ${probs.join('; ')}`);
      else pass(`${tag} card → ${slug}: html[data-vt]="on"; the first paint held for the hand-off; the card's still (a JPEG data URL) rides the "film-still" group into the lead frame; groups ${a.groups.join(', ')}; done by ${Math.round(a.end)} ms; kc:shutter never set`);
      const gone = await page.waitForFunction(() => !document.querySelector('.film__handoff'), null, { timeout: 15000 }).then(() => true, () => false);
      if (!gone) fail(`${tag}: the hand-off image is still in the lead frame 15 s after arriving`);
      else pass(`${tag}: the hand-off image leaves once the film's own still is painted`);

      if (vp === desktop) {
        const b = await follow(page, errors, 'a.film__pager-link--next');
        if (b.vt !== 'on' || b.ready !== 'ran' || b.groups?.includes('film-still') || b.handoff) fail(`${tag} pager: html[data-vt]="${b.vt}", transition ${b.ready}, groups ${JSON.stringify(b.groups)}, vt-handoff ${b.handoff} (want a plain root fade)`);
        else if (b.hold !== null) fail(`${tag} pager: project.js blocking ${JSON.stringify(b.hold ?? null)} (want none: only a hand-off holds the first paint)`);
        else pass(`${tag} pager → next film: a plain root fade (groups ${b.groups.join(', ')}), no shared frame, the first paint not held`);
        await departing(errors, async () => {
          await page.goBack({ waitUntil: 'load' });
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await page.goBack({ waitUntil: 'load' });
        });
        await page.waitForTimeout(600);
        const back = await page.evaluate(() => ({ url: location.pathname, persisted: window.__persisted ?? false, named: [...document.querySelectorAll('[style*="view-transition-name"]')].filter(el => el.style.viewTransitionName === 'film-still').length }));
        if (!back.url.endsWith('index.html') || back.named) fail(`${tag} back to the index: ${back.url}, ${back.named} element(s) still named film-still`);
        else pass(`${tag} back to the index (${back.persisted ? 'from the back/forward cache' : 'reloaded'}): no element keeps the film-still name`);
      }
      if (writes.some(x => x.k === 'kc:shutter')) fail(`${tag}: kc:shutter was set during the run`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- The fixture's real featured still: the hand-off is the still's own URL.
  {
    const tag = `fixture ${desktop[0]}×${desktop[1]}`;
    let fx = null;
    try { fx = fixture.fixtureData(); } catch (e) { fail(`fixture: ${e.message.split('\n')[0]}`); }
    const slug = fx?.films?.[0]?.slug;
    if (slug) {
      const { ctx, writes } = await newContext(desktop, { data: fx });
      try {
        const { page, errors } = await openIndex(ctx);
        const a = await follow(page, errors, `a.work-card__link[data-film="${slug}"]`, { still: `a.work-card__link[data-film="${slug}"] .work-card__frame img` });
        const vt = writes.find(x => x.k === 'kc:vt');
        if (a.vt !== 'on' || !a.groups?.includes('film-still') || !/"src":"https?:\/\//.test(vt?.v ?? '')) fail(`${tag} card → ${slug} (real still): html[data-vt]="${a.vt}", groups ${JSON.stringify(a.groups)}, kc:vt ${JSON.stringify(vt?.v ?? null)}`);
        else pass(`${tag} card → ${slug} (a real featured still): the still's own URL is handed over and rides the film-still group (html[data-vt]="on")`);
        clean(errors, tag);
      } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
    }
  }

  // --- An Index row: its preview pane's frame is the one carried.
  {
    const tag = `Index view ${desktop[0]}×${desktop[1]}`;
    const { ctx, writes } = await newContext(desktop);
    try {
      await ctx.addInitScript(() => { try { localStorage.setItem('kc:work-view', 'index'); } catch { /* storage blocked */ } });
      const { page, errors } = await openIndex(ctx);
      const row = page.locator('tr.work-index__row').nth(1);
      const ready = await page.evaluate(() => !!document.querySelector('.work-index__link') && !!document.querySelector('.work-index__preview [data-preview-frame]')?.getClientRects().length);
      if (!ready) skip(`${tag}: skipped: no Index view with a visible preview pane on this page yet`);
      else {
        const slug = await row.getAttribute('data-film');
        await row.scrollIntoViewIfNeeded();
        await row.hover();
        await page.waitForFunction(s => document.querySelector(`.work-index__preview [data-preview-frame][data-film="${s}"] img`)?.complete, slug, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(400);
        const a = await follow(page, errors, `tr.work-index__row[data-film="${slug}"] a.work-index__link`);
        const vt = writes.find(x => x.k === 'kc:vt');
        if (a.vt !== 'on' || !a.groups?.includes('film-still') || !vt?.v.startsWith(`{"slug":"${slug}"`)) fail(`${tag} row → ${slug}: html[data-vt]="${a.vt}", groups ${JSON.stringify(a.groups)}, kc:vt ${JSON.stringify(vt?.v ?? null)}`);
        else pass(`${tag} row → ${slug}: the preview pane's frame rides the film-still group (html[data-vt]="on")`);
      }
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }

  // --- Motion off, reduced motion: no transition; and with the feature missing, the shutter again.
  const cases = [
    ['Motion off', { motionOff: true }, 'none', 'skipped'],
    ['reduced motion', { reduced: true }, 'none', 'none'],
  ];
  for (const [name, opts, there, back] of cases) {
    const tag = `${name} ${desktop[0]}×${desktop[1]}`;
    const { ctx, writes } = await newContext(desktop, opts);
    try {
      const { page, errors } = await openIndex(ctx);
      const a = await follow(page, errors, 'a.work-card__link');
      const b = await follow(page, errors, 'a.film__pager-all', { url: /index\.html/ });
      const shutter = writes.some(x => x.k === 'kc:shutter') || a.covered || b.covered;
      if (a.vt !== there || b.vt !== back || a.groups || shutter || writes.some(x => x.k === 'kc:vt')) fail(`${tag}: card → film html[data-vt]="${a.vt}" (want "${there}"), film → index "${b.vt}" (want "${back}"), groups ${JSON.stringify(a.groups ?? null)}, shutter ${shutter}, kc:vt ${writes.some(x => x.k === 'kc:vt')}`);
      else pass(`${tag}: no transition: card → film html[data-vt]="${a.vt}"${name === 'Motion off' ? ' (the index skips it in pageswap, so none is offered)' : ''}, film → index "${b.vt}"; no shutter, no hand-off`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
  {
    const tag = `without CSSViewTransitionRule ${desktop[0]}×${desktop[1]}`;
    const { ctx, writes } = await newContext(desktop, { noRule: true });
    try {
      const { page, errors } = await openIndex(ctx);
      const a = await follow(page, errors, 'a.work-card__link');
      const lifted = await page.waitForFunction(() => !document.documentElement.classList.contains('shutter-cover'), null, { timeout: 5000 }).then(() => true, () => false);
      if (!writes.some(x => x.k === 'kc:shutter') || !a.covered || !lifted || writes.some(x => x.k === 'kc:vt')) fail(`${tag}: kc:shutter ${writes.some(x => x.k === 'kc:shutter')}, arrived covered ${a.covered}, uncovered ${lifted}, kc:vt ${writes.some(x => x.k === 'kc:vt')} (want the shutter and no hand-off)`);
      else pass(`${tag}: the shutter runs again: kc:shutter set, the film page arrives covered and uncovers; no match-cut hand-off`);
      clean(errors, tag);
    } catch (e) { fail(`${tag}: ${e.message.split('\n')[0]}`); } finally { await ctx.close(); }
  }
  info('Chromium gives the arriving page no view transition once the leaving page skips it in pageswap, so a Motion-off card click arrives "none"; "skipped" is what a page sees when only its own head script skips it (the film page\'s link back).');
}

export const staticSections = [{ name: 'transitions', title: 'Match cut CSS: reduced-motion guard, 0.8 s at most, pages wired', run: runStatic }];
export const browserSections = [{ name: 'transitions', title: 'Match cut: card → film, Index row, pager, back, Motion off, reduced motion, shutter fallback', run: runBrowser }];
