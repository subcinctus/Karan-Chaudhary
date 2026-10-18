// Entry point so `node --test tools/test/` works on Node 20/22, which resolve a directory argument
// as a module (index.js) instead of expanding it. Imports every *.test.mjs beside this file.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('./', import.meta.url);
for (const f of readdirSync(fileURLToPath(dir)).filter(f => f.endsWith('.test.mjs')).sort()) {
  await import(new URL(f, dir));
}
