# Colour study: from Log C to the look

The Claude Opus 5.5 prompt behind `studies/colour.html`
(`assets/js/pieces/colour.js`, `colour-scene.js`, `colour-grade.js`, `scopes.js`).

The piece shows one frame, lit in scene-linear light and recorded the way a camera would. It is then graded live and read on scopes drawn inside the same canvas, so a recording carries the scopes too.

Motion Prompt references (MIT, Shohei Ohtaki), used for their numbers only:
- **#087**: before/after slider
- **#115**: black and white
- **#117**: teal and orange
- **#118**: film grain

```
<inputs>
- Frame: a dusk road. Ask for a different location if the owner wants one; default is a two-lane
  road at blue hour with tungsten streetlamps, an oncoming car, a roadside motel with a teal neon
  sign, and one figure on the verge.
- Working resolution: 960×402 (2.39), 640×268 on phones. Fixed; the canvas scales the picture.
- Camera: ARRI LogC3 at EI 800, white balance 5600 K. Lamps 3200 K, headlights 5600 K.
- Looks: LOG, Rec.709, teal & orange, bleach bypass, black & white, day for night; print finish toggle.
- Canvas: wide 1.5 (picture over a scopes band), tall 0.68 (picture, waveform, vectorscope + readout).
</inputs>

<direction>
A grading suite seen by someone with taste in light. One frame, lit like a DP would light it:
the sky is the key (orange horizon, sun just under it, thin stratus lit from below), practicals
pool on the road with a cut-off cone, the figure is rim-lit by the lamp behind and the horizon lights
their face, the neon washes the motel facade teal. Everything is scene-referred until the look.

Scopes look like hardware: thin hairlines, IBM Plex Mono uppercase labels, a pale phosphor trace
(log intensity), graticule 0 / 10 / 50 / 90 / 100 %, 75 % vectorscope targets, the skin line at 123°
in tungsten. The waveform's x is the picture's x, so the divider shows in it.

The wipe (#087): the divider at 50 %, then 20 % (0.75–1.55 s), then 82 % (1.55–2.65 s), then
50 % (2.65–3.55 s), all cubic ease-in-out, on a 4.8 s cycle. The scripted demo keeps Log C on the
left and changes the right-hand look at 2.65 s in each cycle, while the divider is at 82 % and the
new look then wipes back in.

Banned: glitch, RGB split, camera shake, particles, neon glow on the UI, bouncy easing, light
leaks, lens flares, rainbow scopes, sparse "dust" grain, any text inside the bottom-right
120×60 px (player chrome).
</direction>

<structure>
| t (s)        | Divider (#087)            | Left (A) | Right (B)                          |
|--------------|---------------------------|----------|------------------------------------|
| 0 – 2.65     | 50 → 20 → 82 %            | Log C    | Rec.709                            |
| 2.65 – 7.45  | 82 → 50, hold, 50 → 20 → 82 | Log C  | Teal & orange (poster at 4.2 s)    |
| 7.45 – 12.25 | same cycle                | Log C    | Bleach bypass                      |
| 12.25 – 17.05| same cycle                | Log C    | Black & white                      |
| 17.05 – 21.85| same cycle                | Log C    | Day for night                      |
| 21.85 – 24   | back to Rec.709; loops seamlessly at 24 s                       |
</structure>

<build>
- Four modules: colour-scene.js (scene), colour-grade.js (looks), scopes.js (scopes),
  colour.js (piece: meta, create, layout, bindWipeDrag).
- Piece contract: export const meta + export async function create(canvas, opts)
  → { seek(t, params), resize(w, h, dpr, { layout }), dispose(), script(t), describe(params) }.
  seek is pure. No Math.random, Date, performance.now or timers in pieces. Await every canvas
  font (meta.fonts, full shorthands) before building the scene: the neon is drawn with a font.
- Scene: a Float32Array of linear RGB plus a sky mask and luminance, built once per (size, seed).
  Physically placed light: lamp pools use the cosine / inverse-square law with a cut-off cone,
  and every lamp casts the figure's shadow. The sun glow is separable (column × row terms).
  Canvas2D is used only to rasterise anti-aliased coverage masks.
- Encoding: LogC3 EI 800, x > 0.010591 ? 0.247190·log10(5.555556x + 0.052272) + 0.385537
  : 5.367655x + 0.092809 (18 % grey → 0.391). 709 = sRGB OETF ∘ Narkowicz ACES fit.
- Speed (grade ≤ 8 ms, scopes ≤ 3 ms at 960×402):
  - Index each linear value once per scene by its float32 bits (exponent + 8 mantissa bits).
  - Fold exposure into a per-EV 1D LUT, so there is no pow or log per pixel.
  - Teal & orange is a 3×3 matrix plus a Y′-indexed shift table.
  - Day for night is folded into its own indices, because it is linear before the display transform.
  - Each look is its own small module-level loop (V8 optimises each on its own types); truncate
    with |0, then clamp as integers. Reuse evicted look buffers instead of allocating.
  - The print finish is a pass after the look: each pixel's grain class (white?, 32 opacity levels)
    indexes a 64 × 3 × 256 byte table, so it is three byte lookups per pixel.
  - Cache each graded look; moving the wipe only copies rows.
  - Scopes sample with stride 2 and compute hue statistics from the vectorscope bins.
- Wipe = a range param "wipe" (a slider, so keyboard users can operate it) and pointer drag on
  the picture via bindWipeDrag(player). Use touch-action: pan-y so vertical scrolling still works,
  and let touch wait 8 px to see the gesture: a tap sets the divider, a horizontal drag moves it,
  a vertical swipe scrolls the page without touching the divider or stopping the demo.
- describe(params) → spoken summary of the scopes (e.g. "Waveform: shadows at 3.1%,
  highlights peaking at 89%, 2.1% of pixels clipped; vectorscope: hues gathered on the skin line
  and its teal opposite."). The Player debounces it into the aria-live region.
- Record: studies/colour.html?record&w=1920&h=1280&fps=30 (tall: &w=1080&h=1588).
  Check six stills (poster 4.2 s, one per look) before a full render.
</build>

<gotchas>
- Keep the grade in linear light until the look; tone-map once. Exposure acts before the look.
- Day for night must keep emitters: p = smoothstep(1.5, 6, Y_scene) lifts the WB gains, the sky
  darkening and the desaturation off lamps, headlights and neon.
- Waveform columns: 480 sampled columns do not divide evenly into 256 buckets, so normalise each
  bucket by its column count or the trace shows vertical stripes.
- The dither table already adds 0.5 for rounding: truncate (| 0); do not let a clamped-array
  store round a second time (that biases every pixel up half a code).
- #118's sparse squares read as dust on a full frame: use dense, low-opacity grain that never moves.
- Uint8 stores through a per-pixel closure were 3× slower than inline 32-bit stores in V8.
- Clip the A/B tags to their own side of the divider, so the wipe reveals the labels too.
- Waveform rows bin 8-bit codes in pairs; smooth gradients (the sky) leave a comb of empty rows
  that reads as stipple. Soften the histogram [1 2 1] down each column before the log mapping.
- The page's grain overlay sits above everything; lift the stage above it on this page, or the
  A/B comparison, the scope traces and the print finish's own grain are all seen through noise.
- Scope labels never below 9 px; in the narrow tall readout, one number per row.
- Pronouns: the figure is "them"; the owner is "I" or "Karan".
</gotchas>

<start>
Build the scene first and look at it raw at 1:1 in Rec.709. Then add LOG and 709, then the
scopes, and only then the creative looks. Screenshot 1440×900 and 390×844 and look at them.
</start>
```
