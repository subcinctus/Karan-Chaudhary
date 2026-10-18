// Find Playwright without making it a dependency: a local install first, then global roots.
// Chromium launch flags: on Linux Playwright does not pass --enable-unsafe-swiftshader, so WebGL in
// headless mode needs the SwiftShader flags added explicitly (skipped with --gpu).

import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

function tryExec(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim(); } catch { return null; }
}

/** Candidate directories that may contain node_modules/playwright (or be the package itself). */
export function playwrightRoots() {
  return [
    process.env.PLAYWRIGHT_MODULE_PATH,
    path.resolve(path.dirname(process.execPath), '../lib/node_modules'),   // e.g. /opt/node22/lib/node_modules
    ...(process.env.NODE_PATH ?? '').split(path.delimiter),
    tryExec('npm', ['root', '-g']),
  ].filter(Boolean);
}

/** Load the playwright module (local install, then global). Throws with install advice if absent. */
export async function loadPlaywright() {
  try { const m = await import('playwright'); return m.default ?? m; } catch { /* not local */ }
  const require = createRequire(import.meta.url);
  for (const r of playwrightRoots()) {
    for (const c of [path.join(r, 'playwright'), r]) {
      try { return require(require.resolve('playwright', { paths: [c] })); } catch { /* next */ }
    }
  }
  throw new Error('Playwright not found: npm i -D playwright@1.56.1 && npx playwright install chromium (or install it globally).');
}

export const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const COMMON_ARGS = ['--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars'];

/**
 * Launch headless Chromium with deterministic colour/font flags.
 * @param {{ gpu?: boolean, headless?: boolean, args?: string[], proxy?: boolean }} [o]
 *   proxy: force Chromium through HTTPS_PROXY (off by default; Chromium already honours the
 *   environment's proxy settings, and forcing it can break loopback requests).
 */
export async function launch({ gpu = false, headless = true, args = [], proxy = false } = {}) {
  const { chromium } = await loadPlaywright();
  const server = proxy ? (process.env.HTTPS_PROXY || process.env.https_proxy) : null;
  return chromium.launch({
    headless,
    args: [...(gpu ? [] : SWIFTSHADER_ARGS), ...COMMON_ARGS, ...args],
    ...(server ? { proxy: { server, bypass: '127.0.0.1,localhost' } } : {}),
  });
}

/** Context options used by the recorder and checks. */
export function contextOptions({ w = 1280, h = 720, reducedMotion = 'no-preference', dpr = 1 } = {}) {
  return {
    viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion, colorScheme: 'dark',
    // A sandbox proxy may re-sign TLS with its own CA; only third-party fonts are fetched over it.
    ignoreHTTPSErrors: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
  };
}

/** Collect console errors and page errors from a page into an array (for zero-error assertions). */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return errors;
}
