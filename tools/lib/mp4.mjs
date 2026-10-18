// Minimal ISO-BMFF reader: list top-level boxes and check faststart (moov before mdat),
// so web players can start before the whole file has downloaded.

import fs from 'node:fs';

/** Top-level boxes of an MP4 buffer: [{ type, offset, size }]. */
export function topLevelBoxes(buf) {
  const boxes = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (size === 1) {
      if (off + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(off + 8));
    } else if (size === 0) size = buf.length - off;   // box runs to end of file
    if (size < 8) break;
    boxes.push({ type, offset: off, size });
    off += size;
  }
  return boxes;
}

/** True when the moov box precedes the first mdat box. */
export function isFaststartBuffer(buf) {
  const types = topLevelBoxes(buf).map(b => b.type);
  const moov = types.indexOf('moov'), mdat = types.indexOf('mdat');
  return moov >= 0 && (mdat < 0 || moov < mdat);
}

/**
 * Faststart check on a file. Reads box headers only (seeks past box bodies), so large files are cheap.
 * Returns { ok, order } where order lists the top-level box types.
 */
export function checkFaststart(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const { size: total } = fs.fstatSync(fd);
    const head = Buffer.alloc(16), order = [];
    let off = 0;
    while (off + 8 <= total) {
      fs.readSync(fd, head, 0, 16, off);
      let size = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (size === 1) size = Number(head.readBigUInt64BE(8));
      else if (size === 0) size = total - off;
      if (size < 8) break;
      order.push(type);
      off += size;
    }
    const moov = order.indexOf('moov'), mdat = order.indexOf('mdat');
    return { ok: moov >= 0 && (mdat < 0 || moov < mdat), order };
  } finally { fs.closeSync(fd); }
}
