import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hash2, hash3, rand2, hashString, valueNoise2, fbm, shuffled } from '../../assets/js/core/prng.js';

test('mulberry32 is deterministic and seed-sensitive', () => {
  const a = mulberry32(1), b = mulberry32(1), c = mulberry32(2);
  const sa = Array.from({ length: 8 }, a), sb = Array.from({ length: 8 }, b), sc = Array.from({ length: 8 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.equal(sa[0], 0.6270739405881613);   // known first value for seed 1
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('mulberry32 is roughly uniform', () => {
  const r = mulberry32(42), bins = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) bins[Math.floor(r() * 10)]++;
  for (const n of bins) assert.ok(Math.abs(n - 10000) < 500, `bin ${n}`);
});

test('hashes are pure uint32 functions of their inputs', () => {
  assert.equal(hash2(3, 4, 1), hash2(3, 4, 1));
  assert.notEqual(hash2(3, 4, 1), hash2(4, 3, 1));
  assert.notEqual(hash2(3, 4, 1), hash2(3, 4, 2));
  assert.equal(hash3(1, 2, 3), hash3(1, 2, 3));
  for (const v of [hash2(-5, 7), hash3(9, -9, 9, 9), hashString('untitled-short-01')]) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
  const v = rand2(1, 2); assert.ok(v >= 0 && v < 1);
});

test('value noise and fbm: deterministic, bounded, continuous', () => {
  assert.equal(valueNoise2(1.3, 2.7, 5), valueNoise2(1.3, 2.7, 5));
  for (let i = 0; i < 200; i++) {
    const x = i * 0.137, y = i * 0.071, n = valueNoise2(x, y), f = fbm(x, y, { seed: 3 });
    assert.ok(n >= 0 && n < 1 && f >= 0 && f < 1);
  }
  assert.ok(Math.abs(valueNoise2(2.5, 3.5) - valueNoise2(2.5001, 3.5)) < 0.01, 'continuous');
  assert.equal(valueNoise2(3, 4, 1), rand2(3, 4, 1), 'lattice value');
});

test('shuffled is a deterministic permutation', () => {
  const s = shuffled([1, 2, 3, 4, 5, 6], 7);
  assert.deepEqual(s, shuffled([1, 2, 3, 4, 5, 6], 7));
  assert.deepEqual([...s].sort(), [1, 2, 3, 4, 5, 6]);
});
