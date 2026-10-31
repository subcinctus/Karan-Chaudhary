// Fixture overrides: every block the site keeps hidden until it is real, filled in, so the browser checks
// and the fixture screenshots can see it render. tools/lib/fixture.mjs merges this over data/portfolio.js
// and serves the result in its place (page.route). Nothing here is ever written into the data or deployed,
// and every fixture screenshot carries a "FIXTURE DATA" banner.
//
// - Every name is an obvious stand-in ("Crew Name A", "Fixture Festival"); no person, festival, award,
//   reference or AI use here is real, and the links go to example.com.
// - Images are the site's own code-rendered posters standing in for camera frames and photographs: the
//   .jpg posters play film frames, the .webp posters (and the light and still .jpg) play photographs, so no
//   photograph shares a file with a frame (the schema fails a photograph that is also a film frame).
// - The reel plays a generated 20 s test pattern (ensureTestClip() in tools/lib/fixture.mjs); its shots sit
//   inside those 20 s, while the label keeps a believable 1:30 runtime.
// - The overrides are a function of the real data, so they keep working as the samples are replaced: the
//   first film, whatever its slug, is marked real and filled in (premiere, awards, a real plot and sequence:
//   none of them may sit on a sample film); the second takes the other credit branch (not operated, not lit
//   by the owner) and keeps its sample status; the shots point at the first six films.
//
// Merge rules (fixture.mjs): objects merge key by key; `films` takes patches keyed by slug; any other array
// or value replaces the real one. The reel is spelled out in full, so a real reel's fields never mix in.

/** The generated test clip, relative to the site root (served at srv.url + TEST_CLIP). */
export const TEST_CLIP = '.artifacts/fixtures/reel.mp4';

const ALL = ['afi', 'nyu', 'famu', 'lodz', 'bfa'];
const NOT_AFI = ['nyu', 'famu', 'lodz', 'bfa'];

// Film frames: the posters at their own sizes (aspect = width / height), palettes sampled from each image.
const FOCUS = { src: 'media/studies/focus/poster.jpg', srcset: ['media/studies/focus/poster.jpg 1920w'], aspect: 2.388, palette: ['#121316', '#1D1B1C', '#2C2724', '#40352B', '#584A3C', '#9C7A56'] };
const SHOTCARD = { src: 'media/studies/shotcard/poster.jpg', srcset: ['media/studies/shotcard/poster.jpg 1280w'], aspect: 2.388, palette: ['#0F1011', '#201E1D', '#393128', '#65513C', '#C2915B', '#CB985F'] };
const COLOUR = { src: 'media/studies/colour/poster.jpg', srcset: ['media/studies/colour/poster.jpg 1920w'], aspect: 1.5, palette: ['#07090C', '#1E2327', '#534B4B', '#716457', '#8B8270', '#CBB194'] };
const TITLE = { src: 'media/studies/title/poster.jpg', srcset: ['media/studies/title/poster.jpg 1920w'], aspect: 1.778, palette: ['#08090A', '#111010', '#141212', '#1E1A16', '#3A2E23', '#5A4B3C'] };
const OG = { src: 'media/og/og-title.jpg', srcset: ['media/og/og-title.jpg 1200w'], aspect: 1.905, palette: ['#09090A', '#111010', '#141212', '#1E1916', '#3C3024', '#5B4C3D'] };

// The shot index: six shots inside the 20 s test clip, each pointing at one of the first six films.
const SHOTS = [
  { t: '0:02', lens: '40 mm', note: 'Fixture note: window key', thumb: FOCUS.src },
  { t: '0:05', lens: '35 mm', note: 'Fixture note: sodium key', thumb: SHOTCARD.src },
  { t: '0:08', lens: '50 mm', note: 'Fixture note: orbit on the chorus', thumb: COLOUR.src },
  { t: '0:11', lens: '12–120 mm', note: 'Fixture note: available light', thumb: TITLE.src },
  { t: '0:14', lens: '40 mm anamorphic', note: 'Fixture note: crane up', thumb: OG.src },
  { t: '0:17', lens: '24–70 mm', note: 'Fixture note: whip pan', thumb: 'media/studies/light/poster.jpg' },
];

/** The first film: marked real, every block filled in. */
const FIRST = {
  placeholder: false,
  director: 'Director Name A',
  production: 'Production Name A',
  logline: 'Fixture logline. Two siblings clear out their late father’s workshop over one long evening, and the light goes with the day.',
  madeAt: { type: 'school', name: 'Fixture Film School', note: 'second-year film' },
  aiUse: 'none',
  operated: true,
  lit: true,
  crew: [
    { role: 'Gaffer', name: 'Crew Name A' },
    { role: 'Colourist', name: 'Crew Name B' },
    { role: 'Production designer', name: 'Crew Name C' },
  ],
  premiere: { event: 'Fixture Festival', year: 2026, url: 'https://example.com/fixture-festival' },
  awards: [{ title: 'Fixture Award', event: 'Fixture Festival', year: 2026, url: 'https://example.com/fixture-award' }],
  references: [
    { title: 'Fixture Reference A', year: 1971, dp: 'Fixture DP A', note: 'Fixture note: one window, no fill.' },
    { title: 'Fixture Reference B', year: 1999 },
  ],
  watch: 'https://example.com/fixture-film',
  stills: [
    { ...FOCUS, alt: 'Fixture stand-in (the Focus study poster): a figure in silhouette against out-of-focus street lights.', line: 'Sc.04 · 40 mm · T2.0 · EI 800 · 2.39:1 · EXT. NIGHT', featured: true },
    { ...SHOTCARD, alt: 'Fixture stand-in (the shot-card poster): a figure on a street at dusk, framed for a dolly in.', line: 'Sc.02 · 25 mm · T2.8 · EI 800 · 2.39:1 · EXT. DUSK' },
    { ...COLOUR, alt: 'Fixture stand-in (the Colour study poster): a roadside at dusk, half log and half graded, over scopes.', line: 'Sc.07 · 32 mm · T2.8 · EI 1280 · 3:2 open gate · EXT. DUSK' },
    { ...TITLE, alt: 'Fixture stand-in (the title poster): a name card among soft points of light.', line: 'Sc.01 · 50 mm · T1.4 · EI 800 · 16:9 · TITLE', caption: 'Fixture caption: one line under the frame.' },
    { ...OG, alt: 'Fixture stand-in (the social card): the name card, framed wider.', line: 'Sc.09 · 50 mm · T1.4 · EI 800 · 1.90:1 · TITLE' },
  ],
  lightingPlot: {
    placeholder: false,
    scene: 'Sc. 04 · EXT. STREET · NIGHT',
    frame: 0,
    motivation: 'Fixture motivation: the street lights behind are the only sources in frame, so a soft key from frame right stands in for them.',
    camera: { x: 0.3, y: 3.6, focal: 40, label: 'A-CAM · 40MM' },
    subject: { facing: 'camera' },
    lights: [
      { role: 'key', az: -50, el: 25, dist: 2.5, kelvin: 3200, label: 'SOFT KEY', modifier: '4×4 diffusion' },
      { role: 'back', az: 160, el: 30, dist: 6, kelvin: 2000, label: 'STREETLIGHTS', modifier: 'existing' },
      { role: 'fill', az: 20, el: -10, dist: 1.5, kelvin: 3200, label: 'BOUNCE', modifier: 'white board' },
    ],
    props: [{ x: -2, y: -3.5, label: 'SHOP WINDOW', detail: 'practical', kelvin: 2700 }],
  },
  sequences: [{
    placeholder: false,
    title: 'Scene 4 in five frames',
    scene: 'Sc. 04 · EXT. STREET · NIGHT',
    frames: [
      { src: TITLE.src, alt: 'Fixture stand-in: the name card among soft lights.', intent: 'Fixture intent: open on the lights alone, 50 mm wide open, before anyone enters.' },
      { src: SHOTCARD.src, alt: 'Fixture stand-in: a figure on the street, framed for a dolly in.', intent: 'Fixture intent: 25 mm, the dolly starts as the figure stops walking.' },
      { src: FOCUS.src, alt: 'Fixture stand-in: the figure in silhouette against the street lights.', intent: 'Fixture intent: 40 mm at T2.0, the background goes to points of light.' },
      { src: COLOUR.src, alt: 'Fixture stand-in: the roadside at dusk, half log and half graded.', intent: 'Fixture intent: the reverse, wider, so the road carries the cut.' },
      { src: OG.src, alt: 'Fixture stand-in: the name card, framed wider.', intent: 'Fixture intent: back to the lights, held two seconds longer than is comfortable.' },
    ],
    hindsight: 'Fixture hindsight: one sentence on what I would change.',
  }],
  grade: {
    log: { src: SHOTCARD.src, alt: 'Fixture stand-in for the log frame.' },
    final: { src: FOCUS.src, alt: 'Fixture stand-in for the graded frame.' },
    colourist: 'Crew Name B',
    note: 'Fixture note: two different posters stand in for one frame before and after the grade.',
  },
  previsCompare: {
    previs: { src: SHOTCARD.src, alt: 'Fixture stand-in for the previs frame.' },
    final: { src: FOCUS.src, alt: 'Fixture stand-in for the final frame.' },
  },
};

/** The second film: still a sample, credited the other way (someone else operated and lit). */
const SECOND = {
  madeAt: { type: 'independent' },
  aiUse: 'Fixture text: one plain sentence on what an AI tool did on this film.',
  operated: false,
  lit: false,
  crew: [
    { role: 'Camera operator', name: 'Crew Name D' },
    { role: 'Gaffer', name: 'Crew Name E' },
    { role: 'Colourist', name: 'Crew Name F' },
    { role: 'Production designer', name: null },
  ],
};

/** The overrides for the real data (data/portfolio.js's default export). */
export default function fixture(real) {
  const films = Array.isArray(real?.films) ? real.films : [];
  return {
    reel: {
      placeholder: false,
      title: 'Showreel',
      provider: 'file',
      id: null,
      hash: null,
      src: TEST_CLIP,
      poster: 'media/studies/title/poster.jpg',
      runtime: '1:30',
      updated: '2026-10',
      uploadDate: '2026-10-12',
      dialogue: false,
      captions: { lang: 'en', label: 'English', src: 'tools/test/fixtures/reel.en.vtt' },
      shots: SHOTS.map((s, i) => ({ ...s, ...(films[i] ? { film: films[i].slug } : { title: `Fixture shot ${i + 1}` }) })),
    },
    person: {
      tenFilms: Array.from({ length: 10 }, (_, i) => ({ title: `Fixture Film ${i + 1}`, year: 1960 + i * 6, dp: `Fixture DP ${String.fromCharCode(65 + i)}`, note: 'Fixture note: what it taught me.' })),
    },
    films: Object.fromEntries([[films[0]?.slug, FIRST], [films[1]?.slug, SECOND]].filter(([slug]) => slug)),
    photographs: {
      captions: false,
      series: [
        {
          title: 'Fixture Series A',
          year: 2026,
          kind: 'colour',
          note: 'Fixture: code-rendered posters standing in for photographs.',
          photos: [
            { src: 'media/studies/colour/poster.webp', alt: 'Fixture stand-in photograph: a roadside at dusk.', w: 1920, h: 1280, sets: ALL },
            { src: 'media/studies/focus/poster.webp', alt: 'Fixture stand-in photograph: a figure against street lights.', w: 1920, h: 804, sets: ALL },
            { src: 'media/studies/title/poster.webp', alt: 'Fixture stand-in photograph: a name card among soft lights.', w: 1920, h: 1080, sets: NOT_AFI },
            { src: 'media/studies/shotcard/poster.webp', alt: 'Fixture stand-in photograph: a figure on a street.', w: 1280, h: 536, sets: ALL },
            { src: 'media/studies/still/poster.webp', alt: 'Fixture stand-in photograph: hills at last light.', w: 1280, h: 536, sets: NOT_AFI, caption: 'Fixture caption.' },
          ],
        },
        {
          title: 'Fixture Series B',
          year: 2025,
          kind: 'bw',
          note: 'Fixture: the same stand-ins, playing a black-and-white series.',
          photos: [
            { src: 'media/studies/light/poster.jpg', alt: 'Fixture stand-in portrait: a plaster bust, Rembrandt light.', w: 864, h: 1080, portrait: true, sets: ALL },
            { src: 'media/studies/light/poster.webp', alt: 'Fixture stand-in portrait: the same bust, a second frame.', w: 864, h: 1080, portrait: true, sets: ALL },
            { src: 'media/studies/still/poster.jpg', alt: 'Fixture stand-in photograph: hills at last light.', w: 1280, h: 536, sets: ALL },
            { src: 'media/studies/title/poster.webp', alt: 'Fixture stand-in photograph: soft lights, again.', w: 1920, h: 1080, sets: ALL },
            { src: 'media/studies/still/poster.webp', alt: 'Fixture stand-in photograph: the hills, again.', w: 1280, h: 536, sets: ALL },
          ],
        },
      ],
    },
  };
}
