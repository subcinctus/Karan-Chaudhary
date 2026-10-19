// Top-down lighting / camera plan as inline SVG, shared by the Light study and the Previs section.
//
//   renderPlan(svg, {
//     camera:  { x = 0, y = 2.2, fov = 12.5, label = 'CAM', aim? },    // metres, fov in degrees (horizontal)
//     cameras?: [{ x, y, fov, label, aim? }, …],                       // further cameras (e.g. a B camera)
//     path?:   [{ x, y }, …],                                          // camera path, drawn dashed with an arrow
//     subject: { x = 0, y = 0, r = 0.12, facing = 'camera', label },  // facing: 'camera' or an angle in degrees
//     lights:  [{ role, az, el, dist, kelvin, label?, size? } | { role, x, y, kelvin, label? }, …],
//     props?:  [{ x, y, r = 0.1, label, detail?, kelvin? }, …],        // set pieces; kelvin = a practical
//     labels:  { title, desc, scale = true, extent? },                 // extent: minimum half-width (m) for a stable scale
//   })
//
// Plan coordinates: subject at the origin, camera toward +y (drawn at the bottom), +x = screen right.
// Lights given in spherical form use (x, y) = (−sinθ·r, cosθ·r), θ positive = camera-left.
// A camera's `aim` is the plan point { x, y } its lens looks toward (default: the subject).
// Lights that share (nearly) one spot in plan, e.g. butterfly's key above the lens and its fill
// below, are fanned out sideways and tied back to their true position by a leader line, and no two
// labels overlap.
// The SVG keeps its own <title>/<desc> current for screen readers.

import { planPosition, lightLabel } from '../core/presets.js';
import { kelvinChip } from '../core/color.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
};
const f = v => +v.toFixed(3);
const deg = r => (r * 180) / Math.PI;
const FONT = 3.7;   // label size in plan pixels (1/100 of the view)
const ADV = 0.66;   // mono advance (0.6 em) plus the 0.06 em letter-spacing

/** Resolve a light to plan (x, y). */
function lightXY(l) {
  if (Number.isFinite(l.x) && Number.isFinite(l.y)) return [l.x, l.y];
  return planPosition(l);
}

/**
 * Render (or re-render) the plan into `svg`. Returns { bounds } in plan metres.
 * @param {SVGSVGElement} svg
 */
export function renderPlan(svg, { camera = {}, cameras = [], path = null, subject = {}, lights = [], props = [], labels = {} } = {}) {
  const cam = { x: 0, y: 2.2, fov: 12.5, label: 'CAM', ...camera };
  const sub = { x: 0, y: 0, r: 0.12, facing: 'camera', ...subject };
  const cams = [cam, ...cameras.map(c => ({ fov: 12.5, label: '', ...c }))];
  for (const c of cams) {
    const a = c.aim ?? sub;
    c.dir = Math.hypot(a.x - c.x, a.y - c.y) > 1e-6 ? Math.atan2(a.y - c.y, a.x - c.x) : Math.atan2(sub.y - c.y, sub.x - c.x);
    c.wedge = wedgeOf(c, sub);
  }
  const L = lights.map(l => ({ ...l, xy: lightXY(l) }));
  const P = props.map(p => ({ r: 0.1, ...p, xy: [p.x, p.y], kind: 'prop' }));

  let axial = 0;
  for (const l of L) {
    const [x, y] = l.xy;
    if (Math.abs(Math.cos(Math.atan2(y - sub.y, x - sub.x))) < 0.3) l.side = axial++ % 2 ? 'left' : 'right';
    l.text = l.label ?? (Number.isFinite(l.el) ? lightLabel(l) : `${(l.role ?? 'light').toUpperCase()} ${l.kelvin ?? ''}K`);
    // Two lines when the label starts with its role ("KEY" / "3200K · 45°↑"): narrower boxes, calmer plan.
    const role = (l.role ?? '').toUpperCase();
    l.lines = !l.label && role && l.text.startsWith(role + ' ') ? [role, l.text.slice(role.length + 1)] : [l.text];
  }
  for (const p of P) p.lines = [p.label ?? 'PROP', p.detail].filter(Boolean).map(String);

  // Fit: centred on the subject left-right (so the plan doesn't drift as lights move), with every
  // point and label box inside a square. Label boxes are in plan units that depend on the scale,
  // so iterate to the fixed point. labels.extent sets a minimum half-width for a stable scale.
  const pts = [[sub.x, sub.y], ...L.map(l => l.xy), ...P.map(p => p.xy), ...(path ?? []).map(p => [p.x, p.y]),
    ...cams.flatMap(c => [[c.x, c.y], ...c.wedge])];
  let minX, maxX, minY, maxY, half, unit = 0;
  for (let pass = 0; pass < 8; pass++) {
    const box = [...pts];
    for (const b of layoutLabels(L, P, sub, unit, cams)) box.push([b.x0, b.y0], [b.x1, b.y1]);
    for (const c of cams) {
      const cw = c.label.length * unit * FONT * ADV;
      box.push([c.x - cw / 2, c.y + unit * 11], [c.x + cw / 2, c.y + unit * 11]);
    }
    const xs = box.map(p => p[0]), ys = box.map(p => p[1]);
    minY = Math.min(...ys); maxY = Math.max(...ys);
    const hx = Math.max(...xs.map(x => Math.abs(x - sub.x)));
    half = Math.max(hx, (maxY - minY) / 2, labels.extent ?? 1.2) * 1.06;
    // With a requested extent the centre is fixed (midway between subject and camera): a stable frame.
    const cx = sub.x, cy = labels.extent ? (sub.y + cam.y) / 2 : (minY + maxY) / 2;
    if (labels.extent) half = Math.max(half, Math.max(cy - Math.min(...ys), Math.max(...ys) - cy) * 1.06);
    minX = cx - half; maxX = cx + half; minY = cy - half; maxY = cy + half;
    unit = (maxX - minX) / 100;   // 1 "plan pixel" for strokes and type
  }
  const placed = layoutLabels(L, P, sub, unit, cams);

  svg.setAttribute('viewBox', `${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('overflow', 'hidden');
  svg.classList.add('plan');
  svg.replaceChildren();

  const titleText = labels.title ?? 'Lighting plan, top view';
  const descText = labels.desc ?? describePlan(cam, sub, L) + describeExtras(cams.slice(1), P, sub);
  const tid = svg.id ? `${svg.id}-title` : null, did = svg.id ? `${svg.id}-desc` : null;
  svg.append(s('title', { id: tid }, titleText), s('desc', { id: did }, descText));
  if (tid) svg.setAttribute('aria-labelledby', `${tid} ${did}`);

  const stroke = { 'vector-effect': 'non-scaling-stroke', fill: 'none' };
  // Every label carries a thin ink halo (painted under the glyphs), so a camera path or a frustum edge
  // that runs through it breaks around the letters instead of striking them through.
  const mono = { 'font-family': 'var(--font-mono, monospace)', 'font-size': f(unit * FONT), style: 'letter-spacing:0.06em',
    stroke: '#0E1013', 'stroke-width': f(unit * 1.1), 'stroke-linejoin': 'round', 'paint-order': 'stroke' };

  // Distance rings every metre around the subject.
  const g0 = s('g', { style: 'stroke:var(--line, #2A2E36)' });
  for (let r = 1; r <= Math.ceil(half * 1.45); r++) g0.append(s('circle', { cx: sub.x, cy: sub.y, r, ...stroke, 'stroke-width': 1 }));
  svg.append(g0);
  if (labels.scale !== false) {
    // Scale bar in the bottom-left corner (rings are 1 m apart).
    const bx = minX + unit * 5, by = maxY - unit * 5;
    svg.append(
      s('path', { d: `M${f(bx)} ${f(by - unit)}V${f(by)}H${f(bx + 1)}V${f(by - unit)}`, ...stroke, style: 'stroke:var(--paper-3, #8A857C)', 'stroke-width': 1 }),
      s('text', { x: f(bx + 1 + unit * 1.5), y: f(by), ...mono, style: 'fill:var(--paper-3, #8A857C)' }, '1 m'),
    );
  }

  // Camera FOV wedges, out to just past the subject.
  for (const c of cams) svg.append(s('path', {
    d: `M${f(c.x)} ${f(c.y)}L${c.wedge.map(p => p.map(f).join(' ')).join('L')}Z`,
    style: 'fill:var(--paper, #ECE6DA);fill-opacity:0.06;stroke:var(--paper-3, #8A857C);stroke-opacity:0.5',
    'vector-effect': 'non-scaling-stroke',
  }));

  // Optional camera path (dashed) with an arrowhead at the end.
  if (path?.length > 1) {
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('');
    svg.append(s('path', { d, ...stroke, style: 'stroke:var(--daylight, #8DB2F0)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    const a = path.at(-2), b = path.at(-1), ang = Math.atan2(b.y - a.y, b.x - a.x), al = unit * 3;
    svg.append(s('path', {
      d: `M${f(b.x)} ${f(b.y)}L${f(b.x - al * Math.cos(ang - 0.45))} ${f(b.y - al * Math.sin(ang - 0.45))}L${f(b.x - al * Math.cos(ang + 0.45))} ${f(b.y - al * Math.sin(ang + 0.45))}Z`,
      style: 'fill:var(--daylight, #8DB2F0)',
    }));
  }

  // Camera bodies.
  for (const c of cams) {
    const cb = s('g', { transform: `translate(${f(c.x)} ${f(c.y)}) rotate(${f(deg(c.dir) - 90)})` });
    cb.append(
      s('rect', { x: f(-unit * 2.4), y: f(-unit * 3.6), width: f(unit * 4.8), height: f(unit * 4.4), rx: f(unit * 0.6), style: 'fill:var(--ink-3, #1E2127);stroke:var(--paper, #ECE6DA)', 'vector-effect': 'non-scaling-stroke' }),
      s('rect', { x: f(-unit * 1.2), y: f(unit * 0.8), width: f(unit * 2.4), height: f(unit * 1.8), style: 'fill:var(--paper, #ECE6DA)' }),
    );
    svg.append(cb);
    if (c.label) svg.append(s('text', { x: f(c.x), y: f(c.y + unit * 10), 'text-anchor': 'middle', ...mono, style: 'fill:var(--paper-2, #B9B3A8)' }, c.label));
  }

  // Subject: head circle + nose tick toward its facing direction.
  const face = sub.facing === 'camera' ? Math.atan2(cam.y - sub.y, cam.x - sub.x) : (Number(sub.facing) * Math.PI) / 180;
  svg.append(
    s('circle', { cx: sub.x, cy: sub.y, r: sub.r, style: 'fill:var(--ink-2, #14161A);stroke:var(--paper, #ECE6DA)', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.5 }),
    s('path', { d: `M${f(sub.x + Math.cos(face) * sub.r)} ${f(sub.y + Math.sin(face) * sub.r)}L${f(sub.x + Math.cos(face) * sub.r * 1.6)} ${f(sub.y + Math.sin(face) * sub.r * 1.6)}`, ...stroke, style: 'stroke:var(--paper, #ECE6DA)', 'stroke-width': 1.5 }),
  );
  if (sub.label) svg.append(s('text', { x: f(sub.x), y: f(sub.y - sub.r - unit * 2), 'text-anchor': 'middle', ...mono, style: 'fill:var(--paper-2, #B9B3A8)' }, sub.label));

  // Props: a small disc (a practical glows in its Kelvin colour) and a mono label.
  for (const p of P) {
    const [x, y] = p.xy, r = Math.max(p.r, unit * 1.2);
    const chip = Number.isFinite(p.kelvin) ? kelvinChip(p.kelvin, 5600) : null;
    if (chip) svg.append(s('circle', { cx: f(x), cy: f(y), r: f(r * 2.2), style: `fill:${chip};fill-opacity:0.18` }));
    svg.append(s('circle', { cx: f(x), cy: f(y), r: f(r), style: chip ? `fill:${chip};stroke:var(--ink-0, #07080A)` : 'fill:var(--ink-3, #1E2127);stroke:var(--paper-3, #8A857C)', 'vector-effect': 'non-scaling-stroke' }));
  }

  // Lights: a rectangle aimed at the subject, a Kelvin chip and a mono label. A light fanned out of
  // a shared spot keeps a dot at its true position and a leader line to its glyph.
  for (const l of L) {
    const [x, y] = l.at, toSub = Math.atan2(sub.y - y, sub.x - x);
    const chip = Number.isFinite(l.kelvin) ? kelvinChip(l.kelvin, 5600) : '#ECE6DA';
    if (l.at !== l.xy) {
      svg.append(
        s('path', { d: `M${f(l.xy[0])} ${f(l.xy[1])}L${f(x)} ${f(y)}`, ...stroke, style: `stroke:${chip};stroke-opacity:0.7`, 'stroke-width': 1, 'stroke-dasharray': '2 2' }),
        s('circle', { cx: f(l.xy[0]), cy: f(l.xy[1]), r: f(unit * 0.9), style: `fill:${chip}` }),
      );
    }
    const g = s('g', { transform: `translate(${f(x)} ${f(y)}) rotate(${f(deg(toSub) + 90)})` });
    g.append(
      s('rect', { x: f(-l.w / 2), y: f(-unit), width: f(l.w), height: f(unit * 2), style: `fill:${chip};stroke:var(--ink-0, #07080A)`, 'vector-effect': 'non-scaling-stroke' }),
      s('path', { d: `M0 ${f(-unit)}L0 ${f(-unit * 3.5)}`, ...stroke, style: `stroke:${chip}`, 'stroke-width': 1 }),
    );
    svg.append(g);
  }

  // Labels last, so no glyph or leader line is drawn over them.
  for (const b of placed) {
    const it = b.item, chip = Number.isFinite(it.kelvin) ? kelvinChip(it.kelvin, 5600) : it.kind === 'prop' ? 'var(--paper-2, #B9B3A8)' : '#ECE6DA';
    const t = s('text', { x: f(b.x), y: f(b.y + unit * 1.1), 'text-anchor': b.anchor, ...mono, style: 'fill:var(--paper, #ECE6DA)' });
    it.lines.forEach((line, i) => t.append(s('tspan', {
      x: f(b.x), dy: i ? f(unit * FONT * 1.3) : null,
      style: i ? `fill:var(${it.kind === 'prop' ? '--paper-3, #8A857C' : '--paper-2, #B9B3A8'})` : `fill:${chip}`,
    }, line)));
    svg.append(t);
  }

  return { bounds: { minX, minY, maxX, maxY } };
}

/** FOV wedge corners for camera `c`, reaching just past the subject along the lens axis. */
function wedgeOf(c, sub) {
  const halfFov = ((c.fov ?? 12.5) * Math.PI) / 360;
  const along = (sub.x - c.x) * Math.cos(c.dir) + (sub.y - c.y) * Math.sin(c.dir);
  const d = along > 0.3 ? along : Math.hypot(sub.x - c.x, sub.y - c.y);
  const reach = (d + Math.max(sub.r * 4, d * 0.08)) / Math.cos(Math.min(halfFov, 1.4));
  return [-1, 1].map(k => [c.x + Math.cos(c.dir + k * halfFov) * reach, c.y + Math.sin(c.dir + k * halfFov) * reach]);
}

/**
 * Glyph positions and label boxes for one scale (`unit`). Lights whose glyphs would crowd one spot
 * (or that sit on one ray from the subject, where their labels would stack) are fanned out along
 * the tangent, nearest the subject first. Any label that still overlaps another label, a camera,
 * its label or the subject is then moved up or down, whichever is shorter. Sets l.w (glyph width)
 * and l.at (glyph position) on each light and returns [{ item, x, y, anchor, x0, y0, x1, y1 }].
 */
function layoutLabels(L, P, sub, unit, cams = []) {
  const u = unit || 1e-3;
  for (const l of L) { l.w = Math.max(u * 3, Math.min((l.size ?? 0.6) * 0.8, u * 9)); l.at = l.xy; l.fan = null; }

  // Group crowded lights (transitively).
  const ang = l => Math.atan2(l.xy[1] - sub.y, l.xy[0] - sub.x);
  const crowd = (a, b) => {
    const d = Math.hypot(a.xy[0] - b.xy[0], a.xy[1] - b.xy[1]);
    const da = Math.abs(Math.atan2(Math.sin(ang(a) - ang(b)), Math.cos(ang(a) - ang(b))));
    return d < u * 7 || (d < u * 14 && da < 0.35);
  };
  const groups = L.map(l => [l]);
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (groups[i].some(a => groups[j].some(b => crowd(a, b)))) {
        groups[i].push(...groups.splice(j, 1)[0]); merged = true; break outer;
      }
    }
  }
  for (const g of groups) {
    if (g.length < 2) continue;
    const cx = g.reduce((a, l) => a + l.xy[0], 0) / g.length, cy = g.reduce((a, l) => a + l.xy[1], 0) / g.length;
    const out = Math.hypot(cx - sub.x, cy - sub.y) > 1e-6 ? Math.atan2(cy - sub.y, cx - sub.x) : Math.PI / 2;
    const tx = -Math.sin(out), ty = Math.cos(out);
    const step = Math.max(u * 11, Math.max(...g.map(l => l.w)) + u * 3);
    g.sort((a, b) => Math.hypot(a.xy[0] - sub.x, a.xy[1] - sub.y) - Math.hypot(b.xy[0] - sub.x, b.xy[1] - sub.y) || L.indexOf(a) - L.indexOf(b));
    g.forEach((l, k) => {
      const off = (k - (g.length - 1) / 2) * step;
      l.at = [l.xy[0] + tx * off, l.xy[1] + ty * off];
      l.fan = off ? [Math.sign(off) * tx, Math.sign(off) * ty] : null;
    });
  }

  const boxes = [];
  const add = (item, x, y, anchor) => {
    const w = Math.max(...item.lines.map(t => t.length)) * u * FONT * ADV;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    boxes.push({ item, x, y, anchor, x0, x1: x0 + w, y0: y - u * FONT, y1: y + u * FONT * (item.lines.length * 1.3 - 0.3) });
  };
  for (const l of L) {
    const [x, y] = l.at;
    if (l.fan && Math.abs(l.fan[0]) > 0.5) {
      // Fanned sideways: the label continues outward on the glyph's own side.
      const right = l.fan[0] > 0;
      add(l, x + (right ? 1 : -1) * Math.max(u * 6, l.w / 2 + u * 2), y - u * 1.5, right ? 'start' : 'end');
      continue;
    }
    const out = Math.atan2(y - sub.y, x - sub.x);
    if (!l.fan && Math.abs(Math.cos(out)) < 0.3) {
      // On (or near) the subject–camera axis: label beside the light, alternating sides.
      const right = l.side !== 'left';
      add(l, x + (right ? 1 : -1) * u * 6, y - u * 1.5, right ? 'start' : 'end');
    } else {
      add(l, x + Math.cos(out) * u * 6, y + Math.sin(out) * u * 6, Math.cos(out) >= 0 ? 'start' : 'end');
    }
  }
  for (const p of P) {
    const right = p.xy[0] >= sub.x, r = Math.max(p.r, u * 1.2);
    add(p, p.xy[0] + (right ? 1 : -1) * (r + u * 2.5), p.xy[1] - u * 1.2, right ? 'start' : 'end');
  }

  // Obstacles that never move: camera bodies and their labels, and the subject.
  const fixed = [{ x0: sub.x - sub.r - u, x1: sub.x + sub.r + u, y0: sub.y - sub.r - u, y1: sub.y + sub.r + u }];
  for (const c of cams) {
    const cw = (c.label?.length ?? 0) * u * FONT * ADV;
    fixed.push({ x0: c.x - u * 4, x1: c.x + u * 4, y0: c.y - u * 4, y1: c.y + u * 4 });
    if (cw) fixed.push({ x0: c.x - cw / 2, x1: c.x + cw / 2, y0: c.y + u * (10 - FONT), y1: c.y + u * 11 });
  }
  // Settle labels in reading order; each one moves the shorter way (up or down) off whatever it
  // overlaps, then is checked again against everything settled so far.
  const gap = u * 0.8, hit = (a, b) => b.x0 < a.x1 + gap && a.x0 < b.x1 + gap && b.y0 < a.y1 + gap && a.y0 < b.y1 + gap;
  boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const settled = [...fixed];
  for (const b of boxes) {
    for (let tries = 0; tries < 24; tries++) {
      const a = settled.find(o => hit(o, b));
      if (!a) break;
      const down = a.y1 + gap - b.y0, up = b.y1 + gap - a.y0;
      const dy = down <= up ? down : -up;
      b.y += dy; b.y0 += dy; b.y1 += dy;
    }
    settled.push(b);
  }
  return boxes;
}

/** Extra sentences for further cameras and props. */
function describeExtras(cams, props, sub) {
  const c = cams.map(k => `${k.label || 'Another camera'} ${Math.hypot(k.x - sub.x, k.y - sub.y).toFixed(1)} m from the subject`);
  const p = props.map(k => [k.label, k.detail].filter(Boolean).join(', ').toLowerCase());
  return (c.length ? ` Also ${c.join('; ')}.` : '') + (p.length ? ` Props: ${p.join('; ')}.` : '');
}

/** Plain-language description used for <desc> when none is given. */
export function describePlan(cam, sub, lights) {
  const parts = lights.map(l => {
    if (!Number.isFinite(l.az)) return `${l.role ?? 'light'} at ${l.kelvin ?? '?'} K`;
    const side = l.az === 0 ? 'on the lens axis' : Math.abs(l.az) >= 180 ? 'directly behind' : `${Math.abs(l.az)}° camera-${l.az > 0 ? 'left' : 'right'}`;
    const height = l.el > 0 ? `${l.el}° above` : l.el < 0 ? `${-l.el}° below` : 'at eye level';
    return `${l.role ?? 'light'} ${side}, ${height}, ${l.dist} m away, ${l.kelvin} K`;
  });
  const d = Math.hypot(cam.x - sub.x, cam.y - sub.y).toFixed(1);
  return `Camera ${d} m from the subject. ${parts.length ? parts.join('; ') + '.' : 'No lights.'}`;
}
