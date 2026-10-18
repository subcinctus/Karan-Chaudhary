#!/usr/bin/env node
// Grey-box bust sheet generator: writes previs/bust.md, the Unreal build sheet for the Light study's
// plaster bust.
//
//   node tools/previs-bust.mjs                 write previs/bust.md
//   node tools/previs-bust.mjs <file>          write the sheet to <file> instead
//   node tools/previs-bust.mjs --stdout        print it instead
//   import { render } from './previs-bust.mjs'  → the sheet as a string
//
// Single source: the parts come from the BUST table in assets/js/pieces/light-shader.js (the signed-
// distance model the study renders), the camera from assets/js/pieces/light.js, and the light maths
// from assets/js/core/presets.js. Output is deterministic, so the committed sheet can be regenerated
// and diffed whenever the shader's numbers change.
//
// Haze note (numbers only, as in light-shader.js):
// Motion Prompt #097 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#097
//
// Study metres (x right, y up, +z toward the camera, head centre at the origin) → Unreal cm (X forward,
// Y right, Z up, the subject at the origin facing −X): X = −z·100, Y = x·100, Z = 150 + y·100.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUST, HEAD_BOUND, BOUND, BACKDROP, PLASTER_ALBEDO, primitiveCount } from '../assets/js/pieces/light-shader.js';
import { CAMERA } from '../assets/js/pieces/light.js';

export const OUT_FILE = 'previs/bust.md';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ZH = 150;   // head centre height, cm (shotlist.json's subject.headCentre[2])
const cm = v => String(Math.round(v * 10000) / 100);
const ue = ([x, y, z]) => [-z * 100, x * 100, ZH + y * 100];   // X forward (−z), Y right (+x), Z up
const r1 = v => { const r = Math.sign(v) * Math.round(Math.abs(v) * 100) / 100; return Object.is(r, -0) ? 0 : r; };
const fmt = p => `(${p.map(v => String(r1(v))).join(', ')})`;
const sc = a => `(${a.map(v => v.toFixed(3)).join(', ')})`;
const mir = (v, s) => [v[0] * s, v[1], v[2]];
const blend = p => (p.op === 'base' ? 'base' : p.op === 'smin' ? `smooth union ${cm(p.k)} cm` : p.op === 'ssub' ? `smooth subtract ${cm(p.k)} cm` : 'union');

/** One table row per placed primitive (mirrored parts once per side). */
function partRows() {
  const rows = [];
  for (const p of BUST) {
    const sides = p.mirror ? [[1, ' (+Y, subject’s left)'], [-1, ' (−Y, subject’s right)']] : [[1, '']];
    for (const [s, side] of sides) {
      let shape, centre, size;
      switch (p.prim) {
        case 'ellipsoid': shape = 'Sphere, scaled'; centre = fmt(ue(mir(p.c, s))); size = `radii X ${cm(p.r[2])} · Y ${cm(p.r[0])} · Z ${cm(p.r[1])} → scale ${sc([p.r[2] * 2, p.r[0] * 2, p.r[1] * 2])}`; break;
        case 'sphere': shape = 'Sphere'; centre = fmt(ue(mir(p.c, s))); size = `radius ${cm(p.r)} → scale ${(p.r * 2).toFixed(3)}`; break;
        case 'capsule': shape = 'Capsule'; centre = `${fmt(ue(mir(p.a, s)))} → ${fmt(ue(mir(p.b, s)))}`; size = `radius ${cm(p.r)}`; break;
        case 'roundCone': shape = 'Round cone (two spheres + taper)'; centre = `${fmt(ue(p.a))} → ${fmt(ue(p.b))}`; size = `radius ${cm(p.r1)} → ${cm(p.r2)}`; break;
        case 'cylinderY': shape = 'Cylinder, vertical'; centre = fmt(ue([p.c[0], (p.y0 + p.y1) / 2, p.c[2]])); size = `radius ${cm(p.r)} · height ${cm(p.y1 - p.y0)} (Z ${cm(ZH / 100 + p.y0)}–${cm(ZH / 100 + p.y1)})`; break;
        case 'roundBox': shape = 'Box, 0.5 cm bevel'; centre = fmt(ue(p.c)); size = `X ${cm(p.b[2] * 2)} · Y ${cm(p.b[0] * 2)} · Z ${cm(p.b[1] * 2)}`; break;
        default: throw new Error(`previs-bust: unknown primitive "${p.prim}" (${p.label})`);
      }
      if (p.cutBelow != null) size += `; cut flat below Z ${cm(ZH / 100 + p.cutBelow)}`;
      rows.push(`| ${p.label}${side} | ${p.maquette ? '●' : ''} | ${shape} | ${centre} | ${size} | ${blend(p)} |`);
    }
  }
  return rows;
}

/** The sheet's exact text. */
export function render() {
  const rows = partRows();
  const cam = ue(CAMERA.pos), tgt = ue(CAMERA.target);
  return `# Grey-box bust for the Light study (Unreal previs)

The plaster bust in the Light study (\`studies/light.html\`) is a signed-distance model built from the
table in \`assets/js/pieces/light-shader.js\` (\`BUST\`). This sheet gives the **same numbers** in Unreal
units so the previs stage lights the same object. The tables below were generated from that table;
if the shader's numbers change, update this sheet with the same mapping (below) so the two stay equal.

## Axes and units

- Centimetres. Unreal axes: **X forward, Y right, Z up**. The subject sits at the origin and faces **−X**
  (toward the camera), the same convention as \`previs/shotlist.json\`.
- Head centre at **(0, 0, ${ZH})**. Study metres → Unreal: \`X = −z·100\`, \`Y = x·100\`, \`Z = ${ZH} + y·100\`.
- "Subject's left" is +Y (screen right from camera). Mirrored parts are listed once per side.

## Parts

${primitiveCount('bust')} primitives in the full bust (mirrored parts count twice); the ${primitiveCount('maquette')}-primitive **lighting
maquette** (●) is the first thing to build: if Rembrandt, loop and butterfly read on the maquette, the
full bust will read too.

| Part | Maquette | Unreal shape (engine sphere = 100 cm) | Centre (or end points), cm | Size, cm | Blend with what is above it |
|---|---|---|---|---|---|
${rows.join('\n')}

**Blends.** The study merges parts with a smooth union (\`smin\`, radius as listed) and carves the eye
sockets and the mouth line with a smooth subtraction. In Unreal, either:

1. place the primitives as listed (a hard union is fine for a lighting grey-box), then merge them with
   **Modeling Mode → Mesh Boolean / Merge** and add a light **Smooth** pass, or
2. build them as a Geometry Script / PCG graph and use a **voxel blend** at about the listed radius.

The eye sockets and the mouth line are subtractions: cut them with Mesh Boolean (Difference). The
eyeballs then sit inside the sockets, about 1 cm behind the brow.

## Bounds used by the renderer

- Head bounding sphere: centre ${fmt(ue(HEAD_BOUND.c))}, radius ${cm(HEAD_BOUND.r)}.
- Whole bust: centre ${fmt(ue(BOUND.c))}, radius ${cm(BOUND.r)}. The plinth sits below it and below
  frame; it exists for the previs stage only.

## Material, backdrop, camera

- **M_Plaster:** base colour ${PLASTER_ALBEDO} linear (sRGB ≈ 0.91), roughness 0.9, specular 0.3, no metal.
- **Backdrop:** a flat vertical card at **X = ${cm(-BACKDROP.z)} cm** (behind every light in the presets,
  including the rims and the backlight), base colour ${BACKDROP.albedo} linear (18 % grey). It takes a little spill
  from the front lights plus a soft background pool behind the head; both are scaled by 2^stops,
  where stops is the preset's \`backgroundStops\` in \`assets/js/core/presets.js\` (−1 to −4).
- **Haze (Backlight #097 only):** the study's veil is a thin haze lit by the source behind the head
  (forward-scattering, strongest looking toward the source). In Unreal, a low-density Exponential
  Height Fog with Volumetric Fog on, scattering distribution about 0.85, and the backlight's
  Volumetric Scattering Intensity up; tint the fog's inscattering toward #FFE3A3.
- **Camera (matches the study):** CineCameraActor at ${fmt(cam)}, looking at ${fmt(tgt)};
  **85 mm**, filmback **Super 35** (24.89 × 18.66 mm) with a **4:5** crop (14.93 × 18.66 mm), vertical
  FOV 12.5°, ${CAMERA.tStop}, focus ${Math.round(Math.hypot(...CAMERA.pos) * 100)} cm.

## Lights

Positions come from \`assets/js/core/presets.js\` (the single source shared with the study and
\`previs/shotlist.json\`):

\`\`\`
X = −d·cos(el)·cos(az)   Y = −d·cos(el)·sin(az)   Z = ${ZH} + d·sin(el)        (d in cm)
az positive = camera-left, el positive = up; RectLight, SourceWidth = SourceHeight = size,
bUseTemperature = true, Temperature = kelvin; fill intensity = key / (ratio − 1).
\`\`\`

Aim each light at the head centre (0, 0, ${ZH}). Set the camera's white balance to the preset's
\`cameraWB\` (Post Process → White Balance → Temp), so a 3200 K key at 5600 K reads amber, as it does
in the study.
`;
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const text = render();
  if (args.includes('--stdout')) process.stdout.write(text);
  else {
    const out = path.resolve(args.find(a => !a.startsWith('--')) ?? path.join(ROOT, OUT_FILE));
    const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    if (prev === text) console.log(`unchanged ${path.relative(process.cwd(), out) || out}`);
    else { fs.writeFileSync(out, text); console.log(`wrote ${path.relative(process.cwd(), out) || out}`); }
  }
}
