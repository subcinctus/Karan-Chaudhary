#!/usr/bin/env node
// Re-fetch the vendored motion libraries (GSAP, Lenis) with `npm pack`, verify the tarball integrity
// and every file's sha256 against tools/vendor-manifest.json, and copy them into assets/js/vendor/.
// Dev-only (not deployed); package.json keeps zero dependencies.
//
//   node tools/vendor-motion.mjs            fetch, verify, copy
//   node tools/vendor-motion.mjs --verify   only verify the files already in assets/js/vendor/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './lib/server.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tools/vendor-manifest.json'), 'utf8'));
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const verifyOnly = process.argv.includes('--verify');
let bad = 0;

for (const pkg of manifest.packages) {
  const dest = path.join(REPO_ROOT, pkg.dir);
  let srcRoot = null;
  if (!verifyOnly) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `vendor-${pkg.name}-`));
    const out = JSON.parse(execFileSync('npm', ['pack', `${pkg.name}@${pkg.version}`, '--json', '--pack-destination', tmp], { encoding: 'utf8' }));
    if (out[0]?.integrity !== pkg.integrity) { console.error(`${pkg.name}: tarball integrity ${out[0]?.integrity} ≠ manifest`); bad++; continue; }
    execFileSync('tar', ['-xzf', path.join(tmp, out[0].filename), '-C', tmp]);
    srcRoot = path.join(tmp, 'package');
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const [rel, want] of Object.entries(pkg.files)) {
    const name = path.basename(rel);
    const buf = fs.readFileSync(srcRoot ? path.join(srcRoot, rel) : path.join(dest, name));
    if (sha(buf) !== want) { console.error(`${pkg.name}/${name}: sha256 ${sha(buf)} ≠ ${want}`); bad++; continue; }
    if (srcRoot) fs.writeFileSync(path.join(dest, name), buf);
    console.log(`ok ${pkg.dir}/${name}`);
  }
}
process.exit(bad ? 1 : 0);
