// Parameter schema helpers and ParamTrack: a value that is retargeted over time as a sum of
// closed-form spring steps, v(t) = v0 + Σ Δi · S(t − ti). Evaluating at any t is pure, so a
// preset transition renders identically whether the Player steps it at 60 fps or a recorder seeks.
//
// Schema entry (meta.params[i]):
//   { key, label, type: 'range' | 'select' | 'radio' | 'toggle', value,   // value = default
//     min, max, step,                // plain range
//     values: [...], labels: [...],  // discrete detents: the slider moves over indices
//     scale: 'log',                  // log range between min and max
//     options: [{ value, label }],   // select / radio
//     unit, format(v, params) → visible text, spoken(v, params) → aria-valuetext,
//     animate: true,                 // spring between values when set() asks to animate
//     group, hint }

import { springStep, springSettleTime, DEFAULT_OMEGA, clamp } from './time.js';

export const LOG_STEPS = 1000;

/** Default values for a schema. */
export function defaults(schema = []) {
  const out = {};
  for (const p of schema) out[p.key] = p.value;
  return out;
}

/** Clamp/snap a partial object to the schema; unknown keys pass through untouched. */
export function normalize(schema = [], partial = {}) {
  const byKey = Object.fromEntries(schema.map(p => [p.key, p]));
  const out = {};
  for (const [k, v] of Object.entries(partial)) {
    const p = byKey[k];
    if (!p) { out[k] = v; continue; }
    if (p.type === 'toggle') out[k] = Boolean(v);
    else if (p.type === 'select' || p.type === 'radio') out[k] = p.options?.some(o => o.value === v) ? v : p.value;
    else if (p.values) out[k] = typeof v === 'number' ? nearestValue(p.values, v) : p.value;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp(v, p.min ?? -Infinity, p.max ?? Infinity);
    else out[k] = p.value;
  }
  return out;
}

const nearestValue = (vals, v) => vals.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), vals[0]);

/** Slider position ↔ parameter value for a range entry. */
export function sliderRange(p) {
  if (p.values) return { min: 0, max: p.values.length - 1, step: 1 };
  if (p.scale === 'log') return { min: 0, max: LOG_STEPS, step: 1 };
  return { min: p.min, max: p.max, step: p.step ?? 'any' };
}
export function sliderToValue(p, s) {
  const n = Number(s);
  if (p.values) return p.values[clamp(Math.round(n), 0, p.values.length - 1)];
  if (p.scale === 'log') return p.min * Math.pow(p.max / p.min, clamp(n / LOG_STEPS));
  return n;
}
export function valueToSlider(p, v) {
  if (p.values) { const i = p.values.indexOf(nearestValue(p.values, v)); return Math.max(0, i); }
  if (p.scale === 'log') return Math.round((Math.log(v / p.min) / Math.log(p.max / p.min)) * LOG_STEPS);
  return v;
}

/** Visible text for a value. */
export function formatValue(p, v, params = {}) {
  if (p.format) return p.format(v, params);
  if (p.options) return p.options.find(o => o.value === v)?.label ?? String(v);
  if (p.type === 'toggle') return v ? 'On' : 'Off';
  if (p.values && p.labels) return p.labels[p.values.indexOf(v)] ?? String(v);
  const num = typeof v === 'number' ? +v.toFixed(3) : v;
  return p.unit ? `${num} ${p.unit}` : String(num);
}
/** aria-valuetext for a value (falls back to the visible text). */
export const spokenValue = (p, v, params = {}) => (p.spoken ? p.spoken(v, params) : formatValue(p, v, params));

// ---------------------------------------------------------------------------

/** One numeric value driven by a sum of spring steps. */
export class ParamTrack {
  constructor(v0, { omega = DEFAULT_OMEGA, zeta = 1 } = {}) {
    this.v0 = v0;
    this.spring = { omega, zeta };
    this.steps = [];           // [{ t, d }]
    this.target = v0;
  }
  /** Retarget to `value` starting at time t (instant when animate is false). */
  retarget(value, t, { animate = true } = {}) {
    if (!animate) { this.v0 = value; this.steps = []; this.target = value; return this; }
    const d = value - this.target;
    if (d !== 0) this.steps.push({ t, d });
    this.target = value;
    return this;
  }
  /** Pure evaluation: v0 + Σ Δi · S(t − ti). */
  value(t) {
    let v = this.v0;
    for (const s of this.steps) v += s.d * springStep(t - s.t, this.spring);
    return v;
  }
  settleTime() { return springSettleTime(this.spring.omega, this.spring.zeta); }
  /** True once every step has fully settled at time t. */
  settled(t) {
    const T = this.settleTime();
    return this.steps.every(s => t - s.t > T);
  }
  /** Fold steps that are settled at t into v0 (value(t') unchanged for every t' ≥ t). */
  compact(t) {
    const T = this.settleTime(), keep = [];
    for (const s of this.steps) { if (t - s.t > T) this.v0 += s.d; else keep.push(s); }
    this.steps = keep;
    return this;
  }
}

/**
 * A full parameter object: numeric entries become ParamTracks, everything else switches instantly.
 * `at(t)` returns a plain params object for the piece's seek(t, params).
 */
export class ParamSet {
  constructor(schema = [], initial = {}, spring = {}) {
    this.schema = schema;
    this.spring = spring;
    this.byKey = Object.fromEntries(schema.map(p => [p.key, p]));
    this.plain = { ...defaults(schema), ...initial };
    this.tracks = {};
    for (const [k, v] of Object.entries(this.plain)) if (this.isNumeric(k, v)) this.tracks[k] = new ParamTrack(v, spring);
  }
  isNumeric(k, v) {
    const p = this.byKey[k];
    return typeof v === 'number' && (!p || p.type === 'range' || p.type === undefined) && p?.animate !== false;
  }
  /** Apply a partial update at time t. */
  set(partial, t, { animate = true } = {}) {
    const clean = normalize(this.schema, partial);
    for (const [k, v] of Object.entries(clean)) {
      if (this.isNumeric(k, v)) (this.tracks[k] ??= new ParamTrack(v, this.spring)).retarget(v, t, { animate });
      else { delete this.tracks[k]; }
      this.plain[k] = v;
    }
    return this;
  }
  /** Target values (where every track is heading). */
  get targets() { return { ...this.plain }; }
  at(t) {
    const out = { ...this.plain };
    for (const [k, tr] of Object.entries(this.tracks)) out[k] = tr.value(t);
    return out;
  }
  settled(t) { return Object.values(this.tracks).every(tr => tr.settled(t)); }
  compact(t) { for (const tr of Object.values(this.tracks)) tr.compact(t); return this; }
}
