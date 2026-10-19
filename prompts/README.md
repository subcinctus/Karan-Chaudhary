# Prompts

Every moving image on this site is a small program: each frame is a pure function of time,
`seek(t)`. There is one prompt per piece, for **Claude Opus 5.5**. Each is a cleaned-up, reusable
version of how its piece was specified and built with Claude Opus 5.5, written alongside the code
(not a verbatim transcript of the original instructions); running it again should produce a
comparable piece.

They are kept here so the site is open about how it was made and so the work can be repeated. The
owner can reuse a prompt to make a new study in the same language.

| Prompt | What it makes | Motion Prompt moves |
|---|---|---|
| [`title-sequence.md`](title-sequence.md) | The 4.5-second main title: an iris opens onto practicals and the name reveals. | #005 · #033 · #112 · #118 |
| [`focus-study.md`](focus-study.md) | The Focus study: depth of field and bokeh through a real lens. | #033 · #105 |
| [`light-study.md`](light-study.md) | The Light study: a plaster bust under classic portrait set-ups. | #097 · #098 · #100 · #101 · #102 · #114 |
| [`colour-study.md`](colour-study.md) | The Colour study: a LogC frame graded to finished looks, with scopes. | #087 · #115 · #117 · #118 |
| [`shot-language.md`](shot-language.md) | The shot-language cards (film cards that perform their move) and the procedural stills. | #027 · #030 · #031 · #032 · #033 · #043 · #105 · #112 · #118 |
| [`site-web-behaviour.md`](site-web-behaviour.md) | Film-leader preloader, shutter transition, reveal on scroll, timecode progress. | #089 · #092 · #074 · #079 |
| [`previs-unreal.md`](previs-unreal.md) | The local Unreal Engine session that blocks, lights and renders the six previs shots. | #027 · #030 · #031 · #032 · #033 · #043 |

## How they are written

The prompts follow the block structure used by the strongest prompts in the
[Awesome Opus 5.5 Videos](https://github.com/yihui-dev/awesome-opus5-5-videos) collection:

- **`<inputs>`** lists what to ask for, each with a default, so the prompt runs even if nobody
  answers.
- **`<direction>`** sets the look and the maths. It cites the camera moves by Motion Prompt ID and
  ends with a **Banned:** list. Restraint is the house style: no glitch, shake, particles, neon,
  bouncy easing, light leaks or flare clichés.
- **`<structure>`** is a seconds-by-seconds table of the timeline.
- **`<build>`** describes one module. `seek(t)` must stay pure, and the block says which core
  helpers to reuse, how to print Motion Prompt numbers with its CLI, and the record command. It
  always ends with "check stills before the full render".
- **`<gotchas>`** lists what went wrong, so the next run avoids it.
- **`<start>`** says what to read first and the first thing to show.

## Reusing a prompt

1. Open Claude Code in this repository. The `code-cinema` skill in `.claude/skills/` is picked up
   automatically. It holds the piece contract, the determinism rules and the add-a-piece checklist.
2. Copy a prompt, paste it in, then change `<inputs>` and `<direction>` for the new idea. Keep
   `<build>` and `<gotchas>`: they encode the contract and the lessons.
3. Let it ask its questions, then check the stills it sends before it renders anything long.
4. Finish with `npm run check`, then record with `npm run record -- <id>`.

To make a new piece from scratch, ask for it in plain words ("a study of how shutter angle changes
motion blur"). The skill takes care of the structure.

## Credits

- **Inspiration:** [Awesome Opus 5.5 Videos](https://github.com/yihui-dev/awesome-opus5-5-videos)
  by yihui-dev (MIT list), the collection that showed films written as code. The prompts' block
  structure is modelled on its best entries. These prompts are original; nothing from the
  collection is copied here or re-hosted on the site, and every video and prompt in it belongs to
  its creator.
- **Move names and numbers:** [Motion Prompt](https://showheyohtaki.github.io/motion-prompt/) by
  Shohei Ohtaki (MIT). The `#ID`s above are its element numbers. Code vendored from it, and the
  licence, are listed in [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).
- **Concept, shot design, lens and lighting choices:** Karan Chaudhary.
