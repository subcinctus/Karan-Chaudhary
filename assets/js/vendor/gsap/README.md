# GSAP 3.15.0 (vendored)

Used only by the desktop motion layer (`assets/js/site/motion/`), which loads these files through
`assets/js/site/motion/lib.js` on fine-pointer screens ≥ 1024 px with motion on. Phones and tablets
never request them. No CDN is used at runtime.

- Package: `gsap@3.15.0` from the npm registry,
  <https://registry.npmjs.org/gsap/-/gsap-3.15.0.tgz>
  (integrity `sha512-dMW4CWBTUK1AEEDeZc1g4xpPGIrSf9fJF960qbTZmN/QwZIWY5wgliS6JWl9/25fpTGJrMRtSjGtOmPnfjZB+A==`).
- Files: copied **byte-identical** from the package's `dist/` folder, with GreenSock's
  `/*! … @license … */` headers intact. Do not edit, minify or strip them.

| File | sha256 |
|---|---|
| `gsap.min.js` | `92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb` |
| `ScrollTrigger.min.js` | `b0b14d67b55b0c43c756ac0b106cfcb09d0879945f6ead64451065b0672916a2` |
| `SplitText.min.js` | `419f7027a5f086a12cb7988736d8fdd3a6ed2200229661de25b6628ca7ced344` |
| `CustomEase.min.js` | `466e426a5c60c21c94b15a30a3dffacac9bb39ce8f4e07d071d7d4bb1be43390` |

`tools/vendor-manifest.json` holds the same hashes; `npm run check` verifies them, and
`node tools/vendor-motion.mjs` re-fetches and re-verifies the files.

## Licence

GSAP is © GreenSock (Webflow) and is distributed under the **GSAP Standard "No Charge" License**:
<https://gsap.com/standard-license>. It allows free use, including commercial use, on sites like
this one. The notices must not be removed or altered. Its one restriction, on building tools that
compete with Webflow's visual animation builder, does not apply to this portfolio.
The package ships no separate LICENSE file; the terms are those at the URL above.

## Why classic scripts

These are UMD builds. Their wrapper assigns `window.window`, which throws in strict (ES module)
code, so `lib.js` injects them as ordered classic `<script>` elements (URLs built with
`new URL(…, import.meta.url)`, relative to the sub-path) and re-exports the globals as ES exports.
