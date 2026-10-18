# Shot language: camera-move cards and placeholder stills

The prompt behind `assets/js/pieces/shotcard.js`, `assets/js/pieces/still.js`,
`studies/shotcard.html` and `studies/still.html`, written for Claude Opus 5.5 in the collection's
block style. Paste it into a Claude Code session opened in this repository.

Motion Prompt (MIT, Shohei Ohtaki) is used two ways:
- **Run the code:** camera cells **#027** Dolly in, **#030** Orbit, **#031** Crane up, **#032** Dolly
  zoom, **#033** Rack focus and **#043** Whip pan, vendored unchanged in
  `assets/js/vendor/motion-prompt/camera.js`.
- **Numbers only:** **#105** Bokeh, **#112** Vignette and **#118** Film grain.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- Films. Default: every film in `data/portfolio.js`, each with `move`, `aspect`, `palette` (five
  hex colours, darkest → lightest) and `stillKinds`.
- Moves. Default: the six camera cells above, one per film; the card's caption reads `#027 DOLLY IN`.
- Placeholder compositions. Default: `wide-ext`, `interior-practical`, `close-silhouette`, `insert`,
  `night-street`, `window-shaft`.
- Where cards play. Default: on hover or keyboard focus; on screens without hover, when 60 % of
  the card is in view.
</inputs>

<direction>
These are the first moving images a reviewer sees in my selected work. They should read as a
cinematographer's shot grammar, quiet and exact, not as motion graphics.

**Cards**
- Each card runs one vendored camera cell, unchanged, repainted in the film's palette:
  - `bg` and `card` take the darkest tone, and the card becomes a dusk sky gradient that peaks at
    the horizon;
  - `blue` (the subject) takes the accent, the most chromatic middle tone, pulled slightly toward
    the dark;
  - the accent tints `blueM`, `blueL` and `blueXL` are mixed toward the sky, so far hills sit in
    haze;
  - `g1`–`g4` are a ramp through the mid tones;
  - `ink` is near-dark, because in these cells it only paints the car's tyres.
- Cover the film's aspect box with the 539×208 card and keep the subject in view at 1.33.
- Replace the kit's white viewfinder with a quiet one: three or four thin frame marks, a mono
  readout top right while the camera moves (`24MM · 2.2 M`, `ARC +54°`, `HEIGHT 9.0 M`,
  `FOCUS 9.0 M`, `SCENE B`) and the caption bottom left.
- **Play once and hold:**

  | Move | Plays to (s) | Exit (s) |
  |---|---|---|
  | #027 | 3.8 | 4.2 → 4.7 |
  | #030 | 3.9 | 4.2 → 4.7 |
  | #031 | 3.8 | 4.2 → 4.7 |
  | #032 | 3.8 | 4.2 → 4.7 |
  | #033 | 3.4 | 4.2 → 4.7 |
  | #043 | 3.0 | 6.4 → 9.4, then 0 |

  - Enter: u rises to the hold at 1×.
  - Leave before the hold: rewind at 1×.
  - Leave after the hold: play the exit, then rest at u = 0.
  - Come back during the exit: run it backwards to its start, then snap to the hold (the two
    frames are identical).
  - Reduced motion: a still frame at the hold.
- The rest frame (u = 0) is the thumbnail, so it has to work as a still.

**Stills**
- Stills are painted frame grabs, not clip-art. Each is lit from one motivated source: a low sun, a
  practical lamp, a backlit window, a sodium streetlight or a hard window shaft.
- Compose on thirds: the horizon on the lower third, the eye line on the upper third, and the
  subject on the third facing the light, with looking room.
- Silhouettes carry a rim: the crescent the shape loses when it is shifted away from the light,
  blurred and added.
- Light behaves: a figure standing in a window patch blocks it (its shadow runs along the floor in
  the light's direction, visible only inside the patch); a lampshade's open bottom throws a pool on
  the tabletop. The caption keeps a soft dark halo so it reads over a lit floor.
- Depth comes from aerial perspective and out-of-focus points: **#105** 9-blade curved bokeh with a
  brighter rim, drawn additively.
- Finish with the **#112** vignette (clear to 45 % of a 0.62·W radius, vertical radius × (H/W) ×
  1.35, rgb(32,35,43) to 70 %, multiplied) and still **#118** grain.
- Caption, small and mono, bottom right: `PLACEHOLDER STILL · replace in data/portfolio.js`.

Banned: glitch, shake, particles (no dust in the shaft), neon, bouncy easing, rainbow light leaks,
lens-flare clichés, and invented credits or names on the frames.
</direction>

<structure>
Card timeline used in record mode and by the Player (8 s loop, `posterTime` 4.0 = the hold):

| t (s) | Action |
|---|---|
| 0 → uHold | u = t: the move plays at 1× |
| uHold → 7.5 − exit length | hold |
| next (exit length) | the exit: cross-fade back (or the B → A whip for #043) |
| last 0.5 s | rest at u = 0, so the loop is seamless |

A still has duration 0: one frame, `posterTime` 0.
</structure>

<build>
- **`pieces/shotcard.js`:** `meta`, `create`, `MOVES`, `mapPalette`, `readout`, `timelineU`, and
  `mountShotCard(container, film, { reducedMotion, trigger, caption, topLeftMark })` →
  `{ ready, destroy, u, phase }`.
  - Draw synchronously: `Object.assign(C, mapPalette(palette))`, draw the cell, `resetPalette()`
    in a `finally`.
  - Clip out the kit's REC dot. It shares `C.blue` with the subject, so a colour swap cannot hide it.
  - The kit sets `ctx.filter = blur(Npx)` in card pixels, but canvas filters ignore the transform.
    Pass the cell a context proxy that scales blur radii by cover scale × dpr.
  - #033 blurs about 30 sprites. Outside record mode, draw it into an offscreen at ≤ 1.25× card
    pixels and scale it up.
  - Only the mount helper owns a clock (`requestAnimationFrame`, real-time `dt` capped at 0.25 s).
    It stops offscreen, and it snaps to rest when the card leaves the viewport.
  - Use two IntersectionObservers: one with a 200 px margin only to create the piece early, and one
    on the real viewport for "≥ 60 % in view" and pausing. A root margin inflates
    `intersectionRatio`, so touch cards would play before they are on screen.
  - Follow the Motion-off toggle and the OS setting live (`onMotionChange`); an explicit
    `reducedMotion` option only sets the starting value.
- **`pieces/still.js`:** `meta`, `create`, `paintStill(ctx, W, H, opts)`, `STILL_KINDS`,
  `normPalette`, `pickAccent`, and `renderStill({ palette, aspect, seed, kind, width, caption })`
  → `Promise<objectURL>` (WebP, PNG where WebP is unsupported).
  - Pure in (palette, seed, kind, size). A seeded `mulberry32` stream picks the variations: water
    or land, horizon height, the sun's place, a mirrored frame.
  - Blur only small layers (rect + 3σ), at ½ or ¼ resolution for large σ, then scale them up.
- **Pages:**
  - `studies/shotcard.html` is the gallery: six moves, their meanings and hover behaviour. On wide
    screens every frame sits in a common 2.39 gate (pillarboxed or letterboxed), so a 4:3 card does
    not tower over a 2.76 one. With
    `?record&params=<base64 {"move","palette","aspect"[, "u"]}>` it renders one move.
  - `studies/still.html` shows every film's stills plus a 36-frame contact sheet. With
    `?record&seed&params=<base64 {"kind","palette","aspect"}>` it renders one still.
- **Check before you trust it:**
  - contact-sheet every move at u = 0, 1.5, 2.2, 4, 6;
  - contact-sheet every palette × kind;
  - seek t1, t2, t1 gives an identical hash;
  - zero console errors at 1440×900 and 390×844.
</build>

<gotchas>
- At ±54° the kit's #030 mountains have no near clipping and fold across the ground as a wedge.
  Paint them with the sky gradient expressed in world space (`world()` draws after
  `translate(w/2, h/2)`).
- A CanvasGradient made on one context works on another: the kit's scratch canvases can use the
  sky gradient as `C.card`.
- `Object.assign(C, map)` copies only enumerable keys, so keep helper data (the sky stops)
  non-enumerable or it leaks into the kit.
- #043's exit is static after 7.2 s apart from the readout; let it rest there.
- Headless Chromium with SwiftShader rasterises canvas on the CPU. Filter-heavy frames (#033 and
  the #043 whip) take hundreds of ms there; measure on a real GPU before cutting detail.
- Wait for IBM Plex Mono before the first frame.
</gotchas>

<start>
Read `assets/js/vendor/motion-prompt/camera.js`, `core/canvas.js`, `core/grain.js`, `core/time.js`,
`pieces/_template.js` and `data/portfolio.js`. Then print the specs in this session:

```
export MOTION_PROMPT_BASE=/path/to/motion-prompt/api/v1
MP=/path/to/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs
node $MP get 27 30 31 32 33 43
node $MP get 105 112 118
```

Send me the move contact sheet and the 6 × 6 stills sheet before wiring anything into the site.
</start>
