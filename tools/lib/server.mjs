// Static dev server that mounts the repo at /Karan-Chaudhary/, exactly like GitHub Pages serves the
// project site. Any root-relative URL ("/assets/…") therefore 404s locally, as it would in production.

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
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st2.size, 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
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
