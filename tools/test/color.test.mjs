import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cctToXy, kelvinToLinearSRGB, lightColor, srgbEncode, srgbDecode, logC3Encode, logC3Decode,
  acesFit, luma709, rgbToYCbCr709, yCbCrToRgb709, xyToXYZ, xyzToLinearSRGB, luminanceLinear,
  contrastRatio, hexToRgb, rgbToHex, kelvinChip, ditherOffset,
} from '../../assets/js/core/color.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`);

test('Kim et al. Planckian locus', () => {
  const [x, y] = cctToXy(6500);
  close(x, 0.3135, 0.0005, 'x @6500K');
  close(y, 0.3237, 0.001, 'y @6500K');
  const [x32, y32] = cctToXy(3200);
  close(x32, 0.4234, 0.001, 'x @3200K');
  close(y32, 0.3990, 0.001, 'y @3200K');
  // Locus is continuous at the 4000 K and 2222 K joins.
  close(cctToXy(3999.99)[0], cctToXy(4000.01)[0], 1e-4);
  close(cctToXy(2221.99)[1], cctToXy(2222.01)[1], 2e-3);
});

test('xy → XYZ → linear sRGB: D65 maps to neutral', () => {
  const rgb = xyzToLinearSRGB(xyToXYZ(0.3127, 0.3290, 1));
  for (const v of rgb) close(v, 1, 0.002);
  close(luminanceLinear(kelvinToLinearSRGB(5000)), 1, 0.01, 'unit luminance');
});

test('white balance: 3200 K at 5600 K WB reads amber; 5600 K at 3200 K reads blue; matched is neutral', () => {
  const [r, g, b] = lightColor(3200, 5600);
  assert.ok(r > g && g > b, `amber ${[r, g, b]}`);
  const [r2, , b2] = lightColor(5600, 3200);
  assert.ok(b2 > r2, 'blue');
  for (const v of lightColor(4300, 4300)) close(v, 1, 0.01, 'neutral when matched');
});

test('sRGB OETF/EOTF round-trip', () => {
  for (const x of [0, 0.001, 0.0031308, 0.18, 0.5, 1]) close(srgbDecode(srgbEncode(x)), x, 1e-9);
  close(srgbEncode(0.18), 0.4614, 0.0005);
});

test('ARRI LogC3 EI800', () => {
  close(logC3Encode(0.18), 0.391, 0.0005, '18 % grey');
  close(logC3Encode(0), 0.092809, 1e-9, 'black');
  for (const x of [0, 0.005, 0.010591, 0.18, 1, 10, 50]) close(logC3Decode(logC3Encode(x)), x, 1e-6 * Math.max(1, x), `round-trip ${x}`);
  let prev = -Infinity;
  for (let x = 0; x < 60; x += 0.01) { const v = logC3Encode(x); assert.ok(v > prev); prev = v; }
});

test('ACES filmic fit is monotonic, bounded and anchored', () => {
  assert.equal(acesFit(0), 0);
  let prev = -1;
  for (let x = 0; x <= 100; x += 0.005) { const v = acesFit(x); assert.ok(v >= prev, `monotonic at ${x}`); assert.ok(v <= 1); prev = v; }
  close(acesFit(0.18), 0.2665, 0.002);
  assert.equal(acesFit(1e6), 1);
});

test('BT.709 luma and Y′CbCr round-trip', () => {
  close(luma709(1, 1, 1), 1, 1e-12);
  const [Y, Cb, Cr] = rgbToYCbCr709(0.8, 0.4, 0.2);
  const back = yCbCrToRgb709(Y, Cb, Cr);
  [0.8, 0.4, 0.2].forEach((v, i) => close(back[i], v, 2e-4));
  const [, cb, cr] = rgbToYCbCr709(0, 0, 1);
  close(cb, 0.5, 1e-9); close(cr, -0.0722 / 1.5748, 1e-9);
});

test('hex utils, contrast and chips', () => {
  assert.deepEqual(hexToRgb('#0C0D10'), [12, 13, 16]);
  assert.equal(rgbToHex([244, 178, 106]), '#F4B26A');
  close(contrastRatio('#FFFFFF', '#000000'), 21, 1e-9);
  assert.ok(contrastRatio('#ECE6DA', '#0C0D10') > 14);
  assert.ok(contrastRatio('#8A857C', '#0C0D10') >= 4.5);
  assert.match(kelvinChip(3200), /^#[0-9A-F]{6}$/);
  const d = ditherOffset(10, 20);
  assert.ok(Math.abs(d) <= 0.5 / 255 && d === ditherOffset(10, 20));
});
