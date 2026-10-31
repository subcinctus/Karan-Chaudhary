// =============================================================================
// THE ONE FILE TO EDIT. Everything on the site comes from here.
//
// - Placeholders: every record with `placeholder: true` shows a visible "SAMPLE" tag on the site
//   and is listed by `npm run check`. Replace the content, then set `placeholder: false`.
// - Search this file for "TODO(owner)" to find every field that still needs real information.
// - Paths are RELATIVE (no leading "/"): the site is served from /Karan-Chaudhary/.
//   Example: 'media/films/untitled-short-01/still-01.jpg'.
// - Never add awards, festivals or names that are not real and confirmed.
// - Text is plain text (it is escaped when rendered). Bios are written in the first person.
// - null or [] means "not filled in yet": that row or block does not show on the site.
// - A sample block inside a film (its lightingPlot, a sequence) has its own `placeholder: true` and
//   "Sample" tag. When the film becomes real, replace those blocks or delete them: `npm run check`
//   fails while a sample block sits inside a film that is not a placeholder.
//
// A film with every field filled in. This is a worked example of the format only: the names, events
// and numbers are made up, so never copy them in.
//
//   {
//     placeholder: false,
//     slug: 'the-long-evening',                  // lowercase-kebab: the page is project.html?slug=the-long-evening
//     title: 'The Long Evening',
//     year: 2026,
//     kind: 'fiction',                           // 'fiction' | 'documentary' | 'music-video' | 'commercial' | 'experimental' | 'exercise'
//     format: 'Short fiction',
//     runtime: '12 min',
//     role: 'Director of Photography',
//     director: 'Name Surname',
//     production: 'Production company or school',
//     madeAt: { type: 'school', name: 'School name', note: 'second-year film' },   // type 'school' | 'independent' | 'commissioned' (AFI asks)
//     aiUse: 'none',                             // 'none', or your own plain words about what AI did on this film (AFI asks)
//     operated: true,                            // you operated the camera (NFTS asks to see it)
//     lit: true,                                 // you designed the lighting (NFTS asks to see it)
//     crew: [                                    // real names only; a row whose name is null never shows
//       { role: 'Gaffer', name: 'Name Surname' },
//       { role: 'Colourist', name: 'Name Surname' },
//       { role: 'Production designer', name: 'Name Surname' },
//     ],
//     premiere: { event: 'Festival name', year: 2026, url: 'https://…' },          // real and confirmed only
//     awards: [{ title: 'Award name', event: 'Festival name', year: 2026, url: 'https://…' }],   // real and confirmed only
//     references: [{ title: 'Film title', year: 1970, dp: 'Name Surname', note: 'what you took from it' }],   // text only, never images
//     logline: 'One sentence about the film.',
//     aspect: 2.39, frameRate: 24,
//     camera: { body: 'Camera', mode: 'Recording mode', codec: 'Codec' },
//     lenses: { set: 'Lens set', range: '25–75mm', anamorphic: false, filtration: 'Filter' },
//     lighting: 'A sentence or two on the lighting plan.',
//     palette: ['#0E1A24', '#1F3B4D', '#C77B3B', '#E8C49A', '#F2EDE4'],        // five colours, darkest → lightest
//     move: '#027',
//     stills: [{                                 // real frames, 2800 px wide, plus a 1400 px copy
//       src: 'media/films/the-long-evening/still-01.jpg',
//       srcset: ['media/films/the-long-evening/still-01-1400.jpg 1400w', 'media/films/the-long-evening/still-01.jpg 2800w'],
//       alt: 'What the frame shows',
//       aspect: 2.39,
//       line: 'Sc.04 · 40 mm · T2.0 · EI 800 · 2.39:1 · INT. NIGHT',         // the camera line under the frame
//       palette: ['#0E1A24', '#1F3B4D', '#C77B3B', '#E8C49A', '#F2EDE4'],    // optional: this frame's own colours
//       caption: 'Optional caption',
//       featured: true,                          // the lead frame (and the work card)
//       focus: [[0.36, 0.56], [0.72, 0.36]],    // optional: subject and second point, as fractions of the frame
//     }],
//     lightingPlot: {                            // a top view of one set-up, shown beside its frame
//       placeholder: false,
//       scene: 'Sc. 03 · EXT. BUS STOP · NIGHT',
//       frame: 0,                                // which frame (stills[0]) sits beside the plot
//       motivation: 'Why the light comes from where it does, in one sentence.',
//       camera: { x: 0.4, y: 4.5, focal: 35, label: 'A-CAM · 35MM' },        // metres; the subject is at 0, 0 and the camera toward +y
//       subject: { facing: 'camera' },           // or an angle in degrees
//       lights: [                                // az: degrees round the subject (+ = camera-left); el: degrees up; dist: metres
//         { role: 'key', az: 40, el: 55, dist: 3.5, kelvin: 2000, label: 'SODIUM STREETLIGHT', modifier: 'existing' },
//       ],
//       props: [{ x: -1.6, y: -0.8, label: 'SHELTER', detail: 'glass' }],    // a practical lamp adds kelvin: 2700
//     },
//     sequences: [{                              // one scene in 3–8 frames, in edit order
//       placeholder: false,
//       title: 'Scene 4 in five frames',
//       scene: 'Sc. 04 · INT. WORKSHOP · DUSK',
//       frames: [{ src: 'media/films/the-long-evening/seq-01.jpg', alt: 'What the frame shows', intent: 'One line: lens, move, why.' }],
//       hindsight: 'What I would change, in one sentence.',
//     }],
//     grade: { log: { src: '…', alt: '…' }, final: { src: '…', alt: '…' }, colourist: 'Name Surname', note: '…' },   // later: real frames only
//     previsCompare: { previs: { src: '…', alt: '…' }, final: { src: '…', alt: '…' } },                          // later
//     preview: { src: 'media/films/the-long-evening/preview.mp4', poster: '…' },   // later: 800 px H.264, 4–6 s, ≤ 2 MB
//     bts: [{ src: 'media/films/the-long-evening/bts-01.jpg', alt: '…', caption: 'Who is doing what', aspect: 1.5 }],
//     watch: 'https://vimeo.com/…',
//     featured: true,
//   }
//
// The reel's, the photographs' and person.tenFilms' formats are explained where they are.
// =============================================================================

export default {
  // --- Site-wide settings --------------------------------------------------------
  site: {
    url: 'https://subcinctus.github.io/Karan-Chaudhary/',   // canonical / OG / JSON-LD only; links stay relative
    title: 'Karan Chaudhary — Cinematographer',
    description: 'Cinematographer / director of photography. Reel, selected work, and light, lens and colour studies rendered live in code.',
    lang: 'en',
    themeColor: '#0C0D10',
    showPlaceholderBadges: true,      // false hides the SAMPLE tags (do this only once nothing is placeholder)
    timecodeRuntime: 180,             // seconds the scroll timecode (TC 00:03:00:00) spans, top to bottom
    intro: {
      // Film-leader countdown before the title, first visit only. Off: the title is the one intro.
      // To use it, set true AND add data-leader="on" to <html> in index.html (decided before first paint).
      preloader: false,
      titleSequence: true,            // 4.5 s main title, plays once per session
      oncePerSession: true,
    },
    ogImage: 'media/og/og-title.jpg', // 1200×630, generated by `npm run og`
  },

  // --- About ------------------------------------------------------------------------
  person: {
    placeholder: true,
    name: 'Karan Chaudhary',
    role: 'Cinematographer',
    roles: ['Director of Photography', 'Camera Operator'],
    // Camera-report slate shown under the name in the title sequence and hero.
    slate: { cam: 'A-CAM', lens: '40mm', stop: 'T2.0', kelvin: 5600, fps: 24, aspect: '2.39:1' },
    base: 'City, Country',                                  // TODO(owner)
    availability: 'Available for shorts and music videos',  // TODO(owner)
    // TODO(owner): rewrite both in your own words (first person).
    bio: {
      short: 'I am a cinematographer. I light for the moment a scene turns, and I would rather move the camera once, for a reason, than often for effect.',
      long: [
        'On set I start from what the scene is about, then work out where the light would plausibly come from and how close the lens needs to be to the actors.',
        'I like small crews, long takes and practical sources I can put in the frame. I plan with overhead diagrams and previs so the day itself can stay open to the actors.',
        'The studies on this site are how I think about the job: depth of field as a choice about attention, key-to-fill ratio as a choice about mood, and the grade as the last step of the lighting.',
      ],
    },
    portrait: { src: null, alt: 'Karan Chaudhary on set' },  // TODO(owner): e.g. 'media/portrait.jpg'
    // Each approach card can deep-link to a study (and a Light-study preset id from assets/js/core/presets.js).
    approach: [
      { title: 'Motivated light', text: 'Every source should have a reason to be where it is. I build the key from the practical or the window the audience can see, then decide how much of the face to give away.', study: 'light', preset: 'rembrandt' },
      { title: 'Focus is attention', text: 'Where the plane of focus sits tells the audience where to look. I choose the stop for the scene, not for the lens.', study: 'focus' },
      { title: 'Colour carries the scene', text: 'I light for the grade I intend: warm against cool, separation before saturation, highlights that roll off rather than clip.', study: 'colour' },
    ],
    education: [
      { placeholder: true, school: 'School name', programme: 'Programme / course', years: 'Years' },   // TODO(owner)
    ],
    // Skills for search engines (JSON-LD). 'Unreal Engine' is only published once a previs render exists.
    knowsAbout: ['Cinematography', 'Lighting', 'Colour grading', 'Previsualization', 'Unreal Engine'],   // TODO(owner)
    sameAs: [],   // profile URLs for JSON-LD, e.g. 'https://vimeo.com/…', 'https://www.imdb.com/name/…'. TODO(owner)
    // Your own list of films (FAMU asks for ten), text only; About shows it once it has one:
    //   [{ title: 'Film title', year: 1970, dp: 'Name Surname', note: 'what you took from it' }, …]   (at most 10)
    tenFilms: [],   // TODO(owner)
  },

  // --- Showreel -------------------------------------------------------------------
  // provider: 'vimeo' | 'youtube' | 'file' | null. With null (or no id / src) the reel section and its
  // nav links are left out, and the hero's button leads to Selected work instead.
  reel: {
    placeholder: true,
    title: 'Showreel',
    provider: null,   // TODO(owner)
    id: null,         // Vimeo / YouTube id
    hash: null,       // an unlisted Vimeo link's hash: vimeo.com/123456789/abcdef1234 → 'abcdef1234'
    src: null,        // for provider 'file': e.g. 'media/reel/reel.mp4'
    poster: null,     // e.g. 'media/reel/poster.jpg'
    runtime: '1:30',  // 1:00–2:30 reads best; 3:00 at most
    updated: null,    // TODO(owner) 'YYYY-MM' of the last cut: "Reel 2026 · updated October 2026"
    uploadDate: null, // 'YYYY-MM-DD', for search engines (with a poster)
    dialogue: null,   // false adds the note "No dialogue — instrumental"
    captions: null,   // { lang: 'en', label: 'English', src: 'media/reel/reel.en.vtt' }; src for provider 'file' only
    // The shot index under the player, in reel order; each one plays the reel from its time. thumb: your
    // own frame from that shot (else the film's real featured still).
    //   [{ t: '0:12', film: 'untitled-short-01', title: 'Untitled Short I', lens: '40 mm', note: 'one line', thumb: 'media/reel/shots/012.jpg' }]
    shots: [],
  },

  // --- Selected work ------------------------------------------------------------------
  // move: the camera move each card performs on hover / in view (Motion Prompt camera cells):
  //   '#027' dolly in · '#030' orbit · '#031' crane up · '#032' dolly zoom · '#033' rack focus · '#043' whip pan
  // aspect: the delivery aspect ratio; the card and stills are cropped to it.
  // palette: five hex colours, darkest → lightest (cards and placeholder stills are drawn from it).
  // stills: [{ src, srcset, alt, aspect, line, caption, featured }]. Empty → procedural "PLACEHOLDER STILL" frames.
  // stillKinds: compositions for the procedural stills
  //   ('wide-ext' | 'interior-practical' | 'close-silhouette' | 'insert' | 'night-street' | 'window-shaft').
  // The fields for credits, awards, the lighting plot and the scene sequence are explained in the worked
  // example at the top of this file. The first two films carry a sample lighting plot, the first a
  // sample sequence: they show the format, and are tagged "Sample" on the site.
  films: [
    {
      placeholder: true,
      slug: 'untitled-short-01',
      title: 'Untitled Short I',
      year: 2026,
      format: 'Short fiction',
      runtime: '12 min',
      role: 'Director of Photography',
      director: 'Director Name',              // TODO(owner)
      production: 'Production / School',     // TODO(owner)
      kind: 'fiction',
      madeAt: null,                // TODO(owner) { type: 'school' | 'independent' | 'commissioned', name, note } (AFI asks)
      aiUse: null,                 // TODO(owner) 'none', or your own plain words about what AI did on this film (AFI asks)
      operated: null, lit: null,   // TODO(owner) true / false: you operated the camera, you designed the lighting (NFTS asks)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner) real names only
      premiere: null,              // real and confirmed only
      references: [],              // text only, never images
      logline: 'Sample logline. Two siblings clear out their late father’s workshop over one long evening, and the light goes with the day.',
      aspect: 2.39,
      frameRate: 24,
      camera: { body: 'Super 35 digital cinema camera', mode: '3.2K 16:9, cropped to 2.39', codec: 'ProRes 4444' },
      lenses: { set: 'Spherical primes', range: '25–75mm', anamorphic: false, filtration: '1/8 black diffusion' },
      lighting: 'Window key from a single large source outside, practicals for the evening, nothing on the ceiling.',
      palette: ['#0E1A24', '#1F3B4D', '#C77B3B', '#E8C49A', '#F2EDE4'],
      move: '#027',
      stillKinds: ['window-shaft', 'interior-practical', 'close-silhouette'],
      stills: [], bts: [], awards: [], watch: null,
      // SAMPLE lighting plot and sequence (each tagged "Sample" on the site): replace them with your own
      // set-up and scene, or set lightingPlot: null and sequences: [].
      lightingPlot: {
        placeholder: true,
        scene: 'Sc. 04 · INT. WORKSHOP · DUSK',
        frame: 0,
        motivation: 'The window is the key all evening; as the day goes, the practicals take over the room.',
        camera: { x: -0.4, y: 3.2, focal: 25, label: 'A-CAM · 25MM' },
        subject: { facing: -30 },
        lights: [
          { role: 'key', az: -120, el: 35, dist: 4, kelvin: 5600, label: 'WINDOW', modifier: 'large source outside' },
        ],
        props: [
          { x: -1.4, y: 0.4, label: 'PRACTICAL', detail: 'table lamp', kelvin: 2700 },
          { x: 1.6, y: -1.8, label: 'PRACTICAL', detail: 'work lamp', kelvin: 3200 },
        ],
      },
      sequences: [{
        placeholder: true,
        title: 'Scene 6 in five frames',
        scene: 'Sc. 06 · INT. WORKSHOP · EVENING',
        frames: [
          { kind: 'window-shaft', alt: 'Placeholder frame: a shaft of window light across the workshop floor, a figure facing it.', intent: 'Wide on 25 mm, locked off: the window is the only key and the room is left to fall away.' },
          { kind: 'interior-practical', alt: 'Placeholder frame: a table lamp glowing against a dark window.', intent: 'The first practical goes on: 40 mm at eye height, the warm lamp against the blue window.' },
          { kind: 'close-silhouette', alt: 'Placeholder frame: a face in silhouette, close, against the light.', intent: 'Close on 75 mm with the lamp behind: the face stays in shadow while the line lands.' },
          { kind: 'insert', alt: 'Placeholder frame: a close insert of an object under one lamp.', intent: 'An insert of the tools on 50 mm, lit by the lamp alone: the object the scene is about.' },
          { kind: 'window-shaft', alt: 'Placeholder frame: the window shaft again, later in the evening.', intent: 'Back to the wide, held longer: the window has gone blue and the lamp now carries the room.' },
        ],
        hindsight: 'Sample note. I would hold the last wide two seconds longer, so the change in the light reads before the cut.',
      }],
      featured: true,
    },
    {
      placeholder: true,
      slug: 'night-exterior-sample',
      title: 'Night Exterior',
      year: 2025,
      format: 'Short fiction',
      runtime: '9 min',
      role: 'Director of Photography',
      director: 'Director Name',
      production: 'Production / School',
      kind: 'fiction',
      madeAt: null, aiUse: null, operated: null, lit: null,   // TODO(owner)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner)
      premiere: null, references: [],
      logline: 'Sample logline. A night-shift cashier and a stranger wait out the last bus under one sodium streetlight.',
      aspect: 1.85,
      frameRate: 24,
      camera: { body: 'Super 35 digital cinema camera', mode: '2.8K 3:2, cropped to 1.85', codec: 'ProRes 422 HQ' },
      lenses: { set: 'Fast spherical primes', range: '18–50mm', anamorphic: false, filtration: null },
      lighting: 'Existing sodium street light kept as the key; one soft bounce to hold eyes. Shot wide open.',
      palette: ['#0B0C10', '#2B2A33', '#D98E32', '#F2C46D', '#E9E4D8'],
      move: '#033',
      stillKinds: ['night-street', 'close-silhouette', 'insert'],
      stills: [], bts: [], awards: [], watch: null,
      // SAMPLE lighting plot (tagged "Sample plot" on the site): replace it with your own, or set it to null.
      lightingPlot: {
        placeholder: true,
        scene: 'Sc. 03 · EXT. BUS STOP · NIGHT',
        frame: 0,
        motivation: 'The streetlight is the one source the audience can see, so it stays the key; a bounce under the lens holds the eyes.',
        camera: { x: 0.4, y: 4.5, focal: 35, label: 'A-CAM · 35MM' },
        subject: { facing: 'camera' },
        lights: [
          { role: 'key', az: 40, el: 55, dist: 3.5, kelvin: 2000, label: 'SODIUM STREETLIGHT', modifier: 'existing' },
          { role: 'fill', az: -15, el: -15, dist: 1.2, kelvin: 2000, label: 'BOUNCE', modifier: 'white board' },
        ],
        props: [{ x: -1.6, y: -0.8, label: 'SHELTER', detail: 'glass' }],
      },
      sequences: [],
    },
    {
      placeholder: true,
      slug: 'sample-music-video',
      title: 'Music Video',
      year: 2025,
      format: 'Music video',
      runtime: '3 min 40 s',
      role: 'Director of Photography',
      director: 'Director Name',
      production: 'Artist / Label',          // TODO(owner)
      kind: 'music-video',
      madeAt: null, aiUse: null, operated: null, lit: null,   // TODO(owner)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner)
      premiere: null, references: [],
      logline: 'Sample logline. One performer, one room, one continuous orbit as the song builds.',
      aspect: 2.39,
      frameRate: 25,
      camera: { body: 'Full-frame digital cinema camera', mode: '4K 17:9, cropped to 2.39', codec: 'ProRes 422 HQ' },
      lenses: { set: 'Vintage spherical primes', range: '35–85mm', anamorphic: false, filtration: 'Low-contrast filter' },
      lighting: 'Hard backlight with haze; the orbit is timed so the key crosses the lens on the chorus.',
      palette: ['#120E16', '#3A2140', '#B4436C', '#E6A5B8', '#F4EEF0'],
      move: '#030',
      stillKinds: ['close-silhouette', 'interior-practical', 'insert'],
      stills: [], bts: [], awards: [], watch: null,
      lightingPlot: null, sequences: [],
    },
    {
      placeholder: true,
      slug: 'untitled-documentary-sample',
      title: 'Untitled Documentary',
      year: 2024,
      format: 'Documentary short',
      runtime: '18 min',
      role: 'Cinematographer',
      director: 'Director Name',
      production: 'Production / School',
      kind: 'documentary',
      madeAt: null, aiUse: null, operated: null, lit: null,   // TODO(owner)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner)
      premiere: null, references: [],
      logline: 'Sample logline. A portrait of a family bakery in the week before it closes.',
      aspect: 1.33,
      frameRate: 24,
      camera: { body: 'Super 16 film camera', mode: 'Super 16, framed for 4:3', codec: 'Colour negative, 2K scan' },
      lenses: { set: 'Zoom + two primes', range: '12–120mm', anamorphic: false, filtration: null },
      lighting: 'Available light only; ovens and a north window. Exposed for the faces and let the windows go.',
      palette: ['#16130F', '#4A3F31', '#8C7A5B', '#C9B79C', '#EFE8DC'],
      move: '#032',
      stillKinds: ['interior-practical', 'insert', 'window-shaft'],
      stills: [], bts: [], awards: [], watch: null,
      lightingPlot: null, sequences: [],
    },
    {
      placeholder: true,
      slug: 'coastal-study-sample',
      title: 'Coastal Study',
      year: 2024,
      format: 'Experimental short',
      runtime: '6 min',
      role: 'Director of Photography',
      director: 'Director Name',
      production: 'Production / School',
      kind: 'experimental',
      madeAt: null, aiUse: null, operated: null, lit: null,   // TODO(owner)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner)
      premiere: null, references: [],
      logline: 'Sample logline. A shoreline over one tide, framed very wide and very still until it is not.',
      aspect: 2.76,
      frameRate: 24,
      camera: { body: 'Large-format digital cinema camera', mode: 'Open gate, cropped to 2.76', codec: 'Raw' },
      lenses: { set: 'Anamorphic (1.3× squeeze)', range: '40–100mm', anamorphic: true, filtration: 'ND + polariser' },
      lighting: 'Overcast daylight; the crane up is the one move, timed to the tide line.',
      palette: ['#0D1316', '#2C3E46', '#6F8C96', '#B8C9CC', '#EEF2F1'],
      move: '#031',
      stillKinds: ['wide-ext', 'wide-ext', 'close-silhouette'],
      stills: [], bts: [], awards: [], watch: null,
      lightingPlot: null, sequences: [],
    },
    {
      placeholder: true,
      slug: 'sample-commercial',
      title: 'Spot',
      year: 2023,
      format: 'Commercial',
      runtime: '30 s',
      role: 'Director of Photography',
      director: 'Director Name',
      production: 'Agency / Client',         // TODO(owner)
      kind: 'commercial',
      madeAt: null, aiUse: null, operated: null, lit: null,   // TODO(owner)
      crew: [{ role: 'Gaffer', name: null }, { role: 'Colourist', name: null }, { role: 'Production designer', name: null }],   // TODO(owner)
      premiere: null, references: [],
      logline: 'Sample logline. Two rooms, one product, joined by a whip pan.',
      aspect: 1.78,
      frameRate: 25,
      camera: { body: 'Super 35 digital cinema camera', mode: '4K UHD', codec: 'ProRes 4444' },
      lenses: { set: 'Spherical zoom', range: '24–70mm', anamorphic: false, filtration: null },
      lighting: 'Clean daylight-balanced soft key; warm practical accents to carry the brand colour.',
      palette: ['#101114', '#33363D', '#E0A458', '#F3D9B1', '#FAF7F2'],
      move: '#043',
      stillKinds: ['insert', 'interior-practical', 'wide-ext'],
      stills: [], bts: [], awards: [], watch: null,
      lightingPlot: null, sequences: [],
    },
  ],

  // Extra frames not tied to a film: [{ src, alt, caption, aspect }].
  stills: [],

  // --- Photographs (your own still photography, never frames from a film) -------------------------
  // The section, its menu link and photographs.html stay hidden until a series has photos. Each school
  // asks for its own set (count, portraits, colour / black-and-white): tag each photo with the sets it
  // belongs to, then print photographs.html?set=afi (and so on) to PDF.
  //   series: [{ title: 'Series title', year: 2026, kind: 'colour' | 'bw', note: 'one line',
  //     photos: [{ src: 'media/photographs/series/01.jpg', alt: 'What the photograph shows', w: 2400, h: 1600,   // w, h: pixels
  //                portrait: true,   // a portrait of a person (AFI asks for a few)
  //                caption: 'optional', sets: ['afi', 'nyu', 'famu', 'lodz', 'bfa'] }] }]
  photographs: {
    captions: false,   // true shows each photo's caption on the photographs page
    series: [],        // TODO(owner)
  },

  // --- Studies (each is also a shareable page under studies/) -----------------------
  studies: [
    { id: 'focus', title: 'Focus', href: 'studies/focus.html', blurb: 'Depth of field from real lens maths: format, focal length, stop and focus distance.', credits: ['#033', '#105'] },
    { id: 'light', title: 'Light', href: 'studies/light.html', blurb: 'A plaster bust under classic portrait set-ups, with key:fill ratio and colour temperature.', credits: ['#097', '#098', '#100', '#101', '#102', '#114'] },
    { id: 'colour', title: 'Colour', href: 'studies/colour.html', blurb: 'A scene-referred frame graded from LogC to finished looks, with live scopes.', credits: ['#087', '#115', '#117', '#118'] },
  ],

  // --- Kit ------------------------------------------------------------------------------
  kit: {
    placeholder: true,   // TODO(owner): list only what you own or have used on real jobs
    owned: [
      { group: 'Camera', items: ['Camera body', 'Monitor', 'Media and readers'] },
      { group: 'Lenses', items: ['Prime set', 'Zoom'] },
      { group: 'Grip & light', items: ['LED panel', 'Tube lights', 'Diffusion frames'] },
    ],
    experienced: [
      { group: 'Cameras', items: ['Digital cinema cameras', 'Super 16 film'] },
      { group: 'Lighting', items: ['HMI', 'LED', 'Practical / tungsten'] },
      { group: 'Tools', items: ['Colour pipeline (LogC → Rec.709)', 'Previs in Unreal Engine'] },
    ],
  },

  // --- Credits (rendered as end credits) ------------------------------------------------
  credits: [
    { placeholder: true, year: 2026, title: 'Untitled Short I', role: 'Director of Photography', director: 'Director Name', kind: 'Short' },
    { placeholder: true, year: 2025, title: 'Night Exterior', role: 'Director of Photography', director: 'Director Name', kind: 'Short' },
    { placeholder: true, year: 2025, title: 'Music Video', role: 'Director of Photography', director: 'Director Name', kind: 'Music video' },
    { placeholder: true, year: 2024, title: 'Untitled Documentary', role: 'Cinematographer', director: 'Director Name', kind: 'Documentary' },
    { placeholder: true, year: 2024, title: 'Coastal Study', role: 'Director of Photography', director: 'Director Name', kind: 'Experimental' },
    { placeholder: true, year: 2023, title: 'Spot', role: 'Director of Photography', director: 'Director Name', kind: 'Commercial' },
    { placeholder: true, year: 2023, title: 'Untitled Short II', role: 'Camera Operator', director: 'Director Name', kind: 'Short' },
  ],

  // --- Previs (Unreal Engine) -------------------------------------------------------------
  // Shots come from previs/shotlist.json (generated). When a shot's video is rendered and encoded
  // (`npm run previs:encode` prints this block), paste the paths here; until then the site shows a plan.
  previs: {
    heading: 'Virtual production / Previs',
    intro: 'Six shots blocked in Unreal Engine before a shoot day: lens, stop, focus and lighting are planned, then rendered as moving storyboards.',
    // Shown while no shot has a rendered video yet (every media entry below is null).
    introPending: 'Six shots planned for Unreal Engine: lens, stop, focus and lighting are set on the plans below; the renders are pending.',
    shotlist: 'previs/shotlist.json',
    media: {
      'PV-010': { video: null, poster: null },
      'PV-020': { video: null, poster: null },
      'PV-030': { video: null, poster: null },
      'PV-040': { video: null, poster: null },
      'PV-050': { video: null, poster: null },
      'PV-060': { video: null, poster: null },
    },
  },

  // --- Contact --------------------------------------------------------------------------------
  contact: {
    placeholder: true,
    heading: 'Let’s make something.',   // TODO(owner): the contact heading, in your voice
    email: 'hello@example.com',   // TODO(owner)
    phone: null,                  // TODO(owner) optional
    representation: null,         // TODO(owner) optional: agent / manager
    socials: [
      { label: 'Instagram', url: null },   // TODO(owner)
      { label: 'Vimeo', url: null },       // TODO(owner)
    ],
    cv: null,                     // TODO(owner) e.g. 'media/cv/karan-chaudhary-cv.pdf'
  },

  // --- Colophon / AI disclosure ----------------------------------------------------------------
  colophon: {
    // TODO(owner): confirm this disclosure matches how the work was made, then set confirmed: true
    // (until then the site shows a "To confirm" tag on it).
    confirmed: false,
    // Scoped to what is code: once a reel or previs renders are added, the site adds a sentence
    // saying those are camera / engine footage.
    text: 'The main title, the studies, the film-card moves and the previs plans on this page are rendered live in your browser from code written with Claude Opus 5.5. Concept, shot design, lens and lighting choices by Karan Chaudhary.',
    // Each credit is plain text, or { text, links: [{ label, href }] } (relative or https links).
    credits: [
      { text: 'Camera moves and the title reveal ported from Motion Prompt (MIT) by Shohei Ohtaki: #005 #027 #030 #031 #032 #033 #043. Lighting, lens, colour, grain and web-behaviour numbers rebuilt (no code copied) from #002 #073 #074 #075 #077 #079 #083 #084 #086 #087 #089 #092 #094 #097 #098 #100 #101 #102 #105 #112 #114 #115 #117 #118.',
        links: [{ label: 'Third-party notices', href: 'THIRD-PARTY-NOTICES.md' }, { label: 'Motion Prompt', href: 'https://showheyohtaki.github.io/motion-prompt/' }] },
      { text: 'Inspired by the Awesome Opus 5.5 Videos collection. No media from the collection is used on this site.',
        links: [{ label: 'The collection', href: 'https://github.com/yihui-dev/awesome-opus5-5-videos' }] },
      'Type: Cormorant Garamond, Inter Tight and IBM Plex Mono (SIL Open Font License), served by Google Fonts.',
      'Page motion on desktop: GSAP 3.15.0 (GSAP Standard No Charge License) and Lenis 1.3.27 (MIT), served from this site.',
      'Previs: Epic Games’ Unreal Engine with the Unreal Engine Skills plugin for Claude Code, referenced by the previs workflow, not included in this site.',
    ],
  },
};
