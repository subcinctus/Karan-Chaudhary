#!/usr/bin/env node
// Previs shot list generator: writes previs/shotlist.json, the one file the Unreal session reads.
//
//   node tools/previs-shotlist.mjs            write previs/shotlist.json
//   node tools/previs-shotlist.mjs --stdout   print the JSON instead
//   import { generate } from './previs-shotlist.mjs'   → the shot list as a plain object
//
// Single source: lighting comes from assets/js/core/presets.js (the same table as the Light study),
// lenses and depth of field from assets/js/core/optics.js (the same maths as the Focus study), and the
// six camera moves from the Motion Prompt camera pack's spec numbers (printed with
// `node $MP get 27 30 31 32 33 43`). Output is deterministic (fixed key order, fixed rounding), so
// `npm run check` can regenerate it in memory and diff it against the committed file.
//
// Camera moves (numbers only; the cell code itself is vendored separately in vendor/motion-prompt/camera.js):
// Motion Prompt #027 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#027
// Motion Prompt #030 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#030
// Motion Prompt #031 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#031
// Motion Prompt #032 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#032
// Motion Prompt #033 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#033
// Motion Prompt #043 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#043
//
// Axis mapping from the Motion Prompt camera kit (metres; Y up; camera looks down +Z; positive yaw turns
// right, positive pitch tilts up; the subject stands `zs` metres ahead) to Unreal (cm; subject at the
// origin facing −X):  X = (kitZ − zs)·100,  Y = kitX·100,  Z = kitY·100,  Yaw = deg(kitYaw),
// Pitch = deg(kitPitch). Positive Unreal yaw also turns right (+X toward +Y), so signs carry over.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LIGHTING_PRESETS, PRESET_ORDER, unrealLocation, fillIntensity, ratioStops,
} from '../assets/js/core/presets.js';
import { FORMATS, depthOfField, fieldOfView, extractionHeight } from '../assets/js/core/optics.js';
import { eIO, eIOs, lerp, P } from '../assets/js/core/time.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = 'previs/shotlist.json';

// ---------------------------------------------------------------- constants
const FPS = 24;
const OUTPUT = { width: 2048, height: 858 };          // 2.39:1 DCI scope, even height
const ASPECT = 2.39;
const S35 = FORMATS.s35;                               // 24.89 × 18.66 mm, CoC 0.025 mm
const HEAD = [0, 0, 150];                              // head centre (cm), bust.md
const BLADES = 9;
const SHOT_SECONDS = 4.2;                              // Motion Prompt pass: move, then hold to 4.2 s
const F0 = 24;                                         // the camera kit's lens (330 px "shown as 24mm")

const EASE = {
  cubic: { name: 'cubic in-out', bezier: [0.65, 0, 0.35, 1],
    unreal: 'Cubic keys, flat (0) tangents, weighted; each handle reaches 65 % of the span in time' },
  quad: { name: 'quadratic in-out', bezier: [0.455, 0.03, 0.515, 0.955],
    unreal: 'Cubic keys, flat (0) tangents, weighted; each handle reaches about 45 % of the span in time' },
  baked: { name: 'baked', bezier: null,
    unreal: 'Keys already sample the eased curve; use Auto tangents between them' },
};

// ---------------------------------------------------------------- helpers
/** Round to n decimals; never emits -0. */
const r = (x, n = 2) => { const v = Math.round(x * 10 ** n) / 10 ** n; return Object.is(v, -0) ? 0 : v; };
const deg = rad => (rad * 180) / Math.PI;
const vec = (a, n = 1) => a.map(v => r(v, n));
const rot = (pitch = 0, yaw = 0, roll = 0) => ({ pitch: r(pitch), yaw: r(yaw), roll: r(roll) });
const frame = t => r(t * FPS, 2);

/** Planar depth of the head centre along a camera's optical axis (cm): what ManualFocusDistance wants. */
function headDepth(loc, { pitch = 0, yaw = 0 }) {
  const p = (pitch * Math.PI) / 180, y = (yaw * Math.PI) / 180;
  const fwd = [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
  return (HEAD[0] - loc[0]) * fwd[0] + (HEAD[1] - loc[1]) * fwd[1] + (HEAD[2] - loc[2]) * fwd[2];
}

/** Depth of field (cm) for a focal length (mm), T-stop and focus distance (cm) on Super 35. far null = ∞. */
function dof(focal, tStop, focusCm) {
  const { H, near, far } = depthOfField({ f: focal, N: tStop, c: S35.coc, s: focusCm * 10 });
  return { near: r(near / 10, 1), far: Number.isFinite(far) ? r(far / 10, 1) : null, hyperfocal: r(H / 10, 1) };
}

/** Lens block: the values to set on the CineCamera before keying (the shot's first key). */
function lens(focal, tStop, focus) {
  const fov = fieldOfView(focal, S35, ASPECT);
  return { focal: r(focal), tStop, focus: r(focus, 1), blades: BLADES, hfov: r(fov.h), vfov: r(fov.v) };
}

/** One camera key: time, frame, transform, focal length and focus, plus the depth of field it gives. */
function key(t, loc, rotation, focal, focus, tStop, extra = {}) {
  const fl = r(focal), fo = r(focus, 1);   // the DoF is computed from the values the key stores
  return { t: r(t, 4), frame: frame(t), ...extra, loc: vec(loc), rot: rotation, focal: fl, focus: fo, dof: nearFar(fl, tStop, fo) };
}
const nearFar = (focal, tStop, focus) => (({ near, far }) => ({ near, far }))(dof(focal, tStop, focus));

// ---------------------------------------------------------------- lighting (core/presets.js)
function lightingBlock() {
  const ids = [...PRESET_ORDER, ...Object.keys(LIGHTING_PRESETS).filter(k => !PRESET_ORDER.includes(k))];
  const out = {};
  for (const id of ids) {
    const p = LIGHTING_PRESETS[id];
    const counts = {};
    const lights = p.lights.map(l => {
      counts[l.role] = (counts[l.role] ?? 0) + 1;
      const n = p.lights.filter(m => m.role === l.role).length > 1 ? `_${counts[l.role]}` : '';
      const loc = unrealLocation(l, HEAD[2]);
      const d = [HEAD[0] - loc[0], HEAD[1] - loc[1], HEAD[2] - loc[2]];
      return {
        name: `LGT_${p.label.replace(/[^A-Za-z]/g, '')}_${l.role[0].toUpperCase()}${l.role.slice(1)}${n}`,
        role: l.role, type: l.type,
        az: l.az, el: l.el, dist: r(l.dist * 100, 1),
        loc: vec(loc),
        rot: rot(deg(Math.atan2(d[2], Math.hypot(d[0], d[1]))), deg(Math.atan2(d[1], d[0])), 0),
        sourceWidth: r(l.size * 100, 1), sourceHeight: r(l.size * 100, 1),
        kelvin: l.kelvin,
        intensity: r(l.role === 'fill' ? fillIntensity(1, p.ratio) : 1, 4),
      };
    });
    out[id] = {
      label: p.label, mp: p.mp, ...(p.original ? { original: true } : {}), ...(p.p2 ? { p2: true, subjectYaw: p.yaw } : {}),
      note: p.note,
      ratio: p.ratio, ratioStops: r(ratioStops(p.ratio), 2),
      cameraWB: p.cameraWB, ambient: p.ambient, backgroundStops: p.backgroundStops,
      ...(p.veil ? { veil: { ...p.veil, hint: 'A low Exponential Height Fog with Volumetric Scattering on the key light' } } : {}),
      lights,
    };
  }
  return out;
}

// ---------------------------------------------------------------- the six shots
function shots() {
  const list = [];

  // PV-010 · #027 Dolly in. Camera forward 0 → 5.8 m at 1.5 m height, 24 mm fixed, 0.5–3.4 s, cubic
  // in-out; the subject 8 m ahead goes 8 → 2.2 m (about 3.6× larger). Kit: post 1.5 m left at 3.6 m,
  // rock 1.6 m right at 4.8 m pass out of frame (props PROP_Post, PROP_Rock).
  {
    const zs = 8, T = 2.8, R0 = rot(0, 0, 0);
    const a = [(0 - zs) * 100, 0, 150], b = [(5.8 - zs) * 100, 0, 150];
    list.push({
      id: 'PV-010', title: 'Push in', mp: '#027', move: 'Dolly in', lighting: 'rembrandt',
      camera: 'CAM_PV010', lens: lens(F0, T, headDepth(a, R0)), durationS: SHOT_SECONDS, ease: EASE.cubic,
      keys: [key(0.5, a, R0, F0, headDepth(a, R0), T), key(3.4, b, R0, F0, headDepth(b, R0), T)],
      props: ['PROP_Post', 'PROP_Rock'],
      notes: 'The camera travels 5.8 m forward over 0.5–3.4 s on a fixed 24 mm; focus tracks the head 8.0 → 2.2 m. The post and the rock pass out of frame; the head grows 3.6× while the colonnade 10 m behind grows only 1.5×.',
    });
  }

  // PV-020 · #033 Rack focus. Camera fixed at 1.1 m; foreground object 0.75 m left at 2 m, subject
  // 0.9 m right at 9 m; focus 2 → 9 m over 1.0–2.6 s, cubic in-out. The flower becomes a practical.
  {
    const T = 1.4, R0 = rot(0, 0, 0);
    const loc = [-900, -90, 110];
    const practical = 200;   // planar depth of the practical (cm)
    list.push({
      id: 'PV-020', title: 'Pull to the face', mp: '#033', move: 'Rack focus', lighting: 'lowkey',
      camera: 'CAM_PV020', lens: lens(F0, T, practical), durationS: SHOT_SECONDS, ease: EASE.cubic,
      keys: [key(1.0, loc, R0, F0, practical, T), key(2.6, loc, R0, F0, headDepth(loc, R0), T)],
      props: ['PROP_Practical'],
      notes: 'Nothing moves but focus. A bare 2700 K practical 2 m from the lens, 0.75 m left, holds focus first, then focus pulls to the head at 9 m over 1.0–2.6 s. At T1.4 the practical blooms into a 9-blade disc as the face sharpens.',
    });
  }

  // PV-030 · #030 Orbit. Radius 6 m about the subject, angle −0.95 → +0.95 rad (−54° → +54°), camera
  // always facing the centre (yaw = −angle), height 1.7 m, pitch −0.07 rad, 0.5–3.6 s, cubic in-out.
  // Unreal: a pivot at the head, the camera parented to it at local (−600, 0, 20). Keying the pivot's
  // yaw moves the camera on the arc; two keys on the camera's own transform would cut a straight chord.
  {
    const T = 2.8, a0 = 0.95, pitch = deg(-0.07);
    const offset = [-600, 0, 20];
    const local = rot(pitch, 0, 0);
    const focus = r(headDepth([offset[0], offset[1], HEAD[2] + offset[2]], local), 1);
    const pk = (t, yawDeg) => ({ t: r(t, 4), frame: frame(t), pivotYaw: r(yawDeg), focal: F0, focus, dof: nearFar(F0, T, focus) });
    list.push({
      id: 'PV-030', title: 'Around the light', mp: '#030', move: 'Orbit', lighting: 'split',
      camera: 'CAM_PV030', lens: lens(F0, T, focus), durationS: SHOT_SECONDS, ease: EASE.cubic,
      rig: {
        type: 'pivot', pivot: 'RIG_PV030_Pivot', loc: vec(HEAD), offset, cameraLocalRot: local,
        how: 'Spawn an empty actor at the head as the pivot; attach the CineCamera to it at the local offset and rotation; key only the pivot Yaw.',
      },
      keys: [pk(0.5, deg(a0)), pk(3.6, deg(-a0))],
      notes: 'A 109° arc at 6 m. The camera is parented to a pivot at the head and the pivot yaw is keyed (+54.4° → −54.4°), so the path is a true arc. Under split light the move carries the face from its lit half to its shadow half.',
    });
  }

  // PV-040 · #032 Dolly zoom. Distance 3.2 → 8 m (pull back 4.8 m), height 1.3 m, f = 24·d/8
  // (9.6 → 24 mm) so d/f is constant and the subject keeps its size; 0.5–3.4 s, cubic in-out.
  {
    const T = 4, R0 = rot(0, 0, 0);
    const at = d => [-d * 100, 0, 130];
    const f = d => (F0 * d) / 8;
    const [d0, d1] = [3.2, 8];
    list.push({
      id: 'PV-040', title: 'The room leans in', mp: '#032', move: 'Dolly zoom', lighting: 'butterfly',
      camera: 'CAM_PV040', lens: lens(f(d0), T, headDepth(at(d0), R0)), durationS: SHOT_SECONDS, ease: EASE.cubic,
      keys: [key(0.5, at(d0), R0, f(d0), headDepth(at(d0), R0), T), key(3.4, at(d1), R0, f(d1), headDepth(at(d1), R0), T)],
      constraint: { rule: 'focal = 24 · d / 8 (mm, d in m); focus = d', focalPerMetre: 3,
        how: 'Key focal length and location with the same times and the same ease, so focal/distance stays exactly 3 mm per metre and the head keeps its size.' },
      variant: { scale: 2, focal: [r(f(d0) * 2), r(f(d1) * 2)], distance: [d0 * 200, d1 * 200],
        note: 'Same ratio at twice the distance: 19.2 → 48 mm over 6.4 → 16 m; stronger compression, needs a 17 m stage.' },
      notes: 'The camera pulls back 4.8 m while the lens zooms 9.6 → 24 mm in step. The head holds its size; the colonnade behind it closes in by about 1.8×. T4 keeps the background readable.',
    });
  }

  // PV-050 · #031 Crane up. Height 1.4 → 9 m, forward 0 → 1.5 m, pitch = −0.86·atan2(h − 1.0, 8 − z)
  // (−2.5° → −44°), 0.5–3.4 s, cubic in-out on height and travel. The pitch is not a tween of its end
  // values, so the keys are baked every 3 frames (and at 3.4 s).
  {
    const zs = 8, T = 2.8, t0 = 0.5, t1 = 3.4, step = 3 / FPS;
    const state = t => {
      const p = eIO(P(t, t0, t1));
      const y = lerp(1.4, 9, p), z = lerp(0, 1.5, p);
      const loc = [(z - zs) * 100, 0, y * 100];
      const rr = rot(deg(-0.86 * Math.atan2(y - 1.0, zs - z)), 0, 0);
      return { loc, rr };
    };
    const times = [];
    for (let f = t0 * FPS; f / FPS < t1 - step / 2 + 1e-9; f += 3) times.push(f / FPS);
    times.push(t1);
    const keys = times.map(t => { const { loc, rr } = state(t); return key(t, loc, rr, F0, headDepth(loc, rr), T); });
    list.push({
      id: 'PV-050', title: 'Rise and reveal', mp: '#031', move: 'Crane up', lighting: 'backlight',
      camera: 'CAM_PV050', lens: lens(F0, T, keys[0].focus), durationS: SHOT_SECONDS, ease: EASE.baked,
      bakedEveryFrames: 3,
      keys,
      notes: 'The camera rises 1.4 → 9 m and creeps 1.5 m forward while tilting down to about −44°. The tilt under-follows the subject (0.86×), so the head sinks toward the lower third as the floor and the backlight pool fill the frame. Keys are baked every 3 frames.',
    });
  }

  // PV-060 · #043 Whip pan. Join 1.7–2.5 s: the outgoing camera swings yaw 0 → +0.45 rad (26°) over the
  // first 0.4 s, quadratic in-out; the cut sits at the midpoint where the blur peaks; the incoming camera
  // swings −0.45 rad → 0 over the last 0.4 s. Camera height 1.4 m; subject 0.6 m left, 7 m ahead.
  // MP blurs with 9 renders over ±1.6 frames: in Movie Render Queue that is 9 temporal samples at 360°.
  {
    const T = 2.8, w = deg(0.45);
    const A = [-700, 60, 140], B = [0, 700, 140];   // B: the subject's profile, from its left (+Y)
    const restB = -90;                                // B looks along −Y at the head
    const cut = 2.1, cutFrame = Math.round(cut * FPS);
    const fa = headDepth(A, rot(0, 0, 0)), fb = headDepth(B, rot(0, restB, 0));
    const keysA = [
      key(1.7, A, rot(0, 0, 0), F0, fa, T, { camera: 'A' }),
      key(2.1, A, rot(0, w, 0), F0, fa, T, { camera: 'A' }),
    ];
    const keysB = [
      key(2.1, B, rot(0, restB - w, 0), F0, fb, T, { camera: 'B' }),
      key(2.5, B, rot(0, restB, 0), F0, fb, T, { camera: 'B' }),
    ];
    list.push({
      id: 'PV-060', title: 'Whip to the profile', mp: '#043', move: 'Whip pan', lighting: 'rim',
      camera: 'CAM_PV060_A', lens: lens(F0, T, fa), durationS: SHOT_SECONDS, ease: EASE.quad,
      keys: keysA,
      cameraB: { camera: 'CAM_PV060_B', lens: lens(F0, T, fb), keys: keysB },
      cuts: [{ t: 0, frame: 0, camera: 'CAM_PV060_A' }, { t: r(cutFrame / FPS, 4), frame: cutFrame, camera: 'CAM_PV060_B' }],
      motionBlur: { shutterAngle: 360, motionBlurAmount: 1, temporalSamples: 9 },
      notes: 'Camera A holds the head just left of centre, whips 26° right in 0.4 s, and the cut to camera B (the profile, from the subject\'s left) lands on frame 50, where the blur peaks; B swings in from 26° left and settles by 2.5 s. Rendered at a 360° shutter with 9 temporal samples, the Motion Prompt blur.',
    });
  }

  // Shared fields every shot carries, in a fixed order.
  let start = 0;
  return list.map(s => {
    const frames = Math.ceil(s.durationS * FPS - 1e-9);
    const out = {
      id: s.id, title: s.title, mp: s.mp, move: s.move, lighting: s.lighting,
      sequence: `/Game/Previs/Seq/${s.id.replace('-', '')}`, masterStartFrame: start, frames,
      camera: s.camera, lens: s.lens, dof: dof(s.lens.focal, s.lens.tStop, s.lens.focus),
      durationS: s.durationS, ease: s.ease,
      ...(s.rig ? { rig: s.rig } : {}),
      ...(s.bakedEveryFrames ? { bakedEveryFrames: s.bakedEveryFrames } : {}),
      keys: s.keys,
      ...(s.cameraB ? { cameraB: s.cameraB, cuts: s.cuts } : {}),
      ...(s.constraint ? { constraint: s.constraint } : {}),
      ...(s.variant ? { variant: s.variant } : {}),
      motionBlur: s.motionBlur ?? { shutterAngle: 180, motionBlurAmount: 0.5, temporalSamples: 8 },
      props: s.props ?? [],
      notes: s.notes,
    };
    start += frames;
    return out;
  });
}

// ---------------------------------------------------------------- stage and props
function stage() {
  const columns = [];
  for (let i = 0; i < 12; i++) {             // #030's 12 trees on a 10 m ring, as grey columns
    const a = ((15 + 30 * i) * Math.PI) / 180;
    columns.push(vec([Math.cos(a) * 1000, Math.sin(a) * 1000, 0]));
  }
  return {
    folder: 'Previs/Stage',
    map: '/Game/Previs/Maps/PV_Stage',
    material: { name: 'M_Plaster', baseColorLinear: 0.8, roughness: 0.9, specular: 0.3 },
    floor: { size: [3600, 3600], z: 0, baseColorLinear: 0.18, roughness: 1 },
    cyc: { radius: 1400, yawSpan: [-120, 120], height: 900, cove: 150, baseColorLinear: 0.18, roughness: 1,
      note: 'Curved 18 % grey wall about the origin on the +X side, with a cove into the floor; 12 flat 380 cm panels are fine.' },
    pedestal: { size: [30, 30, 117], loc: [1, 0, 0],
      note: 'Grey column, loc = centre of its base; its top at Z 117 carries bust.md\'s plinth (Z 117–123), so the head centre sits at 150 cm.' },
    lookdevCard: { source: 'previs/bust.md', x: 160, baseColorLinear: 0.18, folder: 'Previs/Stage/LookdevCard', hiddenInShots: true,
      note: 'bust.md\'s flat backdrop card, for the Light-study comparison stills only. Keep it hidden in every shot: the moves need the colonnade and the cyc behind the head.' },
    colonnade: { count: 12, radius: 1000, diameter: 40, height: 500, firstAngle: 15, bases: columns,
      note: 'Parallax and scale reference for every move (#030 uses 12 trees on a 10 m ring).' },
    props: [
      { name: 'PROP_Post', shape: 'Cylinder', loc: [-440, -150, 0], radius: 6, height: 220, shots: ['PV-010'],
        note: '#027 foreground post: 1.5 m left, 3.6 m from the camera start.' },
      { name: 'PROP_Rock', shape: 'Sphere, scaled', loc: [-320, 160, 0], radii: [60, 50, 35], shots: ['PV-010'],
        note: '#027 rock: 1.6 m right, 4.8 m from the camera start.' },
      { name: 'PROP_Practical', shape: 'Stand + bare bulb', loc: [-700, -165, 0], bulbZ: 80, shots: ['PV-020'],
        light: { type: 'PointLight', kelvin: 2700, sourceRadius: 3, intensity: 0.15 },
        note: '#033 foreground object (the kit\'s flower): 2 m from the lens, 0.75 m left, bulb at 0.8 m.' },
    ],
  };
}

// ---------------------------------------------------------------- the document
export function generate() {
  const extractH = extractionHeight(S35.w, S35.h, ASPECT);
  const shotList = shots();
  return {
    $comment: 'GENERATED by tools/previs-shotlist.mjs from assets/js/core/presets.js, assets/js/core/optics.js and Motion Prompt #027 #030 #031 #032 #033 #043. Do not edit by hand: run npm run previs:shotlist.',
    version: 1,
    fps: FPS,
    units: { length: 'cm', angle: 'deg', focal: 'mm', time: 's', intensity: 'relative to the key (1)' },
    axes: 'Unreal: X forward (subject at origin faces -X), Y right, Z up; rot = {pitch,yaw,roll}; positive yaw turns right, positive pitch tilts up',
    conventions: {
      keys: 'Values hold before the first key and after the last. t in seconds from the shot start; frame = t·24 (Sequencer keys may sit between frames).',
      focus: 'Planar distance from the camera to the head centre along the optical axis (ManualFocusDistance, cm).',
      dof: 'Near/far limits of acceptable focus (cm) on Super 35, CoC 0.025 mm, from core/optics.js; far null = infinity.',
      lights: 'X = -d·cos(el)·cos(az), Y = -d·cos(el)·sin(az), Z = 150 + d·sin(el); az positive = camera-left; aimed at the head; fill = key / (ratio - 1).',
    },
    output: { width: OUTPUT.width, height: OUTPUT.height, aspect: ASPECT },
    filmback: {
      preset: 'Super 35mm', sensorWidth: S35.w, sensorHeight: S35.h, coc: S35.coc,
      crop: { aspect: ASPECT, extractionHeight: r(extractH, 3) },
    },
    camera: {
      actor: 'CineCameraActor', focusMethod: 'Manual', diaphragmBladeCount: BLADES,
      exposure: 'Post Process: Exposure Method Manual, set once on the Rembrandt preset so the key-side cheek sits near 70 % and keep it for every shot; White Balance Temp = the preset cameraWB.',
    },
    subject: { headCentre: HEAD, facing: '-X', bust: 'previs/bust.md' },
    stage: stage(),
    lighting: lightingBlock(),
    sequence: {
      master: '/Game/Previs/Seq/PV_Master', displayRate: FPS,
      totalFrames: shotList.reduce((n, s) => n + s.frames, 0),
      note: 'One subsequence per shot with a spawnable CineCamera, laid back to back on a camera-cut track. Only the shot\'s preset lights are on inside its subsequence.',
    },
    render: {
      tool: 'Movie Render Queue', format: 'PNG', resolution: [OUTPUT.width, OUTPUT.height],
      antiAliasing: { spatialSamples: 1, temporalSamples: 8, overrideAntiAliasing: true, method: 'None' },
      output: 'media/previs/{shot}/{frame_number}', zeroPadFrameNumbers: 4,
      note: 'Write into the website repo; npm run previs:encode turns each folder into media/previs/<id>.mp4 + .jpg.',
    },
    shots: shotList,
  };
}

// ---------------------------------------------------------------- compact, stable JSON
/** JSON with objects expanded and short arrays/objects kept on one line (same data as JSON.stringify). */
export function format(value, indent = '') {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== 'object') return flat;
  const inner = indent + '  ';
  const short = flat.length <= (indent.length >= 6 ? 170 : 120);   // keys and lens rows on one line
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (short || value.every(v => v === null || typeof v !== 'object')) return flat;
    return `[\n${value.map(v => inner + format(v, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  if (short && indent.length >= 4) return flat;
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`).join(',\n')}\n${indent}}`;
}

export function render() { return format(generate()) + '\n'; }

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const text = render();
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else {
    const file = path.join(ROOT, OUT_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    fs.writeFileSync(file, text);
    const n = JSON.parse(text).shots.length;
    console.log(`${prev === text ? 'unchanged' : 'wrote'} ${OUT_FILE} (${n} shots, ${text.length} bytes)`);
  }
}
