import test from 'node:test';
import assert from 'node:assert/strict';
import { fontFamily, fontFaceKey, fontLoaded } from '../../assets/js/core/canvas.js';

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
