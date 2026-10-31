// Motion Prompt #083 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#083
// (numbers only: #083's follower, which covers a fixed share of the remaining distance each frame
//  (12 % at 60 fps), here as a GSAP quickTo of 0.38 s on a power3 ease-out, frame-rate independent;
//  it grows into its labelled state over 0.45 s on an expo ease-out and shrinks away in 0.3 s.)
//
// A viewfinder that appears only over pictures: corner brackets and a centre cross around the pointer,
// with a label under them that says what the picture does: "View — (the card's move)" on a work card,
// "Drag — wipe" on the Colour study, "Live — lens maths" on the Focus study, a shot id on a previs plan.
// The system cursor always stays visible (this is an addition, not a replacement); over the study
// controls, buttons and inputs the viewfinder is hidden; it is aria-hidden, never focusable, and off in
// forced-colours mode. Transforms and opacity only.
// The label keeps clear of what it would cover: it flips above the brackets near the bottom of the
// window and is held inside it sideways; over a study it sits above the brackets (below them only near
// the picture's top edge), so it never lands on the camera readouts drawn in the picture's corners; and
// while the Colour study's divider is being dragged the viewfinder steps aside (the divider is the
// cursor then).

const TARGETS = [
  ['.work-card__link', el => `View — ${el.querySelector('.work-card__foot span')?.textContent?.trim() || 'film'}`],
  ['.study-block--colour [data-study-host]', () => 'Drag — wipe'],
  ['.study-block--focus [data-study-host]', () => 'Live — lens maths'],
  ['.study-block--light [data-study-host]', () => 'Live — key and fill'],
  ['.previs-slot__frame', el => `Plan — ${el.closest('.previs-slot')?.dataset.shot ?? 'shot'}`],
  ['.film__frame, .still .frame', el => (el.closest('.still') ? `Frame ${String([...el.closest('.stills').children].indexOf(el.closest('.still')) + 1).padStart(2, '0')}` : 'Lead frame')],
  ['.film__pager-link', el => el.querySelector('.cam-label')?.textContent?.trim() ?? 'Next'],
];
const SELECTOR = TARGETS.map(t => t[0]).join(', ');
const QUIET = 'button, input, select, textarea, label, [data-controls], .player__chrome';

export function initCursor(env) {
  const { gsap, state } = env;
  const el = document.createElement('div');
  el.className = 'kc-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="kc-cursor__frame"><i></i><i></i><i></i><i></i><b></b></div><span class="kc-cursor__label"></span>';
  document.body.append(el);
  const frame = el.firstElementChild, label = el.lastElementChild;
  gsap.set(frame, { scale: 0.5, autoAlpha: 0 });
  gsap.set(label, { y: 8, autoAlpha: 0 });

  const xTo = gsap.quickTo(el, 'x', { duration: 0.38, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.38, ease: 'power3.out' });
  let px = -200, py = -200, on = null, text = '', seen = false, lw = 0, lh = 0, dragging = false;
  const STUDY = '[data-study-host]';
  const place = () => {
    if (!on || !lw) return;
    const gap = 44, edge = 8;
    let above = false;
    if (on.matches(STUDY)) above = py - on.getBoundingClientRect().top > 110;
    if (!above && py + gap + lh > innerHeight - edge) above = true;
    if (above && py - gap - lh < edge) above = false;
    const dx = Math.min(innerWidth - edge - lw / 2 - px, Math.max(edge + lw / 2 - px, 0));
    label.style.top = `${above ? -gap - lh : gap}px`;
    label.style.left = `${Math.round(dx)}px`;
  };

  const labelFor = t => {
    for (const [sel, fn] of TARGETS) if (t.matches(sel)) return fn(t);
    return '';
  };
  const show = (t) => {
    const next = t ? labelFor(t) : '';
    if (t === on && next === text) return;
    on = t; text = next;
    if (t) {
      label.textContent = next;
      lw = label.offsetWidth; lh = label.offsetHeight;
      place();
      gsap.to(frame, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'kc.out', overwrite: true });
      gsap.to(label, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'kc.out', overwrite: true, delay: 0.05 });
    } else {
      gsap.to(frame, { scale: 0.5, autoAlpha: 0, duration: 0.3, ease: 'kc.ui', overwrite: true });
      gsap.to(label, { y: 8, autoAlpha: 0, duration: 0.2, ease: 'kc.ui', overwrite: true });
    }
  };
  const pick = node => {
    if (!node || node.closest?.(QUIET)) return null;
    return node.closest?.(SELECTOR) ?? null;
  };

  const onMove = e => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    px = e.clientX; py = e.clientY;
    if (!seen) { seen = true; gsap.set(el, { x: px, y: py }); }
    xTo(px); yTo(py);
    show(dragging ? null : pick(e.target));
    place();
  };
  // Dragging the Colour study's divider: the viewfinder steps aside until the button is released.
  const onDown = e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (!e.target.closest?.('.study-block--colour [data-study-host]')) return;
    dragging = true; show(null);
  };
  const onUp = e => { if (!dragging) return; dragging = false; show(pick(document.elementFromPoint(e.clientX, e.clientY))); };
  const onOut = e => { if (!e.relatedTarget) show(null); };
  // The page moves under a still pointer while it scrolls: look again, at most every 100 ms and once
  // when the scroll stops (a hit test every frame would force layout during the scroll).
  let raf = 0, last = 0, tail = 0;
  const look = () => {
    raf = 0; last = performance.now();
    if (dragging) return;
    show(pick(document.elementFromPoint(px, py)));
    place();
  };
  const onScroll = () => {
    if (!seen) return;
    clearTimeout(tail);
    tail = setTimeout(() => { if (!raf) raf = requestAnimationFrame(look); }, 120);
    if (raf || performance.now() - last < 100) return;
    raf = requestAnimationFrame(look);
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerout', onOut, { passive: true });
  document.addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  void state;

  return () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onOut);
    document.removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    clearTimeout(tail);
    removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf);
    el.remove();
  };
}
