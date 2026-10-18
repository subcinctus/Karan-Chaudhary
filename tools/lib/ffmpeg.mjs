// ffmpeg / ffprobe helpers for the recorder and previs encoder.
// Colour: frames arrive as sRGB PNGs; ffmpeg's default RGB→YUV matrix is BT.601, so every encode sets
// an explicit BT.709 matrix (scale=out_color_matrix=bt709:out_range=tv) and tags the stream bt709.

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const BT709_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
/** RGB → limited-range BT.709 YUV 4:2:0 with even dimensions. */
export const YUV709 = 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p';

export function hasFfmpeg() {
  try { execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Run a command; resolves { stdout, stderr } or rejects with stderr on a non-zero exit. */
export function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', reject);
    p.on('close', code => {
      const stdout = Buffer.concat(out).toString(), stderr = Buffer.concat(err).toString();
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

/**
 * Arguments for one-pass PNG-pipe → MP4 (H.264) + WebM (VP9).
 * subframes S > 1 renders S sub-frames per frame and averages them with tmix (motion blur).
 */
export function encodeArgs({ fps, subframes = 1, out, formats = ['mp4', 'webm'], crf = 18, tune = 'film', vp9crf = 32 }) {
  const S = Math.max(1, Math.round(subframes));
  const blur = S > 1 ? `tmix=frames=${S}:weights='${Array(S).fill(1).join(' ')}',framestep=${S},` : '';
  const outs = formats.filter(f => f === 'mp4' || f === 'webm');
  if (!outs.length) throw new Error('encodeArgs: formats must include mp4 and/or webm');
  const labels = outs.map((_, i) => `[v${i}]`);
  const split = outs.length > 1 ? `,split=${outs.length}${labels.join('')}` : labels[0];
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps * S), '-c:v', 'png', '-i', '-',
    '-filter_complex', `[0:v]${blur}${YUV709}${split}`];
  outs.forEach((f, i) => {
    args.push('-map', labels[i], '-r', String(fps));
    if (f === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        ...(tune ? ['-tune', tune] : []), ...BT709_TAGS, '-movflags', '+faststart', '-an', `${out}.mp4`);
    } else {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(vp9crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
        '-pix_fmt', 'yuv420p', ...BT709_TAGS, '-an', `${out}.webm`);
    }
  });
  return args;
}

/**
 * Spawn an encoder that reads PNG frames on stdin.
 * Returns { write(buf) → Promise (resolves once ffmpeg accepted it, honouring backpressure), end() → Promise }.
 */
export function startEncoder(opts) {
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const p = spawn(FFMPEG, encodeArgs(opts), { stdio: ['pipe', 'ignore', 'pipe'] });
  const err = [];
  p.stderr.on('data', d => err.push(d));
  const done = new Promise((resolve, reject) => {
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().trim()}`))));
  });
  done.catch(() => {});   // surfaced through end()
  return {
    process: p,
    write(buf) {
      return new Promise((resolve, reject) => {
        if (!p.stdin.writable) return reject(new Error('ffmpeg stdin closed'));
        p.stdin.write(buf) ? resolve() : p.stdin.once('drain', resolve);
      });
    },
    end() { p.stdin.end(); return done; },
  };
}

/** Write a poster from one PNG frame: WebP (quality 82) and/or JPEG (q 3), optional max width. */
export async function encodePoster(png, { webp, jpg, webpQuality = 82, jpgQ = 3, width } = {}) {
  const input = Buffer.isBuffer(png) ? png : fs.readFileSync(png);
  const vf = width ? [`-vf`, `scale='min(${width},iw)':-2:flags=lanczos`] : [];
  const jobs = [];
  if (webp) { fs.mkdirSync(path.dirname(webp), { recursive: true }); jobs.push(run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'png_pipe', '-i', '-', ...vf, '-c:v', 'libwebp', '-quality', String(webpQuality), '-frames:v', '1', webp], { input })); }
  if (jpg) { fs.mkdirSync(path.dirname(jpg), { recursive: true }); jobs.push(run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'png_pipe', '-i', '-', ...vf, '-q:v', String(jpgQ), '-frames:v', '1', jpg], { input })); }
  await Promise.all(jobs);
}

/** ffprobe JSON for the first video stream (codec, pix_fmt, size, rate, colour tags, duration). */
export async function probe(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,r_frame_rate,color_space,color_primaries,color_transfer:format=duration',
    '-of', 'json', file]);
  const j = JSON.parse(stdout), s = j.streams?.[0] ?? {};
  const [n, d] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  return { ...s, fps: d ? n / d : 0, duration: Number(j.format?.duration ?? 0) };
}

/** Contact sheet: one frame per second, 480 px wide tiles, `cols` per row. */
export async function contactSheet(video, outPng, { cols = 5, width = 480 } = {}) {
  const { duration } = await probe(video);
  const rows = Math.max(1, Math.ceil(Math.max(1, Math.floor(duration)) / cols));
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', video, '-vf', `fps=1,scale=${width}:-1,tile=${cols}x${rows}:padding=8:margin=8`, '-frames:v', '1', outPng]);
}

/** Encode a numbered PNG sequence (Unreal Movie Render Queue output) to a web MP4 + poster at 40 %. */
export async function encodeSequence({ pattern, fps = 24, out, width = 1920, crf = 20, posterWidth = 1280, posterAt = 0.4 }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', pattern,
    '-vf', `scale=${width}:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', ...BT709_TAGS, '-an', out]);
  const { duration } = await probe(out);
  const poster = out.replace(/\.mp4$/, '.jpg');
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', String(duration * posterAt), '-i', out, '-frames:v', '1', '-vf', `scale=${posterWidth}:-2`, '-q:v', '3', poster]);
  return { video: out, poster };
}
