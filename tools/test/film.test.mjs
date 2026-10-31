// The film page's pure parts in Node: the DP-first credit line, the crew block's order and hiding, laurels,
// references and the Enquiries line, sequence normalisation, the lighting plot's arguments for renderPlan,
// the frame cards, and the seed rules that make the work card, the lead frame and frame 01 one picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import data from '../../data/portfolio.js';
import * as FF from '../../assets/js/site/film-facts.js';
import * as FC from '../../assets/js/site/frame-card.js';
import * as optics from '../../assets/js/core/optics.js';
import { describePlan } from '../../assets/js/ui/plot.js';
import { hashString, mulberry32 } from '../../assets/js/core/prng.js';
import { REPO_ROOT } from '../lib/server.mjs';

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const film = (over = {}) => ({ ...structuredClone(data.films[0]), ...over });
/** The rendered credit rows: [[dt, dd], …]. */
const rows = markup => [...String(markup).matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m => [m[1], m[2]]);
const PERSON = data.person.name;

test('frameCredit: "TITLE (YEAR) — DP name · Dir. name", the director left out while it is template text; the dot bound to the word before it', () => {
  const f = film();
  assert.equal(FC.frameCredit(f, data), `UNTITLED SHORT I (2026) — DP ${PERSON}`);
  assert.equal(FC.frameCredit(film({ director: 'Name Surname' }), data), `UNTITLED SHORT I (2026) — DP ${PERSON}\u00a0· Dir. Name Surname`);
  assert.equal(FC.frameCredit(film({ year: null, director: 'Name Surname' }), data), `UNTITLED SHORT I — DP ${PERSON}\u00a0· Dir. Name Surname`);
  assert.equal(FC.frameCredit(film({ role: 'Camera Operator' }), data), `UNTITLED SHORT I (2026) — Camera Operator ${PERSON}`);
  assert.equal(FC.frameCredit(film({ role: 'Cinematographer' }), data), `UNTITLED SHORT I (2026) — DP ${PERSON}`);
});

test('renderCrew: "Photographed by", then the rows in the plan\'s order, filled names only', () => {
  const full = film({
    director: 'Name A', operated: true, lit: true,
    crew: [
      { role: 'Sound recordist', name: 'Name H' }, { role: 'Production designer', name: 'Name G' }, { role: 'Colourist', name: 'Name F' },
      { role: 'Gaffer', name: 'Name E' }, { role: 'Camera operator', name: 'Name D' }, { role: 'Editor', name: null },
    ],
  });
  const out = String(FF.renderCrew(full, data));
  assert.match(out, new RegExp(`<p class="film__credit"><span class="film__credit-role">Photographed by</span> <span class="film__credit-name">${PERSON}</span></p>`));
  assert.deepEqual(rows(out), [
    ['Director', 'Name A'], ['Director of Photography', PERSON], ['Camera operator', `${PERSON}, Name D`],
    ['Lighting', `Designed by ${PERSON}`], ['Gaffer', 'Name E'], ['Colourist', 'Name F'], ['Production designer', 'Name G'],
    ['Sound recordist', 'Name H'],
  ]);
  // The samples: template director, null names, operated / lit unknown → only the owner's DP row.
  assert.deepEqual(rows(FF.renderCrew(film(), data)), [['Director of Photography', PERSON]]);
  // Someone else operated and lit: their names, never the owner's.
  const other = rows(FF.renderCrew(film({ operated: false, lit: false, crew: [{ role: 'Camera operator', name: 'Name D' }, { role: 'Lighting designer', name: 'Name L' }, { role: 'Gaffer', name: null }] }), data));
  assert.deepEqual(other, [['Director of Photography', PERSON], ['Camera operator', 'Name D'], ['Lighting', 'Name L']]);
  // The owner credited as operator on someone else's film: no "Photographed by", no DP row.
  const op = String(FF.renderCrew(film({ role: 'Camera Operator', crew: [{ role: 'Director of Photography', name: 'Name P' }] }), data));
  assert.match(op, /film__credit-role">Camera Operator</);
  assert.deepEqual(rows(op), [['Director of Photography', 'Name P'], ['Camera operator', PERSON]]);
  // Names are text.
  assert.doesNotMatch(String(FF.renderCrew(film({ crew: [{ role: 'Gaffer', name: '<img src=x onerror=alert(1)>' }] }), data)), /<img src=x/);
});

test('laurels only on a real film; references text only; the Enquiries line mails with the title as the subject', () => {
  const awards = [{ title: 'Award A', event: 'Festival A', year: 2026, url: 'https://example.com/a' }, 'Award B', { title: 'Award C', url: 'javascript:alert(1)' }];
  assert.equal(String(FF.renderLaurels(film({ awards }), data)), '', 'never on a sample film');
  const real = String(FF.renderLaurels(film({ placeholder: false, awards }), data));
  assert.match(real, /<a href="https:\/\/example\.com\/a" rel="noopener"><span class="film__laurel-title">Award A<\/span> <span class="film__laurel-event">Festival A · 2026<\/span><\/a>/);
  assert.match(real, />Award B</);
  assert.doesNotMatch(real, /javascript:/);
  assert.equal(String(FF.renderLaurels(film({ placeholder: false, awards: [] }), data)), '');

  assert.equal(String(FF.renderReferences(film(), data)), '');
  const refs = String(FF.renderReferences(film({ references: [{ title: 'Film A', year: 1971, dp: 'Name A', note: 'one window' }, { title: 'Film B', still: 'media/x.jpg' }] }), data));
  assert.match(refs, /Film A<\/span> <span class="film__ref-meta">1971 · DP Name A<\/span><span class="film__ref-note">one window/);
  assert.doesNotMatch(refs, /<img|media\/x\.jpg/, 'text only, never images');

  const enq = String(FF.renderEnquiries(film({ title: 'Night & Day' }), data));
  assert.match(enq, /href="mailto:hello@example\.com\?subject=Night%20%26%20Day"/);
  assert.match(enq, /Sample contact/, 'the sample badge while the contact is a placeholder');
  assert.doesNotMatch(String(FF.renderEnquiries(film(), { ...data, contact: { ...data.contact, placeholder: false } })), /badge-sample/);
  assert.equal(String(FF.renderEnquiries(film(), { ...data, contact: { email: null } })), '');
});

test('sequence normalisation: edit order, at most 8 frames, safe sources, seeds slug + "seq" + i', () => {
  const f = film({
    sequences: [{
      placeholder: true, title: 'Scene A', scene: 'Sc. 07 · INT. ROOM · DAY', hindsight: 'Note',
      frames: [
        { kind: 'insert', alt: 'a', intent: 'one' }, { src: 'media/films/x/seq-01.jpg', alt: 'b', intent: 'two' },
        { src: '/root.jpg', alt: 'dropped' }, { src: 'javascript:alert(1)', alt: 'dropped' }, {},
        ...Array.from({ length: 9 }, (_, i) => ({ kind: 'window-shaft', alt: `c${i}` })),
      ],
    }, { title: 'Empty', frames: [] }, null],
  });
  const [q, ...rest] = FF.sequencesOf(f);
  assert.equal(rest.length, 0, 'a sequence without frames is dropped');
  assert.equal(q.frames.length, 8);
  assert.deepEqual(q.frames.slice(0, 3).map(fr => fr.src ?? fr.kind), ['insert', 'media/films/x/seq-01.jpg', 'window-shaft']);
  q.frames.forEach((fr, i) => {
    assert.equal(fr.aspect, 2.39);
    if (fr.placeholder) assert.equal(fr.seed, hashString(`${f.slug}seq${i}`));
  });
  assert.equal(q.placeholder, true);
  assert.equal(FF.sequencesOf(film({ sequences: [{ placeholder: false, title: 'Real', frames: [{ src: 'a.jpg', alt: 'a' }, { kind: 'insert', alt: 'b' }] }] }))[0].placeholder, true, 'a procedural frame keeps the Sample badge');
  const out = String(FF.renderSequenceShell(f, data));
  assert.match(out, /<p class="cam-label film__h">Sequence\u00a0· Sc\. 07\u00a0· INT\. ROOM\u00a0· DAY<\/p>/, 'no line starts with a dot');
  assert.match(out, /data-lightbox="sequence-0" data-lightbox-index="1" aria-label="Open frame 2 of 8 full screen: b"/);
  assert.match(out, /data-label="Sc\. 07 · 02\/08"/);
  assert.match(out, />Sample sequence</);
  assert.match(out, /In hindsight —<\/span> <span class="sequence__hindsight-text">Note</);
  assert.equal(String(FF.renderSequenceShell(film({ sequences: [] }), data)), '');
});

test('plot arguments: Super 35 field of view at the film\'s aspect, role over Kelvin, practicals glow, title and desc', () => {
  const night = data.films.find(f => f.slug === 'night-exterior-sample');
  const lib = { ...optics, describePlan };
  const a = FF.plotArgs(night, data, lib);
  const p = night.lightingPlot;
  assert.equal(a.camera.fov, optics.fieldOfView(35, optics.FORMATS.s35, 1.85).h);
  assert.deepEqual({ x: a.camera.x, y: a.camera.y, label: a.camera.label }, { x: 0.4, y: 4.5, label: 'A-CAM · 35MM' });
  assert.deepEqual(a.lights.map(l => [l.role, l.az, l.el, l.dist, l.kelvin, l.label, l.detail]), [
    ['key', 40, 55, 3.5, 2000, 'KEY', '2000K'], ['fill', -15, -15, 1.2, 2000, 'FILL', '2000K'],
  ]);
  assert.deepEqual(a.props, [{ x: -1.6, y: -0.8, label: 'SHELTER', detail: 'GLASS' }]);
  assert.equal(a.subject.facing, 'camera');
  assert.equal(a.labels.title, 'Lighting plot: Night Exterior, Sc. 03 · EXT. BUS STOP · NIGHT');
  assert.ok(a.labels.desc.startsWith(describePlan(a.camera, { x: 0, y: 0 }, p.lights)));
  assert.ok(a.labels.desc.endsWith(p.motivation));
  assert.match(a.labels.desc, /Practicals and set: shelter, glass\./);
  // A practical keeps its Kelvin (the glow) and shows it under its label.
  const pr = FF.plotArgs(data.films[0], data, lib).props[0];
  assert.deepEqual([pr.label, pr.detail, pr.kelvin], ['PRACTICAL', '2700K', 2700]);
  // No plot, or one the plan cannot draw: nothing.
  assert.equal(FF.plotArgs(film({ lightingPlot: null }), data, lib), null);
  assert.equal(FF.plotArgs(film({ lightingPlot: { camera: { x: 0, y: 3 }, lights: [] } }), data, lib), null);
  assert.equal(String(FF.renderPlotShell(film({ lightingPlot: null }), data)), '');
  // The legend says in words what the plan draws.
  assert.deepEqual(FF.plotRows(night), [
    ['Camera', 'A-CAM · 35MM · 4.5 m from the subject'],
    ['Key', 'Sodium streetlight · 2000K · 40° camera-left, 55° up · existing'],
    ['Fill', 'Bounce · 2000K · 15° camera-right, 15° down · white board'],
    ['Shelter', 'glass'],
  ]);
  const shell = String(FF.renderPlotShell(night, data));
  assert.match(shell, /<title id="film-plot-svg-title">Lighting plot: Night Exterior, Sc\. 03 · EXT\. BUS STOP · NIGHT<\/title><desc id="film-plot-svg-desc">/);
  assert.match(shell, /role="img" aria-labelledby="film-plot-svg-title" aria-describedby="film-plot-svg-desc">/, 'named by the title, described by the desc (never both in the name)');
  assert.match(shell, /id="plot-title">Lighting plot · Sc\. 03 · EXT\. BUS STOP · NIGHT</, 'the head\'s dots bound to the word before them');
  assert.match(shell, />Sample plot</);
  assert.match(shell, /data-lightbox="frames" data-lightbox-index="0"/, 'the plot\'s frame opens the lightbox on that frame');
});

// pieces/still.js mirrors some compositions by seed. The plan's key must stand on the side its frame is lit
// from: these are the stills' own rules, so a change to them fails here first.
const FLIPPABLE = ['wide-ext', 'night-street', 'window-shaft', 'insert'];
const stillFlips = (kind, seed) => FLIPPABLE.includes(kind) && mulberry32((hashString(kind) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0)() < 0.5;
/** The side each composition is lit from when not mirrored: +1 camera-left (frame left), −1 camera-right. */
const LIT_FROM = { 'window-shaft': 1, insert: 1, 'night-street': -1, 'wide-ext': -1, 'interior-practical': -1, 'close-silhouette': -1 };

test('each sample plot\'s key stands on the side its placeholder frame is lit from', () => {
  const src = read('assets/js/pieces/still.js');
  assert.match(src, /const s = \(hashString\(k\) \^ Math\.imul\(seed \| 0, 0x9e3779b1\)\) >>> 0;\s*const r = mulberry32\(s\);\s*const flip = r\(\) < 0\.5 && \(k === 'wide-ext' \|\| k === 'night-street' \|\| k === 'window-shaft' \|\| k === 'insert'\);/,
    'still.js mirrors by the rule this test copies');
  let checked = 0;
  for (const f of data.films) {
    const p = f.lightingPlot;
    const item = p && FC.frameItems(f)[p.frame];
    if (!item?.placeholder || !(item.kind in LIT_FROM)) continue;
    const key = p.lights.find(l => l.role === 'key');
    const side = LIT_FROM[item.kind] * (stillFlips(item.kind, item.seed) ? -1 : 1);
    assert.equal(Math.sign(key.az), side, `${f.slug}: frame ${p.frame + 1} (${item.kind}${stillFlips(item.kind, item.seed) ? ', mirrored' : ''}) is lit from camera-${side > 0 ? 'left' : 'right'}; the key's az is ${key.az}`);
    checked++;
  }
  assert.ok(checked >= 2, `both sample plots checked (${checked})`);
});

test('seeds: frame i is hashString(slug + i) everywhere; the card, the lead frame and frame 01 share frame 0\'s', () => {
  const f = film();
  const items = FC.frameItems(f);
  assert.deepEqual(items.map(i => i.kind), f.stillKinds);
  items.forEach((it, i) => assert.equal(it.seed, hashString(f.slug + i)));
  assert.equal(FC.frameSeed(f, 0), hashString(`${f.slug}0`));
  assert.equal(FC.sequenceSeed(f, 3), hashString(`${f.slug}seq3`));
  // The work card paints frame 0's seed and first kind (main.js); the lead frame paints frames[0] (project.js).
  assert.match(read('assets/js/site/main.js'), /seed: hashString\(film\.slug \+ 0\), kind: kinds\[0\]/);
  assert.match(read('assets/js/site/project.js'), /paintStill\(hero, frames\[0\]/);
  assert.doesNotMatch(read('assets/js/site/project.js'), /hashString\(`\$\{[^}]*\}hero`\)/, 'no separate hero seed');
  // Without stillKinds: the same default first kind as the card.
  assert.equal(FC.frameItems(film({ stillKinds: [] }))[0].kind, 'wide-ext');
});

test('frame cards: a button per frame, its caption, chips and srcset; real stills keep their own aspect', () => {
  const sample = String(FC.renderFrameCards(film()));
  assert.equal(sample.match(/<button class="still__open"/g).length, 3);
  assert.match(sample, /data-lightbox="frames" data-lightbox-index="2" aria-label="Open frame 3 of 3 full screen: Placeholder still for Untitled Short I: close silhouette"/);
  assert.match(sample, /<span class="still__line">Frame 01\u00a0· window shaft\u00a0· 2\.39:1<\/span>\s*<span class="badge-sample">Placeholder still<\/span>/);
  assert.equal((sample.match(/<span class="chips"[^>]*>(?:<i style="background:#[0-9A-F]{6}"><\/i>){5}<\/span>/gi) ?? []).length, 3, 'five chips from the film palette');
  assert.match(sample, /data-paint="0"/);

  const reals = film({
    stills: [
      { src: 'media/a.jpg', srcset: ['media/a-1400.jpg 1400w', 'media/a.jpg 2800w'], alt: 'Frame A', aspect: 1.5, line: 'Sc.04 · 40 mm · T2.0', palette: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'] },
      { src: 'media/b.jpg', alt: 'Frame B' },
    ],
  });
  const out = String(FC.renderFrameCards(reals));
  assert.match(out, /<span class="frame" style="--ar:1\.5"><img src="media\/a\.jpg" srcset="media\/a-1400\.jpg 1400w, media\/a\.jpg 2800w" sizes="100vw" alt="Frame A"/);
  assert.match(out, /<span class="frame" style="--ar:2\.39"><img src="media\/b\.jpg" alt="Frame B"/, 'no aspect: the film\'s');
  assert.match(out, /<span class="still__line">Sc\.04\u00a0· 40 mm\u00a0· T2\.0<\/span>/, 'a dot is bound to the word before it');
  assert.match(out, /<span class="still__line">Frame 02\u00a0· 2\.39:1<\/span>/, 'no camera line: the frame number and aspect');
  assert.doesNotMatch(out, /Placeholder still|data-paint/);
  assert.equal(out.match(/<span class="chips"[^>]*>(.*?)<\/span>/)[1].match(/<i /g).length, 6);
});

test('wipes: only two real frames make one; the colourist under the grade; no unsafe source', () => {
  const pair = { log: { src: 'media/films/x/log.jpg', alt: 'Log frame' }, final: { src: 'media/films/x/final.jpg', alt: 'Graded frame' }, colourist: 'Name C', note: 'one note' };
  assert.equal(String(FF.renderGradeShell(film(), data)), '', 'nothing on the samples');
  assert.equal(String(FF.renderGradeShell(film({ grade: { ...pair, final: { src: null, alt: 'x' } } }), data)), '', 'both images, or none');
  assert.equal(String(FF.renderGradeShell(film({ grade: { ...pair, log: { src: 'javascript:alert(1)', alt: 'x' } } }), data)), '');
  const out = String(FF.renderGradeShell(film({ grade: pair, previsCompare: { previs: { src: 'media/films/x/pv.jpg', alt: 'Previs' }, final: { src: 'media/films/x/final.jpg', alt: 'Final' } } }), data));
  assert.equal(out.match(/data-wipe-block/g).length, 2);
  assert.match(out, /id="grade-title">Grade · log to final</);
  assert.match(out, /<img src="media\/films\/x\/log\.jpg" alt="Log frame"[\s\S]*A · Log[\s\S]*class="wipe__b"><img src="media\/films\/x\/final\.jpg"/);
  assert.match(out, /<input type="range" min="0" max="100" step="1" value="50" aria-label="Wipe between log and final grade">/);
  assert.match(out, /<figcaption class="wipe__cap">Colourist: Name C · one note<\/figcaption>/);
  assert.match(out, /id="previs-compare-title">Previs · against the final frame</);
  assert.match(read('assets/js/ui/wipe.js'), /^\/\/ Motion Prompt #087 · MIT License \(c\) 2026 Shohei Ohtaki · https:\/\/showheyohtaki\.github\.io\/motion-prompt\/#087/);
});

test('tools/stills.mjs: a frame\'s palette is stable, darkest → lightest; the block pastes as data', async () => {
  const { framePalette, stillsBlock } = await import('../stills.mjs');
  const px = [...Array(40).fill([10, 12, 16]), ...Array(30).fill([200, 120, 40]), ...Array(20).fill([240, 236, 226]), ...Array(10).fill([40, 60, 90])];
  const pal = framePalette(px, 4);
  assert.deepEqual(pal, ['#0A0C10', '#283C5A', '#C87828', '#F0ECE2']);
  assert.deepEqual(framePalette([...px].reverse(), 4), pal, 'the same pixels in another order: the same palette');
  const block = stillsBlock([{ src: 'media/films/x/still-01.jpg', srcset: ['media/films/x/still-01-1400.jpg 1400w', 'media/films/x/still-01.jpg 2800w'], aspect: 2.39, aspectLabel: '2.39:1', palette: pal }]);
  const stills = Function(`return {${block}}`)().stills;
  assert.equal(stills.length, 1);
  assert.deepEqual(stills[0].srcset, ['media/films/x/still-01-1400.jpg 1400w', 'media/films/x/still-01.jpg 2800w']);
  assert.equal(stills[0].featured, true);
  assert.match(stills[0].alt, /^TODO\(owner\)/, 'what the frame shows is the owner\'s to write');
  assert.match(stills[0].line, /^TODO\(owner\)/);
});
