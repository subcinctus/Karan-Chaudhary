import test from 'node:test';
import assert from 'node:assert/strict';
import { fontFamily, fontFaceKey, fontLoaded, scratch, blurLevels, blurLayer, SCRATCH_MAX, _scratchSize, _setFilterSupport } from '../../assets/js/core/canvas.js';

test('font shorthand parsing', () => {
  assert.equal(fontFamily('600 48px "Cormorant Garamond", serif'), 'Cormorant Garamond');
  assert.deepEqual(fontFaceKey('italic 500 80px "Cormorant Garamond", serif'), { family: 'Cormorant Garamond', weight: '500', style: 'italic' });
  assert.deepEqual(fontFaceKey('bold 12px/1.2 Inter Tight'), { family: 'Inter Tight', weight: '700', style: 'normal' });
  assert.deepEqual(fontFaceKey('16px "IBM Plex Mono"'), { family: 'IBM Plex Mono', weight: '400', style: 'normal' });
});

test('fontLoaded requires the exact weight and style to have loaded', () => {
  const face = (family, weight, style, status) => ({ family, weight, style, status });
  const prev = globalThis.document;
  globalThis.document = { fonts: [
    face('"TestF"', '400', 'normal', 'loaded'),
    face('"TestF"', '500', 'normal', 'error'),
    face('Var', '300 700', 'normal', 'loaded'),
    face('Ital', '400', 'italic', 'loaded'),
  ] };
  try {
    assert.equal(fontLoaded('400 16px "TestF"'), true);
    assert.equal(fontLoaded('500 80px "TestF", serif'), false, 'other weight loaded must not count');
    assert.equal(fontLoaded('600 20px Var'), true, 'variable range covers 600');
    assert.equal(fontLoaded('800 20px Var'), false);
    assert.equal(fontLoaded('italic 400 20px Ital'), true);
    assert.equal(fontLoaded('400 20px Ital'), false, 'upright not loaded');
    assert.equal(fontLoaded('400 20px Missing'), false);
  } finally { globalThis.document = prev; }
});

// Minimal DOM canvas stand-in: records drawImage calls with the state they were made in.
function withFakeCanvas(fn) {
  const log = [];
  const makeCtx = canvas => ({
    canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, imageSmoothingQuality: 'low', filter: 'none',
    setTransform() {}, clearRect() {},
    drawImage(img, ...a) { log.push({ dst: canvas, src: img, args: a, alpha: this.globalAlpha, op: this.globalCompositeOperation }); },
  });
  const prev = globalThis.document;
  globalThis.document = { createElement: () => { const c = { width: 300, height: 150 }; const k = makeCtx(c); c.getContext = () => k; return c; } };
  try { return fn(log, makeCtx); } finally { globalThis.document = prev; }
}

test('scratch() is a bounded LRU keyed by name and size', () => withFakeCanvas(() => {
  const a = scratch('lru-a', 10, 10);
  assert.equal(scratch('lru-a', 10, 10), a, 'same key returns the same canvas');
  for (let i = 0; i < SCRATCH_MAX - 1; i++) scratch(`lru-${i}`, 20 + i, 10);
  assert.equal(scratch('lru-a', 10, 10), a, 'recently used entry survives');
  const b = scratch('lru-b', 10, 10);
  for (let i = 0; i < SCRATCH_MAX; i++) scratch(`lru-x${i}`, 5, 5);
  assert.equal(_scratchSize(), SCRATCH_MAX);
  assert.notEqual(scratch('lru-b', 10, 10), b, 'least recently used entry was evicted');
}));

test('blurLevels picks the two pyramid levels around log2(2σ)', () => {
  assert.deepEqual(blurLevels(1), { lo: 1, hi: 2, f: 0 });
  const m = blurLevels(2 ** 1.5 / 2);
  assert.equal(m.lo, 1); assert.equal(m.hi, 2); assert.ok(Math.abs(m.f - 0.5) < 1e-9);
  assert.equal(blurLevels(0.1).lo, 0, 'tiny σ stays at the source');
  assert.deepEqual(blurLevels(1e6), { lo: 5, hi: 6, f: 1 }, 'clamped to the deepest level');
  // f grows continuously with σ (no steps between whole levels).
  let prev = -1;
  for (let s = 0.5; s < 32; s *= 1.05) { const { lo, f } = blurLevels(s); const x = lo + f; assert.ok(x >= prev); prev = x; }
});

test('blurLayer fallback blends two pyramid levels by the fractional part', () => withFakeCanvas((log, makeCtx) => {
  _setFilterSupport(false);
  try {
    const dst = { width: 64, height: 64 }, ctx = makeCtx(dst);
    const src = { width: 64, height: 64 };
    blurLayer(ctx, src, 2 ** 1.25 / 2);   // log2(2σ) = 1.25 → 75 % level 1 + 25 % level 2
    const mix = log.filter(e => e.op === 'lighter');
    assert.equal(mix.length, 2);
    assert.ok(Math.abs(mix[0].alpha - 0.75) < 1e-9 && Math.abs(mix[1].alpha - 0.25) < 1e-9);
    assert.equal(log.at(-1).dst, dst, 'the blend is drawn into the destination last');
    assert.equal(ctx.globalAlpha, 1);
    log.length = 0;
    blurLayer(ctx, src, 1);   // whole level: no blend pass
    assert.equal(log.filter(e => e.op === 'lighter').length, 0);
    assert.equal(log.length, 2, 'one downsample + the final draw');
  } finally { _setFilterSupport(undefined); }
}));
