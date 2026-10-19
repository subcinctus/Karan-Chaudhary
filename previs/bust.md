# Grey-box bust for the Light study (Unreal previs)

The plaster bust in the Light study (`studies/light.html`) is a signed-distance model built from the
table in `assets/js/pieces/light-shader.js` (`BUST`). This sheet gives the **same numbers** in Unreal
units so the previs stage lights the same object. The tables below were generated from that table;
if the shader's numbers change, update this sheet with the same mapping (below) so the two stay equal.

## Axes and units

- Centimetres. Unreal axes: **X forward, Y right, Z up**. The subject sits at the origin and faces **−X**
  (toward the camera), the same convention as `previs/shotlist.json`.
- Head centre at **(0, 0, 150)**. Study metres → Unreal: `X = −z·100`, `Y = x·100`, `Z = 150 + y·100`.
- "Subject's left" is +Y (screen right from camera). Mirrored parts are listed once per side.

## Parts

25 primitives in the full bust (mirrored parts count twice); the 8-primitive **lighting
maquette** (●) is the first thing to build: if Rembrandt, loop and butterfly read on the maquette, the
full bust will read too.

| Part | Maquette | Unreal shape (engine sphere = 100 cm) | Centre (or end points), cm | Size, cm | Blend with what is above it |
|---|---|---|---|---|---|
| Cranium | ● | Sphere, scaled | (1.5, 0, 153.5) | radii X 9.4 · Y 7.4 · Z 8.8 → scale (0.188, 0.148, 0.176) | base |
| Face / jaw | ● | Sphere, scaled | (-2, 0, 147.5) | radii X 7.2 · Y 6.2 · Z 7.5 → scale (0.144, 0.124, 0.150) | smooth union 3.5 cm |
| Chin | ● | Sphere, scaled | (-5.8, 0, 141.2) | radii X 2.2 · Y 2.6 · Z 2 → scale (0.044, 0.052, 0.040) | smooth union 2 cm |
| Cheekbones (+Y, subject’s left) |  | Sphere, scaled | (-5.4, 4.2, 150.4) | radii X 1.5 · Y 1.8 · Z 1.35 → scale (0.030, 0.036, 0.027) | smooth union 3 cm |
| Cheekbones (−Y, subject’s right) |  | Sphere, scaled | (-5.4, -4.2, 150.4) | radii X 1.5 · Y 1.8 · Z 1.35 → scale (0.030, 0.036, 0.027) | smooth union 3 cm |
| Brow ridge (+Y, subject’s left) | ● | Capsule | (-7.4, 0, 154) → (-5.4, 4.6, 153.5) | radius 0.9 | smooth union 1.5 cm |
| Brow ridge (−Y, subject’s right) | ● | Capsule | (-7.4, 0, 154) → (-5.4, -4.6, 153.5) | radius 0.9 | smooth union 1.5 cm |
| Eye sockets (+Y, subject’s left) |  | Sphere, scaled | (-8.8, 3, 152) | radii X 1 · Y 2 · Z 1.2 → scale (0.020, 0.040, 0.024) | smooth subtract 1.4 cm |
| Eye sockets (−Y, subject’s right) |  | Sphere, scaled | (-8.8, -3, 152) | radii X 1 · Y 2 · Z 1.2 → scale (0.020, 0.040, 0.024) | smooth subtract 1.4 cm |
| Eyeballs (+Y, subject’s left) |  | Sphere, scaled | (-6.7, 3, 151.8) | radii X 1.25 · Y 1.55 · Z 1.05 → scale (0.025, 0.031, 0.021) | smooth union 0.8 cm |
| Eyeballs (−Y, subject’s right) |  | Sphere, scaled | (-6.7, -3, 151.8) | radii X 1.25 · Y 1.55 · Z 1.05 → scale (0.025, 0.031, 0.021) | smooth union 0.8 cm |
| Upper lids (+Y, subject’s left) |  | Capsule | (-7.75, 1.9, 152.55) → (-7.15, 4.2, 152.45) | radius 0.35 | smooth union 0.6 cm |
| Upper lids (−Y, subject’s right) |  | Capsule | (-7.75, -1.9, 152.55) → (-7.15, -4.2, 152.45) | radius 0.35 | smooth union 0.6 cm |
| Nose (bridge → tip) | ● | Round cone (two spheres + taper) | (-8.4, 0, 152.8) → (-10.7, 0, 148.7) | radius 0.8 → 1.15 | smooth union 1 cm |
| Nostril wings (alae) (+Y, subject’s left) |  | Sphere | (-9.8, 1.05, 148.4) | radius 0.75 → scale 0.015 | smooth union 0.9 cm |
| Nostril wings (alae) (−Y, subject’s right) |  | Sphere | (-9.8, -1.05, 148.4) | radius 0.75 → scale 0.015 | smooth union 0.9 cm |
| Upper jaw (maxilla) |  | Sphere, scaled | (-6.8, 0, 146.4) | radii X 2.2 · Y 3 · Z 2.4 → scale (0.044, 0.060, 0.048) | smooth union 2 cm |
| Upper lip |  | Sphere, scaled | (-8.88, 0, 145.98) | radii X 0.72 · Y 2.05 · Z 0.58 → scale (0.014, 0.041, 0.012) | smooth union 0.9 cm |
| Lower lip |  | Sphere, scaled | (-8.72, 0, 144.82) | radii X 0.72 · Y 1.75 · Z 0.62 → scale (0.014, 0.035, 0.012) | smooth union 0.9 cm |
| Mouth line |  | Sphere, scaled | (-9.52, 0, 145.38) | radii X 0.45 · Y 1.85 · Z 0.17 → scale (0.009, 0.037, 0.003) | smooth subtract 0.4 cm |
| Ears (+Y, subject’s left) |  | Sphere, scaled | (1.2, 7.1, 150.6) | radii X 1.7 · Y 0.8 · Z 2.7 → scale (0.034, 0.016, 0.054) | smooth union 1.2 cm |
| Ears (−Y, subject’s right) |  | Sphere, scaled | (1.2, -7.1, 150.6) | radii X 1.7 · Y 0.8 · Z 2.7 → scale (0.034, 0.016, 0.054) | smooth union 1.2 cm |
| Neck | ● | Cylinder, vertical | (1.2, 0, 138.5) | radius 5.2 · height 11 (Z 133–144) | smooth union 3 cm |
| Shoulders / chest | ● | Sphere, scaled | (1, 0, 126.5) | radii X 10 · Y 19 · Z 7.5 → scale (0.200, 0.380, 0.150); cut flat below Z 123 | smooth union 4 cm |
| Plinth |  | Box, 0.5 cm bevel | (1, 0, 120) | X 18 · Y 24 · Z 6 | union |

**Blends.** The study merges parts with a smooth union (`smin`, radius as listed) and carves the eye
sockets and the mouth line with a smooth subtraction. In Unreal, either:

1. place the primitives as listed (a hard union is fine for a lighting grey-box), then merge them with
   **Modeling Mode → Mesh Boolean / Merge** and add a light **Smooth** pass, or
2. build them as a Geometry Script / PCG graph and use a **voxel blend** at about the listed radius.

The eye sockets and the mouth line are subtractions: cut them with Mesh Boolean (Difference). The
eyeballs then sit inside the sockets, about 1 cm behind the brow.

## Bounds used by the renderer

- Head bounding sphere: centre (-1, 0, 150.5), radius 13.5.
- Whole bust: centre (0, 0, 143), radius 27. The plinth sits below it and below
  frame; it exists for the previs stage only.

## Material, backdrop, camera

- **M_Plaster:** base colour 0.8 linear (sRGB ≈ 0.91), roughness 0.9, specular 0.3, no metal.
- **Backdrop:** a flat vertical card at **X = 160 cm** (behind every light in the presets,
  including the rims and the backlight), base colour 0.18 linear (18 % grey). It takes a little spill
  from the front lights plus a soft background pool behind the head; both are scaled by 2^stops,
  where stops is the preset's `backgroundStops` in `assets/js/core/presets.js` (−1 to −4).
- **Haze (Backlight #097 only):** the study's veil is a thin haze lit by the source behind the head
  (forward-scattering, strongest looking toward the source). In Unreal, a low-density Exponential
  Height Fog with Volumetric Fog on, scattering distribution about 0.85, and the backlight's
  Volumetric Scattering Intensity up; tint the fog's inscattering toward #FFE3A3.
- **Camera (matches the study):** CineCameraActor at (-200, 0, 150), looking at (0, 0, 144.5);
  **85 mm**, filmback **Super 35** (24.89 × 18.66 mm) with a **4:5** crop (14.93 × 18.66 mm), vertical
  FOV 12.5°, T2.8, focus 200 cm.

## Lights

Positions come from `assets/js/core/presets.js` (the single source shared with the study and
`previs/shotlist.json`):

```
X = −d·cos(el)·cos(az)   Y = −d·cos(el)·sin(az)   Z = 150 + d·sin(el)        (d in cm)
az positive = camera-left, el positive = up; RectLight, SourceWidth = SourceHeight = size,
bUseTemperature = true, Temperature = kelvin; fill intensity = key / (ratio − 1).
```

Aim each light at the head centre (0, 0, 150). Set the camera's white balance to the preset's
`cameraWB` (Post Process → White Balance → Temp), so a 3200 K key at 5600 K reads amber, as it does
in the study.
