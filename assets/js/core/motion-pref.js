// Motion preference: the OS setting (prefers-reduced-motion) OR the site's own "Motion off"
// toggle, persisted in localStorage. Both lead to the same behaviour: static resolved frames,
// no preloader, no transitions. Emits a `motionpref` event on window whenever the result changes.

const KEY = 'kc:motion';
const EVENT = 'motionpref';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function readStored() {
  try { return localStorage.getItem(KEY) === 'off'; } catch { return false; }
}

let userOff = readStored();
let last;

export const prefersReducedMotion = () => !!mq?.matches;
export const motionOffByUser = () => userOff;
/** True when anything should be static. */
export const isReducedMotion = () => prefersReducedMotion() || userOff;

function sync() {
  const reduced = isReducedMotion();
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = reduced ? 'off' : 'on';
  if (reduced === last) return;
  last = reduced;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { reduced, os: prefersReducedMotion(), user: userOff } }));
}

/** Set (and persist) the site toggle. */
export function setMotionOff(off) {
  userOff = !!off;
  try { off ? localStorage.setItem(KEY, 'off') : localStorage.removeItem(KEY); } catch { /* private mode */ }
  sync();
}

/** Subscribe to changes; returns an unsubscribe function. Callback receives { reduced, os, user }. */
export function onMotionChange(cb) {
  const h = e => cb(e.detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/**
 * Wire a <button> as the "Motion off" toggle (aria-pressed reflects the user setting).
 * The OS setting cannot be overridden here; the label says so when it applies.
 */
export function bindMotionToggle(button) {
  const render = () => {
    // Constant label + aria-pressed: "Motion off, pressed" reads correctly to screen readers.
    button.setAttribute('aria-pressed', String(userOff));
    if (!button.textContent.trim()) button.textContent = 'Motion off';
    button.title = prefersReducedMotion() ? 'Your system asks for reduced motion; animations stay still.' : 'Turn animations off or on';
  };
  button.type = 'button';
  button.addEventListener('click', () => { setMotionOff(!userOff); render(); });
  const off = onMotionChange(render);
  render();
  return off;
}

// Keep in sync with the OS setting and other tabs.
mq?.addEventListener?.('change', sync);
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) { userOff = readStored(); sync(); } });
  sync();
}
