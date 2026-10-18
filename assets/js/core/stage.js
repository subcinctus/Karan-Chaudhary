// Stage: turns a study page into either
//  - normal mode: a full-screen Player with generated controls (shareable study page), or
//  - record mode (?record): a bare w×h canvas at dpr 1 with the recorder contract
//      window.READY, N_FRAMES, FPS, renderFrame(i), __seek(t), __meta (incl. fontsOk)
//    which also matches Motion Prompt's make-your-own/render.mjs (READY / N_FRAMES / renderFrame).
//
// URL: ?record&w=1920&h=804&fps=30&seed=1&params=<base64 JSON>&layout=wide|tall&t=<seconds>

import { mount } from './player.js';
import { defaults, normalize } from './params.js';
import { setupCanvas, loadFonts } from './canvas.js';
import { applyPageGrain } from './grain.js';
import { bindMotionToggle } from './motion-pref.js';

/** Decode base64 / base64url JSON (UTF-8 safe). */
export function decodeParams(s) {
  if (!s) return null;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
/** Encode params for a ?params= URL (base64url). */
export function encodeParams(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Parse the stage query string. */
export function parseStageQuery(search = location.search) {
  const q = new URLSearchParams(search);
  const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  let params = null;
  try { params = decodeParams(q.get('params')); } catch (err) { console.warn('[stage] bad params', err); }
  return {
    record: q.has('record'),
    w: num('w', null), h: num('h', null), fps: num('fps', null), seed: num('seed', 1),
    params, layout: q.get('layout'), t: num('t', null),
  };
}

/**
 * Run a study page.
 * @param {{ load: () => Promise<{meta, create}>, host?: string|HTMLElement, controls?: string|HTMLElement, poster?: string, heavy?: boolean }} o
 */
export async function runStage(o) {
  const q = parseStageQuery();
  return q.record ? runRecord(o, q) : runNormal(o, q);
}

async function runRecord({ load }, q) {
  const root = document.documentElement;
  root.classList.add('is-record');
  window.READY = false;
  try {
    const { meta, create } = await load();
    const rec = meta.record ?? {};
    const w = Math.round(q.w ?? rec.w ?? 1920), h = Math.round(q.h ?? rec.h ?? 1080);
    const fps = q.fps ?? rec.fps ?? 30;
    const layout = q.layout ?? (w / h < 1 ? 'tall' : 'wide');
    const base = { ...defaults(meta.params), ...normalize(meta.params ?? [], q.params ?? {}) };
    const fixed = q.params != null;   // explicit params override the scripted demo

    const canvas = document.createElement('canvas');
    canvas.className = 'stage-record';
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    setupCanvas(canvas, w, h, 1);
    document.body.replaceChildren(canvas);

    const fontsOk = await loadFonts(meta.fonts ?? []);
    const instance = await create(canvas, { width: w, height: h, dpr: 1, params: base, seed: q.seed, quality: 1, record: true, reducedMotion: false, layout });
    const paramsAt = t => (!fixed && instance.script ? { ...base, ...instance.script(t) } : base);
    const duration = meta.duration ?? 0;

    window.__seek = t => { instance.seek(t, paramsAt(t)); return t; };
    window.renderFrame = i => window.__seek(i / fps);
    window.FPS = fps;
    window.N_FRAMES = Math.max(1, Math.round(duration * fps));
    window.__meta = {
      id: meta.id, title: meta.title, duration, posterTime: meta.posterTime ?? 0, fps, nFrames: window.N_FRAMES,
      w, h, layout, seed: q.seed, params: base, fixedParams: fixed, fonts: meta.fonts ?? [], fontsOk,
      context: meta.context, credits: meta.credits ?? [], record: rec,
      describe: instance.describe?.(paramsAt(meta.posterTime ?? 0)) ?? '',
    };
    window.__seek(q.t ?? meta.posterTime ?? 0);
    window.READY = true;
  } catch (err) {
    window.STAGE_ERROR = String(err?.stack ?? err);
    console.error('[stage] record mode failed', err);
  }
}

async function runNormal({ load, host = '[data-stage-host]', controls = '[data-controls]', poster, heavy = true, params }, q) {
  applyPageGrain();
  const toggle = document.querySelector('[data-motion-toggle]');
  if (toggle) bindMotionToggle(toggle);
  const hostEl = typeof host === 'string' ? document.querySelector(host) : host;
  const ctlEl = typeof controls === 'string' ? document.querySelector(controls) : controls;
  const player = mount(hostEl, {
    load, poster, heavy, eager: true, seed: q.seed, controls: ctlEl ?? false,
    params: { ...(params ?? {}), ...(q.params ?? {}) },
  });
  window.__stage = player;
  await player.ready;
  const meta = player.meta;
  if (meta) {
    const title = document.querySelector('[data-stage-title]');
    if (title && !title.textContent.trim()) title.textContent = meta.title;
    const credits = document.querySelector('[data-stage-credits]');
    if (credits && meta.credits?.length) credits.textContent = `Motion Prompt references: ${meta.credits.join(' · ')} (MIT, Shohei Ohtaki).`;
  }
  // Test hooks: same names as record mode so checks can drive either page.
  window.__seek = t => { player.pause(); player.seek(t); return t; };
  window.__meta = { id: meta?.id, duration: player.duration, posterTime: meta?.posterTime ?? 0, mode: 'normal' };
  window.READY = player.state !== 'error';
  return player;
}
