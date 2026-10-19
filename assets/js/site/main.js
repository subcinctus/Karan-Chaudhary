// Home page. Renders every section from data/portfolio.js, then mounts the live pieces:
//   film-leader preloader (site/preloader.js) → main title (pieces/title.js, once per session) → reel facade → selected work
//   (shot-language cards) → studies (focus / light / colour Players with their companion DOM) →
//   previs (shot list plans) → about, kit, end credits, contact, colophon.
// Pieces load through guarded dynamic imports: a missing or failing module degrades to a still,
// a poster-less frame or a hidden block, and never breaks the page.

import data from '../../../data/portfolio.js';
import { mount } from '../core/player.js';
import { applyPageGrain } from '../core/grain.js';
import { bindMotionToggle, isReducedMotion, onMotionChange } from '../core/motion-pref.js';
import { hashString } from '../core/prng.js';
import * as R from './render.js';
import { runPreloader, preloaderActive, skipPreloader } from './preloader.js';
import { initShutter, openShutter } from './shutter.js';
import { initReveal } from './reveal.js';
import { initProgress } from './progress.js';
import { mountReel } from './reel.js';

const root = document.documentElement;
const site = data.site ?? {};
const intro = site.intro ?? {};
const TITLE_KEY = 'kc:titles';

// Posters (relative to index.html) shown until a piece's first frame and on error. Written by
// `npm run record:posters` (the same frame as the reduced-motion still); re-run it after a piece changes.
// The hero takes none: its stage stays transparent until the first frame (the DOM title shows through)
// and is hidden on error, and the intro starts from black, so the landed title would only cost a download.
const POSTERS = {
  focus: 'media/studies/focus/poster.webp',
  light: 'media/studies/light/poster.webp',
  colour: 'media/studies/colour/poster.webp',
};

// Lazy loaders, relative to this module.
const LOADERS = {
  title: () => import('../pieces/title.js'),
  focus: () => import('../pieces/focus.js'),
  light: () => import('../pieces/light.js'),
  colour: () => import('../pieces/colour.js'),
};

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** Run fn when el comes within `margin` of the viewport (once). */
function whenNear(el, fn, margin = '600px 0px') {
  if (!el) return;
  if (typeof IntersectionObserver === 'undefined') { fn(); return; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
}

// --- 1. Render ----------------------------------------------------------------------------

function renderSections() {
  const slot = name => document.querySelector(`[data-render="${name}"]`);
  R.put(slot('reel'), R.renderReel(data));
  R.put(slot('work'), R.renderWork(data));
  R.put(slot('studies'), R.renderStudies(data));
  R.put(slot('previs'), R.renderPrevisShell(data));
  R.put(slot('about'), R.renderAbout(data));
  R.put(slot('kit'), R.renderKit(data));
  R.put(slot('credits'), R.renderCredits(data));
  R.put(slot('contact'), R.renderContact(data));
  R.put(slot('colophon'), R.renderColophon(data));
  // Static hero copy follows the data too (it is also in the HTML for crawlers and no-JS).
  const p = data.person ?? {};
  const name = document.querySelector('.hero__name'), role = document.querySelector('.hero__role');
  const slate = document.querySelector('.hero__slate');
  if (name && p.name) name.textContent = p.name;
  if (role && p.role) role.textContent = p.role;
  if (slate && p.slate) slate.textContent = R.slateLine(p.slate);
  R.setJsonLd('ld-person', R.personLD(data));

  // No reel yet: no "coming soon" block. The hero's call to action leads to the work instead.
  R.pruneReel(data);
  if (!R.hasReel(data)) {
    const cta = document.querySelector('[data-watch-reel]');
    if (cta) { cta.href = '#work'; cta.innerHTML = 'Selected work <span aria-hidden="true">↓</span>'; }
    document.querySelector('.hero__down')?.remove();
  }
}

// --- 2. Main title ------------------------------------------------------------------------

function initHero(lifted) {
  const hero = document.querySelector('[data-hero]');
  const stage = hero?.querySelector('[data-hero-stage]');
  const skipBtn = hero?.querySelector('[data-skip-intro]');
  const cta = hero?.querySelector('[data-watch-reel]');
  if (!stage) return null;

  let state = 'done';
  const setIntro = s => {
    state = s;
    root.dataset.intro = s;
    if (skipBtn) skipBtn.hidden = s !== 'playing';
  };

  const shouldPlay = intro.titleSequence !== false && !isReducedMotion() && !location.hash && scrollY < 24
    && !(intro.oncePerSession !== false && store.get(TITLE_KEY));

  const player = mount(stage, {
    load: LOADERS.title, mode: 'once', heavy: true, fit: 'fill', layout: 'auto',
    autoplay: false, chrome: false, eager: true,
    label: `${data.person?.name ?? ''}, ${data.person?.role ?? ''}: main title`,
    onEnd: () => {
      const hadFocus = skipBtn && document.activeElement === skipBtn;
      setIntro('done');
      store.set(TITLE_KEY, '1');
      if (hadFocus) cta?.focus({ preventScroll: true });
    },
  });
  // A failed title piece must never leave the intro hanging: the DOM title is the hero then.
  stage.addEventListener('playerstate', e => { if (e.detail?.state === 'error') setIntro('done'); });

  const skip = () => { if (state === 'playing') player.skip(); };

  if (shouldPlay) {
    setIntro('playing');
    lifted.then(() => {
      if (state !== 'playing') return;
      player.play();
      // Safety net: the sequence is 4.5 s; never hold the page longer than that plus loading.
      setTimeout(() => { if (state === 'playing') player.skip(); }, 9000);
    });
  } else {
    setIntro('done');
    player.skip();   // queued until ready: shows the resolved hero frame (seek(duration))
  }

  skipBtn?.addEventListener('click', skip);
  addEventListener('scroll', () => { if (state === 'playing' && scrollY > 24) skip(); }, { passive: true });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (preloaderActive()) skipPreloader();
    skip();
  });

  // Replay titles (footer): back to the top, then play from the first frame.
  for (const b of document.querySelectorAll('[data-replay-titles]')) {
    b.addEventListener('click', () => {
      scrollTo({ top: 0, behavior: 'instant' });
      if (isReducedMotion()) { cta?.focus({ preventScroll: true }); return; }
      requestAnimationFrame(() => {
        setIntro('playing');
        player.play();
        skipBtn?.focus({ preventScroll: true });
      });
    });
  }
  onMotionChange(({ reduced }) => { if (reduced && state === 'playing') player.skip(); });
  return player;
}

// --- 3. Reel ----------------------------------------------------------------------------------

function initReel() {
  if (!R.hasReel(data)) return;
  const reel = mountReel(document.querySelector('[data-reel-frame]'), data);
  document.querySelector('[data-watch-reel]')?.addEventListener('click', () => {
    // The link scrolls to #reel; land keyboard focus on the player (or the slate) too.
    requestAnimationFrame(() => reel.focus());
  });
}

// --- 4. Selected work: a frame grab with the film's camera move applied to it -------------------
// Source order for each card: the film's featured real still → the procedural placeholder still for
// stillKinds[0] (clearly tagged) → the vector shot-card illustration (last resort, only if stills fail)
// → the palette frame already in the markup.

// Where the subject (and a second point, for rack focus) sits in each procedural composition, as
// fractions of the frame. Real stills can say it per still: { src, focus: [[x, y], [x, y]] }.
const KIND_FOCUS = {
  'window-shaft': [[0.36, 0.56], [0.72, 0.36]],
  'interior-practical': [[0.64, 0.55], [0.3, 0.62]],
  'close-silhouette': [[0.27, 0.5], [0.72, 0.36]],
  insert: [[0.36, 0.56], [0.7, 0.3]],
  'night-street': [[0.38, 0.62], [0.35, 0.22]],
  'wide-ext': [[0.68, 0.62], [0.3, 0.72]],
};
const THIRDS = [[0.667, 0.4], [0.333, 0.62]];

function initWork() {
  const cards = [...document.querySelectorAll('.work-card')];
  if (!cards.length) return;
  const films = new Map((data.films ?? []).map(f => [f.slug, f]));
  let mods = null;
  const load = () => (mods ??= Promise.all([
    import('../ui/still-move.js').catch(err => { console.info('[work] still moves unavailable', err?.message ?? err); return null; }),
    import('../pieces/still.js').catch(err => { console.info('[work] procedural stills unavailable', err?.message ?? err); return null; }),
  ]));
  for (const card of cards) {
    const link = card.querySelector('[data-film]');
    const frame = card.querySelector('[data-card-frame]');
    const film = films.get(link?.dataset.film);
    if (!film || !frame) continue;
    whenNear(frame, async () => {
      const [move, still] = await load();
      const reals = (film.stills ?? []).filter(s => R.safeUrl(s?.src));
      const lead = reals.find(s => s.featured) ?? reals[0];
      let srcA = null, srcB = null, focus = THIRDS, placeholder = false;
      try {
        if (lead) {
          srcA = R.safeUrl(lead.src);
          srcB = R.safeUrl(reals.find(s => s !== lead)?.src) ?? null;
          if (Array.isArray(lead.focus)) focus = lead.focus;
        } else if (still?.renderStill) {
          const kinds = film.stillKinds?.length ? film.stillKinds : ['wide-ext'];
          const o = { palette: R.cleanPalette(film.palette), aspect: Number(film.aspect) || 1.78, caption: false,
            cssWidth: Math.round((frame.clientWidth || 400) * 1.15), dpr: Math.min(2, devicePixelRatio || 1) };
          srcA = await still.renderStill({ ...o, seed: hashString(film.slug + 0), kind: kinds[0] });
          if (film.move === '#043') srcB = still.renderStill({ ...o, seed: hashString(film.slug + 1), kind: kinds[1] ?? kinds[0] });
          focus = KIND_FOCUS[kinds[0]] ?? THIRDS;
          placeholder = true;
        }
      } catch (err) { console.warn('[work] still', film.slug, err); srcA = null; }

      if (srcA) {
        if (move?.mountStillMove) move.mountStillMove(frame, { move: film.move, srcA, srcB, focus, trigger: link });
        else frame.insertAdjacentHTML('afterbegin', String(R.html`<img src="${srcA}" alt="" decoding="async">`));
        if (placeholder) frame.insertAdjacentHTML('beforeend', '<span class="work-card__still-tag" aria-hidden="true">Placeholder still</span>');
        frame.classList.add('has-piece');
        return;
      }
      // Last resort: the vector shot-card illustration of the move.
      try {
        const shot = await import('../ui/shotcard-mount.js');
        shot.mountShotCard(frame, film, { reducedMotion: isReducedMotion(), trigger: link, caption: false });
        frame.classList.add('has-piece');
      } catch (err) { console.info('[work] shot cards unavailable; palette frame stays', err?.message ?? err); }
    }, '800px 0px');
  }
}

// --- 5. Studies ---------------------------------------------------------------------------------

const studyPlayers = new Map();

function initStudies() {
  const binders = [];
  for (const block of document.querySelectorAll('[data-study]')) {
    const id = block.dataset.study;
    const host = block.querySelector('[data-study-host]');
    const panel = block.querySelector('[data-controls]');
    if (!LOADERS[id] || !host) continue;

    // Companion DOM binds before the Player starts (it only listens to 'playerparams'): its margin is
    // wider than the Player's, and priming (below) binds it first.
    let bound = null;
    const bind = () => (bound ??= (async () => {
      if (id === 'light') {
        const svg = block.querySelector('[data-light-plan]');
        try {
          const { bindLightPlot } = await import('../ui/light-plot.js');
          bindLightPlot(host, svg, { report: block.querySelector('[data-light-report]'), note: block.querySelector('[data-light-note]'), controls: panel });
        } catch (err) { console.info('[studies] light plot unavailable', err?.message ?? err); block.querySelector('[data-study-plan]')?.remove(); block.classList.add('no-companion'); }
      } else if (id === 'focus') {
        const ruler = block.querySelector('[data-dof-ruler]');
        try {
          const { bindDofRuler } = await import('../ui/dof-ruler.js');
          bindDofRuler(host, ruler, { readout: block.querySelector('[data-dof-readout]'), controls: panel });
        } catch (err) { console.info('[studies] DoF ruler unavailable', err?.message ?? err); block.querySelector('[data-study-ruler]')?.remove(); }
      }
    })());
    whenNear(block, bind, '1400px 0px');
    binders.push(bind);

    // On touch screens the light tour starts resolved and paused (as on the study page).
    // Start well ahead of the viewport: the controls are built when the piece starts, and a keyboard
    // user tabbing out of Selected work must land in them, not skip past an empty panel.
    const player = mount(host, {
      load: LOADERS[id], mode: 'loop', heavy: true, controls: panel ?? false, lazyMargin: '1000px 0px',
      autoplay: !(id === 'light' && matchMedia('(hover: none)').matches),
      poster: POSTERS[id] ?? undefined, label: `${id} study`,
    });
    studyPlayers.set(id, player);
    host.addEventListener('playerstate', e => { if (e.detail?.state === 'error') block.classList.add('is-unavailable'); });

    player.ready.then(async () => {
      if (player.state === 'error') return;
      if (id === 'colour') {
        try { (await import('../pieces/colour.js')).bindWipeDrag?.(player); } catch (err) { console.info('[studies] wipe drag unavailable', err?.message ?? err); }
      }
    });
  }

  // Keyboard focus entering Selected work or Studies starts every study, so their controls exist
  // by the time Tab reaches them.
  const primeAll = e => {
    if (!e.target?.closest?.('#work, #studies')) return;
    document.removeEventListener('focusin', primeAll);
    Promise.all(binders.map(b => b())).then(() => { for (const p of studyPlayers.values()) p.prime?.(); });
  };
  document.addEventListener('focusin', primeAll);

  // Approach links: jump to a study and set it up (e.g. the Light study on Rembrandt).
  document.addEventListener('click', e => {
    const a = e.target.closest?.('[data-study-link]');
    if (!a) return;
    const player = studyPlayers.get(a.dataset.studyLink);
    const preset = a.dataset.studyPreset;
    if (!player || !preset) return;
    player.ready.then(() => { if (player.state !== 'error') player.set({ preset }, { animate: true }); });
  });
}

// --- 6. Boot --------------------------------------------------------------------------------------

function boot() {
  applyPageGrain();
  initShutter();
  const hero = document.querySelector('[data-hero]');
  const lifted = runPreloader({ enabled: intro.preloader !== false, rise: hero ? [hero] : [] });

  renderSections();
  // The header turns solid before the hero's foot (the CTA row) slides up under it.
  const foot = hero?.querySelector('.hero__foot'), header = document.querySelector('[data-header]');
  R.initChrome({ bindMotionToggle, solidAfter: () => (hero ? hero.offsetHeight - (foot?.offsetHeight ?? 0) - (header?.offsetHeight ?? 72) - 16 : 8) });
  initHero(lifted);
  initReel();
  initStudies();
  const reveal = initReveal();
  initProgress({ runtime: site.timecodeRuntime ?? 180 });
  R.settleHash();
  openShutter();

  initWork();
  const aim = R.initAnchorAim();

  // Previs plans are static SVG from a small JSON file: mount them at once, so the section has its
  // full height before anyone jumps past it. A failing module hides only this block.
  const grid = document.querySelector('[data-previs-grid]');
  if (grid) {
    import('./previs.js')
      .then(({ mountPrevis }) => mountPrevis(grid, data))
      .then(ok => {
        if (ok) reveal.scan(grid);
        // An arrival on #about (etc.) aimed before the plans existed: aim again.
        let target = null;
        try { target = location.hash ? document.querySelector(decodeURIComponent(location.hash)) : null; } catch { /* bad hash */ }
        if (target) aim(target);
      })
      .catch(err => { console.info('[previs] unavailable', err?.message ?? err); grid.hidden = true; });
  }
}

boot();
