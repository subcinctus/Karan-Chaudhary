// Top-down lighting / camera plan as inline SVG, shared by the Light study and the Previs section.
//
//   renderPlan(svg, {
//     camera:  { x = 0, y = 2.2, fov = 12.5, label = 'CAM' },          // metres, fov in degrees (horizontal)
//     path?:   [{ x, y }, …],                                          // camera path, drawn dashed with an arrow
//     subject: { x = 0, y = 0, r = 0.12, facing = 'camera', label },  // facing: 'camera' or an angle in degrees
//     lights:  [{ role, az, el, dist, kelvin, label?, size? } | { role, x, y, kelvin, label? }, …],
//     labels:  { title, desc, scale = true, extent? },                 // extent: minimum half-width (m) for a stable scale
//   })
//
// Plan coordinates: subject at the origin, camera toward +y (drawn at the bottom), +x = screen right.
// Lights given in spherical form use (x, y) = (−sinθ·r, cosθ·r), θ positive = camera-left.
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

/** Resolve a light to plan (x, y). */
function lightXY(l) {
  if (Number.isFinite(l.x) && Number.isFinite(l.y)) return [l.x, l.y];
  return planPosition(l);
}

/**
 * Render (or re-render) the plan into `svg`. Returns { bounds } in plan metres.
 * @param {SVGSVGElement} svg
 */
export function renderPlan(svg, { camera = {}, path = null, subject = {}, lights = [], labels = {} } = {}) {
  const cam = { x: 0, y: 2.2, fov: 12.5, label: 'CAM', ...camera };
  const sub = { x: 0, y: 0, r: 0.12, facing: 'camera', ...subject };
  const L = lights.map(l => ({ ...l, xy: lightXY(l) }));

  let axial = 0;
  for (const l of L) {
    const [x, y] = l.xy;
    if (Math.abs(Math.cos(Math.atan2(y - sub.y, x - sub.x))) < 0.3) l.side = axial++ % 2 ? 'left' : 'right';
    l.text = l.label ?? (Number.isFinite(l.el) ? lightLabel(l) : `${(l.role ?? 'light').toUpperCase()} ${l.kelvin ?? ''}K`);
    // Two lines when the label starts with its role ("KEY" / "3200K · 45°↑"): narrower boxes, calmer plan.
    const role = (l.role ?? '').toUpperCase();
    l.lines = !l.label && role && l.text.startsWith(role + ' ') ? [role, l.text.slice(role.length + 1)] : [l.text];
  }

  // Fit: centred on the subject left-right (so the plan doesn't drift as lights move), with every
  // point and label box inside a square. Label boxes are in plan units that depend on the scale,
  // so iterate to the fixed point. labels.extent sets a minimum half-width for a stable scale.
  const pts = [[cam.x, cam.y], [sub.x, sub.y], ...L.map(l => l.xy), ...(path ?? []).map(p => [p.x, p.y])];
  let minX, maxX, minY, maxY, half, unit = 0;
  for (let pass = 0; pass < 8; pass++) {
    const box = [...pts];
    for (const l of L) {
      const lay = labelLayout(l, sub, unit);
      const w = Math.max(...l.lines.map(t => t.length)) * unit * FONT * 0.62;
      const x0 = lay.anchor === 'start' ? lay.x : lay.anchor === 'end' ? lay.x - w : lay.x - w / 2;
      box.push([x0, lay.y - unit * FONT], [x0 + w, lay.y + unit * FONT * (l.lines.length * 1.3 - 0.3)]);
    }
    const cw = cam.label.length * unit * FONT * 0.62;
    box.push([cam.x - cw / 2, cam.y + unit * 11], [cam.x + cw / 2, cam.y + unit * 11]);
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

  svg.setAttribute('viewBox', `${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('overflow', 'hidden');
  svg.classList.add('plan');
  svg.replaceChildren();

  const titleText = labels.title ?? 'Lighting plan, top view';
  const descText = labels.desc ?? describePlan(cam, sub, L);
  const tid = svg.id ? `${svg.id}-title` : null, did = svg.id ? `${svg.id}-desc` : null;
  svg.append(s('title', { id: tid }, titleText), s('desc', { id: did }, descText));
  if (tid) svg.setAttribute('aria-labelledby', `${tid} ${did}`);

  const stroke = { 'vector-effect': 'non-scaling-stroke', fill: 'none' };
  const mono = { 'font-family': 'var(--font-mono, monospace)', 'font-size': f(unit * FONT), style: 'letter-spacing:0.06em' };

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

  // Camera FOV wedge aimed at the subject.
  const aim = Math.atan2(sub.y - cam.y, sub.x - cam.x), halfFov = ((cam.fov ?? 12.5) * Math.PI) / 360;
  const reach = Math.hypot(sub.x - cam.x, sub.y - cam.y) * 1.25;
  const wedge = [
    [cam.x, cam.y],
    [cam.x + Math.cos(aim - halfFov) * reach, cam.y + Math.sin(aim - halfFov) * reach],
    [cam.x + Math.cos(aim + halfFov) * reach, cam.y + Math.sin(aim + halfFov) * reach],
  ];
  svg.append(s('path', {
    d: `M${wedge.map(p => p.map(f).join(' ')).join('L')}Z`,
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

  // Camera body.
  const cb = s('g', { transform: `translate(${f(cam.x)} ${f(cam.y)}) rotate(${f(deg(aim) - 90)})` });
  cb.append(
    s('rect', { x: f(-unit * 2.4), y: f(-unit * 3.6), width: f(unit * 4.8), height: f(unit * 4.4), rx: f(unit * 0.6), style: 'fill:var(--ink-3, #1E2127);stroke:var(--paper, #ECE6DA)', 'vector-effect': 'non-scaling-stroke' }),
    s('rect', { x: f(-unit * 1.2), y: f(unit * 0.8), width: f(unit * 2.4), height: f(unit * 1.8), style: 'fill:var(--paper, #ECE6DA)' }),
  );
  svg.append(cb);
  svg.append(s('text', { x: f(cam.x), y: f(cam.y + unit * 10), 'text-anchor': 'middle', ...mono, style: 'fill:var(--paper-2, #B9B3A8)' }, cam.label));

  // Subject: head circle + nose tick toward its facing direction.
  const face = sub.facing === 'camera' ? Math.atan2(cam.y - sub.y, cam.x - sub.x) : (Number(sub.facing) * Math.PI) / 180;
  svg.append(
    s('circle', { cx: sub.x, cy: sub.y, r: sub.r, style: 'fill:var(--ink-2, #14161A);stroke:var(--paper, #ECE6DA)', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.5 }),
    s('path', { d: `M${f(sub.x + Math.cos(face) * sub.r)} ${f(sub.y + Math.sin(face) * sub.r)}L${f(sub.x + Math.cos(face) * sub.r * 1.6)} ${f(sub.y + Math.sin(face) * sub.r * 1.6)}`, ...stroke, style: 'stroke:var(--paper, #ECE6DA)', 'stroke-width': 1.5 }),
  );
  if (sub.label) svg.append(s('text', { x: f(sub.x), y: f(sub.y - sub.r - unit * 2), 'text-anchor': 'middle', ...mono, style: 'fill:var(--paper-2, #B9B3A8)' }, sub.label));

  // Lights: a rectangle aimed at the subject, a Kelvin chip and a mono label.
  for (const l of L) {
    const [x, y] = l.xy, toSub = Math.atan2(sub.y - y, sub.x - x);
    const w = Math.max(unit * 3, Math.min((l.size ?? 0.6) * 0.8, unit * 9)), hgt = unit * 2;
    const chip = Number.isFinite(l.kelvin) ? kelvinChip(l.kelvin, 5600) : '#ECE6DA';
    const g = s('g', { transform: `translate(${f(x)} ${f(y)}) rotate(${f(deg(toSub) + 90)})` });
    g.append(
      s('rect', { x: f(-w / 2), y: f(-hgt / 2), width: f(w), height: f(hgt), style: `fill:${chip};stroke:var(--ink-0, #07080A)`, 'vector-effect': 'non-scaling-stroke' }),
      s('path', { d: `M0 ${f(-hgt / 2)}L0 ${f(-hgt / 2 - unit * 2.5)}`, ...stroke, style: `stroke:${chip}`, 'stroke-width': 1 }),
    );
    svg.append(g);
    const lay = labelLayout(l, sub, unit);
    const t = s('text', { x: f(lay.x), y: f(lay.y + unit * 1.1), 'text-anchor': lay.anchor, ...mono, style: 'fill:var(--paper, #ECE6DA)' });
    l.lines.forEach((line, i) => t.append(s('tspan', {
      x: f(lay.x), dy: i ? f(unit * FONT * 1.3) : null,
      style: i ? 'fill:var(--paper-2, #B9B3A8)' : `fill:${chip}`,
    }, line)));
    svg.append(t);
  }

  return { bounds: { minX, minY, maxX, maxY } };
}

/** Label placement outside a light, away from the subject. */
function labelLayout(l, sub, unit) {
  const [x, y] = l.xy, out = Math.atan2(y - sub.y, x - sub.x);
  // Lights on (or near) the subject–camera axis put their label beside them, alternating sides.
  if (Math.abs(Math.cos(out)) < 0.3) {
    const right = l.side !== 'left';
    return { x: x + (right ? 1 : -1) * unit * 6, y: y - unit * 1.5, anchor: right ? 'start' : 'end' };
  }
  return { x: x + Math.cos(out) * unit * 6, y: y + Math.sin(out) * unit * 6, anchor: Math.cos(out) > 0 ? 'start' : 'end' };
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
