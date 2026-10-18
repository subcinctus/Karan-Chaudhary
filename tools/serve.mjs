#!/usr/bin/env node
// Local preview under the GitHub Pages sub-path: node tools/serve.mjs [--port 8080] [--host 127.0.0.1] [--log]

import { startServer } from './lib/server.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const port = Number(opt('port', process.env.PORT ?? 8080));
const host = opt('host', '127.0.0.1');

try {
  const srv = await startServer({ port, host, log: argv.includes('--log') });
  console.log(`Serving the site at ${srv.url}`);
  console.log('Studies: ' + srv.url + 'studies/_template.html  (add ?record&w=1280&h=536&fps=24 for the recorder harness)');
  const stop = () => srv.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (err) {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use; try --port 0 for a free one.` : err);
  process.exit(1);
}
