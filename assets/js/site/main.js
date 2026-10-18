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
import { mountPrevis } from './previs.js';

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
      // Safety net: the sequence is 7 s; never hold the page longer than that plus loading.
      setTimeout(() => { if (state === 'playing') player.skip(); }, 12000);
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
  const reel = mountReel(document.querySelector('[data-reel-frame]'), data);
  document.querySelector('[data-watch-reel]')?.addEventListener('click', () => {
    // The link scrolls to #reel; land keyboard focus on the player (or the slate) too.
    requestAnimationFrame(() => reel.focus());
  });
}

// --- 4. Selected work: shot-language cards, or stills, or the palette frame ------------------

async function initWork() {
  const cards = [...document.querySelectorAll('.work-card')];
  if (!cards.length) return;
  let shot = null, still = null;
  try { shot = await import('../ui/shotcard-mount.js'); } catch (err) { console.info('[work] shot cards unavailable', err?.message ?? err); }
  if (!shot?.mountShotCard) {
    try { still = await import('../pieces/still.js'); } catch (err) { console.info('[work] stills unavailable; palette frames stay', err?.message ?? err); }
  }
  const films = new Map((data.films ?? []).map(f => [f.slug, f]));
  for (const card of cards) {
    const link = card.querySelector('[data-film]');
    const frame = card.querySelector('[data-card-frame]');
    const film = films.get(link?.dataset.film);
    if (!film || !frame) continue;
    if (shot?.mountShotCard) {
      try {
        shot.mountShotCard(frame, film, { reducedMotion: isReducedMotion(), trigger: link });
        frame.classList.add('has-piece');
        continue;
      } catch (err) { console.warn('[work] shot card', film.slug, err); }
    }
    const real = (film.stills ?? []).find(s => s.featured && R.safeUrl(s.src)) ?? (film.stills ?? []).find(s => R.safeUrl(s.src));
    if (real) {
      frame.insertAdjacentHTML('afterbegin', String(R.html`<img src="${R.safeUrl(real.src)}" alt="" loading="lazy" decoding="async">`));
      frame.classList.add('has-piece');
    } else if (still?.renderStill) {
      whenNear(frame, async () => {
        try {
          const url = await still.renderStill({
            palette: R.cleanPalette(film.palette), aspect: Number(film.aspect) || 1.78, seed: hashString(film.slug + 0),
            kind: film.stillKinds?.[0], width: Math.round(frame.clientWidth * Math.min(2, devicePixelRatio || 1)),
          });
          const img = new Image();
          img.alt = ''; img.decoding = 'async'; img.src = url;
          frame.prepend(img);
          frame.classList.add('has-piece');
        } catch (err) { console.warn('[work] still', film.slug, err); }
      });
    }
  }
}

// --- 5. Studies ---------------------------------------------------------------------------------

const studyPlayers = new Map();

function initStudies() {
  for (const block of document.querySelectorAll('[data-study]')) {
    const id = block.dataset.study;
    const host = block.querySelector('[data-study-host]');
    const panel = block.querySelector('[data-controls]');
    if (!LOADERS[id] || !host) continue;

    // Companion DOM binds before the Player mounts (it only listens to 'playerparams').
    whenNear(block, async () => {
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
    }, '900px 0px');

    // On touch screens the light tour starts resolved and paused (as on the study page).
    const player = mount(host, {
      load: LOADERS[id], mode: 'loop', heavy: true, controls: panel ?? false,
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
  R.initChrome({ bindMotionToggle, solidAfter: () => (hero ? hero.offsetHeight - 80 : 8) });
  initHero(lifted);
  initReel();
  initStudies();
  const reveal = initReveal();
  initProgress({ runtime: site.timecodeRuntime ?? 180 });
  R.settleHash();
  openShutter();

  initWork();
  const grid = document.querySelector('[data-previs-grid]');
  whenNear(grid?.closest('section'), () => mountPrevis(grid, data).then(ok => { if (ok) reveal.scan(grid); }), '1200px 0px');
}

boot();
