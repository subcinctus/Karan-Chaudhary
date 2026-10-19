# Site web behaviour: leader, shutter, reveal, timecode

The prompt behind the site shell's four behaviours: `assets/js/site/preloader.js`, `shutter.js`,
`reveal.js` and `progress.js`, plus the hero / intro logic in `main.js`. It is written for Claude
Opus 5.5 in the collection's block style. Paste it into a Claude Code session opened in this
repository. The timings come from Motion Prompt (MIT, Shohei Ohtaki). They are used as numbers only,
rebuilt with real browser events: **#089** Preloader, **#092** Page transition, **#074** Fade-in on
scroll and **#079** Scroll progress bar.

---

<inputs>
Ask me for these, and use the default when I don't answer:
- Preloader. Default: a film-leader countdown, shown on the first visit in a session only.
- Page transition. Default: a shutter panel for internal page links only.
- Scroll reveal. Default: on for section heads, cards, study heads and previs slots.
- Progress. Default: a tungsten bar along the top and a mono timecode readout in the header.
  The full page maps to `site.timecodeRuntime` seconds (180) at 24 fps.
</inputs>

<direction>
These are a web page's manners, not effects. A reader should notice the leader once and then forget
about the rest.

- **#089 leader.** Before you write it, print the spec: `node $MP get 89`.
  - The count runs 0→100 % over 0.25–2.1 s, cubic ease-out. Leader numerals are `8 − floor(p·7)`
    in Cormorant, with a sweep wedge at `(7p mod 1)·360°` behind them.
  - A 180×4 bar fills in tungsten.
  - The screen lifts with `translateY(−100%)` over 2.3–2.85 s, `cubic-bezier(.65,0,.35,1)`.
  - The page under it fades in and rises 14 px over 2.35–2.95 s, `cubic-bezier(.33,1,.68,1)`.
  - Every time is measured from navigation start. It lifts at 2.85 s whether or not anything has
    loaded, and never waits on the network. Esc lifts it at once. It is `aria-hidden`.
- **#092 shutter.** `node $MP get 92`.
  - An ink panel with a 2 px tungsten leading edge and the "K·C" monogram enters from the left over
    0.4 s (eIO). The page navigates while it covers the screen.
  - The next page starts covered (a sessionStorage flag read by an inline `<head>` script before
    first paint) and exits to the right over 0.45 s.
  - It runs on same-origin `.html` links only. It never runs for in-page anchors, modifier keys,
    `target`, `download` or media files.
  - A `pageshow` with `persisted` (back/forward cache) uncovers the page at once.
- **#074 reveal.** `node $MP get 74`.
  - An IntersectionObserver with `rootMargin: 0px 0px -15% 0px` (the 85 % line).
  - Opacity 0→1 and translateY 28 px→0 over 0.7 s, cubic ease-out. Items in a row move together.
  - An element that leaves through the bottom of the view resets and plays again next time.
  - The hidden state exists only under `html.reveal-on`, which the module adds after it has shown
    everything already above the line. Without JS nothing is hidden.
- **#079 progress.** `node $MP get 79`.
  - A 6 px bar along the top of the viewport: a faint paper track and a tungsten fill.
  - The fill is the scroll fraction, using `animation-timeline: scroll(root)` with a rAF fallback.
  - The readout is `TC hh:mm:ss:ff`, computed as fraction × runtime at 24 fps.
- **Intro.**
  - The main title (`pieces/title.js`, 4.5 s) plays once per session. It is the only intro: the
    film leader is off by default (it would stack a second countdown in front of the name).
  - Skip intro, Esc, the first scroll or an arrival on a `#hash` resolves it, using the Player's
    `skip()`, which is queued if the piece is still loading.
  - The header and CTA wait at opacity 0 while it plays but stay reachable by keyboard.
  - A failed piece ends the intro, and the DOM `<h1>` under the canvas is then the hero.
  - "Replay titles" sits in the colophon.

Under reduced motion or the site's Motion off toggle, all four behaviours are off. There is no
leader, no shutter and no reveal, the progress bar and timecode are hidden, and the hero shows the
resolved last frame.

Banned: scroll hijacking, parallax, cursor followers, magnetic buttons, bouncy easing, glitch,
noise wipes, anything that hides content until JS runs, and a preloader that waits for "load".
</direction>

<structure>
| t (s) from navigation start | First visit |
|---|---|
| 0 | `<head>` script: `html.is-preloading` (not under reduced motion, not with a `#hash`) |
| 0.25–2.1 | Leader count 8 → 1, bar 0 → 100 % |
| 2.3 | Lift begins; `title.play()` |
| 2.3–2.85 | Leader lifts away |
| 2.35–2.95 | Hero fades in and rises 14 px |
| 2.3–9.3 | Main title; header and CTA fade in on `onEnd` |
</structure>

<build>
- Plain ES modules, no dependencies. Site code may use clocks (`performance.now`, rAF, WAAPI).
  Pieces may not.
- Each module starts with its element's licence line:
  `// Motion Prompt #089 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#089`
- Read motion through `core/motion-pref.js` (`isReducedMotion`, `onMotionChange`). Bind every
  `[data-motion-toggle]` with `bindMotionToggle`.
- Every URL is relative. The site lives under `/Karan-Chaudhary/`.
- Check it in Chromium through `tools/lib/server.mjs`:
  - On a first visit the leader shows, then the intro plays, then the intro is done. A reload in
    the same session skips both.
  - Esc skips both.
  - Under reduced motion `document.getAnimations()` is empty, nothing is hidden and every Player is
    `static`.
  - A card click covers the page, then the project page uncovers. Back is never left covered.
  - There is no horizontal overflow at 390 px.
</build>

<gotchas>
- A `display` rule on `.btn` overrides the `hidden` attribute. Keep `[hidden]{display:none!important}`.
- Fixed and sticky layers look wrong in a full-page screenshot. Review the page one viewport at a
  time, scrolling as a reader does.
- An IntersectionObserver never sees an element the page jumps past. That is fine for lazy
  Players, but do not rely on it to show content. Elements above the 85 % line are shown on scan.
- Content rendered from data after load breaks the browser's own jump to `#hash`, so scroll to it
  again once rendered.
- The shutter flag must be removed by the arriving page, not on `pagehide`, which fires after it
  is set.
</gotchas>

<start>
Print the four specs with the CLI, then build `reveal.js` first, because it touches the most
content. Build the preloader last and check it at 1.6 s and 3.1 s after navigation.
</start>
