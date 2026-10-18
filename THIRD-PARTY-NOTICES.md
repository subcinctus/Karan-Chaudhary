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
  - ES module exports appended (`CELLS_BY_ID`, `MOTION`, `C`, `OPTS`, `TEXT5`, `setFonts`, …).

Site-level uses (palette remapped per film, content swapped, play-once-and-hold timing) are
documented in the files that call these modules.

### Numbers only (rebuilt, nothing vendored)

These elements' timings, easings and amounts were carried over and re-implemented with real events
or in other code; each file that uses them carries the element's licence line as a comment.

| ID | Element | Used in |
|---|---|---|
| #074 | Fade-in on scroll | <!-- TODO(integration): file --> |
| #079 | Scroll progress (timecode) | <!-- TODO(integration): file --> |
| #087 | Before/after wipe | <!-- TODO(integration): file --> |
| #089 | Film-leader preloader | <!-- TODO(integration): file --> |
| #092 | Shutter page transition | <!-- TODO(integration): file --> |
| #097 | Backlight | `assets/js/core/presets.js` |
| #098 | Rim light | `assets/js/core/presets.js` |
| #100 | Split light | `assets/js/core/presets.js` |
| #101 | Rembrandt light | `assets/js/core/presets.js` |
| #102 | Butterfly light | `assets/js/core/presets.js` |
| #105 | Bokeh | <!-- TODO(integration): file --> |
| #112 | Vignette | <!-- TODO(integration): file --> |
| #114 | Low-key | `assets/js/core/presets.js` |
| #115 | Black and white | <!-- TODO(integration): file --> |
| #117 | Teal and orange | <!-- TODO(integration): file --> |
| #118 | Film grain | `assets/js/core/grain.js` |

<!-- TODO(integration): confirm the final list and file paths once every piece has landed. -->

## Fonts (SIL Open Font License 1.1)

Served by Google Fonts; not redistributed in this repository.

- Cormorant Garamond — Christian Thalmann (Catharsis Fonts)
- Inter Tight — Rasmus Andersson and contributors
- IBM Plex Mono — IBM

Licence text: <https://openfontlicense.org/>

## Inspiration

The "film as code" approach (every frame a pure function `seek(t)`, recorded to video) was
inspired by **Awesome Opus 5.5 Videos** by yihui-dev (MIT) —
<https://github.com/yihui-dev/awesome-opus5-5-videos>. No prompts' outputs or media from that
collection are re-hosted on this site; the pieces here are original.

## Unreal Engine

The previs workflow refers to Epic Games' Unreal Engine and its Claude Code plugin
(`unreal-engine-skills-for-claude-code`). Neither is included in this repository; Unreal Engine is
subject to its own EULA.
