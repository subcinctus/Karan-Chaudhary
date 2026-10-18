---
name: code-cinema
description: Use when building, porting, verifying or recording a code-rendered "piece" for this cinematographer portfolio. A piece is a Canvas2D or WebGL2 module in assets/js/pieces/ whose every frame is a pure function seek(t), mounted by the shared Player and recorded to MP4 by tools/record.mjs. Use it to add a new study or title, to port a Motion Prompt move (#NNN) into the site, to fix a determinism or font failure from npm run check, to record clips or posters for an application, or to change the lighting presets that feed the Unreal previs shot list. Skip it for plain copy edits in data/portfolio.js.
---

# Code as cinema

Every moving image on this site is a small program, never a video file. The Player draws a frame by
calling `seek(t, params)`. The recorder steps `t` frame by frame and pipes the canvas to ffmpeg. So
a piece must look the same every time it is asked for the same `t`.

House style: calm, precise, cinematic, the work of someone with taste in light.

- **Look:** dark ink grounds (`#07080A`–`#1E2127`) and paper type (`#ECE6DA`). Tungsten `#F4B26A`
  and daylight `#8DB2F0` are accents only.
- **Type:** Cormorant Garamond for display, Inter Tight for text, and IBM Plex Mono, uppercase and
  tracked, for camera-report metadata.
- **Banned everywhere:** glitch, shake, particles, neon, bouncy or elastic easing, rainbow light
  leaks, lens-flare clichés, and text that moves after it lands.

Read these before writing code. They are the source of truth, and this file only summarises them:
`assets/js/pieces/_template.js` (a working reference piece), `assets/js/core/player.js`,
`core/stage.js`, `studies/_template.html`, `assets/css/tokens.css`. Below, `core/…`, `ui/…` and
`site/…` are short for `assets/js/core/…`, `assets/js/ui/…` and `assets/js/site/…`.

## 1. The piece contract

```js
// assets/js/pieces/<id>.js
export const meta = {
  id: '<id>', title: 'Shutter study', context: '2d',        // or 'webgl2'
  duration: 12, loop: true,                                  // the scripted timeline (s); a title is loop: false
  posterTime: 7.5,                                           // poster = reduced-motion frame = OG frame
  aspect: { wide: 2.39, tall: 4 / 5 },                       // tall is used when the host is portrait
  interactive: true, budgetMs: 8,                            // adaptive-quality target per frame
  fonts: ['500 16px "IBM Plex Mono"', '500 80px "Cormorant Garamond"'],  // FULL shorthands, all awaited
  params: [ /* control schema: {key,label,type:'range'|'select'|'radio'|'toggle',value,min,max,step,
               options,scale:'log',format,spoken,group,hint,hidden} */ ],
  record: { w: 1920, h: 804, fps: 24, subframes: 1, tune: 'film' },
  credits: ['#033 Rack focus'],                              // Motion Prompt IDs shown in the UI
};
export async function create(canvas, { width, height, dpr, params, seed, quality, record, reducedMotion, layout }) {
  await loadFonts(meta.fonts);                               // core/canvas.js; before the first frame
  return {
    seek(t, p) {},                                           // PURE: pixels = f(t, p, size, dpr, seed, quality)
    resize(w, h, dpr, { layout }) {},                        // the host sizes the backing store; you only scale by dpr
    dispose() {},
    script(t) { return { /* partial params */ }; },          // optional: pure scripted demo (autoplay + recorder)
    describe(p) { return 'one sentence'; },                  // optional: canvas aria-label / live region
  };
}
```

- **Poster and reduced motion.** The reduced-motion frame is
  `seek(posterTime, { ...params, ...script(posterTime) })`, the same frame the recorder writes as the
  poster. Keep `script(posterTime)` close to the defaults.
- **Player chrome.** Keep text out of the bottom-right ~120 × 60 CSS px, where the play/pause
  button sits.
- **Companion DOM.** Plots, rulers and readouts listen for the `playerparams` CustomEvent on the
  host (`{ detail: { params, t, api } }`). Do not poll.
- **Unknown keys.** Params outside the schema (palette, move, aspect) pass through to the piece
  untouched.

## 2. Determinism rules and banned APIs

`npm run check` greps `assets/js/pieces/`, `assets/js/vendor/` and the pure core modules, and fails
on:

`Math.random` · `Date` / `Date.now` / `new Date` · `performance.now` · `setTimeout` · `setInterval` · `requestAnimationFrame`
· `requestIdleCallback` · `crypto.getRandomValues` / `crypto.randomUUID`

There is no escape hatch in these folders (a `check:allow-clock` comment does not exempt them).
Real-time UI helpers (hover loops, timers) belong in `assets/js/site/` or `assets/js/ui/` and drive
a piece through `seek(t)`.

Only the Player owns a clock. Instead:

- **Randomness:** `core/prng.js` (`mulberry32`, `hash2`, `hash3`, `valueNoise2`, `fbm`), seeded from
  `opts.seed` or `hashString(slug)`.
- **Easing and time:** `core/time.js`. `P(t, a, b)`, `eIO` (cubic in-out, the Motion Prompt kits'
  curve), `eIOs`, `eOut`, `tween`, `frameIndex(t, 24)`.
- **Springs:** sums of closed-form steps, `v0 + Σ Δᵢ·S(t − tᵢ)` with `springCritical(τ, ω = 12)`.
  Never integrate per frame.
- **Grain:** `core/grain.js`. `grainTiles(n, size, seed)`, then `grainIndex(t, n)` re-seeds at
  `floor(t·24)`.
- **Caches:** allowed only when keyed by their inputs (size, seed, quality, σ quantised). A cache
  must never change a pixel.
- **Scratch canvases:** never sample a larger scratch canvas for a smaller target. Stale bleed
  breaks `seek(t1), seek(t2), seek(t1)`.
- **Optics, colour and light:** reuse the core helpers; don't re-derive them.
  - `core/optics.js`: `depthOfField`, `blurDisc`, `fieldOfView`, `FORMATS`, `STOPS`.
  - `core/color.js`: `kelvinToLinearSRGB`, `lightColor(K, wbK)`, `logC3Encode`, `acesFit`,
    `srgbEncode`.
  - `core/canvas.js`: `blurLayer` (with a no-`ctx.filter` fallback), `nGonPath`.
  - `core/gl.js` for WebGL2.
  - `core/presets.js` for lighting.
- **Linear light:** do the maths in linear light and encode to sRGB only at output.

The determinism test the checker runs: in `?record` mode, `__seek(t1)`, `__seek(t2)`, `__seek(t1)`
must give an identical sha256 of `canvas.toDataURL()`, and a fresh load must give the same hash.

## 3. Add a piece: checklist

1. **Piece.** Copy `assets/js/pieces/_template.js` to `assets/js/pieces/<id>.js`, then write `meta`
   and `create`. Every Motion Prompt number you use gets its licence line at the top (§4).
2. **Study page.** Copy `studies/_template.html` to `studies/<id>.html`. Change `<title>`, the meta
   description, the `<h1 data-stage-title>` and the import inside
   `runStage({ load: () => import('../assets/js/pieces/<id>.js') })`. Keep `[data-stage-host]`,
   `aside[data-controls]` and `[data-motion-toggle]`. All URLs stay relative: the site is served from
   `/Karan-Chaudhary/`.
3. **Study CSS** (if needed). Add `assets/css/study-<id>.css`, linked after `player.css`. Use tokens
   from `tokens.css`, never raw hex.
4. **Mount it on the home page.**
   - Add a `{ id, title, href: 'studies/<id>.html', blurb, credits }` entry to `studies` in
     `data/portfolio.js`.
   - Add the loader to `LOADERS` in `assets/js/site/main.js`: `<id>: () => import('../pieces/<id>.js')`.
   - Add a poster path to `POSTERS` once one is recorded.
   - Other surfaces use `mount(host, { load, mode, heavy, controls, poster, layout, fit, onEnd })`
     from `core/player.js`.
5. **Prompt.** Write `prompts/<id>.md` in the collection's block style:
   `<inputs>` `<direction>` (with `Banned:`) `<structure>` `<build>` `<gotchas>` `<start>`.
   Add it to `prompts/README.md`.
6. **Credits.** Add any new Motion Prompt ID to `THIRD-PARTY-NOTICES.md`.
7. **Verify.** Run `npm run check`. It covers static rules, then Chromium at 390 / 768 / 1440
   (screens in `.artifacts/screens/`), determinism, reduced motion and keyboard. Open the
   screenshots and look at them.
8. **Record.** `npm run record -- <id>`, and `npm run record:posters` for the committed poster.

## 4. Porting from Motion Prompt

The CLI is the only source of Motion Prompt code and numbers. Print them in your own session; never
write an element from its name or memory.

```sh
export MOTION_PROMPT_BASE=/path/to/motion-prompt/api/v1     # offline clone; omit to use the public API
MP=/path/to/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs
node $MP pick --pack camera        # let the owner choose in the gallery (or: search <words>)
node $MP get 27 33                 # spec + code, up to 8 IDs per call
node $MP kit camera                # the pack's shared constants and helpers
```

The `motion-prompt@motion-prompt` plugin, enabled in `.claude/settings.json`, carries the same CLI
and its own skill.

There are two ways to port, and the pack decides which:

- **Run the code** (camera and motion packs only). The code lives in
  `assets/js/vendor/motion-prompt/{camera,motion}.js`, one ES module per pack, because the kits share
  top-level names.
  - Keep every `// Motion Prompt #ID · MIT License …` line.
  - Tag every changed line `[mod]`, and list the change in the file header and in
    `THIRD-PARTY-NOTICES.md`.
  - Cells are `cell(ctx, w, h, u)` with `0 ≤ u < cycle`.
  - Remap colours with `Object.assign(C, palette)` before a draw, and fonts with `setFonts()`.
- **Numbers only** (lp, ui and photo packs). Rebuild the move with real events, or in your own
  rendering, and carry over its durations, easings and amounts.
  - Put the licence line as a comment at the top of the file that uses the numbers:
    `// Motion Prompt #ID · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#ID`.
  - In CSS, use `/* … */`. The checker fails any file that cites `Motion Prompt #ID` without the
    line.

In both cases, keep the timings, paths and easing as designed, and change only content and palette.
Web behaviours must respect reduced motion.

## 5. Recording and ffprobe

```sh
npm run record -- title --w 1920 --h 804 --fps 24             # → .artifacts/clips/title-1920x804-24.{mp4,webm} (git-ignored)
npm run record -- focus --params '{"stop":1.4}' --formats mp4,sheet
npm run record -- shotcard:027                                 # a film card's move in that film's palette
npm run record:posters                                         # media/studies/<id>/poster.{webp,jpg} (≤120 KB, committed)
npm run og                                                     # media/og/og-title.jpg + apple-touch icon
```

- **How it records.** The recorder serves the repo under `/Karan-Chaudhary/` and opens
  `studies/<id>.html?record&w&h&fps&seed&params&layout`. It waits for `READY`, then steps
  `__seek(i / fps)` and pipes PNG frames to ffmpeg. The output is H.264 yuv420p with an explicit
  BT.709 matrix and tags, faststart, plus VP9.
- **Refusals.** It refuses fallback fonts (`__meta.fontsOk`) and fails on any console or page error.
- **Test stills first.** Before a long render, `__seek` a few times (0, a mid-move frame,
  `posterTime`) and look at the stills.
- **Checking a clip.** `npm run check -- --media` probes the clips. To probe one by hand:

```sh
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate,color_space,color_primaries,color_transfer:format=duration \
  -of json .artifacts/clips/title-1920x804-24.mp4
```

Expect h264, yuv420p, even dimensions, the requested fps, a duration of `meta.duration` ±1 frame,
bt709 in all three tags, and `moov` before `mdat`.

## 6. Previs: a single source

`assets/js/core/presets.js` is the one lighting table. The Light study, its plan
(`ui/light-plot.js`), the site's Previs plans (`site/previs.js` → `ui/plot.js`) and the Unreal shot
list all read it. Lens and depth-of-field numbers come from
`core/optics.js`.

`tools/previs-shotlist.mjs` combines them with the Motion Prompt camera numbers (#027 #030 #031 #032
#033 #043) into `previs/shotlist.json`. Its conventions:

- Super 35 at 2048 × 858, 24 fps.
- Unreal axes in cm, with the subject at the origin facing −X.

After changing a preset or a shot:

```sh
npm run previs:shotlist     # regenerate (deterministic; check diffs it against generate())
npm run check
```

Never edit `shotlist.json` by hand. The Unreal side lives in `previs/README.md` and
`prompts/previs-unreal.md`. It runs locally, in Claude Code with the
`unreal-engine-skills-for-claude-code` plugin. Renders return through `npm run previs:encode`,
which writes `media/previs/<id>.mp4` and `.jpg` and prints the `previs.media` block for
`data/portfolio.js`.
