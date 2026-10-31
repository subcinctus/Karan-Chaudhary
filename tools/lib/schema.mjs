// Data schema for data/portfolio.js: the shape of every field the site renders, the honesty rules
// (laurels only on real films; no sample sub-record inside a film marked real), the reel's limits and
// the photograph counts the schools ask for. Pure apart from the file probes it is handed, so the tests
// run it on any data object (the fixture too).
//
//   validateData(data, { exists, size, now, honesty }) → { fails, warns, infos, summary }
//     exists(path) → boolean and size(path) → bytes take repo-relative paths (default: this checkout).
//     now (a Date) ages the reel's "updated" month. honesty: false leaves out honestyIssues(data), which
//     tools/checks/honesty.mjs reports on its own.
//
// Numbers and their sources (checked 2026-10):
//   AFI: a reel of up to 3 minutes; 8–12 photographs including "a few formal portraits", one PDF of 15 MB
//     or less, no frames from a motion picture: https://conservatory.afi.com/admissions-requirements/
//   Reel 1:00–2:30: "60 to 90 seconds is the modern standard" (https://www.boldcine.com/university/lessons/showcasing-your-work-online);
//     "maybe two, two-and-a-half minutes" (https://sony-cinematography.com/articles/reels-for-cinematographers-part-2-a-studio-exec-s-perspective/)
//   NYU: up to 10 images: https://tisch.nyu.edu/grad-film/admissions/portfolio-requirements-for-mfa-in-filmmaking
//   FAMU: 10–15 photographs: https://www.famu.cz/en/departments/famu-international-fi/one-year-courses/cinematography/
//   AFAD Łódź (the set keyed lodz; the Łódź Film School is another school, and its page sets no photograph
//     count): 10 photographs, or two series of 5 (one colour, one black-and-white): https://www.afad.com.pl/film-school.html
//   Beijing Film Academy: 10–12 (a third-party source): https://www.china-admissions.com/blog/beijing-film-academy-applications-open-for-intake-2024/

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './server.mjs';
import { STILL_KINDS } from '../../assets/js/pieces/still.js';
import { filled } from '../../assets/js/site/html.js';

export const FILM_KINDS = ['fiction', 'documentary', 'music-video', 'commercial', 'experimental', 'exercise'];
export const MADE_AT = ['school', 'independent', 'commissioned'];
export const PHOTO_SETS = ['afi', 'nyu', 'famu', 'lodz', 'bfa'];

const HEX = /^#[0-9a-f]{6}$/i;
const MOVES = new Set(['027', '030', '031', '032', '033', '043']);
/** Keys whose string values are media or link paths: every relative one must exist. */
const PATH_KEYS = new Set(['src', 'poster', 'video', 'cv', 'href', 'image', 'ogImage', 'shotlist', 'still', 'file', 'thumb']);
/** Keys that would put an image into a text-only list (references, tenFilms). */
const IMAGE_KEYS = new Set(['src', 'srcset', 'image', 'img', 'poster', 'still', 'thumb', 'photo']);
/** Photograph sets by school (sources above): ok(n, photos) for the photos tagged with the set. */
const SETS = {
  afi: { name: 'AFI', want: '8–12, including "a few formal portraits" (this check asks for at least 2)', ok: (n, ps) => n >= 8 && n <= 12 && ps.filter(p => p.portrait === true).length >= 2 },
  nyu: { name: 'NYU', want: 'at most 10', ok: n => n <= 10 },
  famu: { name: 'FAMU', want: '10–15', ok: n => n >= 10 && n <= 15 },
  lodz: { name: 'AFAD Łódź', want: '10, or two series of 5 (one colour, one black-and-white)', ok: (n, ps) => n === 10 && (new Set(ps.map(p => p.kind)).size === 1 || ps.filter(p => p.kind === 'colour').length === 5) },
  bfa: { name: 'Beijing Film Academy', want: '10–12', ok: n => n >= 10 && n <= 12 },
};
/** AFI caps the photograph PDF at 15 MB: warn above 13 MB of images, leaving room for the PDF itself. */
const SET_BYTES = 13e6;

const repoExists = p => fs.existsSync(path.join(REPO_ROOT, p));
const repoSize = p => fs.statSync(path.join(REPO_ROOT, p)).size;
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim() !== '';
const num = v => typeof v === 'number' && Number.isFinite(v);
const https = v => typeof v === 'string' && /^https:\/\/\S+$/.test(v);
const kelvin = v => num(v) && v >= 1500 && v <= 12000;
const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
/** A path without its query or hash: the file it names. */
const local = p => String(p).split(/[?#]/)[0];
/** '1:02' or '1:02:03' (or a number of seconds) → seconds; anything else → NaN. */
function seconds(t) {
  if (typeof t === 'number') return t >= 0 ? t : NaN;
  const m = /^(?:(\d+):)?(\d{1,2}):([0-5]\d)$/.exec(String(t ?? '').trim());
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** Paths of the objects below v (not v itself) that carry placeholder: true; a sample's insides are not listed. */
function samplesIn(v, at, out = []) {
  for (const [k, x] of Object.entries(v)) {
    if (!x || typeof x !== 'object') continue;
    const p = Array.isArray(v) ? `${at}[${k}]` : `${at}.${k}`;
    if (!Array.isArray(x) && x.placeholder === true) out.push(p);
    else samplesIn(x, p, out);
  }
  return out;
}

/**
 * The honesty rules, as FAIL messages. Laurels (premiere, awards) are facts, so never on a sample film.
 * A sample sub-record (placeholder: true: a sample lighting plot, a sample sequence) may only sit inside a
 * sample film: inside a film marked real it would pass a diagram or frames off as that film's own.
 */
export function honestyIssues(data) {
  const out = [];
  (Array.isArray(data?.films) ? data.films : []).forEach((f, i) => {
    if (!isObj(f)) return;
    const at = `films[${i}]`;
    if (f.placeholder === true) {
      const laurels = [f.premiere != null && 'a premiere', Array.isArray(f.awards) && f.awards.length && `${f.awards.length} award(s)`].filter(Boolean);
      if (laurels.length) out.push(`${at}${f.slug ? ` (${f.slug})` : ''} is a sample film but lists ${laurels.join(' and ')}: laurels are real facts only (remove them, or set placeholder: false once the film is real)`);
    } else {
      for (const p of samplesIn(f, at)) out.push(`${p} is still the sample: replace or delete it (${f.slug ?? at} is marked real)`);
      // A film marked real publishes its credits (the page, the Index, the JSON-LD): never the template's.
      for (const k of ['director', 'production']) if (f[k] != null && !filled(f[k])) out.push(`${at}.${k} is still the template's "${f[k]}" (${f.slug ?? at} is marked real): fill it in or set it to null`);
      if (/^\s*Sample\b/.test(f.logline ?? '')) out.push(`${at}.logline is still the sample's (${f.slug ?? at} is marked real)`);
      (Array.isArray(f.sequences) ? f.sequences : []).forEach((q, j) => { if (/^\s*Sample\b/.test(q?.hindsight ?? '')) out.push(`${at}.sequences[${j}].hindsight is still the sample's (${f.slug ?? at} is marked real)`); });
    }
  });
  return out;
}

export function validateData(data, { exists = repoExists, size = repoSize, now = new Date(), honesty = true } = {}) {
  const fails = [], warns = [], infos = [];
  const fail = m => fails.push(m), warn = m => warns.push(m), info = m => infos.push(m);
  const d = isObj(data) ? data : {};
  let paths = 0;

  /** A relative path that must exist (srcset candidates; the other paths are found by the walk at the end). */
  const file = (p, at) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(p)) return fail(`${at}: "${p}" must be a relative path`);
    paths++;
    if (!exists(local(p))) fail(`${at}: "${p}" does not exist`);
  };
  const palette = (p, at) => {
    if (!Array.isArray(p) || !p.every(c => HEX.test(c))) return fail(`${at} must be a list of #RRGGBB colours`);
    if (p.length < 5 || p.length > 6) warn(`${at} has ${p.length} colours (frame cards show 5–6 chips)`);
  };
  /** references and person.tenFilms: at most 10 entries of { title, year?, dp?, note? }, text only. */
  const textList = (list, at) => {
    if (list == null) return;
    if (!Array.isArray(list)) return fail(`${at} must be a list of { title, year?, dp?, note? }`);
    if (list.length > 10) fail(`${at} has ${list.length} entries (at most 10)`);
    list.forEach((e, j) => {
      if (!isObj(e) || !text(e.title)) return fail(`${at}[${j}] needs a title`);
      if (e.year != null && !Number.isInteger(e.year)) fail(`${at}[${j}].year must be a whole number`);
      for (const k of ['dp', 'note']) if (e[k] != null && !text(e[k])) fail(`${at}[${j}].${k} must be text`);
      const img = Object.keys(e).filter(k => IMAGE_KEYS.has(k));
      if (img.length) fail(`${at}[${j}] has ${img.join(', ')}: this list is text only (never another film's frames)`);
    });
  };
  /** A before/after (grade, previsCompare): both images, each with alt text. */
  const pair = (v, at, keys) => {
    if (v == null) return;
    if (!isObj(v)) return fail(`${at} must be { ${keys.map(k => `${k}: { src, alt }`).join(', ')} }, or null`);
    for (const k of keys) {
      if (!isObj(v[k]) || !text(v[k].src)) fail(`${at}.${k}.src is missing (a before/after needs both images)`);
      else if (!text(v[k].alt)) fail(`${at}.${k} needs alt text`);
    }
  };
  /** A film's lighting plot: metres from the subject (camera toward +y), degrees, Kelvin. */
  const plot = (p, at, frames) => {
    if (!isObj(p)) return fail(`${at} must be an object, or null`);
    if (!(Number.isInteger(p.frame) && p.frame >= 0 && p.frame < frames)) fail(`${at}.frame ${JSON.stringify(p.frame)} is not one of the film's ${frames} frames (0–${frames - 1})`);
    const c = p.camera;
    if (!(isObj(c) && num(c.x) && num(c.y) && num(c.focal) && c.focal > 0)) fail(`${at}.camera must be { x, y, focal, label? } (metres from the subject, focal length in mm)`);
    if (p.subject != null && !isObj(p.subject)) fail(`${at}.subject must be an object ({ facing })`);
    const lights = Array.isArray(p.lights) ? p.lights : [];
    if (!lights.length) fail(`${at} needs at least one light`);
    lights.forEach((l, j) => {
      const lat = `${at}.lights[${j}]`;
      if (!isObj(l) || !text(l.role)) return fail(`${lat} needs a role (key, fill, back …)`);
      if (!(num(l.az) && num(l.el) && num(l.dist) && l.dist > 0)) fail(`${lat} needs numeric az and el (degrees) and dist (metres, > 0)`);
      if (!kelvin(l.kelvin)) fail(`${lat}.kelvin ${JSON.stringify(l.kelvin)} is outside 1500–12000 K`);
    });
    if (p.props != null && !Array.isArray(p.props)) fail(`${at}.props must be a list`);
    else (p.props ?? []).forEach((q, j) => {
      if (!(isObj(q) && num(q.x) && num(q.y))) fail(`${at}.props[${j}] needs numeric x and y (metres)`);
      else if (q.kelvin != null && !kelvin(q.kelvin)) fail(`${at}.props[${j}].kelvin ${JSON.stringify(q.kelvin)} is outside 1500–12000 K`);
    });
    for (const k of ['scene', 'motivation']) if (p[k] != null && !text(p[k])) fail(`${at}.${k} must be text`);
    if (p.motivation == null) warn(`${at} has no motivation (why each light is where it is)`);
  };
  // Film frames and set stills by file, each named where it first appears: a photograph must never be a
  // film frame (AFI: no frames from a motion picture, no set stills).
  const frameSrcs = new Map(), setStills = new Map();
  const note = (map, src, at) => { if (text(src) && !map.has(local(src))) map.set(local(src), at); };
  /** A scene in 3–8 frames: real frames (src) or procedural placeholders (kind), each with its intent. */
  const sequence = (q, at) => {
    if (!isObj(q)) return fail(`${at} must be { title, scene?, frames, hindsight? }`);
    if (!text(q.title)) fail(`${at} needs a title`);
    for (const k of ['scene', 'hindsight']) if (q[k] != null && !text(q[k])) fail(`${at}.${k} must be text`);
    const frames = Array.isArray(q.frames) ? q.frames : [];
    if (frames.length < 3 || frames.length > 8) fail(`${at} has ${frames.length} frames (3–8, in edit order)`);
    let procedural = 0;
    frames.forEach((fr, k) => {
      const fat = `${at}.frames[${k}]`;
      if (!isObj(fr)) return fail(`${fat} must be { src or kind, alt, intent }`);
      if (!text(fr.src) && fr.kind == null) fail(`${fat} needs a src (a real frame) or a kind (${STILL_KINDS.join(', ')})`);
      if (fr.kind != null && !STILL_KINDS.includes(fr.kind)) fail(`${fat}.kind ${JSON.stringify(fr.kind)} is not one of ${STILL_KINDS.join(', ')}`);
      if (text(fr.src)) note(frameSrcs, fr.src, fat);
      else if (fr.kind != null) procedural++;
      if (!text(fr.alt)) fail(`${fat} needs alt text`);
      if (!text(fr.intent)) warn(`${fat} has no intent line`);
      else if (fr.intent.length > 140) warn(`${fat}.intent is ${fr.intent.length} characters (one line: at most 140)`);
    });
    if (procedural && q.placeholder !== true) warn(`${at} has ${procedural} procedural frame(s) but is not marked placeholder: true (it would show without its Sample badge)`);
  };

  // --- Site and person
  const s = d.site ?? {};
  if (!/^https:\/\/.+\/$/.test(s.url ?? '')) fail(`site.url must be an absolute https URL ending in "/" (got ${JSON.stringify(s.url)})`);
  for (const k of ['title', 'description']) if (typeof s[k] !== 'string' || !s[k].trim()) fail(`site.${k} is missing`);
  if (!d.person?.name) fail('person.name is missing');
  textList(d.person?.tenFilms, 'person.tenFilms');

  // --- Films
  const films = Array.isArray(d.films) ? d.films : [];
  if (!films.length) fail('films is empty (the work grid needs at least one record)');
  const slugs = new Set(), emptyFacts = [];
  films.forEach((film, i) => {
    const f = isObj(film) ? film : {};
    const at = `films[${i}]${f.slug ? ` (${f.slug})` : ''}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug ?? '')) fail(`${at}: slug must be lowercase-kebab (got ${JSON.stringify(f.slug)})`);
    if (slugs.has(f.slug)) fail(`${at}: duplicate slug`);
    slugs.add(f.slug);
    if (!f.title) fail(`${at}: title is missing`);
    if (!(typeof f.aspect === 'number' && Number.isFinite(f.aspect) && f.aspect >= 1 && f.aspect <= 4)) fail(`${at}: aspect must be a number between 1 and 4 (got ${JSON.stringify(f.aspect)})`);
    if (f.frameRate != null && !(typeof f.frameRate === 'number' && f.frameRate > 0)) fail(`${at}: frameRate must be a number`);
    if (f.year != null && !Number.isInteger(f.year)) fail(`${at}: year must be a whole number`);
    if (!Array.isArray(f.palette) || f.palette.length < 2) fail(`${at}: palette must be an array of hex colours`);
    else {
      f.palette.forEach((c, j) => { if (!HEX.test(c)) fail(`${at}: palette[${j}] ${JSON.stringify(c)} is not #RRGGBB`); });
      if (f.palette.length !== 5) warn(`${at}: palette has ${f.palette.length} colours (cards and stills expect 5, darkest → lightest)`);
    }
    const mv = String(f.move ?? '').replace(/^#/, '');
    if (!MOVES.has(mv)) fail(`${at}: move ${JSON.stringify(f.move)} is not one of #027 #030 #031 #032 #033 #043`);
    if (f.stillKinds != null && !(Array.isArray(f.stillKinds) && f.stillKinds.every(k => STILL_KINDS.includes(k)))) fail(`${at}: stillKinds must list compositions from ${STILL_KINDS.join(', ')}`);
    for (const [k, arr] of [['stills', f.stills], ['bts', f.bts]]) {
      if (arr != null && !Array.isArray(arr)) { fail(`${at}: ${k} must be an array`); continue; }
      (arr ?? []).forEach((st, j) => {
        if (!st?.src) fail(`${at}: ${k}[${j}] has no src`);
        if (!st?.alt || !String(st.alt).trim()) fail(`${at}: ${k}[${j}] needs alt text`);
        if (st?.aspect != null && !(typeof st.aspect === 'number' && st.aspect > 0)) fail(`${at}: ${k}[${j}].aspect must be a number`);
        note(k === 'stills' ? frameSrcs : setStills, st?.src, `${at}: ${k}[${j}]`);
      });
    }

    // Frame cards: a camera line, palette chips and srcset variants (1400w / 2800w).
    const stills = Array.isArray(f.stills) ? f.stills : [];
    stills.forEach((st, j) => {
      if (!isObj(st)) return;
      const sat = `${at}: stills[${j}]`;
      if (st.srcset != null) {
        if (!Array.isArray(st.srcset) || !st.srcset.length) fail(`${sat}.srcset must be a list like ['media/films/<slug>/still-01-1400.jpg 1400w', …]`);
        else st.srcset.forEach((c, k) => {
          const m = /^(\S+)\s+(\d+)w$/.exec(String(c).trim());
          if (!m) fail(`${sat}.srcset[${k}] ${JSON.stringify(c)} is not "path NNNw"`);
          else file(m[1], `${sat}.srcset[${k}]`);
        });
      }
      if (st.line != null && !text(st.line)) fail(`${sat}.line must be text, e.g. 'Sc.04 · 40 mm · T2.0 · EI 800 · 2.39:1 · INT. NIGHT'`);
      if (st.palette != null) palette(st.palette, `${sat}.palette`);
      if (st.featured != null && typeof st.featured !== 'boolean') fail(`${sat}.featured must be true or false`);
      if (st.focus != null && !(Array.isArray(st.focus) && st.focus.every(p => Array.isArray(p) && p.length === 2 && p.every(v => num(v) && v >= 0 && v <= 1)))) {
        fail(`${sat}.focus must be points as fractions of the frame, e.g. [[0.36, 0.56], [0.72, 0.36]]`);
      }
    });
    const featured = stills.filter(st => st?.featured === true).length;
    if (featured > 1) warn(`${at}: ${featured} stills are featured (the first one leads)`);

    // What kind of film it is, and the facts the schools ask for (AFI: where it was made and any AI use;
    // NFTS: credited as camera operator and lighting designer). Empty facts are hidden on the site.
    if (f.kind == null) warn(`${at}: kind is missing (${FILM_KINDS.join(' | ')})`);
    else if (!FILM_KINDS.includes(f.kind)) fail(`${at}: kind ${JSON.stringify(f.kind)} is not one of ${FILM_KINDS.join(', ')}`);
    if (f.madeAt != null && !(isObj(f.madeAt) && MADE_AT.includes(f.madeAt.type) && ['name', 'note'].every(k => f.madeAt[k] == null || text(f.madeAt[k])))) {
      fail(`${at}: madeAt must be { type: '${MADE_AT.join("' | '")}', name?, note? }`);
    }
    if (f.aiUse != null && !text(f.aiUse)) fail(`${at}: aiUse must be 'none' or plain words about what AI did on the film`);
    for (const k of ['operated', 'lit']) if (f[k] != null && typeof f[k] !== 'boolean') fail(`${at}: ${k} must be true, false or null`);
    const open = ['madeAt', 'aiUse', 'operated', 'lit'].filter(k => f[k] == null);
    if (open.length && f.placeholder === true) emptyFacts.push(f.slug);
    else if (open.length) warn(`${at}: ${open.join(', ')} not filled in (AFI asks where each film was made and about any AI use; NFTS asks to see you credited as operator and lighting designer)`);
    if (f.crew != null && !Array.isArray(f.crew)) fail(`${at}: crew must be a list of { role, name } (name null until it is real)`);
    else (f.crew ?? []).forEach((c, j) => {
      if (!isObj(c) || !text(c.role)) fail(`${at}: crew[${j}] needs a role`);
      else if (c.name != null && !text(c.name)) fail(`${at}: crew[${j}].name must be text, or null to leave the row out`);
    });

    // Laurels and references: text only, real only (honestyIssues keeps them off sample films).
    if (f.premiere != null && !(isObj(f.premiere) && text(f.premiere.event) && Number.isInteger(f.premiere.year) && (f.premiere.url == null || https(f.premiere.url)))) {
      fail(`${at}: premiere must be { event, year, url? } (url: https)`);
    }
    if (f.awards != null && !Array.isArray(f.awards)) fail(`${at}: awards must be a list`);
    else (f.awards ?? []).forEach((a, j) => {
      const ok = typeof a === 'string' ? text(a) : isObj(a) && text(a.title) && text(a.event) && Number.isInteger(a.year) && (a.url == null || https(a.url));
      if (!ok) fail(`${at}: awards[${j}] must be { title, event, year, url? } (url: https) or plain text`);
    });
    textList(f.references, `${at}: references`);

    // Lighting plot, sequences, before/afters and the hover preview.
    if (f.lightingPlot != null) plot(f.lightingPlot, `${at}: lightingPlot`, stills.filter(st => text(st?.src)).length || f.stillKinds?.length || 3);
    if (f.sequences != null && !Array.isArray(f.sequences)) fail(`${at}: sequences must be a list`);
    else (f.sequences ?? []).forEach((q, j) => sequence(q, `${at}: sequences[${j}]`));
    pair(f.grade, `${at}: grade`, ['log', 'final']);
    if (isObj(f.grade) && f.grade.colourist != null && !text(f.grade.colourist)) fail(`${at}: grade.colourist must be a name, or null`);
    pair(f.previsCompare, `${at}: previsCompare`, ['previs', 'final']);
    for (const k of ['grade', 'previsCompare']) for (const [side, v] of Object.entries(isObj(f[k]) ? f[k] : {})) note(frameSrcs, v?.src, `${at}: ${k}.${side}`);
    if (f.preview != null) {
      if (!(isObj(f.preview) && text(f.preview.src))) fail(`${at}: preview must be { src: 'media/films/<slug>/preview.mp4', poster? }`);
      else if (!/\.mp4$/i.test(local(f.preview.src))) fail(`${at}: preview.src must be an .mp4 (H.264, muted, 4–6 s)`);
      else if (exists(local(f.preview.src)) && size(local(f.preview.src)) > 2e6) warn(`${at}: preview.src is over 2 MB (it plays on hover: 800 px wide, 4–6 s)`);
    }
  });
  (Array.isArray(d.stills) ? d.stills : []).forEach((st, j) => note(frameSrcs, st?.src, `stills[${j}]`));
  if (emptyFacts.length) info(`${emptyFacts.length} sample film(s) leave madeAt, aiUse, operated or lit empty, so those rows stay hidden (AFI and NFTS ask for them: fill them in when a film becomes real)`);

  (d.credits ?? []).forEach((c, i) => { if (c.year != null && !Number.isInteger(c.year)) fail(`credits[${i}]: year must be a whole number`); });
  if (d.contact?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contact.email)) fail(`contact.email ${JSON.stringify(d.contact.email)} is not an email address`);
  for (const id of Object.keys(d.previs?.media ?? {})) if (!/^PV-\d{3}$/.test(id)) warn(`previs.media key ${id} does not look like a shot id (PV-010…)`);

  // --- Reel (hidden until it has a provider; its limits are checked either way)
  const r = isObj(d.reel) ? d.reel : {};
  const runtime = r.runtime == null ? null : seconds(r.runtime);
  if (Number.isNaN(runtime)) fail(`reel.runtime ${JSON.stringify(r.runtime)} is not a time like '1:30'`);
  else if (runtime > 180) fail(`reel.runtime ${r.runtime} is over 3:00 (AFI's limit for a reel)`);
  else if (runtime != null && (runtime < 60 || runtime > 150)) warn(`reel.runtime ${r.runtime} is outside 1:00–2:30 (hiring advice: about two minutes; AFI's limit is 3:00)`);
  if (r.updated != null) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(r.updated));
    const t = new Date(now);
    const age = m ? (t.getUTCFullYear() * 12 + t.getUTCMonth()) - (Number(m[1]) * 12 + Number(m[2]) - 1) : 0;
    if (!m) fail(`reel.updated ${JSON.stringify(r.updated)} must be 'YYYY-MM'`);
    else if (age > 12) warn(`reel.updated ${r.updated} is ${age} months old: recut the reel, or update the label once it is current`);
  }
  if (r.uploadDate != null && !isoDate(r.uploadDate)) fail(`reel.uploadDate ${JSON.stringify(r.uploadDate)} must be a date 'YYYY-MM-DD'`);
  if (r.hash != null && !(typeof r.hash === 'string' && /^[0-9a-z]+$/i.test(r.hash))) fail('reel.hash must be the letters and digits after the id in a Vimeo unlisted link');
  else if (r.hash != null && r.provider !== 'vimeo') warn(`reel.hash is set but reel.provider is ${JSON.stringify(r.provider)} (only Vimeo uses it)`);
  if (r.dialogue != null && typeof r.dialogue !== 'boolean') fail('reel.dialogue must be true, false or null');
  if (r.captions != null && !(isObj(r.captions) && text(r.captions.lang) && text(r.captions.label) && (r.captions.src == null || text(r.captions.src)))) {
    fail(`reel.captions must be { lang: 'en', label: 'English', src? } (src: a .vtt file, for a video file reel)`);
  }
  if (r.shots != null && !Array.isArray(r.shots)) fail('reel.shots must be a list');
  let last = -1;
  (Array.isArray(r.shots) ? r.shots : []).forEach((sh, j) => {
    const at = `reel.shots[${j}]`;
    const t = isObj(sh) ? seconds(sh.t) : NaN;
    if (Number.isNaN(t)) return fail(`${at}.t ${JSON.stringify(sh?.t)} is not a time like '0:12'`);
    if (t <= last) fail(`${at}.t ${sh.t} does not come after the shot before it (shots are listed in reel order)`);
    else if (runtime != null && !Number.isNaN(runtime) && t >= runtime) fail(`${at}.t ${sh.t} is not inside the reel's ${r.runtime}`);
    last = Math.max(last, t);
    if (sh.film != null && !slugs.has(sh.film)) fail(`${at}.film ${JSON.stringify(sh.film)} is not a film slug`);
    for (const k of ['title', 'lens', 'note']) if (sh[k] != null && !text(sh[k])) fail(`${at}.${k} must be text`);
  });
  if (!r.provider) info('reel: no provider yet, so the reel section and its links stay hidden');
  else if (r.placeholder === true) warn('reel.placeholder is still true though the reel has a provider: the page tags it Sample and search engines get no VideoObject for it; set placeholder: false once it is your own reel');

  // --- Photographs (hidden until real, and never samples: the print view is made to be submitted)
  const ph = d.photographs;
  const photos = [];
  if (ph != null && !isObj(ph)) fail('photographs must be { captions, series: [...] }');
  else if (ph != null) {
    if (ph.placeholder === true || samplesIn(ph, 'photographs').length) fail('photographs: no sample photographs (placeholder: true): the print view is made to be submitted, so only real photographs go here');
    if (ph.captions != null && typeof ph.captions !== 'boolean') fail('photographs.captions must be true or false');
    if (ph.series != null && !Array.isArray(ph.series)) fail('photographs.series must be a list');
    (Array.isArray(ph.series) ? ph.series : []).forEach((se, j) => {
      const at = `photographs.series[${j}]`;
      if (!isObj(se)) return fail(`${at} must be { title, year?, kind, note?, photos }`);
      if (!text(se.title)) fail(`${at} needs a title`);
      if (!['colour', 'bw'].includes(se.kind)) fail(`${at}.kind must be 'colour' or 'bw'`);
      if (se.year != null && !Number.isInteger(se.year)) fail(`${at}.year must be a whole number`);
      if (!Array.isArray(se.photos)) return fail(`${at}.photos must be a list`);
      se.photos.forEach((p, k) => {
        const pat = `${at}.photos[${k}]`;
        if (!isObj(p) || !text(p.src)) return fail(`${pat} needs a src`);
        if (!text(p.alt)) fail(`${pat} needs alt text`);
        if (!(num(p.w) && p.w > 0 && num(p.h) && p.h > 0)) fail(`${pat} needs its size in pixels: positive w and h`);
        if (p.portrait != null && typeof p.portrait !== 'boolean') fail(`${pat}.portrait must be true or false`);
        if (p.sets != null && !(Array.isArray(p.sets) && p.sets.every(x => PHOTO_SETS.includes(x)))) fail(`${pat}.sets must list some of ${PHOTO_SETS.join(', ')}`);
        const frame = frameSrcs.get(local(p.src)), bts = setStills.get(local(p.src));
        if (frame) fail(`${pat}: ${p.src} is also a film frame (${frame}); schools ask for photographs, never frames from a film`);
        else if (bts) warn(`${pat}: ${p.src} is also a behind-the-scenes still (${bts}); AFI excludes set stills`);
        photos.push({ ...p, kind: se.kind });
      });
    });
  }
  const tally = [];
  for (const [id, rule] of Object.entries(SETS)) {
    const ps = photos.filter(p => Array.isArray(p.sets) && p.sets.includes(id));
    if (!ps.length) continue;
    tally.push(`${id} ${ps.length}`);
    if (!rule.ok(ps.length, ps)) warn(`photographs set ${id}: ${ps.length} photo(s)${id === 'afi' ? `, ${ps.filter(p => p.portrait === true).length} portrait(s)` : ''}; ${rule.name} asks for ${rule.want}`);
    let bytes = 0;
    for (const p of ps) { try { bytes += size(local(p.src)); } catch { /* a missing file is reported with the paths */ } }
    if (bytes > SET_BYTES) warn(`photographs set ${id}: about ${(bytes / 1e6).toFixed(1)} MB of images (over ${SET_BYTES / 1e6} MB; AFI caps the PDF at 15 MB, so resize the JPEGs)`);
  }
  if (photos.length) info(`photographs: ${photos.length} in ${ph.series.length} series; sets: ${tally.join(', ') || 'none tagged yet'}`);
  else info('photographs: none yet, so the section and its nav item stay hidden and photographs.html says so');

  // --- Paths: every non-null media or link path is relative and exists.
  const seen = new WeakSet();
  const visit = (v, at, key) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return; seen.add(v);
      for (const [k, x] of Object.entries(v)) visit(x, Array.isArray(v) ? `${at}[${k}]` : `${at}.${k}`, Array.isArray(v) ? key : k);
      return;
    }
    if (typeof v !== 'string' || !PATH_KEYS.has(key)) return;
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(v)) return;
    if (v.startsWith('/')) return fail(`${at}: "${v}" is root-relative; use a relative path`);
    const p = local(v);
    if (!p) return;
    paths++;
    if (!exists(p)) fail(`${at}: "${v}" does not exist`);
  };
  visit(d, 'data', '');

  if (honesty) for (const m of honestyIssues(d)) fail(m);
  const summary = `schema ok: ${films.length} films (unique slugs, hex palettes, numeric aspects, moves in #027/#030/#031/#032/#033/#043; kinds, facts, crew, laurels, frames, plots and sequences well-formed); reel and photographs well-formed; ${paths} media/link paths exist`;
  return { fails, warns, infos, summary };
}
