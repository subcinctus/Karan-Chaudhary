// Motion Prompt #087 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#087
// (numbers only: #087's before/after: the A and B tags at the picture's top corners, each clipped to its own
//  side so the divider wipes them with the picture, and a hairline divider with a round grip. Rebuilt in the
//  DOM with real pointer events; there is no scripted demo here.)
//
// A before/after wipe in the DOM for two real frames: a film's grade (log → final) and its previs against
// the final frame. site/film-facts.js renderGradeShell() writes the markup ([data-wipe]: an A image, a B
// layer clipped at --wipe, the divider, a range input); bindWipe(el) makes it move.
// The gestures are the Colour study's (pieces/colour.js bindWipeDrag): a mouse or pen grabs the divider at
// once; on touch a tap sets it, a mostly-horizontal drag past 8 px of slop moves it, and a vertical swipe is
// left to the browser to scroll the page. The range input carries the keyboard (arrows, Page Up / Down, Home,
// End) and says where the divider stands. Nothing animates, so reduced motion and Motion off change nothing.

const SLOP = 8;   // CSS px before a touch counts as a drag

/**
 * Bind one [data-wipe] block. Returns an unbind function.
 * @param {HTMLElement} el  holds [data-wipe-frame] (the picture) and an <input type="range"> (0–100)
 */
export function bindWipe(el) {
  const frame = el.querySelector('[data-wipe-frame]'), input = el.querySelector('input[type="range"]');
  if (!frame || !input) return () => {};
  const [a, b] = [el.dataset.wipeA || 'A', el.dataset.wipeB || 'B'];
  let drag = null, pend = null;
  frame.style.touchAction = 'pan-y';

  const set = v => {
    const p = Math.round(Math.min(1, Math.max(0, v)) * 100);
    el.style.setProperty('--wipe', `${p}%`);
    input.value = String(p);
    input.setAttribute('aria-valuetext', `${p} %: ${a} on the left, ${b} on the right`);
  };
  const at = e => { const r = frame.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  const grab = e => {
    drag = e.pointerId; pend = null;
    try { frame.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    set(at(e));
  };
  const down = e => {
    if ((e.button ?? 0) > 0 || drag != null) return;
    if (e.pointerType === 'touch') { pend = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    grab(e);
    e.preventDefault();
  };
  const move = e => {
    if (drag === e.pointerId) { set(at(e)); return; }
    if (pend?.id !== e.pointerId) return;
    const dx = Math.abs(e.clientX - pend.x), dy = Math.abs(e.clientY - pend.y);
    if (dx > SLOP && dx > dy) grab(e);
    else if (dy > SLOP) pend = null;   // a scroll: leave it to the browser
  };
  const up = e => {
    if (pend?.id === e.pointerId && e.type === 'pointerup') set(at(e));   // a tap
    if (pend?.id === e.pointerId) pend = null;
    if (drag === e.pointerId) drag = null;
  };
  const onInput = () => set(Number(input.value) / 100);
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up };
  for (const [k, f] of Object.entries(events)) frame.addEventListener(k, f);
  input.addEventListener('input', onInput);
  set(Number(input.value) / 100);
  return () => {
    for (const [k, f] of Object.entries(events)) frame.removeEventListener(k, f);
    input.removeEventListener('input', onInput);
    frame.style.touchAction = '';
    drag = pend = null;
  };
}
