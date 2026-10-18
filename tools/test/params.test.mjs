import test from 'node:test';
import assert from 'node:assert/strict';
import { ParamTrack, ParamSet, defaults, normalize, sliderToValue, valueToSlider, formatValue, spokenValue } from '../../assets/js/core/params.js';
import { springCritical } from '../../assets/js/core/time.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);

test('ParamTrack is a pure sum of springs: v(t) = v0 + Σ Δi·S(t − ti)', () => {
  const tr = new ParamTrack(0).retarget(10, 1).retarget(4, 1.2);
  const expect = t => 0 + 10 * springCritical(t - 1) + (4 - 10) * springCritical(t - 1.2);
  for (const t of [0, 1, 1.05, 1.2, 1.3, 2, 5]) close(tr.value(t), expect(t), 1e-12, `t=${t}`);
  // Evaluation order does not matter (pure in t).
  const a = [3, 1.1, 2, 1.1].map(t => tr.value(t));
  assert.equal(a[1], a[3]);
  assert.equal(tr.value(0.5), 0);
  assert.equal(tr.value(10), 4);
  assert.equal(tr.settled(1.5), false);
  assert.equal(tr.settled(10), true);
});

test('ParamTrack compact keeps values for t ≥ compact time; instant retarget clears', () => {
  const tr = new ParamTrack(2).retarget(8, 0);
  const before = [3, 4, 10].map(t => tr.value(t));
  tr.compact(3);
  assert.deepEqual([3, 4, 10].map(t => tr.value(t)), before);
  assert.equal(tr.steps.length, 0);
  tr.retarget(1, 5, { animate: false });
  assert.equal(tr.value(0), 1);
});

const schema = [
  { key: 'focal', type: 'range', values: [18, 25, 35, 50, 85], value: 50, label: 'Focal', unit: 'mm' },
  { key: 'focus', type: 'range', scale: 'log', min: 0.45, max: 30, value: 3, label: 'Focus', format: v => `${v.toFixed(2)} m`, spoken: v => `${v.toFixed(1)} metres` },
  { key: 'stop', type: 'range', min: 1, max: 22, step: 0.1, value: 2.8, label: 'Stop' },
  { key: 'look', type: 'radio', value: 'a', label: 'Look', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  { key: 'grain', type: 'toggle', value: true, label: 'Grain' },
];

test('schema helpers', () => {
  assert.deepEqual(defaults(schema), { focal: 50, focus: 3, stop: 2.8, look: 'a', grain: true });
  assert.deepEqual(normalize(schema, { focal: 40, stop: 99, look: 'z', grain: 0, extra: 1 }), { focal: 35, stop: 22, look: 'a', grain: false, extra: 1 });
  assert.equal(sliderToValue(schema[0], 3), 50);
  assert.equal(valueToSlider(schema[0], 50), 3);
  close(sliderToValue(schema[1], valueToSlider(schema[1], 3)), 3, 0.02);
  assert.equal(formatValue(schema[0], 50), '50 mm');
  assert.equal(spokenValue(schema[1], 3), '3.0 metres');
  assert.equal(formatValue(schema[3], 'b'), 'B');
});

test('ParamSet: numeric params spring, others switch instantly, at(t) is pure', () => {
  const ps = new ParamSet(schema);
  ps.set({ stop: 8, look: 'b' }, 1);
  assert.equal(ps.at(1).stop, 2.8);
  assert.equal(ps.at(1).look, 'b');
  const mid = ps.at(1.1).stop;
  assert.ok(mid > 2.8 && mid < 8);
  assert.equal(ps.at(1.1).stop, mid);
  assert.equal(ps.at(5).stop, 8);
  assert.equal(ps.settled(1.2), false);
  assert.equal(ps.settled(5), true);
  ps.set({ stop: 4 }, 6, { animate: false });
  assert.equal(ps.at(6).stop, 4);
  assert.equal(ps.targets.stop, 4);
});
