# Main title: an iris, the lamps, a name

The prompt behind `assets/js/pieces/title.js` and `studies/title.html`, written for Claude Opus 5.5
in the collection's block style. Paste it into a Claude Code session opened in this repository.
Motion Prompt (MIT, Shohei Ohtaki): **#005** Mask reveal is vendored and run as code; **#033** Rack
focus, **#112** Vignette and **#118** Film grain are numbers only.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- Name, role and camera-report slate. Default: read them from `data/portfolio.js`
  (`person.name`, `person.role`, `person.slate` → "A-CAM · 40mm · T2.0 · 5600K · 24fps · 2.39:1").
- Length. Default: 4.5 s (the name sharp by 2.6 s), played once per session, then held. `seek(4.5)` is the hero frame, the
  reduced-motion frame, the poster and the OG image.
- Picture. Default: letterbox settles from 1.85 to 2.39:1 on landscape screens; on a phone in
  portrait, from 1:1 to 4:5, with the name on two lines.
- Practicals. Default: 14 seeded lamps, 2700–3200 K, seen by a camera balanced for 5600 K.
- Where it lives. Default: the home-page hero (`fit: 'fill'`, the frame is the whole hero) and a
  study page, both through `core/player.js`.
</inputs>

<direction>
The first seconds in a dark cinema. The house lights are already down; nothing announces itself.
Quiet, confident and precise: a DP's title, so the light does the work and the type stays still
once it has landed.

- Palette from `assets/css/tokens.css`: ink #07080A for bars and blades, a near-black room, paper
  #ECE6DA for the name, #B9B3A8 for the role, #8A857C for the slate, one tungsten #F4B26A hairline.
- Type: the name in Cormorant Garamond 500 caps, tracked 0.18em; the role in Inter Tight 500 caps,
  tracked wide like small caps; the slate in IBM Plex Mono, uppercase and tracked, typed on like a
  camera report. Centre the ink, not the advance (letter-spacing adds a trailing gap).
- An original 9-blade iris opens onto out-of-focus practicals. The bokeh is the aperture: 9-gons
  that grow and round off as the blades open, turning with them.
- **#005 Mask reveal:** the name rises from behind an invisible edge marked by a single line; the
  role drops from above it. Run the vendored cell, play it once and hold before its exit.
- **#033 Rack focus**, direction reversed: the name comes into focus as the lamps go soft and grow
  (brightness falls with disc area, so the light is conserved).
- **#112 Vignette** fades in early; **#118 grain** over the picture only, never over the bars.
- A slow push on the room (2.5 % over the sequence, settled before the hold) so the lamps drift
  apart. Nothing else moves.

Banned: lens flares, light leaks, glitch, RGB split, camera shake, particles, neon glows, bouncy
easing, rainbow or coloured haze, any text that moves after it lands, and anything in
the bottom-right 120×60 px (player chrome).
</direction>

<structure>
| Time (s) | Layer | Numbers |
|---|---|---|
| 0–4.5 | Grain, picture only | 8 seeded 256² tiles, tile `floor(t·24) mod 8`; dark #3A3530 55 % / white 45 %, ≤ 38 % alpha × 0.16; 16 % lean to #F2DDBE (#118) |
| 0.1–1.0 | Iris opens | `R = R_open · eOut(P(t, .1, 1.0))`, rotation `0.35·(1 − open)`; 6 % sheen on each blade's leading edge |
| 0.1–0.9 | Vignette in (eIO) | clear to 45 % of a 0.62·W radius, vertical × (picture h / W) × 1.35, rgb(32,35,43) to 70 % (#112) |
| 1.0–2.4 | Name reveal | `u = min(t − 1.0, 1.4)`: line 0.1–0.5 (eIO, drawn at 40 % length, 55 % alpha), name +120 card px 0.35–1.0 (eOut5), role −60 card px 0.55–1.15 (#005) |
| 1.5–2.6 | Rack focus (eIO) | `σ_name = 7·s → 0`, `σ_bg = 0 → 6·s`, s = 0.5·W/539 (0.86·W/539 tall) (#033) |
| 2.6–3.3 | Letterbox (eIO) | 1.85 → 2.39 (tall 1.0 → 0.8), ink bars |
| 3.1–3.8 | Slate types on | `floor(n · eOut(P(t, 3.1, 3.8)))` characters, a tungsten caret while typing |
| 3.8–4.5 | Hold | `seek(4.5)` = hero = reduced motion = poster = OG |
</structure>

<build>
- One piece module with `export const meta` and `export async function create(canvas, opts)`
  returning `{ seek(t, params), resize(w, h, dpr, { layout }), dispose(), describe(params) }`.
- **seek is pure.** No `Math.random`, `Date`, `performance.now`, timers or animation-frame
  callbacks in the piece. Seeded PRNG (`core/prng.js`) for the lamps; caches keyed by their inputs.
- Print the code you port in this session:
  `export MOTION_PROMPT_BASE=/home/user/showheyohtaki/motion-prompt/api/v1`,
  `node skills/motion-prompt/scripts/motion-prompt.mjs kit motion` and `… get 5`; numbers with
  `… get 33 112 118`. Put each element's licence line at the top of the file that uses it.
- #005 runs as code from `assets/js/vendor/motion-prompt/motion.js`. Swap content only through its
  exports (`TEXT5`, `C`, `setFonts`, `OPTS.stage = false`) and restore them afterwards. Draw it into
  an offscreen layer at frame resolution with `ctx.scale(k)`; pass the frame width as the cell's
  `w` so a long name is never clipped by the 539 px card. Draw the name, role and line as separate
  passes so each is centred on its own ink.
- Rack focus with `core/canvas.js` `blurLayer` (feature-detected `ctx.filter`, pyramid fallback).
  The lamps live on a half-resolution layer (all soft light); the name on its own band.
- Record: `?record&w=1920&h=1080&fps=24` on `studies/title.html`; OG at 1200×630 with `&t=4.5`.
  **Check stills before the full render:** a contact sheet at t = 0.2, 0.6, 1.0, 1.6, 2.2, 2.6,
  3.2, 3.8, 4.5 at 1440×900 and 390×844. Look at legibility, focus timing, vignette density and
  spacing; fix the worst thing and look again.
</build>

<gotchas>
- Blur the name layer, not the composite: blurring the composite softens the lamps twice.
- `ctx.filter` is missing in some browsers: feature-detect it with a pixel test.
- Don't let the transform decide a blur radius: draw blurred layers with an identity transform and
  σ × dpr, so the focus pull is the same at every pixel ratio.
- The last frame equals the reduced-motion frame: nothing may depend on how you arrived at t = 7.
- Wait for every canvas font (full shorthands, weight included) before READY, or the recording
  changes typeface halfway.
- #112's colour is lighter than a low-key frame: composite it with `multiply`, or it lifts the
  corners. Lean #118's cream the same way, or the blacks go milky.
- Letter-spacing adds a trailing gap, so a tracked line set with `textAlign = 'center'` sits half
  a gap left; measure the ink box and shift by it.
- The hero's bottom bar holds the page's buttons: keep the name, role and slate inside the
  picture area.
</gotchas>

<start>
Read `assets/js/pieces/_template.js`, `core/canvas.js`, `core/grain.js`,
`vendor/motion-prompt/motion.js` and `data/portfolio.js`. Print #005, #033, #112 and #118 with the
CLI, then build the iris and the lamps first and look at t = 1.6 before you add any type.
</start>
