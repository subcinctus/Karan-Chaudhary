// The previs shot list's framing (tools/previs-shotlist.mjs): an orbit never sees one of its lights, and a
// light moved for a shot keeps the light on the face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, checkFraming, clearance, inFrame } from '../previs-shotlist.mjs';

test('inFrame: the lens axis is the centre, the edges of the field of view are ±1, behind the lens is z < 0', () => {
  const at = p => inFrame([0, 0, 0], { pitch: 0, yaw: 0 }, { hfov: 90, vfov: 90 }, p);
  const c = at([100, 0, 0]);
  assert.deepEqual([c.x, c.y, c.z], [0, 0, 100]);
  assert.ok(Math.abs(at([100, 100, 0]).x - 1) < 1e-9, 'the right edge');
  assert.ok(Math.abs(at([100, 0, 100]).y - 1) < 1e-9, 'the top edge');
  assert.ok(at([-100, 0, 0]).z < 0, 'behind the lens');
});

test('PV-030: no light of the orbit is ever in the picture; the split preset\'s own key would be', () => {
  const list = generate();
  const orbit = list.shots.find(s => s.id === 'PV-030');
  for (const l of orbit.lightsOverride.lights) assert.ok(clearance(orbit, l).clearance > 1, l.name);
  assert.ok(orbit.framing.lights.length && orbit.framing.lights.every(l => l.clearance > 1));
  assert.ok(clearance(orbit, list.lighting.split.lights[0]).clearance < 1, 'the preset key is in the frame');
  const bare = structuredClone(orbit);
  delete bare.lightsOverride; delete bare.framing;
  assert.throws(() => checkFraming([bare], list.lighting), /PV-030: LGT_Split_Key is in the frame/);
});

test('the moved key keeps the light on the face: intensity × (its distance / the preset\'s)²', () => {
  const list = generate();
  const key = list.shots.find(s => s.id === 'PV-030').lightsOverride.lights[0];
  const preset = list.lighting.split.lights[0];
  assert.deepEqual([key.role, key.az, key.el, key.dist, key.kelvin], ['key', 90, 35, 350, preset.kelvin]);
  assert.equal(key.intensity, +((key.dist / preset.dist) ** 2).toFixed(4));
});
