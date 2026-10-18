# Light study: a plaster bust under portrait set-ups

The prompt behind `assets/js/pieces/light.js`, `light-shader.js`, `ui/light-plot.js` and
`studies/light.html`, written for Claude Opus 5.5 in the collection's block style. Paste it into a
Claude Code session opened in this repository. Lighting numbers come from Motion Prompt (MIT,
Shohei Ohtaki), numbers only: **#101** Rembrandt, **#102** Butterfly, **#100** Split, **#098** Rim,
**#097** Backlight, **#114** Low-key.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- Set-ups to include. Default: Rembrandt #101, Loop (original), Butterfly #102, Split #100, Rim #098,
  Backlight #097, Low-key #114, in that tour order.
- Camera. Default: 85 mm on Super 35, a 4:5 extraction (vertical FOV 2·atan(9.33/85) = 12.5°),
  2.0 m from the head, aimed 5.5 cm below its centre, T2.8.
- Subject. Default: a plaster bust (albedo 0.8 linear), no hair, eyes blank, chest cut flat.
- Controls. Default: set-up radio; key:fill ratio 2:1 to 16:1 labelled in stops; key source size
  (bare 10 cm, 1×1, 2×2, 4×4, 8×8 frames); key and fill Kelvin 2700 to 6500 K with detents at 3200
  and 5600; camera white balance 3200 / 4300 / 5600 K.
- Where it lives. Default: a study page plus a home-page mount, both through `core/player.js`.
</inputs>

<direction>
This is a lighting lesson, not a demo reel. It should look like a careful test made in a studio
the evening before a shoot: one bust, one backdrop, the lights moving with intent.

- Light positions come from `assets/js/core/presets.js` only: azimuth from the camera axis (positive
  = camera-left), elevation, distance and source size. Never hard-code a position in the piece.
  - **#101 Rembrandt:** key 45° and 45° up. A triangle of light closes on the shadow-side cheek.
  - **#102 Butterfly:** key on the lens axis and 45° up, clamshell fill from below. Shadow under the nose.
  - **#100 Split:** key at 90°, no fill. The face divides down the nose.
  - **#098 Rim:** key off; two rims at ±135° outline the head against a dark ground.
  - **#097 Backlight:** source behind the head, a 22 % warm veil (#FFE3A3): treat it as a thin
    haze lit by that source (forward scattering, added in linear light, less of it in front of the
    bust than in front of the backdrop), so the frame glows and the figure stays dark against it.
  - **#114 Low-key:** one hard source behind camera-right; most of the frame falls to black.
- Key:fill is the DP ratio R = (K + F)/F, so F = K/(R − 1). Label it in stops ("4:1 · 2 stops").
- Colour is physics: Kim et al. Planckian locus → XYZ → von Kries to the camera white balance →
  linear sRGB (`core/color.js` `lightColor`). A 3200 K key at 5600 K WB must come out amber because
  of the maths, not because of a tint.
- Source size sets shadow softness: k = clamp(2·distance/size, 2, 64) in the soft-shadow march.
- Finish: exposure → ACES fit → sRGB → ±0.5/255 hash dither. A natural cos⁴-like corner falloff
  at most.
- Type: IBM Plex Mono, uppercase and tracked, as a camera report: set-up and Kelvins top-left,
  lens and ratio top-right; on a phone, only the set-up name. Nothing in the bottom-right
  120×60 px, where the player's controls sit.

Banned: lens flares, light leaks, bloom halos, glitch, shake, particles, neon, coloured haze other
than #097's veil, bouncy easing, any text that moves after it lands, and a spinning or orbiting
camera. The lights move; the camera does not.
</direction>

<structure>
A 31.5 s loop, desktop only; touch devices open on the resolved Rembrandt frame:

| Time (s) | Hold (3.3 s) | Then swing (1.2 s, cubic in-out) |
|---|---|---|
| 0.0 | Rembrandt #101 | → Loop |
| 4.5 | Loop | → Butterfly #102 |
| 9.0 | Butterfly #102 | → Split #100 |
| 13.5 | Split #100 | → Rim #098 (the rims fade in, the fill fades out) |
| 18.0 | Rim #098 | → Backlight #097 (the veil rises) |
| 22.5 | Backlight #097 | → Low-key #114 (the background falls 3 stops) |
| 27.0 | Low-key #114 | → back to Rembrandt (the short way round, through the front) |

- `posterTime = 1.5`: the poster and the reduced-motion frame are Rembrandt, the default.
- Azimuths always take the short way round (unwrap to the nearest equivalent angle).
</structure>

<build>
- One piece module with `export const meta` and `export async function create(canvas, opts)`
  returning `{ seek(t, params), resize, dispose, script(t), describe(params) }`. Keep the GLSL in a
  sibling module.
- **seek is pure.** No `Math.random`, `Date`, `performance.now`, timers or animation-frame
  callbacks in the piece. The Player owns the clock; `script(t)` is a pure function of time.
- **Maquette first.** Build a 7-part maquette (cranium, face/jaw, chin, brow, nose, neck,
  shoulders), render every set-up, and look at the stills. Upgrade to the full bust (about 20
  primitives: cheekbones, eye sockets as smooth subtraction, eyeballs, alae, maxilla, lips, mouth
  line, ears) only once Rembrandt, Butterfly and Split read. Then check again.
- Keep the bust as a **table** (centres and radii in metres) and generate the GLSL from it, so
  `previs/bust.md` can quote the same numbers in Unreal centimetres.
- Raymarch inside a bounding sphere: ≤ 96 steps, hit at `d < 4e-4·t`, step `0.9·d`; tetrahedral
  normals (ε 5e-4); iq's improved soft shadow (20 to 32 steps, step clamp 3 mm to 3 cm); 5-tap AO.
  Put the head parts behind their own bounding sphere: the sphere distance is a lower bound and
  `smin` is monotonic, so the field stays conservative.
- Presets as springs: pair the visible `preset` radio with hidden numeric rig params (azimuths,
  elevations, distances, fill and rim presence, ambient, background stops, veil). Answer a preset
  change with `api.set(presetParams(id, current), { animate: true })` so the rig springs. If the
  rig and the radio disagree, derive the rig from the radio, so the piece still works unbound.
- Render on demand: memoise `seek` on its inputs. A frame whose rig is away from its preset's rest
  pose renders at half resolution; at rest, at full. Use params, not timers. In record mode, always
  full resolution and `preserveDrawingBuffer: true`.
- WebGL2 through `core/gl.js`. If the context can't be created, throw from `create()`: the Player
  shows the poster and an honest message, and the plan still draws.
- A top-down SVG plan (`ui/plot.js`) next to the canvas, kept in sync through the Player's
  `playerparams` event: camera wedge, subject with a nose tick, each light aimed at the head with a
  Kelvin chip and a two-line label ("KEY" / "3200K · 45°↑").
- Record: `?record&w=864&h=1080&fps=24` on `studies/light.html`. **Check stills before the full
  render:** `__seek(1.5)` and one frame inside every swing.
</build>

<gotchas>
- The SDF face is the risk. If Rembrandt doesn't show the triangle, the face is too round; flatten
  the front planes and add cheekbones before you move the light. `presets.js` is the source of
  truth for the light.
- Soft shadows from wide sources band into rings: start each shadow ray with a deterministic
  per-pixel jitter (a hash of the pixel), and never with a time-varying one.
- Don't force light through at the terminator to hide self-shadow speckle: it leaks thin bright
  lines along creases. Offset the ray start instead (3 mm along the normal, 3 mm along the ray),
  and scale any terminator wrap by AO² so it never reaches into a crease.
- iq's improved soft shadow assumes the distance shrinks from step to step. Where it grows (leaving
  a bounding sphere, past a blend) use the classic h/t for that step, or you get black specks.
- A clamshell fill from −20° lands in exactly the shadow under the nose. If butterfly's shadow
  vanishes, bring the upper lip and maxilla forward; don't break the ratio.
- Lights at 135° and 180° sit about 0.9 m behind the head: the backdrop must be behind them
  (z = −1.6 m), and a one-sided source must not light the wall behind it.
- Wait for the slate font (`document.fonts.load`) before the first frame, or recordings change
  font.
- A frame that is skipped by the memo is still on screen only because the browser keeps the last
  composited image. Read pixels only in record mode.
</gotchas>

<start>
Read `assets/js/core/presets.js`, `core/color.js`, `core/gl.js`, `pieces/_template.js` and
`ui/plot.js`. Then print the Motion Prompt numbers in this session:

```
export MOTION_PROMPT_BASE=/path/to/motion-prompt/api/v1
node /path/to/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs get 97 98 100 101 102 114
```

Build the maquette and send me seven stills (one per set-up) at 320×400 before writing the full
bust.
</start>
