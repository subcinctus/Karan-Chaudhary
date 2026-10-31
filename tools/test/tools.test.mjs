// Dev tooling: sub-path server, MP4 faststart reader, ffmpeg arguments and the tour's options.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resolveSafe } from '../lib/server.mjs';
import { topLevelBoxes, isFaststartBuffer } from '../lib/mp4.mjs';
import { encodeArgs } from '../lib/ffmpeg.mjs';
import { parseArgs as tourArgs } from '../tour.mjs';

test('server mounts the repo at /Karan-Chaudhary/ and is traversal-safe', async () => {
  const srv = await startServer();
  try {
    const root = await fetch(srv.origin + '/', { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/Karan-Chaudhary/');
    const js = await fetch(srv.url + 'assets/js/core/time.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /^text\/javascript/);
    assert.equal(js.headers.get('cache-control'), 'no-store');
    const outside = await fetch(srv.origin + '/assets/js/core/time.js');
    assert.equal(outside.status, 404, 'root-relative URLs must fail');
    const trav = await fetch(srv.url + '..%2f..%2fetc%2fpasswd');
    assert.equal(trav.status, 404);
    const missing = await fetch(srv.url + 'nope.html');
    assert.equal(missing.status, 404);
  } finally { await srv.close(); }
  assert.equal(resolveSafe('/srv/site', '../../etc/passwd'), '/srv/site/etc/passwd');
  assert.equal(resolveSafe('/srv/site', '%2e%2e/%2e%2e/x'), '/srv/site/x');
});

const box = (type, body = 0) => { const b = Buffer.alloc(8 + body); b.writeUInt32BE(8 + body, 0); b.write(type, 4, 'latin1'); return b; };

test('mp4 faststart: moov must precede mdat', () => {
  const fast = Buffer.concat([box('ftyp', 8), box('moov', 16), box('mdat', 32)]);
  const slow = Buffer.concat([box('ftyp', 8), box('mdat', 32), box('moov', 16)]);
  assert.deepEqual(topLevelBoxes(fast).map(b => b.type), ['ftyp', 'moov', 'mdat']);
  assert.equal(isFaststartBuffer(fast), true);
  assert.equal(isFaststartBuffer(slow), false);
});

test('ffmpeg args carry an explicit BT.709 matrix and tags', () => {
  const a = encodeArgs({ fps: 24, out: 'x', subframes: 4 }).join(' ');
  assert.match(a, /out_color_matrix=bt709:out_range=tv/);
  assert.match(a, /tmix=frames=4/);
  assert.match(a, /-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags \+faststart/);
  assert.match(a, /libvpx-vp9/);
  assert.match(a, /-framerate 96 /);
});

test('tour options: both desktop sizes by default; beats by number or name; nothing narrower than the desktop layout', () => {
  const o = tourArgs([]);
  assert.deepEqual(o.sizes, [[1920, 1080], [1440, 900]]);
  assert.match(o.out, /[\\/]\.artifacts[\\/]tour$/);
  assert.equal(o.only, null);
  assert.deepEqual(tourArgs(['--only', '3,lightbox,09-pager']).only, ['3', 'lightbox', '09-pager']);
  assert.deepEqual(tourArgs(['--sizes=1280x800']).sizes, [[1280, 800]]);
  assert.throws(() => tourArgs(['--only', 'nope']), /no beat/);
  assert.throws(() => tourArgs(['--sizes', '390x844']), /narrower than the desktop layout/);
  assert.throws(() => tourArgs(['--sizes', 'big']), /not WxH/);
});
