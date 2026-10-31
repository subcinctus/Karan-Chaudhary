#!/usr/bin/env node
// Re-fetch the vendored third-party files listed in tools/vendor-manifest.json: the desktop layer's
// motion libraries (GSAP, Lenis) and the self-hosted fonts ("kind": "font", @fontsource packages).
// Each package is fetched with `npm pack` from the public npm registry. Its tarball must match the
// integrity the registry publishes (dist.integrity) and the manifest's, recomputed here from the bytes,
// and every file must match its sha256 in the manifest; then the files are copied into the package's
// folder (assets/js/vendor/…, assets/fonts/…), flat and byte-identical.
// Dev-only (not deployed); package.json keeps zero dependencies.
//
//   node tools/vendor-motion.mjs                     fetch, verify, copy (every package)
//   node tools/vendor-motion.mjs @fontsource/inter-tight gsap   only the packages named
//   node tools/vendor-motion.mjs --verify            only verify the files already in place (offline)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './lib/server.mjs';

const REGISTRY = 'https://registry.npmjs.org/';
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tools/vendor-manifest.json'), 'utf8'));
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
/** Subresource-integrity string of a tarball, as npm publishes it ("sha512-<base64>"). */
const sri = buf => `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}`;
const npm = args => execFileSync('npm', [...args, '--registry', REGISTRY], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const verifyOnly = process.argv.includes('--verify');
const names = process.argv.slice(2).filter(a => !a.startsWith('--'));
const unknown = names.filter(n => !manifest.packages.some(p => p.name === n));
if (unknown.length) { console.error(`not in tools/vendor-manifest.json: ${unknown.join(', ')}`); process.exit(1); }
let bad = 0;

for (const pkg of manifest.packages.filter(p => !names.length || names.includes(p.name))) {
  const dest = path.join(REPO_ROOT, pkg.dir);
  const spec = `${pkg.name}@${pkg.version}`;
  let srcRoot = null;
  if (!verifyOnly) {
    const published = JSON.parse(npm(['view', spec, 'dist.integrity', '--json']));
    if (published !== pkg.integrity) { console.error(`${spec}: the registry publishes ${published} ≠ manifest ${pkg.integrity}`); bad++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `vendor-${pkg.name.replace(/[@/]/g, '-')}-`));
    const out = JSON.parse(npm(['pack', spec, '--json', '--pack-destination', tmp]));
    const tgz = path.join(tmp, out[0].filename);
    const got = sri(fs.readFileSync(tgz));
    if (got !== pkg.integrity) { console.error(`${spec}: tarball integrity ${got} ≠ manifest`); bad++; continue; }
    execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
    srcRoot = path.join(tmp, 'package');
    fs.mkdirSync(dest, { recursive: true });
    console.log(`ok ${spec} tarball ${got.slice(0, 20)}… (registry and manifest agree)`);
  }
  for (const [rel, want] of Object.entries(pkg.files)) {
    const name = path.basename(rel);
    const file = srcRoot ? path.join(srcRoot, rel) : path.join(dest, name);
    if (!fs.existsSync(file)) { console.error(`${pkg.name}/${name}: missing (${srcRoot ? `not in the ${spec} tarball` : `run without --verify to restore ${pkg.dir}/${name}`})`); bad++; continue; }
    const buf = fs.readFileSync(file);
    if (sha(buf) !== want) { console.error(`${pkg.name}/${name}: sha256 ${sha(buf)} ≠ ${want}`); bad++; continue; }
    if (srcRoot) fs.writeFileSync(path.join(dest, name), buf);
    console.log(`ok ${pkg.dir}/${name}`);
  }
}
process.exit(bad ? 1 : 0);
