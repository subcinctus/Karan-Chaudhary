// photographs.html: the owner's still photography in series, and its print view (one photograph to a page,
// saved as PDF for an application: APPLYING.md). Renders the page from data/portfolio.js with the options
// in its URL (?set=afi, ?captions=1, ?cover=1: photographs.js pageOptions), but only where that changes
// what tools/prerender.mjs wrote into the page (every photograph, no options): an identical copy is left
// alone, so its photographs keep loading. Sets the title (the browser offers it as the PDF's file name)
// and robots (nothing to show yet: noindex), and wires the header, the menu sheet, the Motion toggle, the
// timecode and the colophon as on the other pages. No desktop motion layer: the photographs hold still.
//
// "Print / Save as PDF" loads every photograph first (on screen they load as they come near, and one that
// has not arrived would print as an empty page), then opens the browser's print dialog; printing from the
// browser's own menu asks for them all too (beforeprint).

import data from '../../../data/portfolio.js';
import { applyPageGrain } from '../core/grain.js';
import { bindMotionToggle } from '../core/motion-pref.js';
import * as R from './render.js';
import { initShutter } from './shutter.js';
import { initProgress } from './progress.js';
import { renderPhotographsPage, pageOptions, SETS } from './photographs.js';

/** The longest the print button waits for the photographs before opening the dialog anyway. */
const LOAD_MS = 15000;

function setMeta({ set }) {
  const p = data.person ?? {};
  document.title = set ? `${p.name ?? ''} — Photographs, ${SETS[set]} set` : `Photographs — ${p.name ?? ''}, ${p.role ?? 'Cinematographer'}`;
  // Not a page for search engines until it has photographs (the prerendered page says the same).
  let robots = document.querySelector('meta[name="robots"]');
  if (R.hasPhotographs(data)) robots?.remove();
  else if (!robots) {
    robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
  }
}

/** Resolves once every image has loaded or failed, or after `ms`. */
function loaded(imgs, ms) {
  const one = img => (img.complete ? null : new Promise(r => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
  }));
  return Promise.race([Promise.all(imgs.map(one)), new Promise(r => setTimeout(r, ms))]);
}

function bindPrint(main) {
  const photos = () => [...main.querySelectorAll('.photo__img')];
  const eager = () => { for (const img of photos()) img.loading = 'eager'; };
  addEventListener('beforeprint', eager);
  main.addEventListener('click', async e => {
    const button = e.target.closest?.('[data-print]');
    if (!button || button.getAttribute('aria-busy') === 'true') return;
    const status = main.querySelector('[data-print-status]');
    button.setAttribute('aria-busy', 'true');
    eager();
    const waiting = photos().filter(img => !img.complete).length;
    if (status && waiting) status.textContent = `Loading ${waiting} photograph${waiting === 1 ? '' : 's'} for print…`;
    await loaded(photos(), LOAD_MS);
    if (status) status.textContent = '';
    button.removeAttribute('aria-busy');
    print();
  });
}

function boot() {
  applyPageGrain();
  initShutter();
  R.put(document.querySelector('[data-render="colophon"]'), R.renderColophon(data, { replay: false }));
  R.pruneSections(data);
  R.initChrome({ bindMotionToggle, solidAfter: () => -1 });
  // The header's Photographs item leads to the home page's section; on this page it is the current one.
  for (const a of document.querySelectorAll('.site-nav a[href$="#photographs"]')) a.setAttribute('aria-current', 'true');

  const opts = pageOptions(location.search);
  const main = document.querySelector('[data-photographs]');
  const markup = String(renderPhotographsPage(data, opts));
  const key = /data-photos-key="([^"]*)"/.exec(markup)?.[1];
  if (main && main.querySelector('[data-photos-key]')?.dataset.photosKey !== key) {
    R.put(main, markup);
    R.settleHash();   // arriving on #series-2 before the series was in the page
  }
  setMeta(opts);
  if (main) bindPrint(main);
  initProgress({ runtime: data.site?.timecodeRuntime ?? 180 });
}

boot();
