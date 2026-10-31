// The dev server answers byte ranges as GitHub Pages does, so the reel check can seek a video file:
// 206 with Content-Range for one satisfiable range, 416 for a range it cannot serve, the whole file
// (200) without a Range header or for a unit other than bytes, and Accept-Ranges on every file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, parseRange } from '../lib/server.mjs';

const SIZE = 1000;
const BYTES = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 251));

test('parseRange: one byte range, clamped to the file; null to ignore; false for 416', () => {
  assert.equal(parseRange(undefined, SIZE), null);
  assert.equal(parseRange('', SIZE), null);
  assert.equal(parseRange('items=0-10', SIZE), null, 'a unit other than bytes is ignored');
  assert.deepEqual(parseRange('bytes=0-99', SIZE), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=0-', SIZE), { start: 0, end: 999 });
  assert.deepEqual(parseRange('bytes=900-', SIZE), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', SIZE), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', SIZE), { start: 0, end: 999 }, 'a suffix longer than the file is the whole file');
  assert.deepEqual(parseRange('bytes=950-2000', SIZE), { start: 950, end: 999 }, 'an end past the file is clamped');
  assert.deepEqual(parseRange('Bytes = 10 - 19', SIZE), { start: 10, end: 19 });
  for (const bad of ['bytes=1000-', 'bytes=5000-6000', 'bytes=500-100', 'bytes=-0', 'bytes=-', 'bytes=abc', 'bytes=0-1,5-6', 'bytes=1.5-2']) {
    assert.equal(parseRange(bad, SIZE), false, bad);
  }
  assert.equal(parseRange('bytes=0-', 0), false, 'nothing to send from an empty file');
});

test('server: 206 partial content, 416 for bad ranges, Accept-Ranges, text/vtt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-range-'));
  fs.writeFileSync(path.join(root, 'clip.mp4'), BYTES);
  fs.writeFileSync(path.join(root, 'captions.vtt'), 'WEBVTT\n');
  const srv = await startServer({ root });
  const get = (range, method = 'GET') => fetch(srv.url + 'clip.mp4', { method, headers: range ? { Range: range } : {} });
  const body = async r => Buffer.from(await r.arrayBuffer());
  try {
    const whole = await get();
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.equal(whole.headers.get('content-type'), 'video/mp4');
    assert.equal(whole.headers.get('content-range'), null);
    assert.deepEqual(await body(whole), BYTES);

    for (const [range, start, end] of [['bytes=0-99', 0, 99], ['bytes=900-', 900, 999], ['bytes=-100', 900, 999], ['bytes=950-2000', 950, 999], ['bytes=0-', 0, 999]]) {
      const r = await get(range);
      assert.equal(r.status, 206, range);
      assert.equal(r.headers.get('content-range'), `bytes ${start}-${end}/${SIZE}`, range);
      assert.equal(r.headers.get('content-length'), String(end - start + 1), range);
      assert.equal(r.headers.get('accept-ranges'), 'bytes', range);
      assert.equal(r.headers.get('cache-control'), 'no-store', range);
      assert.deepEqual(await body(r), BYTES.subarray(start, end + 1), range);
    }

    for (const range of ['bytes=1000-', 'bytes=500-100', 'bytes=-0', 'bytes=0-1,5-6', 'bytes=abc']) {
      const r = await get(range);
      assert.equal(r.status, 416, range);
      assert.equal(r.headers.get('content-range'), `bytes */${SIZE}`, range);
      assert.equal((await body(r)).length, 0, range);
    }

    const other = await get('items=0-10');
    assert.equal(other.status, 200, 'an unknown unit gets the whole file');
    assert.equal((await body(other)).length, SIZE);

    const head = await get('bytes=0-99', 'HEAD');
    assert.equal(head.status, 206);
    assert.equal(head.headers.get('content-length'), '100');
    assert.equal((await body(head)).length, 0);

    const vtt = await fetch(srv.url + 'captions.vtt');
    assert.equal(vtt.status, 200);
    assert.match(vtt.headers.get('content-type'), /^text\/vtt/);
  } finally {
    await srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
