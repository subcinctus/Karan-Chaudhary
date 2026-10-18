import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hyperfocal, nearLimit, farLimit, depthOfField, blurDisc, fieldOfView, extractionHeight, project,
  FORMATS, PRIMES, STOPS, focusFromSlider, sliderFromFocus, formatDistance, stopsBetween, nearestStop,
} from '../../assets/js/core/optics.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);

test('DoF test vector: 50 mm f/2.8 c 0.025 focused at 3 m', () => {
  const H = hyperfocal(50, 2.8, 0.025);
  close(H / 1000, 35.76, 0.005, 'hyperfocal m');
  close(nearLimit(3000, 50, H) / 1000, 2.771, 0.0005, 'near m');
  close(farLimit(3000, 50, H) / 1000, 3.270, 0.0005, 'far m');
  const d = depthOfField({ f: 50, N: 2.8, c: 0.025, s: 3000 });
  close(d.total / 1000, 0.499, 0.002, 'total m');
});

test('far limit is infinite at and beyond the hyperfocal distance', () => {
  const H = hyperfocal(25, 8, 0.025);
  assert.equal(farLimit(H, 25, H), Infinity);
  assert.equal(farLimit(H * 2, 25, H), Infinity);
  close(nearLimit(H, 25, H), H / 2, 1, 'focused at H → near ≈ H/2');
});

test('blur disc: zero at focus, limit at infinity, grows with aperture', () => {
  assert.equal(blurDisc(50, 2.8, 3000, 3000), 0);
  close(blurDisc(50, 2.8, 3000, 1e12), blurDisc(50, 2.8, 3000, Infinity), 1e-6);
  close(blurDisc(50, 2.8, 3000, Infinity), 2500 / (2.8 * 2950), 1e-12);
  assert.ok(blurDisc(50, 1.4, 3000, 7000) > blurDisc(50, 2.8, 3000, 7000));
  // At the DoF limits the blur disc equals the CoC (thin-lens consistency).
  const H = hyperfocal(50, 2.8, 0.025);
  close(blurDisc(50, 2.8, 3000, nearLimit(3000, 50, H)), 0.025, 1e-3, 'b at near limit');
  close(blurDisc(50, 2.8, 3000, farLimit(3000, 50, H)), 0.025, 1e-3, 'b at far limit');
});

test('tables: formats, primes, third stops', () => {
  assert.deepEqual(Object.keys(FORMATS), ['s16', 's35', 'ff']);
  assert.equal(FORMATS.s35.coc, 0.025);
  assert.equal(PRIMES.length, 12);
  assert.equal(STOPS.length, 25);
  assert.equal(STOPS[0].label, 'f/1.4');
  assert.equal(STOPS.at(-1).label, 'f/22');
  close(STOPS.find(s => s.label === 'f/2.8').N, 2.828, 0.001);
  close(stopsBetween(2.8, 1.4), 2, 0.05);
  assert.equal(nearestStop(4.1).label, 'f/4');
});

test('field of view and projection', () => {
  const fov = fieldOfView(85, FORMATS.s35, 4 / 5);
  close(fov.extractH, 18.66, 1e-9, 'tall extraction uses full height');
  close(extractionHeight(24.89, 18.66, 2.39), 24.89 / 2.39, 1e-9);
  close(fieldOfView(24.89 / 2, FORMATS.s35).h, 90, 1e-9, '90° when f = w/2');
  const p = project({ X: 0, Y: 1.6, d: 3 }, { f: 50, sensorW: 24.89, W: 1920, H: 804 });
  assert.deepEqual([p.x, p.y], [960, 402]);
  const q = project({ X: 1, Y: 1.6, d: 3 }, { f: 50, sensorW: 24.89, W: 1920, H: 804 });
  close(q.x - 960, (0.05 / 2.95) * (1920 / 0.02489), 1e-6);
});

test('log focus slider round-trips and units format', () => {
  for (const m of [0.45, 1, 3, 12.5, 30]) close(focusFromSlider(sliderFromFocus(m)), m, 1e-9);
  assert.equal(sliderFromFocus(Infinity), 1);
  assert.equal(formatDistance(2.771), '2.77 m');
  assert.equal(formatDistance(35.76), '35.8 m');
  assert.equal(formatDistance(Infinity), '∞');
  assert.equal(formatDistance(3, 'ft'), '9 ft 10 in');
});
