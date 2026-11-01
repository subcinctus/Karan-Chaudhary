# Karan Chaudhary · Cinematographer

The portfolio site of Karan Chaudhary, director of photography. It is written for film-school
admissions and for people hiring a DP.

**Live:** <https://subcinctus.github.io/Karan-Chaudhary/>

The site's own moving images are not video files. Each one is an original piece that the browser
renders live from code, where every frame is a pure function of time, `seek(t)`. The pieces are:

- the main title;
- three studies (Focus, Light, Colour) that run on real lens, light and colour maths, each labelled
  "Interactive study · code written with AI assistance · not camera work";
- the camera move each film card performs on its frame grab (and the shot-language diagrams on
  `studies/shotcard.html`);
- the previs plans.

The same code records frame-exact clips for applications. Camera footage comes in only when you add it:
your reel (Vimeo, YouTube or a video file), a film's hover preview and the previs renders.

The site is plain HTML, CSS and JavaScript modules. There is no build step and nothing to install
for the site itself.

**Applying to film school?** Read **[`APPLYING.md`](APPLYING.md)**. It covers each school's
requirements (with sources), what people hiring a DP look for, a checklist from each requirement to
the field that fills it, and how to export your photographs as a PDF.

---

## Quick start

You need [Node.js](https://nodejs.org/) 20 or newer. Nothing else is required to preview the site.

```sh
npm run serve
```

Then open <http://127.0.0.1:8080/Karan-Chaudhary/>. The local server mounts the site under the
same `/Karan-Chaudhary/` path GitHub Pages uses, so a broken link shows up here before it goes live.

## Make it yours: `data/portfolio.js`

Every film, still, photograph, link and every word written in your voice comes from **one file**,
`data/portfolio.js`. It is commented throughout, and its header holds a worked example of a film with
every field filled in. (The fixed interface copy, such as section ledes, button labels and the study
pages' explanations, lives in the page templates and is written in neutral third person, so it never
speaks for you.)

1. **Find what's left.** Search the file for `TODO(owner)`. Every field that still needs real
   information is marked.
2. **Replace the placeholders.** Records marked `placeholder: true` show a visible **SAMPLE** tag
   on the site. Replace the content, then set `placeholder: false`. Never add awards, festivals,
   collaborators, references or AI-use statements that aren't real and confirmed.
3. **Write in the first person.** The bio and approach are in your voice: "I light for…".
4. **Add stills.** Run `node tools/stills.mjs <slug> <frame…> [--start N] [--out dir] [--dry-run]`.
   - **What it writes.** For each frame (any image ffmpeg reads) it writes
     `media/films/<slug>/still-NN.jpg` at 2800 px (never upscaled) and `still-NN-1400.jpg`. It then
     prints a ready-to-paste `stills` block: `src`, `srcset`, `aspect`, a six-colour palette, and `alt`
     and `line` left for you to write.
   - **Fill in each still:**
     ```js
     stills: [
       { src: 'media/films/the-long-evening/still-01.jpg',
         srcset: ['media/films/the-long-evening/still-01-1400.jpg 1400w', 'media/films/the-long-evening/still-01.jpg 2800w'],
         alt: 'Two siblings at the workbench, window light', aspect: 2.39,
         line: 'Sc.04 · 40 mm · T2.0 · EI 800 · 2.39:1 · INT. NIGHT', featured: true },
     ],
     ```
   - **How stills show.**
     - Every frame is shown whole at its own aspect, with its camera `line` and palette chips under it.
       It opens in a full-screen lightbox: ← → Home End, `i` for info, Esc to close.
     - The `featured` still leads the film page and is the film's card on the home page, where the card
       performs the film's camera move on it. The second still is where a `#043` whip pan lands.
     - Optionally tell the move where the subject is, as fractions of the frame:
       `focus: [[0.62, 0.4], [0.3, 0.6]]` (subject, then the rack-focus target).
   - **Until you add stills,** the site draws procedural placeholder frames from the film's palette,
     labelled "PLACEHOLDER STILL".
5. **Fill in the credits and facts.** These rows stay hidden until you fill them, so nothing is ever
   claimed for you. The schools ask for them (see `APPLYING.md`).

   | Field | What it says | Where it shows |
   |---|---|---|
   | `kind` | `'fiction'`, `'documentary'`, `'music-video'`, `'commercial'`, `'experimental'` or `'exercise'` | Classifies the film |
   | `madeAt` | `{ type: 'school' \| 'independent' \| 'commissioned', name?, note? }` | Film page: "Made at" |
   | `aiUse` | `'none'`, or your own words about what AI did on the film | Film page: "AI use" |
   | `operated`, `lit` | `true` when you operated the camera / designed the lighting | Film page credits: you as camera operator and lighting designer |
   | `crew` | `[{ role, name }]`, real names only (a `null` name never shows) | Film page credits, after "Photographed by" |
   | `premiere`, `awards` | `{ event, year, url? }` / `[{ title, event, year, url? }]`, real and confirmed only | Film page laurels; the Index view's Premiere column |
   | `references` | `[{ title, year?, dp?, note? }]`, text only, never images | Film page: References |
   | `person.tenFilms` | Your own list of up to 10 films, text only | About: "Ten films" |

   **Credit roles.** The credits put "Photographed by" first, then the director, then these roles, in
   this order (the role names are matched case-insensitively): Director of Photography (or Cinematographer,
   DP); Camera operator (or Operator); Lighting (or Lighting designer, Lighting design); Gaffer; Colourist
   (or Colorist); Production designer. Any other role follows, as you wrote it.
6. **Show a scene, and how you lit it.** A film's `sequences` show one scene in 3–8 frames in edit order,
   each with one line of intent, and an "In hindsight" line. Its `lightingPlot` is a top view of one
   set-up beside its frame: camera, lights (role, angle, height, distance, Kelvin), practicals and the
   motivation.
   - The first two films carry a sample plot and the first a sample scene, each with its own "Sample"
     badge. They show the format.
   - When you mark a film real, replace those blocks or delete them: the check fails while a sample
     block sits inside a real film.
   - `grade` (log and final frames) and `previsCompare` (previs and final) add a draggable before/after.
     Each one shows only once both of its frames are real.
7. **Add a hover preview** (optional): `preview: { src: 'media/films/<slug>/preview.mp4' }`.
   - The clip: a few seconds of the film, muted H.264, about 800 px wide, 4–6 s, 2 MB at most.
   - It plays on the work card when a mouse rests on it or the keyboard focuses it.
   - The card then shows its still without the camera move.
   - It never plays under reduced motion, Motion off or Save-Data.
8. **Add the reel.** Set `reel.provider` to `'vimeo'`, `'youtube'` or `'file'`, then:
   - **Point to the video.** Give its `id` (an unlisted Vimeo link also needs its `hash`: in
     `vimeo.com/123456789/abcdef1234` the id is `123456789` and the hash is `abcdef1234`), or a `src`
     such as `media/reel/reel.mp4`.
   - **Label it.** Add a `poster`, the `runtime` (3:00 at most; 1:00–2:30 reads best), `updated`
     (`'YYYY-MM'`, shown as "Reel 2026 · updated October 2026") and `uploadDate` (`'YYYY-MM-DD'`).
   - **What the site does with them.**
     - The reel only loads when someone presses play.
     - With a poster and an upload date, search engines get a `VideoObject` with a key moment for each
       shot.
     - Until a reel is set, the reel section and its links are left out, and the hero's button leads to
       Selected work.
   - **The shot index:** `shots: [{ t: '0:41', film: '<slug>', lens: '40 mm', note: 'one line',
     thumb: 'media/reel/shots/041.jpg' }]`.
     - List the shots in reel order, inside the runtime.
     - The `thumb` is your own frame from that shot. Without one, the tile uses the film's real featured
       still, never a procedural one.
     - Each tile plays the reel from its time. `index.html?t=41#reel` opens the reel ready to play from
       0:41.
   - **Sound and captions.**
     - `dialogue: false` adds "No dialogue — instrumental".
     - `captions: { lang: 'en', label: 'English' }` asks Vimeo (`texttrack`) or YouTube
       (`cc_load_policy`, `cc_lang_pref`) to show your captions. A video file also takes
       `src: 'media/reel/reel.en.vtt'`.
9. **Add your photographs**: your own still photography, never frames from a film. See
   [Photographs and print](#photographs-and-print).
10. **Use relative paths everywhere.** Write `media/...`, never `/media/...`. The site lives in a
    sub-folder.
11. **Turn off the badges last.** Set `site.showPlaceholderBadges` to `false` only when nothing is
    placeholder any more.

Then run `npm run check`. It lists any remaining placeholders and catches broken paths. After editing
the data, also run `npm run prerender` (next section), or let CI do it.

## Static pages for crawlers: `npm run prerender`

The pages are rendered from `data/portfolio.js` in the browser. A text-only fetch (a search engine that
runs no JavaScript, a link preview, an AI crawler) or a visitor without JavaScript would see only an
empty page.

`tools/prerender.mjs` runs the same renderers in Node and writes their output into the pages, between
`<!-- prerender:NAME -->` and `<!-- /prerender:NAME -->` comment markers. It writes:

- **The home page:** the header and menu, the reel, Selected work (with the index table), Photographs,
  the studies, previs, About, Kit, the Filmography credits, Contact and the colophon.
- **`project.html`:** a filmography that links every film.
- **`photographs.html`:** its photographs.

It also writes the JSON-LD (Person, WebSite, a list of the real films, the reel's `VideoObject`) and
`sitemap.xml` (the home page, `photographs.html` once it has photographs, and the films marked real).
The scripts then render the same markup again, so nothing moves.

```sh
npm run prerender                        # rewrite the pages and sitemap.xml in place
node tools/prerender.mjs --check         # change nothing; exit 1 when a file is out of date
node tools/prerender.mjs --out _site     # write into a staged copy (CI)
```

You don't have to remember it. If you edit `data/portfolio.js` in GitHub's web editor, CI regenerates
everything into the deployed copy, so the live site always matches the data. The check only warns
("stale") when the committed pages are behind.

## Photographs and print

Some schools ask for still photography, kept apart from film frames: AFI, NYU, FAMU, AFAD Łódź and
the Beijing Film Academy each want a different set (`APPLYING.md` has the numbers and sources).

**Adding photographs.** Add them in series to `photographs` in `data/portfolio.js`:

```js
photographs: {
  captions: false,                 // true shows each caption on the page
  series: [{
    title: 'Series title', year: 2026, kind: 'colour',          // or 'bw'
    photos: [{ src: 'media/photographs/series/01.jpg', alt: 'What the photograph shows', w: 2400, h: 1600,
               portrait: true, caption: 'optional', sets: ['afi', 'nyu', 'famu', 'lodz', 'bfa'] }],
  }],
},
```

- **The pages.** Once a series has a photograph, the home page shows a Photographs section (the series
  and up to six photographs) with a link to **`photographs.html`**. The page shows every series under
  its title, year and a Colour or B&W tag, each photograph whole at its own aspect, in two columns from
  900 px.
- **Sets for each school.** `photographs.html?set=afi` (or `nyu`, `famu`, `lodz`, `bfa`) keeps the
  photographs tagged for that school. `?captions=1` adds the captions; `?cover=1` adds a cover page
  (your name, contact and series).
- **Print and PDF.** In print, each photograph takes a page of its own inside 12 mm margins, with
  nothing else on the paper. **Print / Save as PDF** loads every photograph first, then opens the print
  dialog, so saving as PDF makes the one-photograph-per-page file the schools ask for. `APPLYING.md`
  walks through the export.
- **While there are none.** With no photographs the section and its menu link stay hidden, and
  `photographs.html` says "No photographs yet." and asks search engines not to index it.
- **What the checks do.** The data check counts each set against its school and warns above 13 MB of
  images. It fails a photograph that is also a film frame, and a photograph marked as a sample.
- **Printing the home page.** It prints as a clean filmography: the index table, About, the credits and
  Contact, in black on white.

## Selected work: Frames and Index

Selected work has two views, switched by the **Frames | Index** buttons in its heading. The choice is
remembered in the browser (`localStorage` key `kc:work-view`).

- **Frames** is the film strip of cards. On a desktop it is pinned and scrolls sideways.
- **Index** is a credits-style table: No · Year · Title · Director · Production / Platform · Format ·
  Aspect · Camera / Lens · Premiere.
  - Narrower screens show fewer columns. Print shows all of them, and so does the page without JavaScript
    from 1100 px.
  - From 1100 px a preview pane shows the hovered or focused film's frame, letterboxed, never cropped.

## Page transitions

On a desktop or phone browser that supports cross-document view transitions (Chrome and Edge 126+,
Safari 18.2+), clicking a work card carries its frame into the film page's lead frame while the rest of
the page fades through black (`assets/js/site/match-cut.js`, `assets/css/transitions.css`).

- Other browsers keep the curtain transition (`assets/js/site/shutter.js`).
- The film page holds its first paint until the film is rendered only when a card has handed its frame
  over (`sessionStorage` `kc:vt`), so the cut lands on it; any other arrival paints the header at once.
- There is no transition at all under reduced motion or the site's **Motion off**.
- Film pages are fetched ahead as the pointer settles on a link (speculation rules, prefetch only).

## Deploy (GitHub Pages)

Deploys are automatic. Every push to `main` runs `.github/workflows/pages.yml`:

1. **Tests.** The unit tests and the static checks run.
2. **Staging.** An explicit list of files is copied into `_site`: the pages (`index.html`,
   `project.html`, `photographs.html`, `404.html`), `assets`, `data`, `studies`, `media`,
   `site.webmanifest`, `THIRD-PARTY-NOTICES.md` and `previs/shotlist.json`.
3. **Prerender.** `tools/prerender.mjs --out _site` writes the static content, JSON-LD and sitemap into
   the staged copy.
4. **Publish.** A separate deploy job, which runs no repository code, publishes `_site`.

**One-time setup:** in the GitHub repo, go to **Settings → Pages → Build and deployment →
Source: GitHub Actions**. After that, the site is at
<https://subcinctus.github.io/Karan-Chaudhary/>.

Only the site ships. `tools/`, `prompts/`, `.claude/`, `previs/README.md`, the test fixtures and the
Unreal PNG sequences stay in the repo and are never deployed.

## Record clips for applications

Applications often want a video file. The recorder renders any piece frame by frame, so no frame
is ever dropped:

```sh
npm run record -- title                           # the 4.5 s main title at its default size
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
- **Labelling.** A recorded study is code-rendered, not footage: label it as on the site ("Interactive
  study · code written with AI assistance · not camera work"). `APPLYING.md` explains why.

## Checks

```sh
npm test               # unit tests: core maths, the renderers, prerender, fonts, reel, photographs, tooling
npm run check:static   # links and paths, licences, vendored files and fonts, data, SEO, contrast, plugins (CI)
npm run check          # all of the above plus Chromium
```

The full `npm run check` adds these Chromium checks, with screenshots at 390, 768, 1440 and
1920 px in `.artifacts/screens/` (`--desktop` swaps in 1440, 1512@2x, 1728@2x, 1920 and 2560):

- zero console errors;
- frame determinism;
- reduced motion;
- keyboard access;
- the desktop motion layer: anchors land and move focus, keyboard focus stays on screen in the
  pinned work strip, the strip counter reads 01…06, a sideways swipe moves the strip, the pinned
  strip fits 1366×768 to 2560×1440, credits between the masks are fully opaque, every reveal plays,
  "Motion off" reverts it all (no inline styles left), the visitor keeps their place through
  resizes to 1366 and 1100 px, across 1024 px and Motion off/on, phones never load it.

**Check plugins.** Each file in `tools/checks/` adds a section to both runs:

| Section | Static (also in CI) | In Chromium |
|---|---|---|
| `honesty` | No laurels on sample films; no sample block inside a real film; every study labelled; the colophon discloses AI use; no model identifiers in the repo; no fixture paths or names deployed; no autoplay with sound; the pointer never hidden | |
| `seo-static` / `static-content` | Prerender markers present and in sync; the static home page reads as text (name, role, every film, "Filmography", the email); JSON-LD; speculation rules prefetch only; the sitemap | Without JavaScript the titles and email show; no layout shift when the scripts re-render or the desktop layer arms, from the top or arriving on a section (`index.html#contact` lands under the header); a visitor who scrolls away from the arrival stays where they went; a key pressed during the arrival's hold shows the page |
| `fonts` | No Google font hosts; every face vendored and hashed; faces cover the CSS and every piece; at most 3 preloads | No Google requests; the faces load within 3 s and every preload is used |
| `film` | Film page markup holds only safe links; its module preloads exist (the placeholder still's painter among them) | No frame cropped; credits; the plot's title and description, its two columns ending together; the lead frame on a short window; the lightbox (keys, focus, info panel, swipe); seed parity; the filmography when the film's scripts fail |
| `work` | The index table and the toggle | Frames ↔ Index, every row on the first screen; the preview pane; rack focus on hover only; keyboard and focus rings; print; hover previews |
| `reel` | Safe player links; no `modestbranding` | Hidden without a reel; the shot index seeks; captions; Vimeo and YouTube player addresses; `?t=` |
| `transitions` | `@view-transition` only without reduced motion; under 0.8 s | The match cut; Motion off and reduced motion; the curtain fallback |
| `photographs` | The page, its empty state and noindex; the renderers' markup | Hidden without photographs; the section and page with the fixture; print media; one PDF page per photograph, under 15 MB |

Run one section alone with `node tools/check.mjs --only photographs`, or leave it out with
`--skip photographs`.

**Fixtures.** The blocks that stay hidden until they are real are tested with fixture data. These
include the reel and shot index, crew, laurels, real frames, wipes and photographs.
- **How it works.** `tools/lib/fixture.mjs` merges `tools/test/fixtures/full.mjs` over your data and
  serves it to the browser in place of `data/portfolio.js`. It also makes a 20 s test-pattern clip.
- **It never reads as real.** Every name in it is an obvious stand-in ("Crew Name A", "Fixture
  Festival"), its images are the site's own code-rendered posters, and nothing in it is ever written
  into the data or deployed.
- **Fixture output.** Screenshots and PDFs are named `.artifacts/screens/fixture--*` and carry a red
  "FIXTURE DATA" frame: on every printed page, and down the whole length of a full-page capture.

**Tour.** `npm run tour` (`tools/tour.mjs`) walks the site as a desktop visitor would (your data,
motion on) and records it at 1920×1080 and 1440×900 into `.artifacts/tour/`.
- **Output.** `tour-<w>x<h>.mp4` (H.264, BT.709), a still at every pause (`<w>x<h>/NN-<beat>.png`)
  and `contact-<w>x<h>.jpg` with every still on one sheet.
- **Options.** `--sizes`, `--out`, `--only <beat,…>` (hero, strip, index, studies, credits,
  match-cut, lightbox, sequence, pager) and `--keep-webm` (Playwright's raw recording).
- **It records in real time,** so give it the machine: `flock .artifacts/browser.lock npm run tour`
  waits for any other browser job that holds the lock.
- **What is the tour's own, not the site's.** The arrow (headless Chromium draws no cursor). The main
  title shown at rest and the studies held on their posters, because software rendering draws canvases
  at a few frames a second. Motion at about 0.88× speed (Playwright rounds each frame to 40 ms).

## Desktop motion

On a desktop browser (mouse or trackpad, window ≥ 1024 px, motion on) the page adds a motion layer
in `assets/js/site/motion/`:

- smooth wheel scrolling (Lenis);
- headings that rise line by line behind masks;
- frames that open like a gate;
- Selected work as a pinned film strip;
- a viewfinder cursor over pictures;
- a clip-path curtain between pages.

It uses **GSAP 3.15.0** and **Lenis 1.3.27**, vendored in `assets/js/vendor/` (see their READMEs). Phones,
tablets, reduced motion and the site's **Motion off** toggle get native scroll and simple one-shot
reveals, and never download either library.

- **No cropping.** Pictures are never cropped by the motion: at rest every frame shows its whole
  composition.
- **Your place is kept.** Switching the layer on or off, switching the work view, resizing across
  1024 px or reloading keeps the visitor on the same content (`assets/js/site/place.js`).

## Fonts and vendored code

The type is self-hosted, so nothing is fetched from another site:

- **Cormorant Garamond** 400, 500, 600 and 400 italic;
- **Inter Tight** 400, 500, 600;
- **IBM Plex Mono** 400, 500.

The fonts come from `@fontsource` 5.3.0 under the SIL Open Font License. They live in `assets/fonts/`,
and `assets/css/fonts.css` declares them. Each page preloads at most three of them.

`tools/vendor-manifest.json` lists every vendored file (the fonts, GSAP and Lenis) with its npm package,
version and hashes:

```sh
npm run vendor                               # fetch them from the npm registry and write the files
node tools/vendor-motion.mjs --verify        # check the files on disk against the manifest's hashes
```

To add a face, add its files to the font's entry in the manifest, run
`node tools/vendor-motion.mjs <package>`, then add its `@font-face` rule. The licences are in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

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
- **Fonts.** Cormorant Garamond, Inter Tight and IBM Plex Mono (SIL Open Font License), served from
  this site.
- **Page motion (desktop).** GSAP 3.15.0 (GSAP Standard No Charge License) and Lenis 1.3.27 (MIT),
  served from this site.
- **Full list.** See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

**For admissions and applications.** Many schools ask how AI was used, so say it plainly.

- **On the site.** Each study is labelled "Interactive study · code written with AI assistance · not
  camera work", and the colophon says how the site was made (`colophon` in `data/portfolio.js`; check
  that it matches how you worked, then set `colophon.confirmed: true`).
- **AI-assisted:** the generative pieces on this site, which are code written with an AI model.
- **Yours alone:** your films, stills, photographs and reel.

Keep the two clearly separate. When you submit a recorded clip of a study, label it as a
code-rendered study, not as footage. Some schools do not accept AI-generated work at all
(`APPLYING.md` lists them); follow each school's own policy where it is stricter.
