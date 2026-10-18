# Focus study: depth of field through a real lens

The prompt behind `assets/js/pieces/focus.js`, `ui/dof-ruler.js`, `studies/focus.html` and
`assets/css/study-focus.css`, written for Claude Opus 5.5 in the collection's block style. Paste it
into a Claude Code session opened in this repository. Motion numbers come from Motion Prompt
(MIT, Shohei Ohtaki), numbers only: **#105** Bokeh and **#033** Rack focus.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- Formats. Default: Super 16 (12.52 × 7.41 mm, CoC 0.015), Super 35 (24.89 × 18.66 mm, CoC 0.025),
  full frame (36 × 24 mm, CoC 0.030), all from `core/optics.js` `FORMATS`.
- Lenses. Default: prime detents 18 21 25 29 32 35 40 50 65 75 100 135 mm; third stops f/1.4 to
  f/22 (N = 2^(k/6), labelled with the nominal marking); iris blades 5, 6, 7, 8, 9, 11 or round.
- Focus. Default: a log ring from 0.45 m to 30 m with an ∞ detent past the end; engravings at
  0.5, 0.75, 1, 1.5, 2, 3, 5, 10 m and ∞ (2–50 ft and ∞ in feet).
- Scene. Default: a night exterior on a rooftop, camera 1.6 m high and level, white balance 4300 K.
  A: slate on a C-stand arm at 1.2 m. B: actor stand-in at 3 m, 1.75 m tall. C: practical floor
  lamp at 7 m. D: parapet and festoon string at 18 m, 40 bulbs on a catenary at 2700 K. E: city
  facades at 60 m with lit windows, shopfronts and distant lights.
- Defaults. Default: S35, 50 mm, f/2.8, focus 3 m, 9 blades, metres. That is the test vector:
  Near 2.77 m · Far 3.27 m · DoF 0.50 m · Hyperfocal 35.8 m.
</inputs>

<direction>
This is a lens lesson that must look like a frame from a film, not a diagram: a calm night
exterior seen through a fast prime, the kind of test a focus puller and a DP shoot the night before.

- Every number is optics. `H = f²/(N·c) + f`; near `s(H − f)/(H + s − 2f)`; far `s(H − f)/(H − s)`,
  infinite at or beyond H; blur disc on the sensor `b = f²·|d − s| / (N·d·(s − f))`. Use the
  nominal f-number on a detent (f/2.8, not 2.83), so the readout matches a DP's calculator.
- Extended planes blur as layers, never as a composite: each plane gets a Gaussian σ = b_px / 4
  (a uniform disc of diameter b has σ = b/4).
- Point sources are bokeh, the teaching point:
  - an n-gon of diameter max(b_px, source size), with the iris's blade count;
  - blade curvature that rounds the polygon within 1.5 stops of wide open;
  - a cat's-eye toward the frame edges that disappears as the iris closes;
  - **energy-conserving alpha**, E·(2/d)² computed in linear light and encoded to sRGB, so a disc
    that doubles in size has a quarter of the brightness;
  - additive (`lighter`) compositing, with clipped highlights desaturating toward white.
- **#105 Bokeh:** discs from 100 % to 55 % opacity as the iris opens; practical lamps #FFC75A,
  distant lights #FFE3A3, a 1.2 px amber rim.
- **#033 Rack focus:** a 1.6 s pull, cubic in-out. Thin corner brackets travel between subjects in
  log distance, like a focus puller's mark.
- Colour is physics: Kelvin → Planckian locus → XYZ → von Kries to 4300 K (`core/color.js`
  `kelvinChip`), so tungsten reads amber and LED office floors read cool.
- The actor stays mostly in shadow: a cool skyglow fill on the face and a soft warm rim from the
  practical behind camera-left.
- Type: IBM Plex Mono, uppercase and tracked, as a camera report along the top. Line one is camera,
  lens, stop, white balance and the focus mark in tungsten; line two is Near · Far · DoF ·
  Hyperfocal. Subject chips sit top-right and turn tungsten when b ≤ c. Nothing goes in the
  bottom-right 120×60 px.

Banned: lens flares, light leaks, anamorphic streaks, glitch, shake, particles, neon, bouncy
easing, rainbow or hexagonal "filter" bokeh, blur on the composite, and any text that moves after
it lands. Focus moves; the camera does not.
</direction>

<structure>
A 12 s loop, pure `script(t)`. It returns only `stop` and `focus`; every other param comes from
the controls.

| t (s) | Action | Source |
|---|---|---|
| 0.0–0.4 | Hold f/16, focus on the slate (A, 1.2 m): nearly everything reads | — |
| 0.4–1.4 | Iris opens f/16 → f/1.4 (log-space, cubic in-out): the festoons bloom into discs | #105 |
| 3.0–4.6 | Rack A → B (1.2 → 3 m, log-space, cubic in-out) | #033 |
| 6.5–8.1 | Rack B → C (3 → 7 m) | — |
| 10–12 | Return to f/16 at 1.2 m, so the loop is seamless | — |

- `posterTime = 5.5`: f/1.4, focused on the actor. This is the poster and the reduced-motion frame.
</structure>

<build>
- One piece module with `export const meta` and `export async function create(canvas, opts)`
  returning `{ seek(t, params), resize, dispose, script(t), describe(params) }`. Export
  `lensState(params)`, `readout(params)` and `SUBJECTS`, so the DOM ruler uses the same maths.
- **seek is pure.** No `Math.random`, `Date`, `performance.now`, timers or animation-frame
  callbacks in the piece. Seeded `core/prng.js` places windows and bulbs.
- Draw each plane in world metres (Y up) under one transform per distance, from
  `core/optics.js` `project`. Build each layer once per size, format and focal length, cropped to
  its content plus a margin. Blur through `core/canvas.js` `blurLayer`, which has a pyramid
  fallback without `ctx.filter`. Build a mip chain (½, ¼, ⅛) once, and blur the copy that matches
  σ.
- Cache each plane's blurred result keyed by σ quantised to 1 %, and draw with the quantised σ
  every time, so the cache can never change a pixel.
- Draw the optical frame (planes and bokeh) into one opaque offscreen canvas keyed by size, dpr,
  stop, focus and blades, then blit it 1:1 and put grain, brackets and the report on top. Every
  frame takes that path, so a held frame of the demo costs one blit and is still bit-identical.
- Controls come from `meta.params`. Focal and stop are discrete detent sliders; focus is a log
  slider whose last stretch reads ∞; format, blades and units are radios.
- `ui/dof-ruler.js` `bindDofRuler(host, el, { readout, controls })` listens to the Player's
  `playerparams` event. It draws an SVG log-distance ruler with:
  - the near/far band and the hyperfocal tick;
  - the focus witness mark;
  - a disc per subject sized by its blur in circles of confusion.

  It also fills a readout list and chips, engraves the ring marks under the focus slider, and keeps
  the focus label in the chosen units.
- Record: `?record&w=1920&h=804&fps=30` on `studies/focus.html`; `&params=` fixes the lens.
  **Check stills before the full render:** `__seek` 0, 1.6, 5.5 and 8.5, plus 18 mm, 135 mm,
  5 blades and f/22.
</build>

<gotchas>
- Blur an opaque plane that touches the frame edge with a margin of real content around it, or the
  edges go dark as σ grows.
- Energy conservation done in sRGB makes big discs vanish. Do it in linear light, then encode.
- Keep the actor's profile clean: no distant light directly behind the face, or at f/16 it reads
  as a highlight on the lips.
- Small extended light sources (a lampshade) are layers, not points. Give the shade a point-source
  disc only once its blur outgrows the shade, or a sharp lamp gets a dot in the middle.
- Never reuse a larger scratch canvas for a smaller blur target. Bilinear upscaling reads past the
  sub-rectangle into last frame's bleed, and seek(t1), seek(t2), seek(t1) stop matching.
- On a CPU rasteriser `ctx.filter` blur costs about the same at any σ. Draw σ < 0.4 px plainly and
  downsample above 1.2 px.
- Wait for the mono font (`document.fonts.load`) before the first frame, or recordings change font.
- `∞` is not in Google's latin subset, so it falls back to a system glyph. That is fine for a
  study, but check it in stills.
</gotchas>

<start>
Read `assets/js/core/optics.js`, `core/canvas.js`, `core/color.js`, `core/player.js` (the
`playerparams` event) and `pieces/_template.js`. Then print the Motion Prompt numbers in this
session:

```
export MOTION_PROMPT_BASE=/path/to/motion-prompt/api/v1
node /path/to/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs get 105 33
```

First prove that the test vector prints `Near 2.77 m · Far 3.27 m · DoF 0.50 m · Hyperfocal 35.8 m`.
Then send me four stills at 1280×536: t = 0, 1.6, 5.5 and 8.5.
</start>
