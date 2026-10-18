// Thin-lens optics for the Focus study and the previs generator. All lengths in millimetres
// unless a name says otherwise. Formulas are the standard photographic approximations.

/** Capture formats: sensor gate (mm) and circle of confusion (mm). */
export const FORMATS = {
  s16: { id: 's16', label: 'Super 16', w: 12.52, h: 7.41, coc: 0.015 },
  s35: { id: 's35', label: 'Super 35', w: 24.89, h: 18.66, coc: 0.025 },
  ff: { id: 'ff', label: 'Full frame', w: 36, h: 24, coc: 0.030 },
};
export const DEFAULT_FORMAT = 's35';

/** Prime lens detents (mm). */
export const PRIMES = [18, 21, 25, 29, 32, 35, 40, 50, 65, 75, 100, 135];

/** Third-stop apertures f/1.4 … f/22: exact N = 2^(k/6), labelled with the nominal marking. */
const NOMINAL = ['1.4', '1.6', '1.8', '2', '2.2', '2.5', '2.8', '3.2', '3.5', '4', '4.5', '5', '5.6',
  '6.3', '7.1', '8', '9', '10', '11', '13', '14', '16', '18', '20', '22'];
export const STOPS = NOMINAL.map((label, i) => ({ k: i + 3, N: Math.pow(2, (i + 3) / 6), label: `f/${label}` }));

/** Focus ring marks (m); Infinity is the ∞ detent. */
export const FOCUS_MARKS = [0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 3, 5, 10, Infinity];
export const FOCUS_RANGE = { min: 0.45, max: 30 };

/** Iris blade options; 0 = round. */
export const BLADES = [5, 6, 7, 8, 9, 11, 0];

export const M_TO_FT = 3.280839895;

/** Hyperfocal distance H = f²/(N·c) + f. */
export const hyperfocal = (f, N, c) => (f * f) / (N * c) + f;
/** Near limit of acceptable focus for subject distance s. */
export const nearLimit = (s, f, H) => (s * (H - f)) / (H + s - 2 * f);
/** Far limit; infinite at or beyond the hyperfocal distance. */
export const farLimit = (s, f, H) => (s < H ? (s * (H - f)) / (H - s) : Infinity);

/** Full depth-of-field solution for focal length f, aperture N, CoC c, focus distance s (all mm). */
export function depthOfField({ f, N, c, s }) {
  const H = hyperfocal(f, N, c);
  const near = nearLimit(s, f, H), far = farLimit(s, f, H);
  return { H, near, far, total: far - near };
}

/**
 * Blur-disc diameter on the sensor (mm) for an object at distance d when focused at s:
 * b = f²·|d − s| / (N·d·(s − f)); d = ∞ gives f²/(N(s − f)).
 */
export function blurDisc(f, N, s, d) {
  if (!Number.isFinite(d)) return (f * f) / (N * (s - f));
  return (f * f * Math.abs(d - s)) / (N * d * (s - f));
}

/** Sensor mm → image pixels for an image Wpx wide showing the full sensor width. */
export const mmToPx = (mm, Wpx, sensorW) => (mm * Wpx) / sensorW;

/** Gaussian σ (px) that approximates a uniform disc of diameter b px. */
export const blurSigma = bPx => bPx / 4;

/** Height of the gate actually used for a given delivery aspect (extraction). */
export const extractionHeight = (sensorW, sensorH, aspect) => Math.min(sensorH, sensorW / aspect);

/** Field of view (radians) across a dimension of the gate. */
export const fovRad = (f, size) => 2 * Math.atan(size / (2 * f));
export const deg = r => (r * 180) / Math.PI;
export const rad = d => (d * Math.PI) / 180;

/** Horizontal and vertical FOV (degrees) for focal f on a format at a delivery aspect. */
export function fieldOfView(f, format = FORMATS[DEFAULT_FORMAT], aspect = 2.39) {
  const h = extractionHeight(format.w, format.h, aspect);
  return { h: deg(fovRad(f, format.w)), v: deg(fovRad(f, h)), extractH: h };
}

/**
 * Pinhole projection of a world point (metres; X right, Y up, d = distance along the optical axis)
 * into an image W×H px whose width shows the full sensor width. Camera height camH (m).
 */
export function project({ X, Y, d }, { f, sensorW, W, H, camH = 1.6 }) {
  const fm = f / 1000, k = (fm / (d - fm)) * (W / (sensorW / 1000));
  return { x: W / 2 + X * k, y: H / 2 - (Y - camH) * k, scale: k };
}

/** Stops between two apertures (positive when N2 is smaller, i.e. wider). */
export const stopsBetween = (N1, N2) => 2 * Math.log2(N1 / N2);

/** Log focus ring: slider u in 0..1 ↔ distance (m) between FOCUS_RANGE.min and .max. */
export function focusFromSlider(u, { min, max } = FOCUS_RANGE) {
  return min * Math.pow(max / min, Math.min(1, Math.max(0, u)));
}
export function sliderFromFocus(m, { min, max } = FOCUS_RANGE) {
  if (!Number.isFinite(m)) return 1;
  return Math.log(m / min) / Math.log(max / min);
}

/** "2.77 m" / "9 ft 1 in" style readout. */
export function formatDistance(m, units = 'm') {
  if (!Number.isFinite(m)) return '∞';
  if (units === 'ft') {
    const ft = m * M_TO_FT, whole = Math.floor(ft), inch = Math.round((ft - whole) * 12);
    return inch === 12 ? `${whole + 1} ft` : `${whole} ft ${inch} in`;
  }
  return m >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`;
}

/** Nearest stop entry for an f-number. */
export function nearestStop(N) {
  return STOPS.reduce((best, s) => (Math.abs(Math.log(s.N / N)) < Math.abs(Math.log(best.N / N)) ? s : best), STOPS[0]);
}
