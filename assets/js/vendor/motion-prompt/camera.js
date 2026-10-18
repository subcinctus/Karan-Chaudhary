// Vendored Motion Prompt camera pack as one ES module (run-the-code port).
// Source: "kit camera" and "get 27 30 31 32 33 43" printed by the Motion Prompt CLI
// (skills/motion-prompt/scripts/motion-prompt.mjs, offline API v1). MIT License, see THIRD-PARTY-NOTICES.md.
// Each pack lives in its own module: kits declare the same top-level names (CW, CH, CYC, C, CELLS, …).
//
// Modifications (every changed line is tagged "[mod]"; with the default palette the pixels are unchanged):
//   - Palette object C gains keys vfMark, hudBg, hudInk, face, glass, vfLine, rec whose defaults are the original literals.
//   - White literals in clear(), shot() and mkCanvasCached() ('#FFFFFF' / '#fff') → C.card.
//   - Viewfinder line '#8F8F94' → C.vfLine, REC label '#7D7D82' → C.rec; centre mark, HUD pill and HUD text → C.vfMark / C.hudBg / C.hudInk.
//   - person() face dot '#FFFFFF' → C.face; CAR window '#fff' → C.glass.
//   - Font constants JP / EN / MONO: const → let, so setFonts() can point them at the site's stacks.
//   - ES module exports appended at the end (CELLS_BY_ID, CAMERA, C, setFonts, …).
// Element code is unchanged. Callers remap colours with Object.assign(C, palette) before a draw call
// (synchronous, so safe) and pass each cell this pack's card size: cell(ctx, CAMERA.w, CAMERA.h, u), 0 ≤ u < 9.4.

// Motion Prompt #025-048 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#025
//
// Kit for pack "camera" (Camera moves & transitions / カメラワークと切り替え): the constants and helpers its elements share.
// Elements #025-048 · 539x208 px · cycle 9.4 s. Element code: https://showheyohtaki.github.io/motion-prompt/api/v1/en/e/<id>.txt (or /ja/).
//
// Run one element standalone in a browser:
//   1. paste this file into a <script>,
//   2. paste the element code below it (it assigns CELLS[n - 1], n = the element number inside the pack),
//   3. then add:
//        const c = document.createElement('canvas'); c.width = 539; c.height = 208; document.body.append(c);
//        const k = c.getContext('2d'), cell = CELLS.find(Boolean), t0 = performance.now();
//        (function loop() {
//          const u = ((performance.now() - t0) / 1000) % 9.4;   // seconds, 0 <= u < 9.4
//          k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, 539, 208);
//          k.save(); cell(k, 539, 208, u); k.restore();
//          requestAnimationFrame(loop);
//        })();
// Every cell is a pure function of u, so the same call renders video frames: u = frame / fps.

// @kit
// カメラワーク＆切り替え 24（カード 539x208）。各コマは時間 u の純関数。
// 1つの動きは CYC=4.7秒。切り替え（19〜21）は A→B の次に B→A と戻るので、パックの周期は CYC×2=9.4秒。
const CW = 539, CH = 208, FPS = 30;
const HOLD = 9.4, CYC = HOLD / 2;
const C = {
  bg: '#F4F3F0', card: '#FFFFFF', border: '#E3E1DC', ink: '#1E1E21', sub: '#8E8E93', faint: '#C9C9CC',
  blue: '#2F6BEB', blueM: '#9DB8F6', blueL: '#C9D8FB', blueXL: '#E4ECFE', blueBg: '#F1F5FF',
  grid: '#ECECEC', g1: '#F1F0EE', g2: '#E2E1DE', g3: '#CFCECB', g4: '#A9A8A5',
  vfMark: 'rgba(143,143,148,.55)', hudBg: 'rgba(255,255,255,.82)', hudInk: '#6E6E73', face: '#FFFFFF', glass: '#fff', vfLine: '#8F8F94', rec: '#7D7D82'   // [mod] added keys
};
let JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
let EN = '"Helvetica Neue", "SF Pro Display", system-ui, sans-serif';
let MONO = '"SF Mono", ui-monospace, Menlo, monospace';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const P = (t, a, b) => clamp((t - a) / (b - a));
const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eIOs = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const eOut = x => 1 - Math.pow(1 - x, 3);
const mod = (a, n) => ((a % n) + n) % n;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function txt(ctx, s, x, y, font, col, align = 'left', base = 'alphabetic', ls = '0px') {
  ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = ls; ctx.fillText(s, x, y); ctx.letterSpacing = '0px';
}
function tw(ctx, s, font, ls = '0px') { ctx.font = font; ctx.letterSpacing = ls; const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w; }

// ============================== 3D SCENE ==============================
// 世界座標: Y上・カメラは +Z を向く（yaw=0）。単位はメートル。焦点距離 f はピクセル。
const F0 = 330;  // = 24mm 表示
const mm = f => Math.round(f / F0 * 24) + 'mm';
function cam(o) { return Object.assign({ x: 0, y: 1.5, z: 0, yaw: 0, pitch: 0, roll: 0, f: F0 }, o); }
function proj(c, X, Y, Z) {
  const dx = X - c.x, dy = Y - c.y, dz = Z - c.z;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
  return { x: c.f * x1 / z2, y: -c.f * y2 / z2, z: z2, s: c.f / z2, cx: x1, cy: y2 };
}
function camZ(c, X, Y, Z) { return proj(c, X, Y, Z).z; }
const NEAR = 0.25;
function seg(ctx, c, a, b) {   // 3D line with near clipping
  let za = camZ(c, ...a), zb = camZ(c, ...b);
  if (za < NEAR && zb < NEAR) return;
  if (za < NEAR) { const t = (NEAR - za) / (zb - za); a = a.map((v, i) => lerp(v, b[i], t)); }
  else if (zb < NEAR) { const t = (NEAR - zb) / (za - zb); b = b.map((v, i) => lerp(v, a[i], t)); }
  const p = proj(c, ...a), q = proj(c, ...b);
  ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
}
function poly(ctx, c, pts) { ctx.beginPath(); pts.forEach((p, i) => { const q = proj(c, ...p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath(); }

// sprite = local drawing (meters, y up) anchored at a world point, always facing camera (billboard)
function sprite(ctx, c, X, Y, Z, fn) {
  const p = proj(c, X, Y, Z); if (p.z < NEAR) return;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s, -p.s); fn(ctx, p.s); ctx.restore();
}
function person(ctx, s, o = {}) {
  const col = o.col || C.blue, walk = o.walk || 0, face = o.face;
  ctx.fillStyle = col;
  const sw = Math.sin(walk) * 0.42;
  // legs
  [[-0.08, sw], [0.08, -sw]].forEach(([x, a]) => { ctx.save(); ctx.translate(x, 0.86); ctx.rotate(a); rr(ctx, -0.075, -0.86, 0.15, 0.88, 0.07); ctx.fill(); ctx.restore(); });
  // arms
  [[-0.25, -sw], [0.25, sw]].forEach(([x, a]) => { ctx.save(); ctx.translate(x, 1.38); ctx.rotate(a * (o.armUp ? 0 : 1) + (o.armUp ? (x < 0 ? -2.6 : 2.6) : 0)); rr(ctx, -0.06, -0.58, 0.12, 0.6, 0.06); ctx.fill(); ctx.restore(); });
  rr(ctx, -0.23, 0.82, 0.46, 0.64, 0.12); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 1.63, 0.16, 0, 7); ctx.fill();
  if (face !== undefined && Math.cos(face) > 0) {   // 顔の向き（オービット用）
    ctx.fillStyle = C.face; /* [mod] → C.face */ ctx.beginPath(); ctx.arc(Math.sin(face) * -0.09, 1.65, 0.035, 0, 7); ctx.fill();
  }
}
function tree(ctx, s, h = 4, col = C.g2) {
  ctx.fillStyle = C.g3; ctx.fillRect(-0.09 * h / 4, 0, 0.18 * h / 4, h * 0.55);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, h * 0.68, h * 0.3, 0, 7); ctx.fill();
}
function building(ctx, s, w, h, col = C.g1) {
  ctx.fillStyle = col; ctx.fillRect(-w / 2, 0, w, h);
  ctx.strokeStyle = C.g3; ctx.lineWidth = 1.4 / s; ctx.strokeRect(-w / 2, 0, w, h);
  ctx.fillStyle = C.g2;
  for (let y = h - 1.6; y > 1; y -= 1.8) for (let x = -w / 2 + 0.6; x < w / 2 - 0.7; x += 1.3) ctx.fillRect(x, y, 0.6, 0.8);
}
function post(ctx, s, h = 1.2) { ctx.fillStyle = C.g4; ctx.fillRect(-0.07, 0, 0.14, h); ctx.fillRect(-0.12, h - 0.06, 0.24, 0.1); }

// scene presets
const MTN_FAR = [[-420, 0], [-300, 22], [-230, 8], [-150, 30], [-80, 12], [-20, 34], [50, 14], [120, 28], [190, 6], [260, 26], [340, 10], [420, 0]];
const MTN_NEAR = [[-260, 0], [-190, 12], [-140, 4], [-70, 18], [-20, 6], [30, 15], [95, 3], [160, 16], [230, 5], [300, 0]];
const BLD = [[-17, 4, 9], [-12, 3.2, 13], [-8, 2.6, 7], [11, 3.4, 11], [15.5, 4, 8], [20, 3, 15], [-24, 3.5, 10], [26, 4, 7]];
const CITY = [[-9, 3.4, 12], [-5.5, 3, 18], [-2, 3.6, 9], [1.8, 3, 22], [5.4, 3.6, 14], [9, 3, 10], [-13, 3.4, 15], [12.8, 3.6, 19]];

function world(ctx, w, h, c, o = {}) {
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(c.roll || 0);
  const blurBg = o.blurBg || 0, blurFg = o.blurFg || 0;
  const setBlur = b => { ctx.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none'; };
  // sky tint
  if (o.sky) { ctx.fillStyle = o.sky; ctx.fillRect(-w * 2, -h * 3, w * 4, h * 6); }
  setBlur(blurBg);
  // sun / moon
  const sun = o.sun === undefined ? [30, 30, 170] : o.sun;
  if (sun) { const p = proj(c, ...sun); if (p.z > NEAR) { ctx.fillStyle = o.sunCol || C.blueL; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, 5.5 * p.s * (o.sunScale || 1)), 0, 7); ctx.fill(); } }
  if (o.clouds) o.clouds.forEach(([X, Y, Z, r]) => { const p = proj(c, X, Y, Z); if (p.z < NEAR) return; ctx.fillStyle = C.g1; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 2.2 * p.s, r * p.s, 0, 0, 7); ctx.ellipse(p.x + r * 1.2 * p.s, p.y + r * .2 * p.s, r * 1.4 * p.s, r * .8 * p.s, 0, 0, 7); ctx.fill(); });
  // mountains (far planes)
  if (o.mountains !== false) {
    const off = o.mtnZ || 0;
    ctx.fillStyle = C.blueXL; poly(ctx, c, [...MTN_FAR.map(([x, y]) => [x, y, 175 + off])]); ctx.fill();
    ctx.fillStyle = C.blueL; poly(ctx, c, [...MTN_NEAR.map(([x, y]) => [x, y, 120 + off])]); ctx.fill();
  }
  // ground + grid
  if (o.grid !== false) {
    ctx.save(); setBlur(blurBg * 0.6);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1.3; ctx.beginPath();
    const z0 = Math.floor(c.z / 2) * 2, xs = o.gridX || 40;
    for (let z = z0 + 2; z <= z0 + 90; z += (z - z0 < 30 ? 2 : 6)) seg(ctx, c, [-xs + c.x, 0, z], [xs + c.x, 0, z]);
    for (let x = Math.floor(c.x / 2) * 2 - xs; x <= c.x + xs; x += 2) seg(ctx, c, [x, 0, z0 + 0.5], [x, 0, z0 + 90]);
    ctx.stroke();
    // horizon
    ctx.strokeStyle = C.g2; ctx.lineWidth = 1.5; ctx.beginPath(); seg(ctx, c, [c.x - 400, 0, c.z + 300], [c.x + 400, 0, c.z + 300]); ctx.stroke();
    ctx.restore();
  }
  // sprites sorted by depth
  const list = [];
  const add = (X, Y, Z, fn, fg) => list.push({ z: camZ(c, X, Y, Z), X, Y, Z, fn, fg });
  if (o.buildings !== false) (o.city ? CITY.map(([x, bw, bh]) => [x, bw, bh, 30]) : BLD.map(([x, bw, bh]) => [x, bw, bh, 48])).forEach(([x, bw, bh, z]) => add(x, 0, z, (k, s) => building(k, s, bw, bh)));
  if (o.trees !== false) [[-7, 22], [6.5, 19], [9.5, 24], [-11, 26], [3, 30]].forEach(([x, z]) => add(x, 0, z, (k, s) => tree(k, s, 4)));
  if (o.tower) add(o.tower[0], 0, o.tower[1], (k, s) => { building(k, s, 6, 9.5, C.g1); k.fillStyle = C.g4; k.fillRect(-0.08, 9.5, 0.16, 2.2); k.fillStyle = C.blue; k.beginPath(); k.arc(0, 11.8, 0.3, 0, 7); k.fill(); });
  if (o.ring) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(o.ring[0] + Math.sin(a) * o.ring[2], 0, o.ring[1] + Math.cos(a) * o.ring[2], (k, s) => tree(k, s, 3.2, i % 3 ? C.g2 : C.blueXL)); }
  if (o.extra) o.extra.forEach(e => add(e[0], e[1], e[2], e[3], e[4]));
  if (o.person) { const pp = o.person; add(pp.x || 0, pp.y || 0, pp.z === undefined ? 8 : pp.z, (k, s) => person(k, s, pp), pp.fg); }
  if (o.fg) o.fg.forEach(([X, Z, kind]) => add(X, 0, Z, (k, s) => kind === 'rock' ? (k.fillStyle = C.g3, k.beginPath(), k.ellipse(0, 0.1, 0.55, 0.38, 0, 0, 7), k.fill()) : post(k, s), true));
  list.sort((a, b) => b.z - a.z);
  for (const it of list) { setBlur(it.fg ? blurFg : blurBg); sprite(ctx, c, it.X, it.Y, it.Z, it.fn); }
  ctx.filter = 'none';
  if (o.after) o.after(ctx, c);
  ctx.restore();
}

// ============================== VIEWFINDER CARD ==============================
const CARD = mkCanvas(CW, CH), CK = CARD.getContext('2d');
const TMP = mkCanvas(CW, CH), TK = TMP.getContext('2d');
const TMP2 = mkCanvas(CW, CH), TK2 = TMP2.getContext('2d');
function clear(k, w = CW, h = CH) { k.setTransform(1, 0, 0, 1, 0, 0); k.globalAlpha = 1; k.filter = 'none'; k.fillStyle = C.card; k.fillRect(0, 0, w, h); }   // [mod] '#FFFFFF' → C.card
// draw fnA then blend fnB on top with alpha a (into k)
function blend(k, fnA, fnB, a) {
  if (a <= 0.001) return fnA(k);
  if (a >= 0.999) return fnB(k);
  fnA(k);
  clear(TK2); fnB(TK2); k.save(); k.globalAlpha = a; k.drawImage(TMP2, 0, 0); k.restore();
}
// motion blur: average n renders of fn(k, s) with s spread over [s0, s1]
function mblur(k, fn, s0, s1, n) {
  if (Math.abs(s1 - s0) < 1e-4 || n < 2) return fn(k, s0);
  const acc = mkCanvasCached(), ak = acc.getContext('2d');
  for (let i = 0; i < n; i++) {
    clear(TK); fn(TK, lerp(s0, s1, (i + .5) / n));
    ak.globalAlpha = 1 / (i + 1); ak.drawImage(TMP, 0, 0);
  }
  ak.globalAlpha = 1; k.save(); k.drawImage(acc, 0, 0); k.restore();
}
let _acc; function mkCanvasCached() { if (!_acc) _acc = mkCanvas(CW, CH); const k = _acc.getContext('2d'); k.globalAlpha = 1; k.fillStyle = C.card; k.fillRect(0, 0, CW, CH); return _acc; }   // [mod] '#fff' → C.card

function viewfinder(k, w, h, t, hud, hudCol) {
  k.save();
  const m = 13, L = 20;
  k.strokeStyle = C.vfLine; k.lineWidth = 2.6; k.lineCap = 'round';   // [mod] '#8F8F94' → C.vfLine
  k.beginPath();
  [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, sx, sy]) => { k.moveTo(x, y + sy * L); k.lineTo(x, y); k.lineTo(x + sx * L, y); });
  k.stroke();
  // center mark
  k.strokeStyle = C.vfMark; k.lineWidth = 1.6;   /* [mod] → C.vfMark */ k.beginPath(); k.moveTo(w / 2 - 7, h / 2); k.lineTo(w / 2 + 7, h / 2); k.moveTo(w / 2, h / 2 - 7); k.lineTo(w / 2, h / 2 + 7); k.stroke();
  // REC (なめらかな明滅・9.4秒で9回＝ループの継ぎ目なし)
  const a = 0.55 + 0.45 * Math.cos(t * Math.PI * 2 * 9 / HOLD);
  k.fillStyle = C.blue; k.globalAlpha = a; k.beginPath(); k.arc(m + 16, m + 17, 5, 0, 7); k.fill(); k.globalAlpha = 1;
  txt(k, 'REC', m + 27, m + 17, `600 14px ${MONO}`, C.rec, 'left', 'middle');   // [mod] '#7D7D82' → C.rec
  if (hud) {
    const f = `600 15px ${MONO}`, ww = tw(k, hud, f);
    k.fillStyle = C.hudBg; /* [mod] → C.hudBg */ rr(k, w - m - 14 - ww - 10, m + 6, ww + 20, 23, 6); k.fill();
    txt(k, hud, w - m - 14, m + 18, f, hudCol || C.hudInk, 'right', 'middle');   // [mod] '#6E6E73' → C.hudInk
  }
  k.restore();
}

// ============================== CELLS ==============================
// each: (k, w, h, u) where u = time within the cycle (0..CYC), cyc = cycle index; returns HUD string
const RESET = 0.5;  // 末尾のクロスフェードで開始状態へ戻す
function camCell(stateAt, hudAt, t0 = 0.5, t1 = 3.4) {
  return (k, w, h, u) => {
    const p = eIO(P(u, t0, t1));
    const r = P(u, CYC - RESET, CYC);
    blend(k, kk => stateAt(kk, w, h, p, u), kk => stateAt(kk, w, h, 0, u - CYC), eIOs(r));
    return hudAt(r > 0.5 ? 0 : p, u);
  };
}
// 1コマぶんの枠: 白地 → 中身 → ファインダー（四隅・REC・右上の数値）。u はパック周期 0..CYC×2
function shot(fn, vh) {
  return (k, w, h, u) => {
    const uu = mod(u, CYC), cyc = Math.floor(u / CYC);
    k.fillStyle = C.card; k.fillRect(0, 0, w, h);   // [mod] '#FFFFFF' → C.card
    k.save(); const hud = fn(k, w, h, uu, cyc); k.restore();
    k.globalAlpha = 1; k.filter = 'none';
    viewfinder(k, w, vh || h, u, hud);
  };
}
const CELLS = [];

// @shared
// 跳躍の高さと、舞い落ちる葉（13・14・16 で使う）
function jumpY(q) { return q <= 0 || q >= 1 ? 0 : 4 * q * (1 - q) * 1.1; }
function leaves(u, speed) { const ex = []; for (let i = 0; i < 9; i++) { const ph = mod(u * speed / 4.7 + i / 9, 1); ex.push([-3 + i * 0.75 + Math.sin(i * 3) * 0.3, 3.4 - ph * 3.4, 6 + (i % 3), (kk) => { kk.fillStyle = i % 2 ? C.blueM : C.g3; kk.save(); kk.rotate(ph * 6 + i); kk.beginPath(); kk.ellipse(0, 0, 0.09, 0.045, 0, 0, 7); kk.fill(); kk.restore(); }]); } return ex; }

// @shared
// ---- 切り替え: 奇数サイクルは B→A に戻る（リセット不要）
const sceneA = (k, w, h, extra = {}) => world(k, w, h, cam(Object.assign({ y: 1.4 }, extra.cam)), Object.assign({ person: { x: -0.6, z: 7 } }, extra));
const CAR = [1.2, 0, 9, (kk) => { kk.fillStyle = C.blue; rr(kk, -1.9, 0.35, 3.8, 0.75, 0.25); kk.fill(); rr(kk, -1.1, 0.95, 2.1, 0.62, 0.28); kk.fill(); kk.fillStyle = C.glass; /* [mod] → C.glass */ kk.fillRect(-0.85, 1.08, 0.8, 0.36); kk.fillRect(0.12, 1.08, 0.7, 0.36); kk.fillStyle = C.ink; [-1.15, 1.15].forEach(x => { kk.beginPath(); kk.arc(x, 0.34, 0.34, 0, 7); kk.fill(); }); }];
const SB = { city: true, mountains: false, trees: false, sun: [-26, 40, 150], extra: [CAR] };
const sceneB = (k, w, h, extra = {}) => world(k, w, h, cam(Object.assign({ y: 1.6, pitch: 0.1 }, extra.cam)), Object.assign({}, SB, extra));
function abCell(trans, hudFn) {
  return (k, w, h, u, cyc) => {
    const S = cyc % 2 === 0 ? [sceneA, sceneB] : [sceneB, sceneA];
    trans(k, w, h, u, S[0], S[1], cyc);
    return hudFn ? hudFn(u, cyc) : (cyc % 2 === 0 ? 'A → B' : 'B → A');
  };
}

// @shared
// 23/24 J・L カット: 上が映像、下に映像と音のタイムライン
function splitCell(lead) {   // lead>0: 音が先（J） / lead<0: 音が後（L）
  return (k, w, h, u, cyc) => {
    const vh = 134;
    const p = clamp((u - 0.4) / 3.6);       // 再生ヘッド
    const r = P(u, CYC - RESET, CYC);
    const X0 = 70, X1 = w - 22, cutV = 0.55, cutA = cutV - lead;
    const draw = (kk, p) => {
      // 映像
      kk.save(); kk.beginPath(); kk.rect(0, 0, w, vh); kk.clip();
      (p < cutV ? sceneA : sceneB)(kk, w, vh, { cam: { pitch: p < cutV ? -0.13 : -0.06 } });
      // 今流れている音
      const aB = p >= cutA, lab = aB ? '♪ Bの音' : '♪ Aの音', f = `700 15px ${JP}`;
      const bw = tw(kk, lab, f) + 22;
      kk.fillStyle = aB ? C.blue : '#8E8E93'; rr(kk, w - 42 - bw, vh - 40, bw, 26, 13); kk.fill();
      txt(kk, lab, w - 42 - bw / 2, vh - 26.5, f, '#fff', 'center', 'middle');
      const sl = p < cutV ? 'A' : 'B';
      kk.fillStyle = 'rgba(255,255,255,.9)'; rr(kk, 42, vh - 40, 70, 26, 13); kk.fill();
      txt(kk, '映像' + sl, 77, vh - 26.5, `700 15px ${JP}`, C.ink, 'center', 'middle');
      kk.restore();
      kk.strokeStyle = C.border; kk.lineWidth = 1.5; kk.beginPath(); kk.moveTo(0, vh + .5); kk.lineTo(w, vh + .5); kk.stroke();
      // タイムライン
      const tracks = [['映像', vh + 14, cutV], ['音', vh + 44, cutA]];
      const xAt = q => lerp(X0, X1, q);
      tracks.forEach(([name, y, cut]) => {
        txt(kk, name, 18, y + 11, `600 15px ${JP}`, C.sub, 'left', 'middle');
        kk.fillStyle = C.g2; rr(kk, X0, y, xAt(cut) - X0 - 2, 22, 5); kk.fill();
        kk.fillStyle = C.blueL; rr(kk, xAt(cut) + 2, y, X1 - xAt(cut) - 2, 22, 5); kk.fill();
        txt(kk, 'A', X0 + 10, y + 11.5, `700 14px ${EN}`, C.g4, 'left', 'middle');
        txt(kk, 'B', xAt(cut) + 12, y + 11.5, `700 14px ${EN}`, C.blue, 'left', 'middle');
        if (name === '音') {   // 波形
          kk.strokeStyle = 'rgba(255,255,255,.95)'; kk.lineWidth = 1.6; kk.beginPath();
          for (let x = X0 + 26; x < X1 - 6; x += 5) { if (x < X0 + 24 || (x > xAt(cut) - 4 && x < xAt(cut) + 26)) continue; const a = 3 + 5 * Math.abs(Math.sin(x * 0.37) * Math.cos(x * 0.11)); kk.moveTo(x, y + 11 - a); kk.lineTo(x, y + 11 + a); }
          kk.stroke();
        }
      });
      // ずれている区間を強調
      const a1 = xAt(Math.min(cutA, cutV)), a2 = xAt(Math.max(cutA, cutV));
      kk.fillStyle = 'rgba(47,107,235,.12)'; kk.fillRect(a1, vh + 8, a2 - a1, 64);
      kk.strokeStyle = C.blue; kk.lineWidth = 1.5; kk.setLineDash([4, 3]); kk.beginPath(); kk.moveTo(a1, vh + 8); kk.lineTo(a1, vh + 72); kk.moveTo(a2, vh + 8); kk.lineTo(a2, vh + 72); kk.stroke(); kk.setLineDash([]);
      // 再生ヘッド
      const hx = xAt(p); kk.fillStyle = C.ink; kk.fillRect(hx - 1.5, vh + 6, 3, 68); kk.beginPath(); kk.moveTo(hx - 6, vh + 4); kk.lineTo(hx + 6, vh + 4); kk.lineTo(hx, vh + 11); kk.fill();
    };
    blend(k, kk => draw(kk, p), kk => draw(kk, 0), eIOs(r));
    return null;
  };
}

// Motion Prompt #027 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#027
//
// Dolly in / ドリーイン
// Pack: camera (Camera moves & transitions) · element 03 · Category: Camera Movement
// What happens: The camera itself moves toward the subject; near objects grow and pass quickly while the distant mountains barely change.
// Motion spec:
//   - Camera: moves forward (in depth) 0 m → 5.8 m; height 1.5 m, direction and focal length (330 px, shown as 24mm) fixed
//   - Timing: 0.5 s to 3.4 s (2.9 s), cubic ease-in-out (about cubic-bezier(0.65,0,0.35,1))
//   - Subject: a person stands still 8 m ahead; distance goes 8 m → 2.2 m, so they appear about 3.6× larger
//   - Parallax: a foreground post (1.5 m left, 3.6 m deep) and a rock (1.6 m right, 4.8 m deep) pass out of frame; mountains 120 m+ away stay almost the same size
//   - Return: hold 3.4–4.2 s, then cross-fade back to the start over the last 0.5 s (one pass = 4.7 s)
//   - The top-right readout stays at 24mm (the difference from 04 Zoom in)
// When to use it: To move in on a person or detail while keeping a sense of depth.
// Tags: dolly, dolly in, push in, track in, move forward, parallax, camera move
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#027
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 03
// 03 ドリーイン: カメラ位置が前へ（手前は大きく、奥はほぼそのまま）
CELLS[2] = shot(camCell((k, w, h, p) => world(k, w, h, cam({ z: lerp(0, 5.8, p) }), { person: { z: 8 }, fg: [[-1.5, 3.6], [1.6, 4.8, 'rock']] }),
  p => mm(F0)));

// Motion Prompt #030 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#030
//
// Orbit (Arc shot) / オービット
// Pack: camera (Camera moves & transitions) · element 06 · Category: Camera Movement
// What happens: The camera travels on a circle around the subject; the person stays centred while the trees and buildings behind sweep sideways.
// Motion spec:
//   - Camera: travels on a circle of radius 6 m centred on the person (9 m ahead), from -0.95 rad → +0.95 rad (-54° → +54°, about 109° in total)
//   - Direction: always faces the centre (yaw = -angle); height 1.7 m, pitch fixed at -0.07 rad (about 4° down)
//   - Timing: 0.5 s to 3.6 s (3.1 s), cubic ease-in-out (about cubic-bezier(0.65,0,0.35,1))
//   - Subject: the person does not move; a white dot on the face shifts sideways with the angle; a dashed circle of radius 1.3 m marks the ground
//   - Background: 12 trees evenly spaced on a 10 m radius cross behind the person as the camera moves round
//   - Return: hold 3.6–4.2 s, then cross-fade back over the last 0.5 s; top-right readout shows the angle (-54° → +54°)
// When to use it: To show a person or product in three dimensions, or to emphasise an entrance or a key moment.
// Tags: orbit, arc shot, circle, 360, rotate around, revolve, camera move
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#030
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 06
// 06 オービット: 被写体を中心に円を描いて回り込む
CELLS[5] = shot(camCell((k, w, h, p) => {
  const a = lerp(-0.95, 0.95, p), R = 6, P0 = [0, 0, 9];
  const c = cam({ x: P0[0] + Math.sin(a) * R, z: P0[2] - Math.cos(a) * R, yaw: -a, y: 1.7, pitch: -0.07 });
  world(k, w, h, c, {
    person: { z: 9, face: a }, ring: [0, 9, 10], buildings: true, trees: false,
    after: (kk, cc) => { kk.strokeStyle = C.blueM; kk.lineWidth = 2; kk.setLineDash([5, 5]); kk.beginPath(); for (let i = 0; i <= 48; i++) { const b = i / 48 * Math.PI * 2; const q = proj(cc, Math.sin(b) * 1.3, 0, 9 + Math.cos(b) * 1.3); i ? kk.lineTo(q.x, q.y) : kk.moveTo(q.x, q.y); } kk.stroke(); kk.setLineDash([]); }
  });
}, p => `${Math.round(lerp(-0.95, 0.95, p) * 57.3)}°`.replace(/^(\d)/, '+$1'), 0.5, 3.6));

// Motion Prompt #031 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#031
//
// Crane up / クレーンアップ
// Pack: camera (Camera moves & transitions) · element 07 · Category: Camera Movement
// What happens: The camera rises while tilting down until it looks down on the person.
// Motion spec:
//   - Camera: rises from 1.4 m to 9 m while moving forward 0 m → 1.5 m
//   - Direction: tilts down to keep the person (8 m ahead) in frame; pitch = -0.86 × atan2(height - 1.0, 8 - forward), about -2.5° → -44°
//   - Timing: 0.5 s to 3.4 s (2.9 s), cubic ease-in-out (about cubic-bezier(0.65,0,0.35,1))
//   - Subject: the person does not move; they get smaller as the camera rises, the ground grid fills the frame and the horizon leaves at the top
//   - Return: hold 3.4–4.2 s, then cross-fade back to the start over the last 0.5 s (one pass = 4.7 s)
//   - Top-right readout shows the height (↑ 1.4m → ↑ 9.0m)
// When to use it: To pull away from a person at the end of a scene or to reveal how large the location is.
// Tags: crane, crane up, jib, boom up, rise, high angle, camera move
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#031
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 07
// 07 クレーンアップ: カメラが上昇し、見下ろしになる
CELLS[6] = shot(camCell((k, w, h, p) => {
  const y = lerp(1.4, 9, p), z = lerp(0, 1.5, p);
  world(k, w, h, cam({ y, z, pitch: -0.86 * Math.atan2(y - 1.0, 8 - z) }), { person: { z: 8 } });
}, p => `↑ ${lerp(1.4, 9, p).toFixed(1)}m`));

// Motion Prompt #032 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#032
//
// Dolly zoom (Vertigo) / ドリーズーム
// Pack: camera (Camera moves & transitions) · element 08 · Category: Camera Movement
// What happens: The camera pulls back while zooming in by the same ratio; the person keeps the same size and only the background closes in.
// Motion spec:
//   - Camera: distance d to the person (8 m ahead) widens from 3.2 m → 8 m (a 4.8 m pull-back); height 1.3 m
//   - Focal length: f = 330 × d/8 px, i.e. 132 px → 330 px (shown as 10mm → 24mm), keeping distance ÷ focal length constant
//   - Timing: 0.5 s to 3.4 s (2.9 s), cubic ease-in-out (about cubic-bezier(0.65,0,0.35,1))
//   - Subject: the person does not move and keeps the same height in frame; blue dashed lines 160 px wide at head (1.8 m) and feet show the size is constant
//   - Background: buildings (48 m away) grow about 2.2× and mountains about 2.4×, closing in behind the person, while the ground in front of the person shrinks
//   - Return: hold 3.4–4.2 s, then cross-fade back to the start over the last 0.5 s (one pass = 4.7 s)
// When to use it: For a moment of realisation, or to show unease or shock visually.
// Tags: dolly zoom, vertigo, zolly, push pull, background stretch, unease, camera move
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#032
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 08
// 08 ドリーズーム: 人物の大きさは一定、背景だけ伸び縮み
CELLS[7] = shot(camCell((k, w, h, p) => {
  const d = lerp(3.2, 8, p), f = F0 * d / 8 * 1.0;
  const c = cam({ z: 8 - d, f, y: 1.3 });
  world(k, w, h, c, {
    person: { z: 8 }, trees: true,
    after: (kk, cc) => { const top = proj(cc, 0, 1.8, 8).y, bot = proj(cc, 0, 0, 8).y; kk.strokeStyle = C.blue; kk.lineWidth = 1.6; kk.setLineDash([6, 5]); kk.beginPath(); kk.moveTo(-80, top); kk.lineTo(80, top); kk.moveTo(-80, bot); kk.lineTo(80, bot); kk.stroke(); kk.setLineDash([]); }
  });
}, p => mm(F0 * lerp(3.2, 8, p) / 8)));

// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
//
// Rack focus / ラックフォーカス
// Pack: camera (Camera moves & transitions) · element 09 · Category: Shooting Style & Time
// What happens: The camera does not move; focus shifts from a flower in the foreground to a person behind it, swapping which one is blurred.
// Motion spec:
//   - Camera: position, direction and focal length all fixed (height 1.1 m); only the blur amounts change
//   - Blur: the foreground flower (0.75 m left, 2 m away) goes 0 px → 7 px; the person and background (person 0.9 m right, 9 m away) go 6 px → 0 px; the ground grid uses 0.6× the background blur
//   - Timing: 1.0 s to 2.6 s (1.6 s), cubic ease-in-out (about cubic-bezier(0.65,0,0.35,1))
//   - Focus marker: blue corner brackets travel in a straight line from the flower to the person, half-width shrinking 46 px → 30 px
//   - Subject: neither the flower nor the person moves
//   - Return: hold 2.6–4.2 s, then cross-fade back over the last 0.5 s; top-right readout shows focus distance (◎ 2m → ◎ 9m)
// When to use it: To move attention from foreground to background (or back) without cutting.
// Tags: rack focus, focus pull, pull focus, depth of field, blur, bokeh, foreground
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#033
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 09
// 09 ラックフォーカス
CELLS[8] = shot(camCell((k, w, h, p) => {
  world(k, w, h, cam({ y: 1.1 }), {
    person: { x: 0.9, z: 9 }, blurFg: 7 * p, blurBg: 6 * (1 - p),
    extra: [[-0.75, 0, 2.0, (kk, s) => { kk.fillStyle = C.g3; kk.fillRect(-0.025, 0, 0.05, 0.75); kk.fillStyle = C.blueM; for (let i = 0; i < 6; i++) { kk.beginPath(); kk.ellipse(Math.cos(i) * 0.09, 0.8 + Math.sin(i) * 0.09, 0.08, 0.05, i, 0, 7); kk.fill(); } kk.fillStyle = C.blue; kk.beginPath(); kk.arc(0, 0.8, 0.05, 0, 7); kk.fill(); }, true]],
    after: (kk, cc) => {   // ピント位置の枠
      const a = proj(cc, -0.75, 0.8, 2.0), b = proj(cc, 0.9, 0.9, 9);
      const x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p), r = lerp(46, 30, p);
      kk.strokeStyle = C.blue; kk.lineWidth = 2; kk.beginPath();
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { kk.moveTo(x + sx * r, y + sy * r - sy * 9); kk.lineTo(x + sx * r, y + sy * r); kk.lineTo(x + sx * r - sx * 9, y + sy * r); });
      kk.stroke();
    }
  });
}, p => `◎ ${lerp(2, 9, p).toFixed(0)}m`, 1.0, 2.6));

// Motion Prompt #043 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#043
//
// Whip pan / ホイップパン
// Pack: camera (Camera moves & transitions) · element 19 · Category: Transitions
// What happens: The camera swings sideways very fast and the next scene is swapped in during the streaked blur.
// Motion spec:
//   - Join: 0.8 s, from 1.7 s to 2.5 s; in the first 0.4 s the outgoing shot swings away, in the last 0.4 s the incoming shot swings in and settles
//   - First half: outgoing yaw 0 → +0.45 rad (about 26°), quadratic ease-in-out; second half: incoming yaw -0.45 rad → 0, same easing
//   - Swap: a straight replacement at the 50% point, hidden because the blur is at its strongest
//   - Blur: 9 renders spread over ±1.6 frames (at 30 fps) are averaged
//   - Camera: height 1.4 m, fixed except during the swing; the subjects (a person in A, a car and city in B) do not move
//   - Alternates A→B and B→A every 4.7 s (9.4 s for the round trip); top-right readout shows "A → B" / "B → A"
// When to use it: To change location or topic while keeping the energy up.
// Tags: whip pan, swish pan, motion blur, fast pan, transition, energy
// Size: 539x208 px · Cycle: 9.4 s
// Needs: kit camera -> https://showheyohtaki.github.io/motion-prompt/api/v1/kit/camera.js
// Live demo: https://showheyohtaki.github.io/motion-prompt/#043
//
// cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 19
// 19 ホイップパン（ブレで次の場面へ）
CELLS[18] = shot(abCell((k, w, h, u, A, B) => {
  const t0 = 1.7, t1 = 2.5;
  const at = (kk, s) => {   // s: 0..1 の進み。前半 A を右へ振り、後半 B が左から止まる
    if (s < .5) world(kk, w, h, cam({ y: 1.4, yaw: eIOs(s * 2) * 0.45 }), A === sceneA ? { person: { x: -0.6, z: 7 } } : SB);
    else world(kk, w, h, cam({ y: 1.4, yaw: -(1 - eIOs((s - .5) * 2)) * 0.45 }), B === sceneA ? { person: { x: -0.6, z: 7 } } : SB);
  };
  if (u < t0) return A(k, w, h);
  if (u > t1) return B(k, w, h);
  const s = P(u, t0, t1), ds = 1 / FPS / (t1 - t0);
  mblur(k, at, clamp(s - ds * 1.6), clamp(s + ds * 1.6), 9);
}));

// Needs kit: camera — run "kit <pack>" once per pack before using this code.

// ============================== ES MODULE EXPORTS (added) ==============================
/** Cells by Motion Prompt ID. */
export const CELLS_BY_ID = { '027': CELLS[2], '030': CELLS[5], '031': CELLS[6], '032': CELLS[7], '033': CELLS[8], '043': CELLS[18] };
/** Pack constants: card size, full cycle (A→B then B→A), one pass, kit fps. */
export const CAMERA = { w: CW, h: CH, cycle: HOLD, pass: CYC, fps: FPS };
/** Palette (mutable: remap per draw) and a frozen copy of the defaults. */
export { C };
export const C_DEFAULT = Object.freeze({ ...C });
export function resetPalette() { Object.assign(C, C_DEFAULT); }
/** Point the kit's font constants at other stacks, e.g. setFonts({ en: '"Inter Tight", sans-serif', mono: '"IBM Plex Mono", monospace' }). */
export function setFonts({ en, mono, jp } = {}) { if (en) EN = en; if (mono) MONO = mono; if (jp) JP = jp; }
export const getFonts = () => ({ en: EN, mono: MONO, jp: JP });
