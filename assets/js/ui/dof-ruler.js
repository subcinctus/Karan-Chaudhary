// Companion DOM for the Focus study: an SVG depth-of-field ruler on a log distance axis, an optional
// text readout with per-subject chips, and lens-ring engravings under the focus slider.
//
//   import { bindDofRuler } from '../assets/js/ui/dof-ruler.js';
//   const host = document.querySelector('[data-stage-host]');          // the Player host
//   bindDofRuler(host, document.querySelector('[data-dof-ruler]'), {
//     readout: document.querySelector('[data-dof-readout]'),          // optional
//     controls: document.querySelector('[data-controls]'),            // optional: ring marks + unit sync
//   });
//   mount(host, { load: () => import('../pieces/focus.js'), controls: true, heavy: true });
//
// The ruler draws at once from the piece's defaults (so the page has a ruler before the canvas
// loads, or without it), then follows the Player's 'playerparams' events. It only listens: call it
// before or after mount(). Everything here derives from pieces/focus.js lensState(), which is
// core/optics.js, so the ruler, the in-canvas report and describe() always agree.

import { defaults } from '../core/params.js';
import { M_TO_FT } from '../core/optics.js';
import {
  meta, readout, formatDist, SUBJECTS, RING_MARKS, FOCUS_SLIDER_MAX, isInfinity,
} from '../pieces/focus.js';

const NS = 'http://www.w3.org/2000/svg';
const AXIS = { min: 0.3, max: 100 };          // metres on the log axis; ∞ sits past the end
const TICKS = {
  m: { major: [0.5, 1, 2, 3, 5, 10, 20, 50], minor: [0.4, 0.6, 0.7, 0.8, 0.9, 1.5, 4, 6, 7, 8, 9, 15, 30, 40, 60, 70, 80, 90] },
  ft: { major: [1, 2, 3, 5, 10, 20, 50, 100, 300].map(f => f / M_TO_FT), minor: [4, 6, 7, 8, 9, 15, 30, 40, 60, 70, 80, 90, 150, 200, 250].map(f => f / M_TO_FT) },
};
const tickLabel = (m, u) => {
  const v = u === 'ft' ? m * M_TO_FT : m;
  return String(Math.round(v * (v < 1 ? 100 : 10)) / (v < 1 ? 100 : 10));
};

const svgEl = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
};

/** Short distance for ruler labels: "3.00 m" → "3.00", "9 ft 10 in" kept whole. */
const short = (mm, u) => (Number.isFinite(mm) ? formatDist(mm / 1000, u).toUpperCase() : '∞');

/**
 * Render the ruler into an <svg> at its current CSS width.
 * @param {SVGSVGElement} svg
 * @param {object} params  Focus-study params (format, focal, stop, focus, blades, units)
 */
export function renderRuler(svg, params) {
  const p = { ...defaults(meta.params), ...params };
  const u = p.units === 'ft' ? 'ft' : 'm';
  const R = readout(p), L = R.lens;
  const W = Math.max(280, Math.round(svg.clientWidth || svg.parentElement?.clientWidth || 640));
  const narrow = W < 560;
  const H = 118;
  const padL = 14, padR = 16, infGap = 30;
  const xInf = W - padR, x1 = xInf - infGap;
  const lx = m => padL + ((Math.log(m) - Math.log(AXIS.min)) / (Math.log(AXIS.max) - Math.log(AXIS.min))) * (x1 - padL);
  const X = mm => {
    if (!Number.isFinite(mm)) return xInf;
    const m = mm / 1000;
    if (m >= AXIS.max) return Math.min(xInf - 8, x1 + (Math.log(m / AXIS.max) / Math.log(10)) * 10);
    return Math.max(padL, lx(Math.max(AXIS.min, m)));
  };

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${svg.id || 'dof-ruler'}-t ${svg.id || 'dof-ruler'}-d`);
  const sharpNames = L.subjects.filter(s => s.sharp).map(s => s.name.toLowerCase());
  svg.append(
    svgEl('title', { id: `${svg.id || 'dof-ruler'}-t` }, 'Depth-of-field ruler'),
    svgEl('desc', { id: `${svg.id || 'dof-ruler'}-d` },
      `Focus ${R.focus}. ${R.line}. Sharp subjects: ${sharpNames.length ? sharpNames.join(', ') : 'none'}.`),
  );

  const yTop = 28, yBot = 62, yMid = 45, yAxis = 72;

  // Depth-of-field band (near → far; far may be ∞).
  const bx0 = X(L.near), bx1 = X(L.far);
  svg.append(svgEl('rect', { class: 'dof-ruler__band', x: bx0, y: yTop, width: Math.max(1.5, bx1 - bx0), height: yBot - yTop }));
  svg.append(svgEl('line', { class: 'dof-ruler__edge', x1: bx0, x2: bx0, y1: yTop, y2: yBot }));
  svg.append(svgEl('line', { class: 'dof-ruler__edge', x1: bx1, x2: bx1, y1: yTop, y2: yBot }));

  // Axis, ticks, labels, ∞ detent.
  svg.append(svgEl('line', { class: 'dof-ruler__axis', x1: padL, x2: x1, y1: yAxis, y2: yAxis }));
  svg.append(svgEl('line', { class: 'dof-ruler__axis dof-ruler__axis--gap', x1: x1 + 4, x2: xInf, y1: yAxis, y2: yAxis }));
  for (const m of TICKS[u].minor) if (m > AXIS.min && m < AXIS.max) svg.append(svgEl('line', { class: 'dof-ruler__tick', x1: lx(m), x2: lx(m), y1: yAxis, y2: yAxis + 4 }));
  const majors = TICKS[u].major.filter(m => m > AXIS.min && m < AXIS.max);
  majors.forEach((m, i) => {
    const x = lx(m);
    svg.append(svgEl('line', { class: 'dof-ruler__tick dof-ruler__tick--major', x1: x, x2: x, y1: yAxis, y2: yAxis + 7 }));
    if (narrow && i % 2 && m > 1) return;   // thin the labels on phones
    svg.append(svgEl('text', { class: 'dof-ruler__num', x, y: yAxis + 19, 'text-anchor': 'middle' }, tickLabel(m, u)));
  });
  svg.append(svgEl('line', { class: 'dof-ruler__tick dof-ruler__tick--major', x1: xInf, x2: xInf, y1: yAxis - 3, y2: yAxis + 7 }));
  svg.append(svgEl('text', { class: 'dof-ruler__num dof-ruler__num--inf', x: xInf, y: yAxis + 20, 'text-anchor': 'middle' }, '∞'));

  // Hyperfocal tick (daylight), focus mark (paper), and their labels on the bottom row.
  const xH = X(L.H), xS = X(L.inf ? Infinity : L.s);
  svg.append(svgEl('line', { class: 'dof-ruler__hyper', x1: xH, x2: xH, y1: yTop - 4, y2: yAxis + 7 }));
  svg.append(svgEl('line', { class: 'dof-ruler__focus', x1: xS, x2: xS, y1: yTop - 6, y2: yAxis }));
  svg.append(svgEl('path', { class: 'dof-ruler__witness', d: `M${xS} ${yAxis + 1} l5 8 h-10 z` }));

  const yLab = H - 4;
  const fLabel = `FOCUS ${R.focus.toUpperCase()}`, hLabel = `H ${short(L.H, u)}`;
  const cw = 6.4;   // approx. mono glyph advance at 10.5 px with tracking
  const place = (x, text) => {
    const w = text.length * cw;
    const left = Math.min(Math.max(padL, x - w / 2), W - padR - w);
    return { left, right: left + w, w };
  };
  const fp = place(xS, fLabel);
  let hp = place(xH, hLabel);
  if (hp.left < fp.right + 10 && hp.right > fp.left - 10) {
    // Overlap: put H on whichever side has room.
    hp = xH >= xS ? { ...hp, left: Math.min(fp.right + 12, W - padR - hp.w) } : { ...hp, left: Math.max(padL, fp.left - 12 - hp.w) };
    if (hp.left < fp.right + 4 && hp.left + hp.w > fp.left - 4) hp = null;   // no room: the readout still says it
  }
  svg.append(svgEl('text', { class: 'dof-ruler__label dof-ruler__label--focus', x: fp.left, y: yLab }, fLabel));
  if (hp) svg.append(svgEl('text', { class: 'dof-ruler__label dof-ruler__label--hyper', x: hp.left, y: yLab }, hLabel));

  // Subjects: a disc whose size grows with the blur disc (in circles of confusion); tungsten = sharp.
  let lastRight = -Infinity;
  for (const s of L.subjects) {
    const x = X(s.d * 1000);
    const r = s.sharp ? 4 : 4.5 + 7.5 * Math.min(1, Math.log10(Math.max(1, s.ratio)) / 2);   // 1× → 4.5, 100× CoC → 12
    const g = svgEl('g', { class: `dof-ruler__subject${s.sharp ? ' is-sharp' : ''}` });
    g.append(svgEl('circle', { cx: x, cy: yMid, r }));
    const name = narrow ? s.id : `${s.id} ${s.name.toUpperCase()}`;
    const w = name.length * cw;
    let tx = x - w / 2;
    if (tx < lastRight + 6) tx = lastRight + 6;
    tx = Math.min(tx, W - padR - w);
    lastRight = tx + w;
    g.append(svgEl('text', { class: 'dof-ruler__name', x: tx, y: 14 }, name));
    svg.append(g);
  }
  return { near: L.near, far: L.far, H: L.H };
}

/** Fill a readout container: a definition list of the limits and a list of subject chips. */
export function renderReadout(el, params) {
  const p = { ...defaults(meta.params), ...params };
  const R = readout(p), u = p.units === 'ft' ? 'ft' : 'm';
  const dl = document.createElement('dl');
  dl.className = 'dof-readout__list';
  for (const [k, v] of [['Near', R.near], ['Far', R.far], ['DoF', R.dof], ['Hyperfocal', R.hyperfocal]]) {
    const row = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    row.append(dt, dd); dl.append(row);
  }
  const ul = document.createElement('ul');
  ul.className = 'dof-readout__chips';
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', 'Subjects');
  for (const s of R.lens.subjects) {
    const li = document.createElement('li');
    li.className = `dof-chip${s.sharp ? ' is-sharp' : ''}`;
    const dist = formatDist(s.d, u);
    li.innerHTML = '<span class="dof-chip__dot" aria-hidden="true"></span><span class="dof-chip__id"></span><span class="dof-chip__name"></span><span class="dof-chip__state"></span>';
    li.children[1].textContent = s.id;
    li.children[2].textContent = `${s.name} · ${dist}`;
    // Rounded up below 10×, so a disc just over the CoC never reads "1.0×" next to "not sharp".
    li.children[3].textContent = s.sharp ? 'Sharp' : `${s.ratio >= 10 ? Math.round(s.ratio) : (Math.ceil(s.ratio * 10) / 10).toFixed(1)}× CoC`;
    ul.append(li);
  }
  el.replaceChildren(dl, ul);
}

/** Engrave lens-ring marks under the focus slider (aria-hidden), in the current units. */
export function ringMarks(input, units = 'm') {
  if (!input) return null;
  const item = input.closest('.controls__item') ?? input.parentElement;
  let ring = item.querySelector('.dof-ring');
  if (!ring) {
    ring = document.createElement('div');
    ring.className = 'dof-ring';
    ring.setAttribute('aria-hidden', 'true');
    input.insertAdjacentElement('afterend', ring);
  }
  if (ring.dataset.units === units) return ring;
  ring.dataset.units = units;
  const p = meta.params.find(q => q.key === 'focus');
  const pos = m => (Number.isFinite(m) ? Math.log(m / p.min) / Math.log(p.max / p.min) : 1);
  ring.replaceChildren(...RING_MARKS[units].map(m => {
    const s = document.createElement('span');
    s.className = Number.isFinite(m) ? 'dof-ring__mark' : 'dof-ring__mark dof-ring__mark--inf';
    s.style.setProperty('--u', pos(m).toFixed(4));
    s.textContent = Number.isFinite(m) ? tickLabel(m, units) : '∞';
    return s;
  }));
  return ring;
}

/**
 * Bind the ruler (and optional readout / slider decorations) to a Focus-study Player host.
 * @param {HTMLElement} host  the element passed to mount()
 * @param {SVGSVGElement|HTMLElement} el  an <svg>, or a container that will receive one
 * @param {{ readout?: HTMLElement, controls?: HTMLElement, params?: object }} [o]
 * @returns {{ update(params): void, destroy(): void, svg: SVGSVGElement }}
 */
export function bindDofRuler(host, el, { readout: readoutEl = null, controls = null, params = null } = {}) {
  const svg = el instanceof SVGSVGElement ? el : el.appendChild(svgEl('svg', { class: 'dof-ruler__svg' }));
  svg.classList.add('dof-ruler');
  let current = { ...defaults(meta.params), ...(params ?? {}) };
  let lastKey = '', lastUnits = null;

  const keyOf = p => [p.format, p.focal, (+p.stop).toFixed(3), (+p.focus).toFixed(3), p.blades, p.units, svg.clientWidth].join('|');

  function syncControls(p) {
    const root = controls ?? host.parentElement?.querySelector('[data-controls]') ?? document;
    const input = root.querySelector?.('input.controls__range[id$="-focus"]');
    if (!input) return;
    ringMarks(input, p.units === 'ft' ? 'ft' : 'm');
    // The generated controls repaint a slider only when it moves; keep the focus label in the
    // chosen units when only the Units radio changed.
    if (p.units !== lastUnits) {
      lastUnits = p.units;
      const spec = meta.params.find(q => q.key === 'focus');
      const out = root.querySelector(`output[for="${input.id}"]`);
      if (out) out.textContent = spec.format(p.focus, p);
      input.setAttribute('aria-valuetext', spec.spoken(p.focus, p));
    }
  }

  function update(p) {
    current = { ...current, ...p };
    const key = keyOf(current);
    if (key === lastKey) return;
    lastKey = key;
    renderRuler(svg, current);
    if (readoutEl) renderReadout(readoutEl, current);
    syncControls(current);
  }

  const onParams = e => update(e.detail?.params ?? {});
  host.addEventListener('playerparams', onParams);
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    let w = 0;
    ro = new ResizeObserver(() => { const nw = svg.clientWidth; if (nw !== w) { w = nw; lastKey = ''; update({}); } });
    ro.observe(svg);
  }
  update(current);

  return {
    svg, update,
    destroy() { host.removeEventListener('playerparams', onParams); ro?.disconnect(); },
  };
}

export { isInfinity, FOCUS_SLIDER_MAX, SUBJECTS };
