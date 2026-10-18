import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp, lerp, P, eIO, eIOs, eOut, eOut5, backIn, springCritical, springUnderdamped, springSettleTime,
  springStep, cubicBezier, frameIndex, mod, holdU,
} from '../../assets/js/core/time.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);

test('basic helpers', () => {
  assert.equal(clamp(2), 1); assert.equal(clamp(-1), 0); assert.equal(lerp(2, 4, 0.5), 3);
  assert.equal(P(0.5, 0.5, 3.4), 0); assert.equal(P(3.4, 0.5, 3.4), 1); close(P(1.95, 0.5, 3.4), 0.5, 1e-12);
  assert.equal(mod(-1, 4.7), 3.7); assert.equal(holdU(9, 3.8), 3.8);
  assert.equal(frameIndex(1, 24), 24); assert.equal(frameIndex(1 / 24 * 5, 24), 5);
});

test('kit easings: endpoints, symmetry, monotonic', () => {
  for (const e of [eIO, eIOs, eOut, eOut5]) {
    assert.equal(e(0), 0); close(e(1), 1, 1e-12);
    let prev = -1; for (let x = 0; x <= 1; x += 0.01) { assert.ok(e(x) >= prev - 1e-12); prev = e(x); }
  }
  close(eIO(0.5), 0.5, 1e-12); close(eIO(0.25) + eIO(0.75), 1, 1e-12);
  assert.ok(backIn(0.2, 1.2) < 0, 'backIn dips first');
  const bz = cubicBezier(0.65, 0, 0.35, 1);
  for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) close(bz(x), eIO(x), 0.03, `bezier ≈ eIO at ${x}`);
});

test('critically damped spring: S(0)=0, S(∞)=1, monotone, settles exactly', () => {
  assert.equal(springCritical(0), 0);
  assert.equal(springCritical(-1), 0);
  assert.equal(springCritical(100), 1);
  assert.equal(springCritical(8 / 12 + 1e-9), 1);
  let prev = 0;
  for (let t = 0; t <= 1; t += 0.001) { const v = springCritical(t, 12); assert.ok(v >= prev, `monotone at ${t}`); assert.ok(v <= 1); prev = v; }
  close(springCritical(1 / 12, 12), 1 - 2 * Math.exp(-1), 1e-12, 'closed form at ωτ = 1');
});

test('underdamped spring overshoots, then settles to 1', () => {
  assert.equal(springUnderdamped(0, 12, 0.4), 0);
  let max = 0; for (let t = 0; t < 2; t += 0.001) max = Math.max(max, springUnderdamped(t, 12, 0.4));
  assert.ok(max > 1.1, `overshoot ${max}`);
  assert.equal(springUnderdamped(springSettleTime(12, 0.4) + 0.01, 12, 0.4), 1);
  close(springUnderdamped(0.3, 12, 1), springCritical(0.3, 12), 0, 'ζ ≥ 1 falls back');
  assert.equal(springStep(0.2, { omega: 12, zeta: 1 }), springCritical(0.2, 12));
});
