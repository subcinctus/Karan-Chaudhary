// Player: the only owner of a clock. Mounts a piece (meta + create()) into a host element and
// handles lazy init, visibility, arbitration between heavy pieces, reduced motion, sizing,
// adaptive quality, WebGL context loss and errors. Pieces stay pure: seek(t, params).
//
//   const player = mount(host, { load: () => import('../pieces/focus.js'), controls: true, heavy: true });
//
// Failure policy: nothing here throws into the page. Errors log console.warn and keep the poster.
//
// Reduced motion / "Motion off": no clock. The frame is seek(posterTime, script(posterTime) over params),
// the same frame the recorder writes as the poster. Controls still work: the first set() switches to
// 'interactive' and the frame follows the params; preset springs become instant. A once-mode piece
// shown resolved this way counts as ended (onEnd fires once).

import { defaults, ParamSet, normalize } from './params.js';
import { isReducedMotion, onMotionChange } from './motion-pref.js';
import { setupCanvas } from './canvas.js';
import { buildControls } from './controls.js';

const QUALITY_STEPS = [1, 0.85, 0.7, 0.5];
const VISIBLE_RATIO = 0.15;
const MAX_STEP = 1 / 15;              // clock never jumps more than this per frame
const ADAPT_FRAMES = 20;
const LIMITS = { heavy: 1, light: 2 }; // how many players per group may animate at once

// --- Page-level state shared by all players ---------------------------------

const pool = new Set();
let order = 0;
let pageVisible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';

function arbitrate() {
  for (const group of ['heavy', 'light']) {
    const want = [...pool].filter(p => p.group === group && p.wantsRun());
    want.sort((a, b) => b.ratio - a.ratio || a.order - b.order);
    const allowed = new Set(want.slice(0, LIMITS[group]));
    for (const p of pool) if (p.group === group) p.setAllowed(allowed.has(p));
  }
}

if (typeof window !== 'undefined') {
  const setPage = v => { pageVisible = v; arbitrate(); };
  document.addEventListener('visibilitychange', () => setPage(document.visibilityState !== 'hidden'));
  window.addEventListener('pagehide', () => setPage(false));
  window.addEventListener('pageshow', () => setPage(document.visibilityState !== 'hidden'));
  window.__players ??= [];
}

/** Change the per-group animation limits (e.g. allow more shot cards on a wide screen). */
export function setArbitrationLimits(limits) { Object.assign(LIMITS, limits); arbitrate(); }

const isTouch = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

/**
 * 'tall' on a narrow portrait screen. A fill-mode host (its size comes from the page, not from the
 * frame aspect) is also 'tall' whenever it is portrait itself, at any width. Aspect-fit hosts skip
 * that test: their height follows the layout, so it would never switch back.
 */
function autoLayout(host, fill = false) {
  const w = host.clientWidth || innerWidth;
  if (fill && host.clientHeight > w) return 'tall';
  return w < 640 && innerHeight > innerWidth ? 'tall' : 'wide';
}

const h = (tag, cls, attrs = {}) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// --- mount -------------------------------------------------------------------

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {() => Promise<{meta, create}>} o.load      lazy module loader
 * @param {'loop'|'once'|'interactive'|'static'} [o.mode]  defaults from meta (loop / once / static)
 * @param {object} [o.params]   initial params (merged over meta defaults)
 * @param {number} [o.seed=1]
 * @param {boolean} [o.autoplay=true]   ignored under reduced motion
 * @param {number} [o.dprCap=2]  (1.5 on hover:none)
 * @param {number} [o.maxPixels=2.1e6]
 * @param {string} [o.poster]   relative URL, shown until the first frame and on error
 * @param {boolean|string|HTMLElement} [o.controls=false]  build controls from meta.params
 * @param {boolean} [o.heavy=false]  takes part in one-heavy-piece arbitration
 * @param {'auto'|'wide'|'tall'} [o.layout='auto']
 * @param {'aspect'|'fill'} [o.fit='aspect']  aspect: frame uses meta.aspect; fill: frame fills host
 * @param {boolean} [o.eager=false]  init immediately instead of when near the viewport
 * @param {string} [o.lazyMargin='400px 0px']  how far ahead of the viewport a lazy player starts
 * @param {boolean} [o.chrome=true]  show the play/pause and Resume demo buttons
 * @param {boolean} [o.adaptive=true]
 * @param {string} [o.label]  fallback canvas aria-label
 * @param {(api) => void} [o.onEnd]
 * @param {(state, api) => void} [o.onState]
 */
export function mount(host, o = {}) {
  const {
    load, params: initialParams = {}, seed = 1, autoplay = true, dprCap = 2, maxPixels = 2.1e6,
    poster, controls = false, heavy = false, layout: layoutOpt = 'auto', fit = 'aspect',
    eager = false, lazyMargin = '400px 0px', chrome = true, adaptive = true, label, onEnd, onState,
  } = o;

  // DOM: frame > canvas + poster + chrome. Reuse a frame/canvas the page already provides.
  host.classList.add('player');
  if (fit === 'fill') host.classList.add('player--fill');
  const frame = host.querySelector('.player__frame') ?? host.appendChild(h('div', 'player__frame'));
  const canvas = frame.querySelector('canvas') ?? frame.appendChild(h('canvas', 'player__canvas'));
  canvas.classList.add('player__canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label ?? 'Loading animation');
  let posterImg = null;
  if (poster) {
    posterImg = frame.querySelector('.player__poster') ?? frame.appendChild(h('img', 'player__poster', { alt: '', decoding: 'async', loading: eager ? 'eager' : 'lazy' }));
    posterImg.src = poster;
  }
  const bar = h('div', 'player__chrome');
  const toggleBtn = h('button', 'player__btn player__toggle', { type: 'button' });
  toggleBtn.innerHTML = '<span class="player__icon" aria-hidden="true"></span><span class="visually-hidden"></span>';
  const resumeBtn = h('button', 'player__btn player__resume', { type: 'button' });
  resumeBtn.textContent = 'Resume demo';
  toggleBtn.hidden = true; resumeBtn.hidden = true;
  bar.append(toggleBtn, resumeBtn);
  if (chrome) frame.append(bar);
  const fallback = h('p', 'player__fallback');
  fallback.textContent = 'The live render is unavailable in this browser.';
  frame.append(fallback);

  // Internal state.
  let mod = null, meta = null, instance = null;
  let state = 'idle', mode = o.mode ?? null, initialMode = null;
  let wantPlay = false, allowed = false, ratio = eager ? 1 : 0, ended = false, destroyed = false;
  let reduced = isReducedMotion();
  let t = 0, pt = 0, raf = 0, lastNow = null, frames = 0;
  let paramSet = null, pending = {};
  // Transport intents made before the instance exists (e.g. Esc during the title's font load).
  let queued = { skip: false, seek: null, play: null };
  let endFired = false;   // onEnd fires once per play-through
  let qIndex = 0, ema = null, slow = 0, fast = 0;
  let size = { w: 0, h: 0, dpr: 0 }, layout = 'wide';
  let ui = null, lastLabel = '', contextLost = false;
  let drawnSig = '';   // t, size and params of the frame on the canvas (see render)
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  const duration = () => meta?.duration ?? 0;
  const animated = () => (mode === 'loop' || mode === 'once') && duration() > 0;
  const visible = () => ratio >= VISIBLE_RATIO;
  const settling = () => mode === 'interactive' && paramSet && !paramSet.settled(pt);

  const rec = {
    group: heavy ? 'heavy' : 'light', order: order++,
    get ratio() { return ratio; },
    wantsRun: () => !!instance && state !== 'error' && !reduced && pageVisible && visible() && wantPlay && animated(),
    setAllowed(v) { if (allowed !== v) { allowed = v; } update(); },
  };

  function setState(s) {
    if (s === state) return;
    state = s;
    host.dataset.state = s;
    try { onState?.(s, api); } catch (err) { console.warn('[player] onState', err); }
    host.dispatchEvent(new CustomEvent('playerstate', { detail: { state: s } }));
  }
  host.dataset.state = state;

  function fail(err) {
    console.warn(`[player] ${meta?.id ?? 'piece'}:`, err);
    stop();
    setState('error');
    delete host.dataset.drawn;
    toggleBtn.hidden = true; resumeBtn.hidden = true;
    if (queued.skip) { queued.skip = false; fireEnd(); }   // the user asked to move on; let the page do so
    resolveReady();
  }

  // --- params -------------------------------------------------------------

  /**
   * Params for the current frame. Until the user touches a control, a scripted piece shows
   * script(t) over its params — also under reduced motion, where t = posterTime, so the static
   * frame matches the recorded poster. After the first set() (mode 'interactive') params win.
   */
  function currentParams() {
    if (mode !== 'interactive' && instance?.script && animated()) {
      return { ...paramSet.at(pt), ...instance.script(t) };
    }
    return paramSet.at(pt);
  }

  // --- rendering ------------------------------------------------------------

  /** Draw the frame at t. timed: called by the clock, so its cost feeds adaptive quality. */
  function render(timed = false) {
    if (!instance || contextLost || state === 'error') return;
    const params = currentParams();
    // Pieces are pure (pixels = f(t, params, size, dpr, seed)), so an on-demand redraw of the frame
    // already on the canvas is skipped: a static player draws exactly one frame (e.g. a queued skip()
    // landing on the reduced-motion frame it already shows). Clock frames are always drawn and leave
    // no signature, so the next on-demand render after them always draws too.
    const sig = timed ? '' : `${t}|${size.w}x${size.h}@${size.dpr}|${JSON.stringify(params)}`;
    if (sig && sig === drawnSig) return;
    drawnSig = sig;
    const t0 = performance.now();
    try {
      instance.seek(t, params);
    } catch (err) { drawnSig = ''; fail(err); return; }
    const cost = performance.now() - t0;
    frames++;
    if (!host.dataset.drawn) host.dataset.drawn = '';
    if (timed && adaptive) adapt(cost);
    if (instance.describe) {
      const text = instance.describe(params);
      if (text && text !== lastLabel) { lastLabel = text; canvas.setAttribute('aria-label', text); }
    }
    emitParams(params);
  }

  // Companion DOM (a lighting plot, a DoF ruler) listens for 'playerparams' on the host; it fires
  // only when a primitive param value actually changed since the last drawn frame.
  let lastParamsKey = '';
  function emitParams(params) {
    const key = Object.entries(params).map(([k, v]) => (typeof v === 'object' ? k : `${k}=${v}`)).join('&');
    if (key === lastParamsKey) return;
    lastParamsKey = key;
    host.dispatchEvent(new CustomEvent('playerparams', { detail: { params, t, api } }));
  }

  function adapt(cost) {
    const budget = meta.budgetMs ?? 12;
    ema = ema == null ? cost : ema * 0.9 + cost * 0.1;
    if (ema > budget * 1.25) { slow++; fast = 0; } else if (ema < budget * 0.6) { fast++; slow = 0; } else { slow = fast = 0; }
    if (slow >= ADAPT_FRAMES && qIndex < QUALITY_STEPS.length - 1) { qIndex++; slow = fast = 0; ema = null; applySize(true); }
    else if (fast >= ADAPT_FRAMES && qIndex > 0) { qIndex--; slow = fast = 0; ema = null; applySize(true); }
  }

  function measure() {
    const w = frame.clientWidth, hh = frame.clientHeight;
    const cap = isTouch() ? Math.min(dprCap, 1.5) : dprCap;
    let dpr = Math.min(window.devicePixelRatio || 1, cap) * QUALITY_STEPS[qIndex];
    if (w * hh > 0) dpr *= Math.min(1, Math.sqrt(maxPixels / (w * hh * dpr * dpr)));
    return { w, h: hh, dpr };
  }

  function applyLayout() {
    if (!meta) return;
    layout = layoutOpt === 'auto' ? autoLayout(host, fit === 'fill') : layoutOpt;
    host.dataset.layout = layout;
    if (fit === 'aspect') {
      const a = typeof meta.aspect === 'number' ? meta.aspect : (meta.aspect?.[layout] ?? meta.aspect?.wide ?? 16 / 9);
      frame.style.setProperty('--ar', String(a));
    }
  }

  /** Resize the backing store when the frame or quality changed; redraw the current frame. */
  function applySize(force = false) {
    if (!instance) return false;
    applyLayout();
    const s = measure();
    if (!s.w || !s.h) return false;
    if (!force && s.w === size.w && s.h === size.h && Math.abs(s.dpr - size.dpr) < 1e-3) return false;
    size = s;
    setupCanvas(canvas, s.w, s.h, s.dpr);
    try { instance.resize(s.w, s.h, s.dpr, { layout }); } catch (err) { fail(err); return false; }
    drawnSig = '';   // after resize() always redraw, even at the same size
    render();
    return true;
  }

  // --- clock ------------------------------------------------------------------

  let inTick = false;
  function tick(now) {
    raf = 0;
    if (destroyed) return;
    inTick = true;
    const dt = lastNow == null ? 0 : Math.min((now - lastNow) / 1000, MAX_STEP);
    lastNow = now;
    pt += dt;
    const running = rec.wantsRun() && allowed;
    if (running) {
      t += dt;
      if (mode === 'loop') t %= duration();
      else if (mode === 'once' && t >= duration()) { t = duration(); ended = true; }
    }
    render(true);
    if (paramSet && mode === 'interactive' && paramSet.settled(pt)) paramSet.compact(pt);
    // Keep the controls roughly in step with the scripted demo (4×/s), unless the user is on them.
    if (ui && running && instance.script && frames % 15 === 0 && !ui.root.contains(document.activeElement)) ui.update(currentParams());
    if (running && ended) { wantPlay = false; fireEnd(); }
    update();
    inTick = false;
  }

  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastNow = null; }

  function fireEnd() {
    if (endFired) return;
    endFired = true;
    try { onEnd?.(api); } catch (err) { console.warn('[player] onEnd', err); }
  }

  /** Jump to the last frame and hold it (Skip intro, or a once-piece shown resolved). */
  function finish() {
    t = duration(); ended = true; wantPlay = false;
    render(); arbitrate(); update();
    fireEnd();
  }

  /** Apply transport calls made while the instance was still loading. */
  function applyQueued() {
    const q = queued;
    queued = { skip: false, seek: null, play: null };
    if (q.skip) return finish();
    if (q.seek != null) api.seek(q.seek);
    if (q.play === true) api.play();
    else if (q.play === false) api.pause();
  }

  /** Reconcile the rAF loop, state and chrome with the current wishes. */
  function update() {
    if (!instance || destroyed || state === 'error') return;
    const running = rec.wantsRun() && allowed;
    const needs = running || (settling() && pageVisible && visible());
    if (needs && !raf) {
      if (!inTick) lastNow = null;   // a fresh start must not count the idle gap as elapsed time
      raf = requestAnimationFrame(tick);
    }
    else if (!needs && raf) stop();

    if (reduced || mode === 'static' || !duration()) setState('static');
    else if (mode === 'interactive') setState('ready');
    else setState(running ? 'playing' : 'paused');

    const showToggle = animated() && !reduced;
    toggleBtn.hidden = !showToggle;
    host.dataset.want = wantPlay ? 'play' : 'pause';
    const verb = wantPlay ? 'Pause' : 'Play';
    toggleBtn.setAttribute('aria-label', `${verb} animation`);
    toggleBtn.lastChild.textContent = verb;
    resumeBtn.hidden = !(mode === 'interactive' && initialMode !== 'interactive' && initialMode !== 'static' && duration() > 0 && !reduced);
  }

  // --- lifecycle ----------------------------------------------------------------

  async function createInstance() {
    applyLayout();
    const s = measure();
    size = { w: s.w || 1, h: s.h || 1, dpr: s.dpr };
    setupCanvas(canvas, size.w, size.h, size.dpr);
    drawnSig = '';
    const params = paramSet.at(pt);
    instance = await mod.create(canvas, {
      width: size.w, height: size.h, dpr: size.dpr, params, seed, quality: QUALITY_STEPS[qIndex],
      record: false, reducedMotion: reduced, layout,
    });
    if (!instance || typeof instance.seek !== 'function') throw new Error('create() must return { seek, resize, dispose }');
  }

  async function init() {
    if (state !== 'idle' || destroyed) return;
    setState('loading');
    try {
      mod = await load();
      meta = mod.meta;
      if (!meta || typeof mod.create !== 'function') throw new Error('piece must export meta and create()');
      host.dataset.piece = meta.id;
      initialMode = mode ??= meta.loop === false ? 'once' : meta.interactive && !duration() ? 'interactive' : 'loop';
      if (!duration() && mode !== 'interactive') initialMode = mode = 'static';
      paramSet = new ParamSet(meta.params ?? [], { ...defaults(meta.params), ...normalize(meta.params ?? [], initialParams), ...pending });
      await createInstance();
      if (destroyed) { instance.dispose?.(); return; }
      t = reduced ? (meta.posterTime ?? 0) : mode === 'static' ? (meta.posterTime ?? 0) : 0;
      wantPlay = autoplay && animated() && !reduced;
      if (controls) mountControls();
      ended = mode === 'once' && t >= duration();
      render();
      setState(reduced || mode === 'static' ? 'static' : 'ready');
      arbitrate();
      update();
      startResize();
      if (ended) fireEnd();   // reduced motion shows the once-piece already resolved
      applyQueued();
      resolveReady();
    } catch (err) { fail(err); }
  }

  function mountControls() {
    const target = controls instanceof HTMLElement ? controls
      : typeof controls === 'string' ? document.querySelector(controls)
        : host.querySelector('[data-controls]') ?? host.parentElement?.querySelector('[data-controls]');
    if (!target || !meta.params?.length) return;
    ui = buildControls(target, meta.params, {
      values: currentParams(),
      describe: instance.describe ? p => instance.describe(p) : undefined,
      summary: instance.summary ? (p, k) => instance.summary(p, k) : undefined,
      onInput: (partial, opts) => api.set(partial, opts),
    });
  }

  /** Freeze what is on screen as the new base params and stop the demo clock (render on demand). */
  function enterInteractive(skipKeys = []) {
    const shown = currentParams();
    paramSet = new ParamSet(meta.params ?? [], shown);
    mode = 'interactive';
    wantPlay = false;
    // Sync the other controls to what is on screen, but never overwrite the one being edited.
    const sync = { ...shown };
    for (const k of skipKeys) delete sync[k];
    ui?.update(sync);
  }

  let ro = null, roRaf = 0, visIO = null, lazyIO = null;
  function startResize() {
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', onWinResize); return; }
    ro = new ResizeObserver(() => {
      if (roRaf) return;
      roRaf = requestAnimationFrame(() => { roRaf = 0; applySize(); });
    });
    ro.observe(frame);
  }
  const onWinResize = () => applySize();

  // Visibility: pause below 15 % visible; ratio also ranks heavy players.
  if (typeof IntersectionObserver !== 'undefined') {
    visIO = new IntersectionObserver(entries => {
      for (const e of entries) ratio = e.isIntersecting ? e.intersectionRatio : 0;
      arbitrate();
    }, { threshold: [0, VISIBLE_RATIO, 0.3, 0.5, 0.75, 1] });
    visIO.observe(host);
  } else ratio = 1;

  // Lazy init `lazyMargin` (400 px by default) before the host scrolls into view.
  if (eager || typeof IntersectionObserver === 'undefined') queueMicrotask(init);
  else {
    lazyIO = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { lazyIO.disconnect(); lazyIO = null; init(); }
    }, { rootMargin: lazyMargin });
    lazyIO.observe(host);
  }

  const offMotion = onMotionChange(({ reduced: r }) => {
    reduced = r;
    if (!instance) return;
    if (r) {
      wantPlay = false;
      t = meta.posterTime ?? 0;
      ended = mode === 'once' && t >= duration();
      render();
      if (ended) fireEnd();
    }
    // A once-piece that already reached its end stays resolved (and must not fire onEnd again).
    else if (autoplay && animated() && !(mode === 'once' && (ended || t >= duration()))) wantPlay = true;
    arbitrate(); update();
  });

  // WebGL context loss → poster; restore → rebuild the instance.
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    contextLost = true;
    stop();
    delete host.dataset.drawn;
    setState('error');
    console.warn(`[player] ${meta?.id}: WebGL context lost`);
  });
  canvas.addEventListener('webglcontextrestored', async () => {
    try {
      try { instance?.dispose(); } catch { /* old context is gone */ }
      instance = null;
      await createInstance();
      contextLost = false;
      state = 'loading';
      render();
      update();
      applyQueued();
    } catch (err) { fail(err); }
  });

  toggleBtn.addEventListener('click', () => api.toggle());
  resumeBtn.addEventListener('click', () => api.resumeDemo());

  // --- public API ---------------------------------------------------------------

  const api = {
    ready, host, canvas,
    /** Start loading now (e.g. keyboard focus is heading this way); a no-op once started. */
    prime() { lazyIO?.disconnect(); lazyIO = null; init(); },
    get state() { return state; },
    get mode() { return mode; },
    get meta() { return meta; },
    get id() { return meta?.id; },
    get time() { return t; },
    get duration() { return duration(); },
    get params() { return paramSet ? currentParams() : { ...initialParams, ...pending }; },
    get frames() { return frames; },
    get quality() { return QUALITY_STEPS[qIndex]; },
    play() {
      if (!instance) { queued.play = true; return; }
      if (reduced || !animated()) return;
      if (ended || (mode === 'once' && t >= duration())) { t = 0; ended = false; endFired = false; }
      wantPlay = true; arbitrate(); update();
    },
    pause() {
      if (!instance) { queued.play = false; return; }
      wantPlay = false; arbitrate(); update();
    },
    toggle() { wantPlay ? api.pause() : api.play(); },
    /** Show the frame at time t (clamped to the duration). */
    seek(time) {
      if (!instance) { queued.seek = Number(time) || 0; queued.skip = false; return; }
      t = Math.max(0, Math.min(Number(time) || 0, duration() || 0));
      ended = mode === 'once' && t >= duration();
      if (!ended) endFired = false;
      render();
      // A paused demo's controls show the scripted params of the frame on screen.
      if (mode !== 'interactive') ui?.update(currentParams());
    },
    /**
     * Jump to the last frame, pause and fire onEnd (Skip intro). Safe to call while loading:
     * the skip is queued and applied as soon as the piece exists (or onEnd fires if it fails).
     */
    skip() {
      if (!instance) { if (state !== 'error') queued.skip = true; else fireEnd(); return; }
      finish();
    },
    /**
     * Change params. Controls call this with animate:false (direct manipulation); presets animate
     * through ParamTrack springs. The first user change switches to interactive (render on demand).
     */
    set(partial, { animate = true, interactive = true, source } = {}) {
      if (!instance) { pending = { ...pending, ...partial }; return; }
      if (reduced) animate = false;   // preset transitions are instant under reduced motion
      // Interactive even under reduced motion, so the control (not script(t)) decides the frame.
      if (interactive && (mode === 'loop' || mode === 'once')) enterInteractive(source === 'control' ? Object.keys(partial) : []);
      paramSet.set(partial, pt, { animate });
      if (source !== 'control') ui?.update(paramSet.targets);
      // Draw now unless a spring is under way and a frame is already scheduled. A key with no spring
      // (radio, select, toggle, string) or a set that is already settled changes the picture at once,
      // and a frame queued by the demo is no promise: update() below cancels it when nothing needs
      // the clock any more.
      const instant = !animate || paramSet.settled(pt) || Object.keys(partial).some(k => !paramSet.tracks[k]);
      if (instant || !raf) render();
      update();
    },
    /** Leave interactive mode and return to the scripted demo. */
    resumeDemo() {
      if (!instance || initialMode === 'interactive' || initialMode === 'static') return;
      mode = initialMode;
      paramSet = new ParamSet(meta.params ?? [], { ...defaults(meta.params), ...normalize(meta.params ?? [], initialParams) });
      if (reduced) t = meta.posterTime ?? 0;
      ended = mode === 'once' && t >= duration();
      wantPlay = !reduced && autoplay !== false && !(mode === 'once' && ended);
      ui?.update(currentParams());
      render(); arbitrate(); update();
      toggleBtn.focus?.();
    },
    destroy() {
      destroyed = true;
      stop();
      if (roRaf) cancelAnimationFrame(roRaf);
      ro?.disconnect(); visIO?.disconnect(); lazyIO?.disconnect();
      window.removeEventListener('resize', onWinResize);
      offMotion();
      ui?.destroy();
      try { instance?.dispose(); } catch (err) { console.warn('[player] dispose', err); }
      instance = null;
      pool.delete(rec);
      const i = window.__players.indexOf(api);
      if (i >= 0) window.__players.splice(i, 1);
      arbitrate();
    },
  };

  pool.add(rec);
  window.__players.push(api);
  return api;
}
