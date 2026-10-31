// Check plugin (static): what the site shows must be what it is.
//   - The data's honesty rules (tools/lib/schema.mjs honestyIssues): no laurels on a sample film, and no
//     sample sub-record (a sample lighting plot or sequence) inside a film marked real.
//   - Every study says it is code, not camera work: each rendered study block and each studies/*.html.
//   - The colophon discloses the AI use, and the rendered colophon shows it.
//   - No model identifiers in the repo's text files (naming the model in prose, as the colophon does, is fine).
//   - Nothing from the fixtures reaches the data or a deployed file: no tools/, .artifacts/ or fixtures/
//     paths, no fixture names (comments aside: a note about the tooling is not a reference).
//   - No <video autoplay> without muted, and the system cursor is never hidden (no cursor: none).

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/server.mjs';
import { honestyIssues } from '../lib/schema.mjs';

/** The label every study carries (plan: "Credits and role clarity"). */
const STUDY_LABEL = 'Interactive study · code written with AI assistance · not camera work';
/** Model identifiers ("<family>-<version>" API names). The model's name in prose does not match. */
const MODEL_IDS = [/\bclaude-[a-z0-9.-]*\d/i, /\bgpt-\d/i, /\bgemini-\d/i];
/** Not the repo's own text: version control, dependencies, local output. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.artifacts', '.cache', '_site']);
const BINARY = /\.(?:png|jpe?g|webp|avif|gif|ico|mp4|webm|mov|woff2?|ttf|otf|pdf|zip|gz|exr)$/i;
/** A path into the tooling or the fixtures (not "devtools/" or "assets/tools/"). */
const FIXTURE_PATH = /(?<![\w./-])(?:\.\.\/)*(?:tools|\.artifacts|fixtures?)\//g;
/**
 * Text only the fixtures use (tools/test/fixtures/full.mjs): their names and notes say "Fixture" ("Fixture Film 1",
 * "Fixture note: …"), their people "Crew Name A", "Director Name A". The data's own template text ("Director Name")
 * has no letter after it; no deployed file says "Fixture" outside its comments.
 */
export const FIXTURE_TEXT = /\bFixture\b|\bFIXTURE\b|\b(?:Crew|Director|Production) Name [A-Z]\b/g;

/** Every file under the repo root except SKIP_DIRS (dot-folders such as .claude and .github included). */
function repoFiles(dir = '', out = []) {
  for (const d of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(d.name)) continue;
    const p = dir ? `${dir}/${d.name}` : d.name;
    if (d.isDirectory()) repoFiles(p, out); else if (d.isFile()) out.push(p);
  }
  return out;
}

async function run({ pass, fail, R, read, walk, deployedFiles, splitComments, lineOf, loadData, decode }) {
  const data = await loadData();
  /** What a file does, without its comments (newlines kept, so line numbers hold). */
  const codeOf = f => {
    const src = read(f);
    if (/\.m?js$/.test(f)) return splitComments(src, 'js').code;
    if (f.endsWith('.css')) return splitComments(src, 'css').code;
    if (!/\.(?:html|svg|xml)$/.test(f)) return src;
    return src.replace(/<!--[\s\S]*?-->/g, s => s.replace(/[^\n]/g, ' '))
      .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, b) => a + splitComments(body, 'js').code + b)
      .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, body, b) => a + splitComments(body, 'css').code + b);
  };

  // 1. Laurels only on real films; sample sub-records only inside sample films.
  const issues = honestyIssues(data);
  for (const m of issues) fail(m);
  const films = data.films ?? [];
  const samples = films.filter(f => f?.placeholder === true)
    .reduce((n, f) => n + (f.lightingPlot?.placeholder === true) + (f.sequences ?? []).filter(q => q?.placeholder === true).length, 0);
  if (!issues.length) pass(`no laurels on sample films; no sample block inside a film marked real (${samples} sample plot/sequence block(s), all inside sample films)`);

  // 2. Every study says it is code written with AI assistance, not camera work.
  const studies = data.studies ?? [];
  const bare = studies.filter(s => !decode(String(R.renderStudy(s, data))).includes(STUDY_LABEL)).map(s => s.id);
  const pages = walk('studies', f => f.endsWith('.html')).sort();
  const unlabelled = pages.filter(f => !decode(read(f).replace(/<!--[\s\S]*?-->/g, '')).includes(STUDY_LABEL));
  if (bare.length) fail(`study block(s) rendered without "${STUDY_LABEL}": ${bare.join(', ')} (render.js renderStudy)`);
  if (unlabelled.length) fail(`study page(s) without "${STUDY_LABEL}": ${unlabelled.join(', ')}`);
  if (!bare.length && !unlabelled.length) pass(`every study is labelled "${STUDY_LABEL}": ${studies.length} rendered study blocks, ${pages.length} studies/*.html pages`);

  // 3. The colophon discloses the AI use, and the page shows it.
  const col = String(data.colophon?.text ?? '');
  if (!/\b(?:AI|artificial intelligence|Claude)\b/i.test(col)) fail('colophon.text does not disclose the AI use (which parts of the site are code written with an AI model)');
  else if (!decode(String(R.renderColophon(data))).includes(col)) fail('the rendered colophon does not show colophon.text (render.js renderColophon)');
  else pass(`the colophon discloses the AI use, and renderColophon shows it ("${col.slice(0, 72)}…")`);

  // 4. No model identifiers in any text file of the repo.
  let scanned = 0, ids = 0;
  for (const f of repoFiles()) {
    if (BINARY.test(f)) continue;
    const buf = fs.readFileSync(path.join(REPO_ROOT, f));
    if (buf.subarray(0, 8000).includes(0)) continue;   // binary without a known extension
    scanned++;
    const src = buf.toString('utf8');
    for (const re of MODEL_IDS) {
      const m = re.exec(src);
      if (m) { ids++; fail(`${f}:${lineOf(src, m.index)}: model identifier "${m[0]}" (name the model in prose, or leave it out)`); break; }
    }
  }
  if (!ids) pass(`no model identifiers in ${scanned} text files (skipped: ${[...SKIP_DIRS].join(', ')} and binaries)`);

  // 5. Fixture paths and names never reach the data or a deployed file.
  const deployed = deployedFiles(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.xml', '.svg']);
  let leaks = 0;
  for (const f of deployed) {
    const code = codeOf(f);
    for (const re of [FIXTURE_PATH, FIXTURE_TEXT]) {
      const hits = [...code.matchAll(re)];
      if (hits.length) { leaks++; fail(`${f}:${hits.map(m => lineOf(code, m.index)).join(',')}: ${re === FIXTURE_PATH ? 'tooling/fixture path' : 'fixture text'} "${hits[0][0]}" (fixtures are served by tools/lib/fixture.mjs in tests only, never deployed)`); }
    }
  }
  if (!leaks) pass(`no tools/, .artifacts/ or fixtures/ paths and no fixture names in ${deployed.length} deployed files (data/portfolio.js included)`);

  // 6. Sound never starts on its own, and the pointer stays visible.
  let media = 0;
  for (const f of deployedFiles(['.html', '.js', '.mjs'])) {
    const code = codeOf(f);
    for (const m of code.matchAll(/<video\b[^>]*>/gi)) {
      if (/\bautoplay\b/i.test(m[0]) && !/\bmuted\b/i.test(m[0])) { media++; fail(`${f}:${lineOf(code, m.index)}: <video autoplay> without muted`); }
    }
    const auto = /\.autoplay\s*=\s*true|setAttribute\(\s*['"`]autoplay['"`]/.exec(code);
    if (auto && !/\.muted\s*=\s*true|\bmuted\b/.test(code)) { media++; fail(`${f}:${lineOf(code, auto.index)}: sets autoplay on a video and never mutes it`); }
  }
  for (const f of deployedFiles(['.css', '.html', '.js', '.mjs'])) {
    const code = codeOf(f);
    for (const m of code.matchAll(/\bcursor\s*:\s*none\b|\.cursor\s*=\s*['"`]none\b|setProperty\(\s*['"`]cursor['"`]\s*,\s*['"`]none\b/gi)) {
      media++; fail(`${f}:${lineOf(code, m.index)}: "${m[0]}" hides the system cursor (the pointer always stays visible)`);
    }
  }
  if (!media) pass('no <video autoplay> without muted; no cursor: none in deployed CSS, HTML or JS');
}

export const staticSections = [
  { name: 'honesty', title: 'Honesty: samples and laurels, AI labels, model identifiers, fixtures, autoplay, cursor', run },
];
