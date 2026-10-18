// Vendored Motion Prompt motion pack as one ES module (run-the-code port).
// Source: "kit motion" and "get 5" printed by the Motion Prompt CLI
// (skills/motion-prompt/scripts/motion-prompt.mjs, offline API v1). MIT License, see THIRD-PARTY-NOTICES.md.
// Separate module from the camera pack: the kits share top-level names.
//
// Modifications (every changed line is tagged "[mod]"; with the defaults the pixels are unchanged):
//   - Font constants JP / DISP: const → let, so setFonts() can point them at the site's stacks.
//   - stage() background fill made optional through OPTS.stage (set false to draw #005 over another layer).
//   - #005 sample content as data: TEXT5 { top, topFont, topTracking, bottom, bottomFont, bottomTracking },
//     defaults equal the original literals; the top text's '#fff' → C.white (same value).
//   - ES module exports appended at the end (CELLS_BY_ID, MOTION, C, OPTS, TEXT5, setFonts).
// Call cells with this pack's card size: cell(ctx, MOTION.w, MOTION.h, u), 0 ≤ u < 4.7 (#005 repeats every 2.35 s).

// Motion Prompt #001-024 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#001
//
// Kit for pack "motion" (Motion graphics moves / モーショングラフィックスの動き): the constants and helpers its elements share.
// Elements #001-024 · 539x208 px · cycle 4.7 s. Element code: https://showheyohtaki.github.io/motion-prompt/api/v1/en/e/<id>.txt (or /ja/).
//
// Run one element standalone in a browser:
//   1. paste this file into a <script>,
//   2. paste the element code below it (it assigns CELLS[n - 1], n = the element number inside the pack),
//   3. then add:
//        const c = document.createElement('canvas'); c.width = 539; c.height = 208; document.body.append(c);
//        const k = c.getContext('2d'), cell = CELLS.find(Boolean), t0 = performance.now();
//        (function loop() {
//          const u = ((performance.now() - t0) / 1000) % 4.7;   // seconds, 0 <= u < 4.7
//          k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, 539, 208);
//          k.save(); cell(k, 539, 208, u); k.restore();
//          requestAnimationFrame(loop);
//        })();
// Every cell is a pure function of u, so the same call renders video frames: u = frame / fps.

// @kit
// モーショングラフィックスの演出の名前 24（各カード 539x208・4.7秒周期。各コマは時間 u の純関数）
// カードの中だけ共通パレット（濃紺の地＋青・コーラル・黄・ミント）。
const CW = 539, CH = 208;
const CYC = 4.7;                          // 各カードは4.7秒周期（ループの継ぎ目なし）
const C = {
  navy: '#0F1A3D', navy2: '#1B2A5E', navy3: '#2A3D80', dim: '#7F90C4',
  blue: '#3B7BFF', coral: '#FF6B5C', yel: '#FFC83D', mint: '#2EDBA8', white: '#FFFFFF', cream: '#FFF1D6'
};
const PAL = [C.blue, C.coral, C.yel, C.mint];
let JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
let DISP = '"Avenir Next", "Helvetica Neue", system-ui, sans-serif';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const P = (t, a, b) => clamp((t - a) / (b - a));
const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eIOs = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const eOut = x => 1 - Math.pow(1 - x, 3);
const eOut5 = x => 1 - Math.pow(1 - x, 5);
const eIn = x => x * x * x;
const smooth = x => x * x * (3 - 2 * x);
const mod = (a, n) => ((a % n) + n) % n;
const backOut = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const backIn = (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x;
const spring = (t, w = 14, d = 7) => t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t);   // 0→行き過ぎ→1
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function txt(ctx, s, x, y, font, col, align = 'left', base = 'alphabetic', ls = '0px') {
  ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = ls; ctx.fillText(s, x, y); ctx.letterSpacing = '0px';
}
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
function bez(x1, y1, x2, y2) {
  const cx_ = 3 * x1, bx = 3 * (x2 - x1) - cx_, ax = 1 - cx_ - bx;
  const cy_ = 3 * y1, by = 3 * (y2 - y1) - cy_, ay = 1 - cy_ - by;
  const sx = t => ((ax * t + bx) * t + cx_) * t, sy = t => ((ay * t + by) * t + cy_) * t;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } return sy(t); };
}
function star(k, x, y, R, rot = 0, inner = 0.5, n = 5) { k.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? R * inner : R, a = rot - Math.PI / 2 + i * Math.PI / n; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? k.lineTo(px, py) : k.moveTo(px, py); } k.closePath(); }
function heartPath(k, s) { k.beginPath(); k.moveTo(0, s * 0.92); k.bezierCurveTo(-s * 1.75, -s * 0.12, -s * 0.85, -s * 1.2, 0, -s * 0.42); k.bezierCurveTo(s * 0.85, -s * 1.2, s * 1.75, -s * 0.12, 0, s * 0.92); k.closePath(); }
const G0 = mkCanvas(CW, CH), GK0 = G0.getContext('2d', { willReadFrequently: true });
const G1 = mkCanvas(CW, CH), GK1 = G1.getContext('2d', { willReadFrequently: true });
const OPTS = { stage: true };   // [mod] stage() background can be switched off to draw over other layers
function stage(k, col = C.navy) { if (!OPTS.stage) return; /* [mod] */ k.fillStyle = col; k.fillRect(0, 0, CW, CH); }
// ぬるっとつながる形（描く→ぼかす→しきい値）。paint(ctx) で色を塗った結果のキャンバスを返す
function goo(draw, blur, paint) {
  GK0.setTransform(1, 0, 0, 1, 0, 0); GK0.clearRect(0, 0, CW, CH); GK0.fillStyle = '#fff'; draw(GK0);
  GK1.setTransform(1, 0, 0, 1, 0, 0); GK1.globalCompositeOperation = 'source-over'; GK1.clearRect(0, 0, CW, CH);
  GK1.filter = `blur(${blur}px)`; GK1.drawImage(G0, 0, 0); GK1.filter = 'none';
  const im = GK1.getImageData(0, 0, CW, CH), d = im.data;
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; d[i] = a < 112 ? 0 : a > 144 ? 255 : (a - 112) * 8; }
  GK1.putImageData(im, 0, 0);
  GK1.globalCompositeOperation = 'source-atop'; paint(GK1); GK1.globalCompositeOperation = 'source-over';
  return G1;
}
function chars(k, s, font, ls = 0) { k.font = font; const ws = [...s].map(ch => k.measureText(ch).width + ls); const tot = ws.reduce((a, b) => a + b, 0) - ls; let x = -tot / 2; return [...s].map((ch, i) => { const o = { ch, x: x + (ws[i] - ls) / 2, w: ws[i] - ls }; x += ws[i]; return o; }); }
const CELLS = [];

// @shared
// 画面A＝昼（クリーム・コーラルの太陽）／画面B＝夜（濃紺・黄色の月）。A→B→A で1周期
const SUN = [112, 104], MOON = [CW - 112, 104];
function scrA(k, w, h) {
  k.fillStyle = C.cream; k.fillRect(0, 0, w, h);
  k.fillStyle = '#FFD9A8'; k.beginPath(); k.arc(SUN[0], SUN[1], 66, 0, 7); k.fill();
  k.fillStyle = C.coral; k.beginPath(); k.arc(SUN[0], SUN[1], 44, 0, 7); k.fill();
  txt(k, 'DAY', 214, h / 2 + 4, `800 96px ${DISP}`, C.navy, 'left', 'middle', '2px');
  k.fillStyle = '#fff'; rr(k, 400, 34, 96, 26, 13); k.fill(); rr(k, 430, 20, 50, 26, 13); k.fill();
}
function scrB(k, w, h) {
  k.fillStyle = '#16255A'; k.fillRect(0, 0, w, h);
  k.fillStyle = '#fff';[[40, 30, 3], [150, 170, 2.5], [250, 24, 2.5], [330, 180, 3], [500, 30, 2.5], [20, 150, 2], [300, 100, 0]].forEach(s => { k.beginPath(); k.arc(s[0], s[1], s[2], 0, 7); k.fill(); });
  k.fillStyle = C.yel; k.beginPath(); k.arc(MOON[0], MOON[1], 46, 0, 7); k.fill();
  k.fillStyle = '#16255A'; k.beginPath(); k.arc(MOON[0] + 22, MOON[1] - 14, 38, 0, 7); k.fill();
  txt(k, 'NIGHT', 40, h / 2 + 4, `800 88px ${DISP}`, '#fff', 'left', 'middle', '1px');
}
const SCR = [scrA, scrB];
const SEG3 = CYC / 2;
function abCell(trans) { return (k, w, h, u) => { const sgi = Math.min(1, Math.floor(u / SEG3)), uu = u - sgi * SEG3; trans(k, w, h, uu, sgi, 1 - sgi); }; }
const TA = 0.5, TB = 1.5;

// [mod] Sample content of #005 as data (defaults = the original words, weights, sizes and tracking).
const TEXT5 = { top: 'Hello!', topFont: '800 98px', topTracking: '1px', bottom: 'はじめまして', bottomFont: '700 32px', bottomTracking: '6px' };

// Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005
//
// Mask reveal / マスクリビール
// Pack: motion (Motion graphics moves) · element 05 · Category: Entrances & text
// What happens: Headline text slides out from behind an invisible edge marked by a single line.
// Motion spec:
//   - One pass per 2.35 s. Divider line (coral, 380 × 6, y = 124): grows from the centre at 0.1–0.5 s (cubic ease-in-out), shrinks away at 2.05–2.3 s.
//   - Top text (bold 98 px, white): clipped to the area above the line (y 8–119); moves up into place from 120 px below at 0.35–1.0 s, quintic ease-out.
//   - Bottom text (32 px, yellow): clipped to the area below the line (y 129–181); moves down into place from 60 px above at 0.55–1.15 s, quintic ease-out.
//   - Exit: top text moves 150 px up at 1.7–2.05 s (backIn, s = 1.2, dipping slightly first); bottom text moves 70 px down at 1.75–2.05 s (cubic ease-in).
//   - Opacity never changes; the text is hidden only by leaving the clip area.
// When to use it: Use it for titles and headings that should appear in a clean, composed way.
// Tags: mask, reveal, clip, wipe, title, text, slide-up, headline
// Size: 539x208 px · Cycle: 4.7 s
// Needs: kit motion -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/motion.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#005
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 05
// 05 マスクリビール（見えない枠＝線の向こうから、見出しがせり上がる）
CELLS[4] = (k, w, h, u) => {
  stage(k);
  const T = CYC / 2, lu = mod(u, T), X = w / 2, LY = 124;
  const lg = eIO(P(lu, 0.1, 0.5)) * (1 - eIO(P(lu, 2.05, 2.3)));
  // 上の段：線の下から上へ
  const up = (1 - eOut5(P(lu, 0.35, 1.0))) * 120 + backIn(P(lu, 1.7, 2.05), 1.2) * -150;
  k.save(); k.beginPath(); k.rect(0, 8, w, LY - 8 - 5); k.clip();
  txt(k, TEXT5.top, X, LY - 14 + up, `${TEXT5.topFont} ${DISP}`, C.white, 'center', 'alphabetic', TEXT5.topTracking);   // [mod] content/font/colour from TEXT5 + C.white
  k.restore();
  // 下の段：線の上から下へ
  const dn = (1 - eOut5(P(lu, 0.55, 1.15))) * -60 + eIn(P(lu, 1.75, 2.05)) * 70;
  k.save(); k.beginPath(); k.rect(0, LY + 5, w, 52); k.clip();
  txt(k, TEXT5.bottom, X, LY + 44 + dn, `${TEXT5.bottomFont} ${JP}`, C.yel, 'center', 'alphabetic', TEXT5.bottomTracking);   // [mod] content/font from TEXT5
  k.restore();
  if (lg > 0.005) { k.fillStyle = C.coral; rr(k, X - 190 * lg, LY - 3, 380 * lg, 6, 3); k.fill(); }
};

// Needs kit: motion — run "kit <pack>" once per pack before using this code.

// ============================== ES MODULE EXPORTS (added) ==============================
export const CELLS_BY_ID = { '005': CELLS[4] };
/** Pack constants: card size, cycle, and #005's single pass (CYC / 2). */
export const MOTION = { w: CW, h: CH, cycle: CYC, pass: CYC / 2 };
export { C, OPTS, TEXT5 };
export const C_DEFAULT = Object.freeze({ ...C });
export const TEXT5_DEFAULT = Object.freeze({ ...TEXT5 });
export function resetPalette() { Object.assign(C, C_DEFAULT); }
export function setFonts({ disp, jp } = {}) { if (disp) DISP = disp; if (jp) JP = jp; }
export const getFonts = () => ({ disp: DISP, jp: JP });
