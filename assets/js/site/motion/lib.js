// Loads the vendored motion libraries for the desktop layer and hands them out as ES exports.
//
// GSAP 3.15.0 (core, ScrollTrigger, SplitText, CustomEase) ships here as the publisher's minified
// files, byte-identical with their licence headers (assets/js/vendor/gsap/README.md). Their UMD
// wrapper assigns `window.window`, which throws in module (strict) code, so they are injected as
// ordered classic scripts and read back from window. Lenis 1.3.27 is a real ES module.
// Only this module requests them, and only the desktop branch of main.js / project.js imports it:
// phones and tablets never download either library. Every URL is built from import.meta.url
// (relative to this file), so the site keeps working under the GitHub Pages sub-path.

import Lenis from '../../vendor/lenis/lenis.mjs';

const FILES = ['gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js', 'CustomEase.min.js'];

const load = name => new Promise((resolve, reject) => {
  const src = new URL(`../../vendor/gsap/${name}`, import.meta.url).href;
  const s = document.createElement('script');
  s.src = src;
  s.async = false;   // dynamic scripts with async=false execute in insertion order
  s.dataset.vendor = name;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`failed to load ${name}`));
  document.head.append(s);
});

await Promise.all(FILES.map(load));

const { gsap, ScrollTrigger, SplitText, CustomEase } = window;
if (!gsap || !ScrollTrigger || !SplitText || !CustomEase) throw new Error('GSAP globals missing');
gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
gsap.config({ nullTargetWarn: false });

// The three site curves, the same numbers as tokens.css (--ease-out-expo, --ease-io-expo, --ease-ui).
CustomEase.create('kc.out', 'M0,0 C0.16,1 0.3,1 1,1');
CustomEase.create('kc.io', 'M0,0 C0.77,0 0.175,1 1,1');
CustomEase.create('kc.ui', 'M0,0 C0.4,0 0.1,1 1,1');

export { gsap, ScrollTrigger, SplitText, CustomEase, Lenis };
