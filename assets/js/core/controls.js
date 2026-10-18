// Accessible controls generated from meta.params: native inputs with <label>, aria-valuetext,
// and one debounced aria-live readout per panel. Sliders are direct manipulation (instant);
// radio/select changes may animate through the Player's ParamTracks.

import { sliderRange, sliderToValue, valueToSlider, formatValue, spokenValue } from './params.js';

let uid = 0;
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.filter(Boolean));
  return n;
};

/**
 * Build controls into `container`.
 * @param {HTMLElement} container
 * @param {Array} schema meta.params
 * @param {{ values: object, onInput: (partial, opts) => void, describe?: (params) => string, live?: HTMLElement, debounceMs?: number }} o
 * @returns {{ update(values): void, announce(text): void, destroy(): void, root: HTMLElement }}
 */
export function buildControls(container, schema = [], { values = {}, onInput, describe, live, debounceMs = 400 } = {}) {
  const id = `ctl${++uid}`;
  const root = el('form', { class: 'controls', 'data-controls-root': true, 'aria-label': 'Study controls' });
  root.addEventListener('submit', e => e.preventDefault());
  const entries = [];
  let current = { ...values };

  // Group consecutive params that share `group` into a fieldset.
  let fieldset = null, groupName = null;
  for (const p of schema) {
    if (p.hidden) continue;
    if (p.group !== groupName) {
      groupName = p.group;
      fieldset = p.group ? el('fieldset', { class: 'controls__group' }, el('legend', { class: 'controls__legend', text: p.group })) : null;
      if (fieldset) root.append(fieldset);
    }
    const parent = fieldset ?? root;
    const entry = makeControl(p, `${id}-${p.key}`);
    parent.append(entry.node);
    entries.push(entry);
  }

  const liveEl = live ?? el('p', { class: 'controls__live visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
  if (!live) root.append(liveEl);
  container.append(root);

  let timer = 0;
  const announce = text => {
    clearTimeout(timer);
    timer = setTimeout(() => { liveEl.textContent = text; }, debounceMs);
  };
  const readout = changedKey => {
    if (describe) return describe(current);
    const p = schema.find(q => q.key === changedKey);
    return p ? `${p.label}: ${spokenValue(p, current[p.key], current)}` : '';
  };

  function makeControl(p, cid) {
    const v0 = values[p.key] ?? p.value;
    const hint = p.hint ? el('p', { class: 'controls__hint', id: `${cid}-hint`, text: p.hint }) : null;
    const desc = hint ? `${cid}-hint` : null;

    if (p.type === 'radio') {
      const fs = el('fieldset', { class: 'controls__item controls__radios', 'aria-describedby': desc },
        el('legend', { class: 'controls__label', text: p.label }));
      const inputs = p.options.map((o, i) => {
        const input = el('input', { type: 'radio', name: cid, id: `${cid}-${i}`, value: String(i) });
        input.checked = o.value === v0;
        input.addEventListener('change', () => { if (input.checked) emit(p, o.value, { animate: p.animate !== false }); });
        fs.append(el('label', { class: 'controls__radio', for: `${cid}-${i}` }, input, el('span', { text: o.label })));
        return input;
      });
      if (hint) fs.append(hint);
      return { p, node: fs, set: v => inputs.forEach((inp, i) => { inp.checked = p.options[i].value === v; }) };
    }

    if (p.type === 'select') {
      const sel = el('select', { id: cid, class: 'controls__select', 'aria-describedby': desc });
      p.options.forEach((o, i) => { const opt = el('option', { value: String(i), text: o.label }); opt.selected = o.value === v0; sel.append(opt); });
      sel.addEventListener('change', () => emit(p, p.options[Number(sel.value)].value, { animate: p.animate !== false }));
      const node = el('div', { class: 'controls__item' }, el('label', { class: 'controls__label', for: cid, text: p.label }), sel, hint);
      return { p, node, set: v => { const i = p.options.findIndex(o => o.value === v); if (i >= 0) sel.value = String(i); } };
    }

    if (p.type === 'toggle') {
      const box = el('input', { type: 'checkbox', id: cid, class: 'controls__check', 'aria-describedby': desc });
      box.checked = !!v0;
      box.addEventListener('change', () => emit(p, box.checked, { animate: false }));
      const node = el('div', { class: 'controls__item controls__item--toggle' }, box, el('label', { class: 'controls__label', for: cid, text: p.label }), hint);
      return { p, node, set: v => { box.checked = !!v; } };
    }

    // range
    const r = sliderRange(p);
    const input = el('input', { type: 'range', id: cid, class: 'controls__range', min: r.min, max: r.max, step: r.step, 'aria-describedby': desc });
    input.value = String(valueToSlider(p, v0));
    const out = el('output', { class: 'controls__value', for: cid, 'aria-hidden': 'true' });
    const paint = v => {
      out.textContent = formatValue(p, v, current);
      input.setAttribute('aria-valuetext', spokenValue(p, v, current));
      const frac = (Number(input.value) - r.min) / ((r.max - r.min) || 1);
      input.style.setProperty('--fill', `${(frac * 100).toFixed(2)}%`);
    };
    paint(v0);
    input.addEventListener('input', () => { const v = sliderToValue(p, input.value); emit(p, v, { animate: false }); paint(v); });
    const node = el('div', { class: 'controls__item controls__item--range' },
      el('div', { class: 'controls__row' }, el('label', { class: 'controls__label', for: cid, text: p.label }), out), input, hint);
    return { p, node, set: v => { input.value = String(valueToSlider(p, v)); paint(v); } };
  }

  function emit(p, v, opts) {
    current = { ...current, [p.key]: v };
    onInput?.({ [p.key]: v }, { ...opts, source: 'control', key: p.key });
    announce(readout(p.key));
  }

  return {
    root,
    /** Reflect values set elsewhere (presets, Resume demo) without emitting input. */
    update(vals) {
      current = { ...current, ...vals };
      for (const e of entries) if (e.p.key in vals) e.set(vals[e.p.key]);
    },
    announce,
    destroy() { clearTimeout(timer); root.remove(); if (!live) liveEl.remove(); },
  };
}
