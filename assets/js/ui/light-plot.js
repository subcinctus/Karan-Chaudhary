// Companion DOM for the Light study: the top-down lighting plan (ui/plot.js), a camera-report
// readout, and the preset → rig springs.
//
//   import { bindLightPlot } from '../assets/js/ui/light-plot.js';
//   const host = document.querySelector('[data-stage-host]');            // the Player host
//   bindLightPlot(host, document.querySelector('svg[data-light-plan]'), {
//     report: document.querySelector('[data-light-report]'),             // optional <dl>
//     note: document.querySelector('[data-light-note]'),                 // optional <p>
//   });
//   mount(host, { load: () => import('../pieces/light.js'), controls: true, heavy: true });
//
// It draws the plan at once from the default set-up (so the page has a plan even without WebGL),
// then follows the Player's 'playerparams' events. Call it before or after mount(); it only listens.
//
// Presets: when the user picks a set-up, the Player only changes `preset`. This binding answers by
// springing the hidden rig (light azimuths, elevations, distances, fill/rim presence, look) to that
// set-up with api.set(presetParams(id, current), { animate: true }). It runs synchronously inside
// the event, so the frame drawn for the click is replaced before the browser paints. Pass
// { presets: false } to keep the plan only (the piece then switches set-ups without a transition).

import { renderPlan } from './plot.js';
import { LIGHTING_PRESETS, DEFAULT_PRESET, ratioLabel } from '../core/presets.js';
import { presetParams, rigFromParams, describeLight, CAMERA, CAMERA_HFOV } from '../pieces/light.js';

const r100 = v => Math.round(v / 100) * 100;
const wrap180 = a => ((((a + 180) % 360) + 360) % 360) - 180;
const sideText = az => {
  const a = Math.round(wrap180(az));
  return a === 0 ? 'ON AXIS' : Math.abs(a) === 180 ? 'BEHIND' : `${Math.abs(a)}° ${a > 0 ? 'CAM-L' : 'CAM-R'}`;
};
const elText = el => `${Math.abs(Math.round(el))}°${el > 0.5 ? '↑' : el < -0.5 ? '↓' : ''}`;

/** True when at least 15 % of the element is inside the viewport (the Player's own threshold). */
function inView(el) {
  const r = el.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
  const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return r.height > 0 && vis / r.height >= 0.15;
}

/** Plan lights (rounded for labels) for a params object. */
export function planLights(params) {
  return rigFromParams(params).lights
    .filter(l => (l.presence ?? 1) > 0.5)
    .map(l => ({
      role: l.role, az: Math.round(wrap180(l.az)), el: Math.round(l.el), dist: Math.round(l.dist * 10) / 10,
      kelvin: r100(l.kelvin), size: l.size,
    }));
}

/** Camera-report rows for the readout. */
export function reportRows(params) {
  const r = rigFromParams(params);
  const [key, fill, rim2] = r.lights;
  const pr = r.preset;
  const rows = [['Set-up', `${pr.label}${pr.mp ? ` · ${pr.mp}` : ''}`]];
  if (pr.id === 'rim' || rim2.presence > 0.5) rows.push(['Rims', `±135° · ${elText(key.el)} · ${r100(key.kelvin)}K · ${key.dist.toFixed(1)}\u00a0m`]);
  else rows.push(['Key', `${sideText(key.az)} · ${elText(key.el)} · ${r100(key.kelvin)}K · ${key.dist.toFixed(1)}\u00a0m`]);
  rows.push(['Fill', fill.presence > 0.5 ? `${sideText(fill.az)} · ${elText(fill.el)} · ${r100(fill.kelvin)}K` : 'None']);
  rows.push(['Ratio', fill.presence > 0.5 ? ratioLabel(Math.round(r.ratio * 10) / 10) : '—']);
  rows.push(['Camera', `WB ${r100(r.wb)}K · ${CAMERA.focal}mm · S35 4:5 · ${CAMERA.tStop}`]);
  return rows;
}

/**
 * Bind the plan (and optional readout) to a Light-study Player host.
 * @param {HTMLElement} host   the element passed to mount()
 * @param {SVGSVGElement} svg
 * @param {{ report?: HTMLElement, note?: HTMLElement, presets?: boolean, params?: object, controls?: HTMLElement }} [o]
 *   controls: accepted for older callers; unused now that the Player answers set() at once
 * @returns {{ update(params): void, destroy(): void }}
 */
export function bindLightPlot(host, svg, { report = null, note = null, presets = true, params = null, controls = null } = {}) {
  let lastPlan = '', lastReport = '';

  function update(p) {
    if (svg) {
      const lights = planLights(p);
      const key = JSON.stringify([lights, p.preset]);
      if (key !== lastPlan) {
        lastPlan = key;
        const pr = LIGHTING_PRESETS[p.preset] ?? LIGHTING_PRESETS[DEFAULT_PRESET];
        renderPlan(svg, {
          camera: { x: 0, y: CAMERA.pos[2], fov: CAMERA_HFOV, label: `CAM · ${CAMERA.focal}MM` },
          subject: { r: 0.1 },
          lights,
          labels: { title: `Lighting plan, top view: ${pr.label}`, desc: describeLight(p), extent: 2.9 },
        });
      }
    }
    const rows = reportRows(p);
    const rk = JSON.stringify(rows) + p.preset;
    if (rk === lastReport) return;
    lastReport = rk;
    if (report) {
      report.replaceChildren(...rows.flatMap(([dt, dd]) => {
        const a = document.createElement('dt'), b = document.createElement('dd');
        // Camera-report case, except metres stay a lower-case "m" (an upper-case M reads as mega),
        // and a line never starts with the "·" separator.
        a.textContent = dt;
        b.textContent = dd.toUpperCase().replace(/(\d)\u00a0M\b/g, '$1\u00a0m').replace(/ · /g, '\u00a0· ');
        const row = document.createElement('div');
        row.append(a, b);
        return [row];
      }));
    }
    if (note) note.textContent = (LIGHTING_PRESETS[p.preset] ?? LIGHTING_PRESETS[DEFAULT_PRESET]).note;
  }

  function onParams(e) {
    const { params: p, api } = e.detail ?? {};
    if (!p) return;
    if (presets && api?.mode === 'interactive' && p.preset !== p.rigPreset && LIGHTING_PRESETS[p.preset]) {
      // The Player only runs frames while its canvas is in view (on a phone the radios sit below
      // the picture). A spring nobody can see would stall at its start and leave the plan and the
      // report on the old set-up, so off screen the rig jumps straight to the new one.
      api.set(presetParams(p.preset, p), { animate: inView(host) });
      api.seek(api.time);   // redraw now (spring at its start) even if a frame is already scheduled
      return;   // the nested render emits the new params, which draw the plan
    }
    update(p);
  }

  update(params ?? presetParams(DEFAULT_PRESET));
  host.addEventListener('playerparams', onParams);
  return {
    update,
    destroy() { host.removeEventListener('playerparams', onParams); },
  };
}

/** Preset springs only (no plan), for a page that mounts the Light study without the SVG. */
export function bindLightPresets(host, opts = {}) {
  return bindLightPlot(host, null, { ...opts, presets: true });
}
