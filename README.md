# Karan Chaudhary · Cinematographer

The portfolio site of Karan Chaudhary, director of photography. It is written for film-school
admissions and for people hiring a DP.

**Live:** <https://subcinctus.github.io/Karan-Chaudhary/>

None of the moving images on the site are video files. Each one is an original piece that the
browser renders live from code, where every frame is a pure function of time, `seek(t)`. The pieces
are:

- the main title;
- three studies (Focus, Light, Colour) that run on real lens, light and colour maths;
- the shot-language cards on each film;
- the previs plans.

The same code records frame-exact clips for applications.

The site is plain HTML, CSS and JavaScript modules. There is no build step and nothing to install
for the site itself.

---

## Quick start

You need [Node.js](https://nodejs.org/) 20 or newer. Nothing else is required to preview the site.

```sh
npm run serve
```

Then open <http://127.0.0.1:8080/Karan-Chaudhary/>. The local server mounts the site under the
same `/Karan-Chaudhary/` path GitHub Pages uses, so a broken link shows up here before it goes live.

## Make it yours: `data/portfolio.js`

Every word, film, still and link on the site comes from **one file**, `data/portfolio.js`. It is
commented throughout.

1. **Find what's left.** Search the file for `TODO(owner)`. Every field that still needs real
   information is marked.
2. **Replace the placeholders.** Records marked `placeholder: true` show a visible **SAMPLE** tag
   on the site. Replace the content, then set `placeholder: false`. Never add awards, festivals or
   collaborators that aren't real and confirmed.
3. **Write in the first person.** The bio and approach are in your voice: "I light for…".
4. **Add stills.** Put image files under `media/films/<slug>/`, then list them in that film's
   `stills`:
   ```js
   stills: [
     { src: 'media/films/untitled-short-01/still-01.jpg', alt: 'Two siblings at the workbench, window light', caption: 'Workshop, dusk', aspect: 2.39, featured: true },
   ],
   ```
   While `stills` is empty, the site draws procedural placeholder frames from the film's palette,
   labelled "PLACEHOLDER STILL". Use JPEG or WebP at about 2400 px wide.
5. **Add the reel.** Set `reel.provider` to `'vimeo'` or `'youtube'` and give its `id`, or use
   `'file'` and give a `src` such as `media/reel/reel.mp4`. Add a `poster`. The reel only loads when
   someone clicks play.
6. **Use relative paths everywhere.** Write `media/...`, never `/media/...`. The site lives in a
   sub-folder.
7. **Turn off the badges last.** Set `site.showPlaceholderBadges` to `false` only when nothing is
   placeholder any more.

Then run `npm run check`. It lists any remaining placeholders and catches broken paths.

## Deploy (GitHub Pages)

Deploys are automatic. Every push to `main` runs the checks in `.github/workflows/pages.yml`, then
publishes the site.

**One-time setup:** in the GitHub repo, go to **Settings → Pages → Build and deployment →
Source: GitHub Actions**. After that, the site is at
<https://subcinctus.github.io/Karan-Chaudhary/>.

Only the site ships. `tools/`, `prompts/`, `.claude/` and `previs/README.md` stay in the repo and
are never deployed.

## Record clips for applications

Applications often want a video file. The recorder renders any piece frame by frame, so no frame
is ever dropped:

```sh
npm run record -- title                           # the 7 s main title at its default size
npm run record -- title --w 1920 --h 1080 --fps 24
npm run record -- focus --seconds 12              # the Focus study's scripted demo
npm run record -- shotcard:027                    # a film card's camera move
npm run record:posters                            # refresh the posters the site shows
npm run og                                        # refresh the social-share image and app icon
```

- **Output.** Clips go to `.artifacts/clips/`, which is kept out of git. Each one is an H.264 MP4
  (BT.709, ready to upload) plus a WebM.
- **Requirements.** Recording needs **ffmpeg** and **Playwright with Chromium**:
  `npm i -D playwright@1.56.1 && npx playwright install chromium`, or a global install.
- **Help.** Run `node tools/record.mjs --help` for every option.

## Checks

```sh
npm test               # unit tests for the core maths (lens, colour, springs, PRNG)
npm run check:static   # links and paths, licences, data, SEO, previs sync, contrast (runs in CI)
npm run check          # all of the above plus Chromium
```

The full `npm run check` adds these Chromium checks, with screenshots at 390, 768 and 1440 px in
`.artifacts/screens/`:

- zero console errors;
- frame determinism;
- reduced motion;
- keyboard access.

## Previs (Unreal Engine)

The site's **Virtual production / Previs** section shows six shots, one for each camera move:

- **PV-010** dolly in
- **PV-020** rack focus
- **PV-030** orbit
- **PV-040** dolly zoom
- **PV-050** crane up
- **PV-060** whip pan

Each shot's lens, stop, focus, keyframes and lighting are in `previs/shotlist.json`. That file is
generated by `npm run previs:shotlist` from the same lighting presets and lens maths the studies
use.

Until the shots are rendered, the site shows a plan view of each one. To render them in your own
Unreal Engine project, follow **[`previs/README.md`](previs/README.md)**. It covers setup and
copy-paste prompts for Claude Code with the Unreal Engine plugin. After rendering:

1. Run `npm run previs:encode`.
2. Paste the block it prints into `previs.media` in `data/portfolio.js`.

The section then plays your renders.

## Claude Code: plugins and skills

This repo is set up to keep building with [Claude Code](https://claude.com/claude-code):

- **`.claude/settings.json`** enables two plugins:
  - **Motion Prompt**, the named library of camera and motion moves, with its CLI;
  - **Unreal Engine Skills**, which only does anything inside an Unreal project.
- **`.claude/skills/code-cinema/`** teaches Claude this site's conventions:
  - the piece contract and the determinism rules;
  - the checklist for adding a new study;
  - how to port a Motion Prompt move;
  - how to record and verify.

  Ask for a new piece in plain words ("a study of shutter angle and motion blur"), and the skill
  takes care of the structure.
- **`prompts/`** holds the prompt behind every piece. See [`prompts/README.md`](prompts/README.md).

## Credits and AI disclosure

- **Code.** Every piece was written with **Claude Opus 5.5**. The concept, shot design, and lens
  and lighting choices are Karan Chaudhary's.
- **Motion Prompt.** Camera moves and the title reveal are ported from
  [Motion Prompt](https://showheyohtaki.github.io/motion-prompt/) by Shohei Ohtaki (MIT). Its move
  numbers (#027 dolly in, #101 Rembrandt light, …) are used throughout.
- **Inspiration.** The "film as code" approach was inspired by
  [Awesome Opus 5.5 Videos](https://github.com/yihui-dev/awesome-opus5-5-videos). Nothing from that
  collection is used on the site.
- **Fonts.** Cormorant Garamond, Inter Tight and IBM Plex Mono (SIL Open Font License), via Google
  Fonts.
- **Full list.** See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

**For admissions and applications.** Many schools ask how AI was used, so say it plainly. The site
does this in its colophon (`colophon` in `data/portfolio.js`; check that it matches how you
worked):

- **AI-assisted:** the generative pieces on this site, which are code written with an AI model.
- **Yours alone:** your films, stills and reel.

Keep the two clearly separate. When you submit a recorded clip of a study, label it as a
code-rendered study, not as footage. Follow each school's own policy where it is stricter.
