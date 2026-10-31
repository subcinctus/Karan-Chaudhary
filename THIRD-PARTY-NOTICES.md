# Third-party notices

This site's code is original except for the parts listed here. Placeholder content is marked
`placeholder: true` in `data/portfolio.js` and shows a "SAMPLE" tag on the site.

## Motion Prompt (MIT)

Motion Prompt by Shohei Ohtaki — <https://showheyohtaki.github.io/motion-prompt/> ·
<https://github.com/showheyohtaki/motion-prompt>

```
MIT License

Copyright (c) 2026 Shohei Ohtaki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Vendored code (run-the-code ports)

Printed with the Motion Prompt CLI (`kit` / `get`) and kept in one ES module per pack. Every
element block keeps its first line,
`// Motion Prompt #ID · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#ID`,
and each kit keeps its own licence line.

| File | Contents |
|---|---|
| `assets/js/vendor/motion-prompt/camera.js` | Camera kit (#025–048) + #027 Dolly in, #030 Orbit, #031 Crane up, #032 Dolly zoom, #033 Rack focus, #043 Whip pan |
| `assets/js/vendor/motion-prompt/motion.js` | Motion kit (#001–024) + #005 Mask reveal |
| `assets/js/core/time.js` | Kit helpers `P`, `eIO`, `eIOs`, `eOut`, `eOut5`, `eIn`, `backIn`, `backOut`, copied (formulas verbatim) from the motion (#001–024) and camera (#025–048) kits; both kit licence lines are at the top of the file |

Modifications (each changed line is tagged `[mod]` in the file; with the default palette and
content the rendered pixels are unchanged):

- **camera.js**
  - Palette `C` gains keys `vfMark`, `hudBg`, `hudInk`, `face`, `glass`, `vfLine`, `rec`, defaulting to the original literals.
  - White literals in `clear()`, `shot()` and `mkCanvasCached()` (`'#FFFFFF'` / `'#fff'`) → `C.card`.
  - Viewfinder line `'#8F8F94'` → `C.vfLine`, REC label `'#7D7D82'` → `C.rec`; centre mark, HUD pill and HUD text → `C.vfMark`, `C.hudBg`, `C.hudInk`.
  - `person()` face dot → `C.face`; car windows → `C.glass`.
  - Font constants `JP`, `EN`, `MONO` changed from `const` to `let` so `setFonts()` can use the site's stacks.
  - ES module exports appended (`CELLS_BY_ID`, `CAMERA`, `C`, `C_DEFAULT`, `resetPalette`, `setFonts`, `getFonts`).
- **motion.js**
  - Font constants `JP`, `DISP` changed from `const` to `let` (`setFonts()`).
  - `stage()` background fill made optional through `OPTS.stage`.
  - #005 sample words, font weight/size and tracking moved into `TEXT5` (defaults equal the originals); the top text's `'#fff'` → `C.white` (same value).
  - ES module exports appended (`CELLS_BY_ID`, `MOTION`, `C`, `OPTS`, `TEXT5`, `C_DEFAULT`, `TEXT5_DEFAULT`, `resetPalette`, `setFonts`, `getFonts`).

Where the vendored cells are used. Beyond the `[mod]` lines above (which, inside a cell, only turn
#005's sample text into the `TEXT5` data), no element's code is changed; the site files work only
through what the kits expose:

| Element | Used by | How |
|---|---|---|
| #005 Mask reveal | `assets/js/pieces/title.js` | The name reveal, played once to its hold. Content is swapped through the kit's own hooks only: the words, weight, size and tracking through `TEXT5`, colours through `C`, faces through `setFonts()`, and the stage fill turned off through `OPTS.stage`. |
| #027 #030 #031 #032 #033 #043 | `assets/js/pieces/shotcard.js` (real-time hover loop in `assets/js/ui/shotcard-mount.js`) | The shot-language cards. Each draw remaps the kit palette `C` to the film's palette, draws the cell and calls `resetPalette()` in the same synchronous call. The kit's viewfinder keys (corner marks, REC label, HUD pill) are set transparent and a quieter viewfinder is drawn on top; the kit's REC dot, drawn in the subject's colour, is clipped out. The kit's `ctx.filter` blur radii are scaled to the card size through a thin context proxy. The card is cropped to the film's aspect and played once and held. |

The same six camera moves are also the vocabulary of the Unreal previs. Their spec numbers
(distances, angles, timings, easing) are rebuilt in Unreal units by `tools/previs-shotlist.mjs`,
which carries their licence lines, into `previs/shotlist.json`.

### Numbers only (rebuilt, nothing vendored)

These elements' timings, easings and amounts were carried over and re-implemented with real events
or in other code. Each file that uses them carries the element's licence line as a comment.

| ID | Element | Used in |
|---|---|---|
| #002 | Staggered entrance | `assets/js/site/motion/reveals.js` (the per-item stagger, 0.06 s, without the back-out overshoot) |
| #005 | Mask reveal (page layer) | `assets/js/site/motion/text.js` (headings rise behind line masks, a rule grows, opacity never changes; re-timed). The vendored #005 cell itself runs only in the title piece. |
| #033 | Rack focus | `assets/js/pieces/focus.js` (1.6 s pull, cubic in-out, travelling corner brackets), `assets/js/pieces/title.js` (the name's focus-pull timing) |
| #073 | Parallax layers | `assets/js/site/motion/work.js`, `assets/css/motion.css` (one layer, at the strip's edges only: a picture crossing the window's edge is pushed in ≤ 1.04× and drifts ≤ 1.8 %; on screen it is shown whole), `assets/css/work.css` (the phones' scroll-driven gate wipe) |
| #074 | Fade-in on scroll | `assets/js/site/reveal.js`, `assets/css/site.css` (sharpened: 20 px, expo ease-out, once), `assets/js/site/motion/reveals.js` (desktop) |
| #075 | Sticky header hide/show | `assets/js/site/motion/nav.js`, `assets/css/motion.css`, `assets/css/transitions.css` (at a match cut, a header that had slid away slides back in) |
| #077 | Pinned horizontal strip | `assets/js/site/motion/work.js`, `assets/css/motion.css` (Selected work as a film strip on desktop), `assets/css/work.css` (the phones' scroll-driven gate wipe) |
| #079 | Scroll progress (timecode) | `assets/js/site/progress.js`, `assets/css/site.css` |
| #087 | Before/after wipe | `assets/js/pieces/colour.js`, `assets/js/ui/wipe.js`, `assets/css/film.css` (the film page's grade and previs wipes) |
| #089 | Film-leader preloader | `assets/js/site/preloader.js`, `assets/css/site.css` |
| #083 | Cursor follower | `assets/js/site/motion/cursor.js`, `assets/css/motion.css` (a viewfinder over pictures; the system cursor stays) |
| #084 | Magnetic button | `assets/js/site/motion/magnetic.js` (damped: 0.3, ≤ 12 px, no elastic) |
| #086 | Underline wipe | `assets/css/motion.css`, `assets/css/site.css` (in from the left, out to the right) |
| #092 | Shutter page transition | `assets/js/site/shutter.js`, `assets/css/site.css` (re-cut as a clip-path curtain with an intertitle) |
| #094 | Marquee band | `assets/js/site/motion/credits.js`, `assets/css/motion.css` (56 px/s, paused on hover and off screen) |
| #097 | Backlight | `assets/js/core/presets.js`, `assets/js/pieces/light.js`, `assets/js/pieces/light-shader.js` (the backlight veil, rebuilt as a lit haze), `tools/previs-bust.mjs` (its Unreal haze note) |
| #098 | Rim light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #100 | Split light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #101 | Rembrandt light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #102 | Butterfly light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #105 | Bokeh | `assets/js/pieces/focus.js`, `assets/js/pieces/still.js` |
| #112 | Vignette | `assets/js/pieces/title.js`, `assets/js/pieces/shotcard.js`, `assets/js/pieces/still.js` |
| #114 | Low-key | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #115 | Black and white | `assets/js/pieces/colour-grade.js` |
| #117 | Teal and orange | `assets/js/pieces/colour-grade.js` |
| #118 | Film grain | `assets/js/core/grain.js` (the speckle tiles); `assets/js/pieces/still.js` (static); `assets/css/tokens.css` (the static page grain; `assets/css/base.css` only uses its tokens); `assets/js/pieces/title.js` and `assets/js/pieces/shotcard.js` (re-seeded at 24 fps, a deviation: they are moving images; the cards only while the camera moves); `assets/js/pieces/colour-scene.js` and `assets/js/pieces/colour-grade.js` (modified: a speck on every pixel at 18 % of #118's opacity, quantised to 32 levels, instead of sparse squares) |

The lighting presets (#097 #098 #100 #101 #102 #114) also reach `previs/shotlist.json` through
`assets/js/core/presets.js`. The remaining pieces' text and prompts (`prompts/*.md`) cite Motion
Prompt IDs by name only. No other Motion Prompt element is used.

## Motion libraries (desktop layer)

Vendored as files (no CDN at runtime) and loaded only on fine-pointer screens ≥ 1024 px with motion
on, by `assets/js/site/motion/lib.js`. Hashes: `tools/vendor-manifest.json` (checked by
`npm run check`); provenance: `assets/js/vendor/gsap/README.md`, `assets/js/vendor/lenis/README.md`.

### GSAP 3.15.0 — GSAP Standard "No Charge" License

`assets/js/vendor/gsap/{gsap,ScrollTrigger,SplitText,CustomEase}.min.js`, byte-identical from the
`gsap@3.15.0` npm package, each with GreenSock's `@license` header intact.
Copyright 2026, GreenSock (Webflow). Subject to the terms at <https://gsap.com/standard-license>:
free to use, including commercially; the notices must stay in the files; the licence restricts only
tools that compete with Webflow's visual animation builder, which this site is not.

### Lenis 1.3.27 — MIT

`assets/js/vendor/lenis/lenis.mjs` (+ source map), byte-identical from the `lenis@1.3.27` npm
package; its licence file ships beside it (`assets/js/vendor/lenis/LICENSE`). Its stylesheet rules
are copied into `assets/css/motion.css`.

```
The MIT License

Copyright (c) 2024 darkroom.engineering

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the “Software”), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Fonts (SIL Open Font License 1.1)

Self-hosted: the pages load their type from this site (`assets/css/fonts.css`, files under
`assets/fonts/`), never from a font service. The files are byte-identical, **unmodified** copies of WOFF2
files from the npm packages below: only the latin and latin-ext files of the faces the site uses. Each
folder keeps its package's `LICENSE` (the copyright line below, then the full SIL Open Font License 1.1
text), and it is deployed with the fonts. Hashes: `tools/vendor-manifest.json` (checked by `npm run
check`); `tools/vendor-motion.mjs` re-fetches the packages and verifies them.

### Cormorant Garamond — @fontsource/cormorant-garamond 5.3.0 (OFL-1.1)

`assets/fonts/cormorant-garamond/`: 400, 500, 600 and 400 italic. The copyright line of its `LICENSE`, verbatim:

```
Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) CormorantGaramond-Italic[wght].ttf: Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)
```

### Inter Tight — @fontsource/inter-tight 5.3.0 (OFL-1.1)

`assets/fonts/inter-tight/`: 400, 500 and 600. The copyright line of its `LICENSE`, verbatim:

```
Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight) InterTight-Italic[wght].ttf: Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight)
```

### IBM Plex Mono — @fontsource/ibm-plex-mono 5.3.0 (OFL-1.1)

`assets/fonts/ibm-plex-mono/`: 400 and 500. The copyright line of its `LICENSE`, verbatim:

```
Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-ThinItalic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-ExtraLight.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-ExtraLightItalic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-Light.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-LightItalic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-Regular.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-Italic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-Medium.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-MediumItalic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-SemiBold.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-SemiBoldItalic.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-Bold.ttf: Copyright 2017 IBM Corp. All rights reserved. IBMPlexMono-BoldItalic.ttf: Copyright 2017 IBM Corp. All rights reserved.
```

IBM's own licence for IBM Plex (<https://github.com/IBM/plex/blob/master/LICENSE.txt>) opens with
`Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"`: "Plex" is a Reserved Font Name. The files
here are unmodified and keep their names, and no modified version of them is made or distributed.

Licence text: each folder's `LICENSE`, and <https://openfontlicense.org/>

## Inspiration: Awesome Opus 5.5 Videos

The "film as code" approach was inspired by **Awesome Opus 5.5 Videos** by yihui-dev:
<https://github.com/yihui-dev/awesome-opus5-5-videos>. The list is MIT-licensed. In this site, that
means:

- the approach is every frame a pure function `seek(t)`, recorded to video;
- the prompts in `prompts/` borrow the collection's block structure:
  `<inputs>` / `<direction>` / `<structure>` / `<build>` / `<gotchas>` / `<start>`;
- the videos and prompts in the collection belong to their creators. None of them, and none of their
  outputs or media, is copied, embedded or re-hosted here;
- every piece on this site is original.

## Unreal Engine and the Unreal Engine Skills plugin

The previs workflow (`previs/README.md`, `prompts/previs-unreal.md`, `.claude/settings.json`) uses
two things that are **not** included in this repository:

- **The Unreal Engine Skills for Claude Code plugin** by Epic Games:
  `unreal-engine-skills-for-claude-code@claude-plugins-official`, from Anthropic's official plugin
  marketplace. It is referenced by name in `.claude/settings.json` and installed by the user.
- **Epic Games' Unreal Engine.** It is subject to its own EULA.

The Motion Prompt plugin is also referenced in `.claude/settings.json` (marketplace
`showheyohtaki/motion-prompt`); it is not vendored. Any Unreal renders committed under
`media/previs/` are original output of this project's own previs scenes.
