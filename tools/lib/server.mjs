// Static dev server that mounts the repo at /Karan-Chaudhary/, exactly like GitHub Pages serves the
// project site. Any root-relative URL ("/assets/…") therefore 404s locally, as it would in production.
// Like GitHub Pages it answers byte ranges (206, or 416 for a range it cannot serve): browsers fetch
// media in ranges, and a video served only whole cannot be sought.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/Karan-Chaudhary/';
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
};

/** Map a request path to a file inside root, or null if it escapes root. */
export function resolveSafe(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes('\0')) return null;
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

/**
 * A Range header against a file of `size` bytes: { start, end } (inclusive) to send, null to ignore it
 * (no header, or a unit other than bytes: the whole file goes), or false when it cannot be served
 * (malformed, more than one range, or past the end of the file): 416. One byte range is all a browser
 * asks for when it plays or seeks a video.
 */
export function parseRange(header, size) {
  const m = /^\s*([\w-]+)\s*=(.*)$/.exec(header ?? '');
  if (!m || m[1].toLowerCase() !== 'bytes') return null;
  const spec = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(m[2]);
  if (!spec || (spec[1] === '' && spec[2] === '')) return false;
  let start, end;
  if (spec[1] === '') {   // "-500": the last 500 bytes
    if (Number(spec[2]) === 0) return false;
    start = Math.max(0, size - Number(spec[2]));
    end = size - 1;
  } else {
    start = Number(spec[1]);
    end = spec[2] === '' ? size - 1 : Number(spec[2]);
    if (end < start) return false;
    end = Math.min(end, size - 1);
  }
  return start < size ? { start, end } : false;
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function notFound(root, res, method) {
  const page = path.join(root, '404.html');
  fs.readFile(page, (err, buf) => {
    if (err) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, method === 'HEAD' ? undefined : 'Not found');
    send(res, 404, { 'Content-Type': MIME['.html'] }, method === 'HEAD' ? undefined : buf);
  });
}

/**
 * Start the server. Resolves to { url, origin, port, server, close() }; url ends with BASE.
 * @param {{ root?: string, port?: number, host?: string, base?: string, log?: boolean }} [o]
 */
export function startServer({ root = REPO_ROOT, port = 0, host = '127.0.0.1', base = BASE, log = false } = {}) {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (log) console.log(req.method, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
    if (pathname === '/' || pathname === base.slice(0, -1)) return send(res, 302, { Location: base }, undefined);
    if (!pathname.startsWith(base)) return notFound(root, res, req.method);

    let file = resolveSafe(root, pathname.slice(base.length));
    if (!file) return notFound(root, res, req.method);
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        if (!pathname.endsWith('/')) return send(res, 301, { Location: pathname + '/' }, undefined);
        file = path.join(file, 'index.html');
      }
      fs.stat(file, (err2, st2) => {
        if (err2 || !st2.isFile()) return notFound(root, res, req.method);
        const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        const range = parseRange(req.headers.range, st2.size);
        if (range === false) return send(res, 416, { 'Content-Range': `bytes */${st2.size}`, 'Accept-Ranges': 'bytes' }, undefined);
        res.writeHead(range ? 206 : 200, {
          'Content-Type': type, 'Content-Length': range ? range.end - range.start + 1 : st2.size,
          'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
          ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${st2.size}` } : {}),
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file, range ?? undefined).pipe(res);
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const { port: p } = server.address();
      const origin = `http://${host}:${p}`;
      resolve({
        server, port: p, origin, url: origin + base,
        close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}
