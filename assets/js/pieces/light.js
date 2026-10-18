// Light study: a plaster bust under the classic portrait set-ups, raymarched in WebGL2.
// Light positions, ratios and colour temperatures come from core/presets.js (the same table the
// SVG plan and the Unreal previs shot list read). Lighting numbers rebuilt from Motion Prompt
// photo elements (numbers only, nothing vendored):
// Motion Prompt #097 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#097
// Motion Prompt #098 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#098
// Motion Prompt #100 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#100
// Motion Prompt #101 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#101
// Motion Prompt #102 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#102
// Motion Prompt #114 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#114
//
// How it renders
//   - Camera: 85 mm on Super 35, 4:5 extraction (vertical FOV 2·atan(9.33/85) = 12.5°), 2.0 m from
//     the head, aimed 5.5 cm below its centre. Wider frames keep the vertical FOV; narrower keep 4:5's width.
//   - Lights are one-sided area sources treated as points for direct light, with iq soft shadows whose
//     sharpness k = clamp(2·dist/size, 2, 64): a bare fresnel is hard, an 8×8 frame very soft.
//   - Key:fill is the DP ratio R = (K + F)/F, so F = K/(R − 1) (presets.fillIntensity).
//   - Colour: Kim Planckian locus → XYZ → von Kries to the camera white balance → linear sRGB
//     (color.lightColor). A 3200 K key at 5600 K WB reads amber because of the maths, not a tint.
//   - Backlight #097: its 22 % #FFE3A3 veil is a thin haze lit by the source behind the head
//     (Henyey-Greenstein in-scatter, added in linear light), so the frame glows instead of greying.
//   - Output: exposure → ACES fit → sRGB → hash dither, then a slate overlay (canvas text, IBM Plex Mono).
//
// Render on demand: seek() is memoised on its inputs (params, size, scale), so the Player can call it
// every frame of a hold for free. Transitions (geometry away from its preset's rest pose) render at
// half resolution; a frame at rest renders at full resolution. Record mode always renders at full.
//
// Presets as springs: the visible `preset` radio is paired with hidden numeric rig params (keyAz …).
// ui/light-plot.js (bindLightPlot / bindLightPresets) answers a preset change with
// api.set(presetParams(id, current), { animate: true }), so the rig springs to the new set-up. Without
// that binding the piece still follows the radio, instantly (the rig is derived from the preset when
// rigPreset ≠ preset).

import { LIGHTING_PRESETS, PRESET_ORDER, DEFAULT_PRESET, fillIntensity, ratioLabel, lightPosition } from '../core/presets.js';
import { lightColor, hexToLinear } from '../core/color.js';
import { clamp, lerp, eIO, mod, smoothstep } from '../core/time.js';
import { loadFonts } from '../core/canvas.js';
import { getGL2, program, uniforms, fullscreenTriangle, drawFullscreen, FULLSCREEN_VS, renderTarget, texture } from '../core/gl.js';
import { sceneFS, COMPOSITE_FS, primitiveCount } from './light-shader.js';

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

// --- Camera -------------------------------------------------------------------

export const CAMERA = {
  focal: 85, format: 'Super 35', gateH: 18.66, aspect: 4 / 5,
  pos: [0, 0, 2.0], target: [0, -0.055, 0], tStop: 'T2.8',
  /** tan(half vertical FOV) for the 4:5 extraction. */
  tanV: 18.66 / 2 / 85,
};
/** Horizontal FOV of the 4:5 frame in degrees (for the plan's wedge). */
export const CAMERA_HFOV = (2 * Math.atan(CAMERA.tanV * CAMERA.aspect) * 180) / Math.PI;

// --- Rig model ------------------------------------------------------------------

const FILL_DEFAULT = { az: -30, el: 5, dist: 2, size: 1.2, kelvin: 5600 };
const RIM_PAIR = LIGHTING_PRESETS.rim.lights;          // [+135°, −135°]
const RIM2 = RIM_PAIR[1];
const RIG_KEYS = ['keyAz', 'keyEl', 'keyDist', 'fillAz', 'fillEl', 'fillDist', 'fillOn', 'rimOn', 'ambient', 'bgStops', 'veil', 'yaw'];
const ANGLE_KEYS = new Set(['keyAz', 'fillAz']);
const wrap180 = a => mod(a + 180, 360) - 180;

/**
 * Full parameter set for a preset (controls + hidden rig). With `current`, azimuths are unwrapped to
 * the nearest equivalent angle so a spring swings the short way round.
 */
export function presetParams(id, current = null) {
  const pr = LIGHTING_PRESETS[id] ?? LIGHTING_PRESETS[DEFAULT_PRESET];
  const isRim = pr.id === 'rim';
  const key = isRim ? RIM_PAIR[0] : pr.lights.find(l => l.role === 'key');
  const fill = pr.lights.find(l => l.role === 'fill');
  const f = fill ?? FILL_DEFAULT;
  const out = {
    preset: pr.id, rigPreset: pr.id,
    keyAz: key.az, keyEl: key.el, keyDist: key.dist, size: key.size, keyK: key.kelvin,
    fillAz: f.az, fillEl: f.el, fillDist: f.dist, fillK: f.kelvin, fillOn: fill ? 1 : 0,
    rimOn: isRim ? 1 : 0, ratio: pr.ratio, wb: pr.cameraWB,
    ambient: pr.ambient ?? 0, bgStops: pr.backgroundStops ?? -2, veil: pr.veil ? 1 : 0, yaw: pr.yaw ?? 0,
  };
  if (current) for (const k of ANGLE_KEYS) if (Number.isFinite(current[k])) out[k] = current[k] + wrap180(out[k] - current[k]);
  return out;
}

/** Largest distance of the rig from its preset's rest pose (0 when settled). */
function restDelta(p) {
  const rest = presetParams(p.rigPreset);
  let m = 0;
  for (const k of RIG_KEYS) {
    if (!Number.isFinite(p[k])) continue;
    const d = ANGLE_KEYS.has(k) ? Math.abs(wrap180(p[k] - rest[k])) : Math.abs(p[k] - rest[k]);
    m = Math.max(m, d);
  }
  return m;
}

/**
 * Lights and look for a params object. Pure. Each light: { role, az, el, dist, size, kelvin, gain }.
 * gain is relative to the key at the head (key = 1, fill = 1/(R − 1)).
 */
export function rigFromParams(params) {
  const p = { ...params };
  // No binding (or a hand-written ?params=): follow the radio instantly.
  if (p.rigPreset !== p.preset && LIGHTING_PRESETS[p.preset]) {
    const r = presetParams(p.preset);
    for (const k of RIG_KEYS) p[k] = r[k];
  }
  const pr = LIGHTING_PRESETS[p.preset] ?? LIGHTING_PRESETS[DEFAULT_PRESET];
  const ratio = clamp(p.ratio ?? 4, 1.01, 64);
  // A preset without fill gains one as soon as the ratio is opened up below 16:1.
  const fillGain = Math.max(clamp(p.fillOn ?? 0), smoothstep(16, 8, ratio));
  const lights = [
    { role: pr.id === 'rim' ? 'rim' : 'key', az: p.keyAz, el: p.keyEl, dist: p.keyDist, size: p.size, kelvin: p.keyK, gain: 1 },
    { role: 'fill', az: p.fillAz, el: p.fillEl, dist: p.fillDist, size: FILL_DEFAULT.size, kelvin: p.fillK, gain: fillGain * fillIntensity(1, ratio), presence: fillGain },
    { role: 'rim', az: RIM2.az, el: RIM2.el, dist: RIM2.dist, size: RIM2.size, kelvin: p.keyK, gain: clamp(p.rimOn ?? 0), presence: clamp(p.rimOn ?? 0) },
  ];
  lights[0].presence = 1;
  return {
    preset: pr, lights, ratio, wb: p.wb, ambient: p.ambient ?? 0, bgStops: p.bgStops ?? -2,
    veil: clamp(p.veil ?? 0), yaw: p.yaw ?? 0, moving: restDelta(p) > 1e-3,
  };
}

// --- Labels -----------------------------------------------------------------------

const r100 = v => Math.round(v / 100) * 100;
const kelvinText = v => {
  const k = r100(v);
  return `${k} K${k === 3200 ? ' · tungsten' : k === 5600 ? ' · daylight' : ''}`;
};
const SIZES = [0.1, 0.3, 0.6, 1.2, 2.4];
const SIZE_LABELS = ['Bare · 10 cm', '1×1 · 30 cm', '2×2 · 60 cm', '4×4 · 1.2 m', '8×8 · 2.4 m'];
const SIZE_SPOKEN = ['bare fresnel, 10 centimetres', '1 by 1 frame, 30 centimetres', '2 by 2 frame, 60 centimetres', '4 by 4 frame, 1.2 metres', '8 by 8 frame, 2.4 metres'];
const sizeIndex = v => SIZES.findIndex(s => Math.abs(s - v) < 0.005);
const sizeText = v => SIZE_LABELS[sizeIndex(v)] ?? `${Math.round(v * 100)} cm`;
const sizeShort = v => (['BARE', '1×1', '2×2', '4×4', '8×8'][sizeIndex(v)] ?? `${Math.round(v * 100)}CM`);
const side = az => {
  const a = Math.round(wrap180(az));
  if (a === 0) return 'on the lens axis';
  if (Math.abs(a) === 180) return 'directly behind';
  return `${Math.abs(a)}° camera-${a > 0 ? 'left' : 'right'}`;
};

// --- Meta ---------------------------------------------------------------------------

const TOUR = ['rembrandt', 'loop', 'butterfly', 'split', 'rim', 'backlight', 'lowkey'];
const SEG = 4.5, TRANS = 1.2;
const DEF = presetParams(DEFAULT_PRESET);
const hiddenNum = key => ({ key, type: 'range', hidden: true, value: DEF[key] });

export const meta = {
  id: 'light',
  title: 'Light · Portrait set-ups',
  context: 'webgl2',
  duration: TOUR.length * SEG,
  loop: true,
  posterTime: 1.5,
  aspect: { wide: 4 / 5, tall: 4 / 5 },
  interactive: true,
  budgetMs: 16,
  fonts: [`500 12px ${MONO}`],
  params: [
    { key: 'preset', label: 'Set-up', type: 'radio', value: DEFAULT_PRESET,
      options: PRESET_ORDER.map(id => ({ value: id, label: LIGHTING_PRESETS[id].label })),
      hint: 'Each set-up moves the lights on the plan; the sliders then change the look.' },
    { key: 'ratio', label: 'Key : fill', type: 'range', values: [2, 3, 4, 6, 8, 12, 16], value: DEF.ratio, group: 'Light',
      format: v => ratioLabel(Math.round(v * 10) / 10), spoken: v => ratioLabel(Math.round(v * 10) / 10, { spoken: true }),
      hint: 'R = (key + fill) / fill. Each stop halves the light on the shadow side.' },
    { key: 'size', label: 'Key source size', type: 'range', values: SIZES, value: DEF.size, group: 'Light',
      format: sizeText, spoken: v => SIZE_SPOKEN[sizeIndex(v)] ?? `${Math.round(v * 100)} centimetres`,
      hint: 'Bigger sources, relative to their distance, give softer shadow edges.' },
    { key: 'keyK', label: 'Key Kelvin', type: 'range', min: 2700, max: 6500, step: 100, value: DEF.keyK, group: 'Light',
      format: kelvinText, spoken: v => `${r100(v)} kelvin${r100(v) === 3200 ? ', tungsten' : r100(v) === 5600 ? ', daylight' : ''}` },
    { key: 'fillK', label: 'Fill Kelvin', type: 'range', min: 2700, max: 6500, step: 100, value: DEF.fillK, group: 'Light',
      format: kelvinText, spoken: v => `${r100(v)} kelvin${r100(v) === 3200 ? ', tungsten' : r100(v) === 5600 ? ', daylight' : ''}` },
    { key: 'wb', label: 'White balance', type: 'range', values: [3200, 4300, 5600], value: DEF.wb, group: 'Camera',
      format: v => `${r100(v)} K`, spoken: v => `${r100(v)} kelvin`,
      hint: 'Light warmer than the white balance reads amber; cooler reads blue.' },
    // Hidden rig (springs between presets) and options.
    ...RIG_KEYS.map(hiddenNum),
    { key: 'rigPreset', type: 'select', hidden: true, value: DEFAULT_PRESET,
      options: Object.keys(LIGHTING_PRESETS).map(id => ({ value: id, label: id })) },
    { key: 'model', type: 'select', hidden: true, value: 'bust', options: [{ value: 'bust', label: 'Bust' }, { value: 'maquette', label: 'Maquette' }] },
    { key: 'slate', type: 'toggle', hidden: true, value: true },
  ],
  record: { w: 864, h: 1080, fps: 24, subframes: 1, tune: 'film' },
  credits: ['#101 Rembrandt', '#102 Butterfly', '#100 Split', '#098 Rim', '#097 Backlight', '#114 Low-key'],
};

/** Scripted tour: hold each set-up 3.3 s, then swing to the next over 1.2 s (eased). Pure. */
export function tourParams(t) {
  const tt = mod(t, meta.duration);
  const i = Math.min(TOUR.length - 1, Math.floor(tt / SEG));
  const local = tt - i * SEG;
  const a = presetParams(TOUR[i]);
  if (local < SEG - TRANS) return a;
  const b = presetParams(TOUR[(i + 1) % TOUR.length], a);
  const u = eIO((local - (SEG - TRANS)) / TRANS);
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = typeof v === 'number' ? lerp(v, b[k], u) : (u < 0.5 ? v : b[k]);
  return out;
}

// --- Piece ----------------------------------------------------------------------------

const VEIL = hexToLinear(LIGHTING_PRESETS.backlight.veil.color);
const VEIL_AMOUNT = LIGHTING_PRESETS.backlight.veil.amount;
const EXPOSURE = 0.5, BG_LEVEL = 1.2, BG_SPILL = 0.5, VIGNETTE = 0.1;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export async function create(canvas, opts) {
  const record = !!opts.record;
  const gl = getGL2(canvas, { preserveDrawingBuffer: record, antialias: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser');
  await loadFonts(meta.fonts);

  let W = opts.width, H = opts.height, dpr = opts.dpr;
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  const shadowSteps = record ? 32 : touch ? 20 : 32;

  const vao = fullscreenTriangle(gl);
  const programs = {};
  const sceneProgram = model => {
    if (!programs[model]) {
      const prog = program(gl, FULLSCREEN_VS, sceneFS(model));
      programs[model] = { prog, u: uniforms(gl, prog) };
    }
    return programs[model];
  };
  sceneProgram('bust');
  const compProg = program(gl, FULLSCREEN_VS, COMPOSITE_FS);
  const compU = uniforms(gl, compProg);

  let target = null;
  const ensureTarget = (w, h) => {
    if (target && target.w === w && target.h === h) return target;
    if (target) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex); }
    target = renderTarget(gl, w, h);
    return target;
  };

  // Slate overlay: canvas text at device resolution, uploaded only when its text or size changes.
  const slate = document.createElement('canvas');
  const sctx = slate.getContext('2d');
  const slateTex = texture(gl, null, { w: 1, h: 1 });
  let slateKey = '';

  function slateLines(r) {
    const pr = r.preset, key = r.lights[0], fill = r.lights[1];
    const name = `${pr.label.toUpperCase()}${pr.mp ? ` · ${pr.mp}` : ''}`;
    const ratio = fill.presence > 0.5 ? ratioLabel(Math.round(r.ratio * 10) / 10).toUpperCase() : 'NO FILL';
    return {
      top: [name, `KEY ${r100(key.kelvin)}K`, ...(fill.presence > 0.5 ? [`FILL ${r100(fill.kelvin)}K`] : []), `WB ${r100(r.wb)}K`],
      right: ['S35 · 85MM', `${CAMERA.tStop} · 4:5`, ratio, `${key.role === 'rim' ? 'RIMS' : 'KEY'} ${sizeShort(key.size)}`],
    };
  }

  function drawSlate(lines, on) {
    const pw = canvas.width, ph = canvas.height;
    const keyStr = on ? `${pw}x${ph}|${dpr}|${JSON.stringify(lines)}` : `off|${pw}x${ph}`;
    if (keyStr === slateKey) return;
    slateKey = keyStr;
    if (slate.width !== pw) slate.width = pw;
    if (slate.height !== ph) slate.height = ph;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, pw, ph);
    if (on) {
      const fs = clamp(Math.round(W * 0.024), 10, 13);
      const pad = Math.round(fs * 1.5), lh = Math.round(fs * 1.55);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.font = `500 ${fs}px ${MONO}`;
      if ('letterSpacing' in sctx) sctx.letterSpacing = `${(fs * 0.08).toFixed(2)}px`;
      sctx.textBaseline = 'alphabetic';
      // Top-left: the set-up; top-right: the camera report. Both sit over the backdrop, clear of the
      // bust and of the Player's chrome in the bottom-right corner.
      const compact = W < 480;   // phones: the set-up name only; the page carries the full report
      (compact ? lines.top.slice(0, 1) : lines.top).forEach((s, i) => {
        sctx.textAlign = 'left';
        sctx.fillStyle = i === 0 ? 'rgba(236,230,218,0.92)' : 'rgba(185,179,168,0.82)';
        sctx.fillText(s, pad, pad + fs + i * lh);
      });
      if (!compact) lines.right.forEach((s, i) => {
        sctx.textAlign = 'right';
        sctx.fillStyle = 'rgba(185,179,168,0.82)';
        sctx.fillText(s, W - pad, pad + fs + i * lh);
      });
    }
    gl.bindTexture(gl.TEXTURE_2D, slateTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slate);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  function cameraBasis() {
    const fwd = norm(sub(CAMERA.target, CAMERA.pos));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const aspect = W / H;
    let tanV = CAMERA.tanV, tanH = tanV * aspect;
    if (aspect < CAMERA.aspect) { tanH = CAMERA.tanV * CAMERA.aspect; tanV = tanH / aspect; }
    return { fwd, right, up, tan: [tanH, tanV] };
  }

  let lastKey = '';

  function seek(t, params) {
    const r = rigFromParams(params);
    const model = params.model === 'maquette' ? 'maquette' : 'bust';
    const scale = record || !r.moving ? 1 : 0.5;
    const pw = canvas.width, ph = canvas.height;
    const lines = slateLines(r);
    const slateOn = params.slate !== false;

    const wbK = r.wb;
    const L = r.lights.map(l => {
      const pos = lightPosition(l);
      const col = lightColor(l.kelvin, wbK).map(v => v * l.gain);
      return {
        pos, col, aim: norm(sub([0, 0, 0], pos)),
        k: clamp((2 * l.dist) / l.size, 2, 64),
        wrap: clamp((0.3 * l.size) / l.dist, 0, 0.3),
        d: l.dist,
        ao: clamp(l.size / l.dist, 0, 1) * 0.8,
      };
    });
    const keyCol = lightColor(r.lights[0].kelvin, wbK);
    const fillCol = lightColor(r.lights[1].kelvin, wbK);
    const neutral = lightColor(wbK, wbK);
    const bgGain = Math.pow(2, r.bgStops);
    const u = {
      uCamPos: CAMERA.pos, uYaw: (r.yaw * Math.PI) / 180,
      uLPos: L.flatMap(l => l.pos), uLCol: L.flatMap(l => l.col), uLAim: L.flatMap(l => l.aim),
      uLK: L.map(l => l.k), uLWrap: L.map(l => l.wrap), uLD: L.map(l => l.d), uLAO: L.map(l => l.ao),
      uAmbient: fillCol.map(v => v * r.ambient),
      // Background light: half the key's colour, half neutral at the camera's balance.
      uBgCol: keyCol.map((v, i) => (0.5 * v + 0.5 * neutral[i]) * BG_LEVEL * bgGain),
      uBgSpill: BG_SPILL * bgGain,
      uVeil: [...VEIL, VEIL_AMOUNT * r.veil],
      uExposure: EXPOSURE, uShadowSteps: shadowSteps, uVignette: VIGNETTE,
    };

    // Memo: identical inputs → the canvas already shows this frame.
    const key = JSON.stringify([model, scale, pw, ph, slateOn, lines, u]);
    if (key === lastKey) return;
    lastKey = key;

    const cam = cameraBasis();
    const tw = Math.max(1, Math.round(pw * scale)), th = Math.max(1, Math.round(ph * scale));
    const tgt = ensureTarget(tw, th);
    const sp = sceneProgram(model);

    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
    gl.viewport(0, 0, tw, th);
    sp.u.set({ ...u, uFwd: cam.fwd, uRight: cam.right, uUp: cam.up, uTan: cam.tan });
    drawFullscreen(gl, vao);

    drawSlate(lines, slateOn);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slateTex);
    compU.set({ uScene: 0, uOverlay: 1, uOverlayOn: slateOn ? 1 : 0 });
    drawFullscreen(gl, vao);
    gl.activeTexture(gl.TEXTURE0);
  }

  return {
    seek,
    resize(w, h, d) { W = w; H = h; dpr = d; lastKey = ''; slateKey = ''; },
    dispose() {
      try {
        for (const p of Object.values(programs)) gl.deleteProgram(p.prog);
        gl.deleteProgram(compProg);
        if (target) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex); }
        gl.deleteTexture(slateTex);
        gl.deleteVertexArray(vao);
      } catch { /* context already gone */ }
      target = null;
    },
    script: tourParams,
    describe(params) { return describeLight(params); },
  };
}

/** Plain-language description of the frame (canvas aria-label and live readout). */
export function describeLight(params) {
  const r = rigFromParams(params);
  const pr = r.preset, [key, fill, rim2] = r.lights;
  const name = `${pr.label} lighting${pr.mp ? ` (Motion Prompt ${pr.mp})` : ''}`;
  const wb = r100(r.wb), kk = r100(key.kelvin);
  const cast = kk < wb - 250 ? 'reads warm' : kk > wb + 250 ? 'reads cool' : 'reads neutral';
  const keyText = pr.id === 'rim' || rim2.presence > 0.5
    ? `two rim lights at 135° either side behind the head, ${Math.round(key.el)}° up, ${kk} K`
    : `key ${side(key.az)}, ${Math.round(key.el)}° ${key.el < 0 ? 'below' : 'above'}, ${kk} K, ${sizeText(key.size)}`;
  const fillText = fill.presence > 0.5
    ? `fill ${side(fill.az)} at ${r100(fill.kelvin)} K, key to fill ${ratioLabel(Math.round(r.ratio * 10) / 10, { spoken: true })}`
    : 'no fill';
  return `Plaster bust, ${name}: ${keyText}; ${fillText}. Camera balanced for ${wb} K, so the key ${cast}. ${primitiveCount(params.model === 'maquette' ? 'maquette' : 'bust')}-primitive ${params.model === 'maquette' ? 'maquette' : 'bust'}, 85 mm on Super 35.`;
}
