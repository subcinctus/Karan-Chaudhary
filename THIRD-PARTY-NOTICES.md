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
  - ES module exports appended (`CELLS_BY_ID`, `MOTION`, `C`, `OPTS`, `TEXT5`, `C_DEFAULT`, `TEXT5_DEFAULT`, `resetPalette`, `setFonts`, `getFonts`).

Where the vendored cells are used:

| Element | Used by |
|---|---|
| #005 Mask reveal | `assets/js/pieces/title.js` (the name reveal, played once to its hold) |
| #027 #030 #031 #032 #033 #043 | `assets/js/pieces/shotcard.js` (the shot-language cards: palette remapped per film, cropped to the film's aspect, played once and held) |

The same six camera moves are also the vocabulary of the Unreal previs. Their spec numbers
(distances, angles, timings, easing) are rebuilt in Unreal units by `tools/previs-shotlist.mjs`,
which carries their licence lines, into `previs/shotlist.json`.

### Numbers only (rebuilt, nothing vendored)

These elements' timings, easings and amounts were carried over and re-implemented with real events
or in other code. Each file that uses them carries the element's licence line as a comment.

| ID | Element | Used in |
|---|---|---|
| #074 | Fade-in on scroll | `assets/js/site/reveal.js`, `assets/css/site.css` |
| #079 | Scroll progress (timecode) | `assets/js/site/progress.js`, `assets/css/site.css` |
| #087 | Before/after wipe | `assets/js/pieces/colour.js` |
| #089 | Film-leader preloader | `assets/js/site/preloader.js`, `assets/css/site.css` |
| #092 | Shutter page transition | `assets/js/site/shutter.js`, `assets/css/site.css` |
| #097 | Backlight | `assets/js/core/presets.js`, `assets/js/pieces/light.js`, `assets/js/pieces/light-shader.js` |
| #098 | Rim light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #100 | Split light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #101 | Rembrandt light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #102 | Butterfly light | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #105 | Bokeh | `assets/js/pieces/focus.js`, `assets/js/pieces/still.js` |
| #112 | Vignette | `assets/js/pieces/title.js`, `assets/js/pieces/shotcard.js`, `assets/js/pieces/still.js` |
| #114 | Low-key | `assets/js/core/presets.js`, `assets/js/pieces/light.js` |
| #115 | Black and white | `assets/js/pieces/colour-grade.js` |
| #117 | Teal and orange | `assets/js/pieces/colour-grade.js` |
| #118 | Film grain | `assets/js/core/grain.js`, `assets/js/pieces/title.js`, `assets/js/pieces/colour-grade.js`, `assets/js/pieces/colour-scene.js`, `assets/js/pieces/shotcard.js`, `assets/js/pieces/still.js` |

The lighting presets (#097 #098 #100 #101 #102 #114) also reach `previs/shotlist.json` through
`assets/js/core/presets.js`. #033 Rack focus also appears as numbers in
`assets/js/pieces/focus.js` and `assets/js/pieces/title.js`. The remaining pieces' text and prompts
(`prompts/*.md`) cite Motion Prompt IDs by name only.

## Fonts (SIL Open Font License 1.1)

Served by Google Fonts; not redistributed in this repository.

- Cormorant Garamond — Christian Thalmann (Catharsis Fonts)
- Inter Tight — Rasmus Andersson and contributors
- IBM Plex Mono — IBM

Licence text: <https://openfontlicense.org/>

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
