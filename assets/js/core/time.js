// Motion Prompt #001-024 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#001
// Motion Prompt #025-048 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#025
//   (kit helpers P, eIO, eIOs, eOut, eOut5, eIn, backIn, backOut: formulas copied from the motion and camera kits)
//
// Time helpers shared by every piece. Pure functions only: no clocks live here.
// Easings match the Motion Prompt kits (camera/motion packs) so ported numbers keep their feel.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, x) => a + (b - a) * x;
/** Progress of t through [a, b], clamped to 0..1 (the kits' P()). */
export const P = (t, a, b) => clamp((t - a) / (b - a));
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const mod = (a, n) => ((a % n) + n) % n;
export const smoothstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const smooth = x => x * x * (3 - 2 * x);

// Kit easings, verbatim formulas.
/** Cubic in-out, about cubic-bezier(0.65, 0, 0.35, 1). */
export const eIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Quadratic in-out. */
export const eIOs = x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
/** Cubic ease-out, about cubic-bezier(0.33, 1, 0.68, 1). */
export const eOut = x => 1 - Math.pow(1 - x, 3);
export const eOut5 = x => 1 - Math.pow(1 - x, 5);
export const eIn = x => x * x * x;
export const backIn = (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x;
export const backOut = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

/** CSS-style cubic-bezier easing (bisection, 40 steps; same approach as the motion kit's bez()). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}

/** Eased segment: value of an `ease` move from v0 to v1 during [t0, t1]. */
export const tween = (t, t0, t1, v0, v1, ease = eIO) => lerp(v0, v1, ease(P(t, t0, t1)));

/** Time-quantise (e.g. grain re-seeded at 24 fps): floor(t * fps). */
export const frameIndex = (t, fps = 24) => Math.floor(t * fps + 1e-9);

// ---------------------------------------------------------------------------
// Closed-form spring step responses. A value retargeted many times is
// v0 + Σ Δi · S(t − ti), so every frame stays a pure function of t.

export const DEFAULT_OMEGA = 12;

/** Critically damped unit step: S(τ) = 1 − (1 + ωτ)e^(−ωτ); exactly 1 once τ > 8/ω. */
export function springCritical(tau, omega = DEFAULT_OMEGA) {
  if (tau <= 0) return 0;
  if (tau > 8 / omega) return 1;
  const x = omega * tau;
  return 1 - (1 + x) * Math.exp(-x);
}

/**
 * Underdamped unit step (0 < ζ < 1): 1 − e^(−ζωτ)(cos ω_d τ + ζω/ω_d · sin ω_d τ).
 * Falls back to the critically damped form for ζ ≥ 1. Exactly 1 once the envelope is below 1e-4.
 */
export function springUnderdamped(tau, omega = DEFAULT_OMEGA, zeta = 0.5) {
  if (zeta >= 1) return springCritical(tau, omega);
  if (tau <= 0) return 0;
  if (tau > springSettleTime(omega, zeta)) return 1;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * tau) * (Math.cos(wd * tau) + (zeta * omega / wd) * Math.sin(wd * tau));
}

/** Time after which the step response is treated as settled (returns exactly 1). */
export function springSettleTime(omega = DEFAULT_OMEGA, zeta = 1) {
  if (zeta >= 1) return 8 / omega;
  return Math.log(1e4) / (zeta * omega);
}

/** Pick the step response for a spring config { omega, zeta }. */
export function springStep(tau, { omega = DEFAULT_OMEGA, zeta = 1 } = {}) {
  return zeta >= 1 ? springCritical(tau, omega) : springUnderdamped(tau, omega, zeta);
}

/** Loop / once helpers for Motion Prompt cells: loop → u = t mod cycle; hold → u = min(t, uHold). */
export const loopU = (t, cycle) => mod(t, cycle);
export const holdU = (t, uHold) => clamp(t, 0, uHold);
