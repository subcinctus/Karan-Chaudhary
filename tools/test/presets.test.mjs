import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIGHTING_PRESETS, PRESET_ORDER, DEFAULT_PRESET, validatePreset, lightPosition, planPosition,
  unrealLocation, fillIntensity, ratioLabel, lightLabel,
} from '../../assets/js/core/presets.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);

test('every preset is well-formed', () => {
  for (const [k, p] of Object.entries(LIGHTING_PRESETS)) {
    assert.equal(p.id, k);
    assert.deepEqual(validatePreset(p), [], k);
  }
  assert.ok(PRESET_ORDER.every(id => LIGHTING_PRESETS[id] && !LIGHTING_PRESETS[id].p2));
  assert.ok(LIGHTING_PRESETS[DEFAULT_PRESET]);
});

test('Motion Prompt ids match the spec table', () => {
  const ids = Object.fromEntries(PRESET_ORDER.map(id => [id, LIGHTING_PRESETS[id].mp]));
  assert.deepEqual(ids, { butterfly: '#102', loop: null, rembrandt: '#101', split: '#100', rim: '#098', backlight: '#097', lowkey: '#114' });
  assert.equal(LIGHTING_PRESETS.loop.original, true);
});

test('geometry from the spec table', () => {
  const r = LIGHTING_PRESETS.rembrandt;
  assert.deepEqual([r.lights[0].az, r.lights[0].el, r.lights[0].dist], [45, 45, 1.5]);
  assert.equal(r.ratio, 4);
  assert.deepEqual(LIGHTING_PRESETS.rim.lights.map(l => l.az), [135, -135]);
  assert.equal(LIGHTING_PRESETS.lowkey.ambient, 0);
  assert.equal(LIGHTING_PRESETS.backlight.veil.amount, 0.22);
});

test('coordinate conventions', () => {
  // On-axis light sits toward the camera (+z), camera-left light toward −x.
  const [x0, , z0] = lightPosition({ az: 0, el: 0, dist: 2 });
  close(x0, 0, 1e-12); close(z0, 2, 1e-12);
  const [xl] = lightPosition({ az: 90, el: 0, dist: 2 });
  close(xl, -2, 1e-12);
  const [, y45] = lightPosition({ az: 0, el: 30, dist: 2 });
  close(y45, 1, 1e-12);
  const [px, py] = planPosition({ az: 90, el: 0, dist: 1.5 });
  close(px, -1.5, 1e-12); close(py, 0, 1e-12);
  // Unreal: subject faces −X, so an on-axis light is at −X; camera-left is −Y.
  const [X, Y, Z] = unrealLocation({ az: 0, el: 0, dist: 1.5 });
  close(X, -150, 1e-9); close(Y, 0, 1e-9); close(Z, 150, 1e-9);
  close(unrealLocation({ az: 90, el: 0, dist: 1 })[1], -100, 1e-9);
});

test('ratio maths and labels', () => {
  assert.equal(fillIntensity(1, 4), 1 / 3);
  assert.equal(ratioLabel(4), '4:1 · 2 stops');
  assert.equal(ratioLabel(4, { spoken: true }), '4 to 1, 2 stops');
  assert.equal(ratioLabel(2), '2:1 · 1 stop');
  assert.equal(lightLabel(LIGHTING_PRESETS.rembrandt.lights[0]), 'KEY 3200K · 45°↑');
});
