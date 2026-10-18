// Lighting presets: the single source of truth for the Light study, the SVG plan and the
// Unreal previs shot list. Numbers for the named looks come from Motion Prompt photo elements
// (numbers only, rebuilt here; nothing is vendored):
// Motion Prompt #097 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#097
// Motion Prompt #098 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#098
// Motion Prompt #100 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#100
// Motion Prompt #101 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#101
// Motion Prompt #102 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#102
// Motion Prompt #114 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#114
//
// Conventions (spherical, about the head centre):
//   az  = azimuth from the camera axis in degrees, positive = camera-left / screen-left
//   el  = elevation in degrees, dist = metres, size = square source side in metres
//   Light study (y up, +z toward camera): pos = H + d·(−sinθ·cosφ, sinφ, cosθ·cosφ)
//   Plan view: (x, y) = (−sinθ·r, cosθ·r), camera on +y
//   Unreal (cm, subject faces −X): X = −d·cosφ·cosθ, Y = −d·cosφ·sinθ, Z = Zhead + d·sinφ
// Key:fill uses the DP convention R = (K + F) / F, so F = K / (R − 1).

const L = (role, az, el, dist, size, kelvin, extra = {}) => ({ role, type: 'RectLight', az, el, dist, size, kelvin, ...extra });

export const LIGHTING_PRESETS = {
  butterfly: {
    id: 'butterfly', label: 'Butterfly', mp: '#102',
    note: 'Key high and on the lens axis; clamshell fill from below. Shadow under the nose.',
    lights: [L('key', 0, 45, 1.5, 0.6, 5600), L('fill', 0, -20, 1.5, 1.2, 5600)],
    ratio: 3, cameraWB: 5600, ambient: 0.03, backgroundStops: -1,
  },
  loop: {
    id: 'loop', label: 'Loop', mp: null, original: true,
    note: 'Key 30° off axis and above; the nose shadow loops down toward the cheek.',
    lights: [L('key', 30, 30, 1.5, 0.6, 4300), L('fill', -25, 5, 2, 1.2, 5600)],
    ratio: 3, cameraWB: 4300, ambient: 0.03, backgroundStops: -1.5,
  },
  rembrandt: {
    id: 'rembrandt', label: 'Rembrandt', mp: '#101',
    note: 'Key 45° and high; a triangle of light closes on the shadow-side cheek.',
    lights: [L('key', 45, 45, 1.5, 0.6, 3200), L('fill', -30, 5, 2, 1.2, 5600)],
    ratio: 4, cameraWB: 5600, ambient: 0.02, backgroundStops: -2,
  },
  split: {
    id: 'split', label: 'Split', mp: '#100',
    note: 'Key at 90°; the face divides down the nose. No fill.',
    lights: [L('key', 90, 0, 1.5, 0.6, 3200)],
    ratio: 16, cameraWB: 3200, ambient: 0.01, backgroundStops: -2.5,
  },
  rim: {
    id: 'rim', label: 'Rim', mp: '#098',
    note: 'Key off; two rims from behind outline the head against a dark ground.',
    lights: [L('rim', 135, 20, 1.2, 0.3, 5600), L('rim', -135, 20, 1.2, 0.3, 5600)],
    ratio: 16, cameraWB: 4300, ambient: 0.02, backgroundStops: -3,
  },
  backlight: {
    id: 'backlight', label: 'Backlight', mp: '#097',
    note: 'Source behind the subject; a warm veil lifts the frame. Weak fill from the lens.',
    lights: [L('key', 180, 25, 1.0, 0.6, 3200), L('fill', 0, 0, 2, 1.2, 5600)],
    ratio: 16, cameraWB: 5600, ambient: 0.03, backgroundStops: -1, veil: { amount: 0.22, color: '#FFE3A3' },
  },
  lowkey: {
    id: 'lowkey', label: 'Low-key', mp: '#114',
    note: 'One hard source from behind camera-right; most of the frame falls to black.',
    lights: [L('key', -100, 10, 1.5, 0.3, 3200)],
    ratio: 16, cameraWB: 4300, ambient: 0, backgroundStops: -4,
  },
  // P2: head turned 30°; broad lights the side facing camera, short the side turned away.
  broad: {
    id: 'broad', label: 'Broad', mp: null, original: true, p2: true, yaw: 30,
    note: 'Head turned; key on the side of the face nearest camera.',
    lights: [L('key', 40, 35, 1.5, 0.6, 3200), L('fill', -30, 5, 2, 1.2, 5600)],
    ratio: 4, cameraWB: 5600, ambient: 0.02, backgroundStops: -2,
  },
  short: {
    id: 'short', label: 'Short', mp: null, original: true, p2: true, yaw: 30,
    note: 'Head turned; key on the side of the face turned away from camera.',
    lights: [L('key', -50, 35, 1.5, 0.6, 3200), L('fill', 30, 5, 2, 1.2, 5600)],
    ratio: 4, cameraWB: 5600, ambient: 0.02, backgroundStops: -2,
  },
};

/** Display order for the Light study (P2 presets excluded). */
export const PRESET_ORDER = ['butterfly', 'loop', 'rembrandt', 'split', 'rim', 'backlight', 'lowkey'];
export const DEFAULT_PRESET = 'rembrandt';

/** Fill intensity for key intensity K and ratio R = (K + F)/F. */
export const fillIntensity = (K, R) => (R <= 1 ? K : K / (R - 1));
/** Ratio in stops (4:1 → 2 stops). */
export const ratioStops = R => Math.log2(R);
/** "4:1 · 2 stops" (used for aria-valuetext too, with `spoken`). */
export function ratioLabel(R, { spoken = false } = {}) {
  const st = ratioStops(R), s = Number.isInteger(st) ? String(st) : st.toFixed(1);
  const r = Number.isInteger(R) ? String(R) : R.toFixed(1);
  return spoken ? `${r} to 1, ${s} stop${st === 1 ? '' : 's'}` : `${r}:1 · ${s} stop${st === 1 ? '' : 's'}`;
}

const rad = d => (d * Math.PI) / 180;

/** Light-study position (metres, y up, +z toward camera) about head centre `H`. */
export function lightPosition({ az, el, dist }, H = [0, 0, 0]) {
  const t = rad(az), p = rad(el);
  return [H[0] - dist * Math.sin(t) * Math.cos(p), H[1] + dist * Math.sin(p), H[2] + dist * Math.cos(t) * Math.cos(p)];
}

/** Top-down plan position (metres), camera toward +y. `r` defaults to the horizontal distance. */
export function planPosition({ az, el = 0, dist }, { horizontal = true } = {}) {
  const r = horizontal ? dist * Math.cos(rad(el)) : dist, t = rad(az);
  return [-Math.sin(t) * r, Math.cos(t) * r];
}

/** Unreal location (cm) with the subject at the origin facing −X and the head at zHead cm. */
export function unrealLocation({ az, el, dist }, zHead = 150) {
  const t = rad(az), p = rad(el), d = dist * 100;
  return [-d * Math.cos(p) * Math.cos(t), -d * Math.cos(p) * Math.sin(t), zHead + d * Math.sin(p)];
}

/** "KEY 3200K · 45°↑" plan label. */
export function lightLabel(light) {
  const arrow = light.el > 0 ? '↑' : light.el < 0 ? '↓' : '';
  return `${light.role.toUpperCase()} ${light.kelvin}K · ${Math.abs(light.el)}°${arrow}`;
}

/** Relative intensities for a preset: key (or rims) = 1, fill from the ratio. */
export function presetIntensities(preset, K = 1) {
  return preset.lights.map(l => (l.role === 'fill' ? fillIntensity(K, preset.ratio) : K));
}

/** Validate one preset; returns a list of problems (empty when well-formed). */
export function validatePreset(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['not an object'];
  if (!p.id || !p.label) errs.push('missing id/label');
  if (!(p.mp === null ? p.original === true : /^#\d{3}$/.test(p.mp))) errs.push(`bad mp id ${p.mp}`);
  if (!Array.isArray(p.lights) || !p.lights.length) errs.push('no lights');
  for (const l of p.lights ?? []) {
    if (!['key', 'fill', 'rim'].includes(l.role)) errs.push(`bad role ${l.role}`);
    for (const k of ['az', 'el', 'dist', 'size', 'kelvin']) if (!Number.isFinite(l[k])) errs.push(`${l.role}.${k} not finite`);
    if (l.dist <= 0 || l.size <= 0) errs.push(`${l.role} dist/size must be > 0`);
    if (l.kelvin < 1667 || l.kelvin > 25000) errs.push(`${l.role} kelvin out of range`);
  }
  if (!(p.ratio >= 1)) errs.push('ratio < 1');
  if (![3200, 4300, 5600].includes(p.cameraWB)) errs.push('cameraWB must be 3200/4300/5600');
  return errs;
}
