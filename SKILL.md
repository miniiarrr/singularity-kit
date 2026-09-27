---
name: singularity
description: Integrate the singularity landing animation, the npm package @miniiarrr/singularity (a galaxy of ink dots that collapses into a black hole with a surfer riding it, on three.js), into any site or app in one of its three modes (full, galaxy, hole), and verify it. Use this skill whenever the user mentions the singularity, singularity-kit, @miniiarrr/singularity, the black hole / galaxy / surfer hero animation, wants it on a page (plain index.html, React, Next.js, Vue, Svelte, Astro), wants to change its mode, colours, size, position or entrance, or asks why it is not showing, flashes, covers the text or is off-centre. Also use it when building a hero or landing page that needs this animation.
---

# Singularity: adding the animation to a page

One animation, shipped as `@miniiarrr/singularity`. A page never draws it differently: the colours, timing, scales and seeds are the brand's identity and are fixed in the package. What a page decides is **which of the three modes plays**, **where the scene sits** (the anchor), **what it stays inside** (the clip), and the light page colour. Keep to that and the result looks exactly like the reference page; step outside it and the scene silently disappears, which is the most common failure.

## 1. Find the package and its docs

Locate the package before writing anything:

- in an app: `node_modules/@miniiarrr/singularity/` (after `npm i @miniiarrr/singularity three`), or the CDN (`https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/…`) for pages with no build step;
- its own repository, `github.com/miniiarrr/singularity-kit` (the source of truth; the package is published from it), which also holds the reference screenshots and `verify.py`.

Its `README.md` is the full contract (sections *The contract*, *Options*, *Troubleshooting*); its `CLAUDE.md` is the short procedure and the rules. Read the README's *The contract* section before touching the page layout: the scene is painted at `z-index: -1` behind the page, so the rules about backgrounds are what make it visible at all.

## 2. Choose the mode

| mode | what the visitor sees | choose it when |
|---|---|---|
| `full` (default) | ~9 s intro: the galaxy collapses, explodes in front of the page, a black hole is born, the camera flies in, the surfer gathers and rides for as long as the page is open | a first-visit hero that should tell the whole story |
| `galaxy` | the galaxy alone, turning slowly forever; the stars part for the pointer | calm pages, secondary pages, anywhere an explosion would be too much |
| `hole` | the black hole close up from its birth: gas condenses (~3 s), the surfer gathers (~4 s) and rides | pages that should open on the product, not the prelude |

Pick it with `data-singularity-mode="galaxy"` on the anchor (static pages) or `mount({ mode: 'galaxy' })` / `<Singularity mode="galaxy">`. Seconds mean the same in every mode (one shared timeline), so `{ mode: 'hole', from: 16.5 }` skips the birth and opens with the surfer already riding, and `?at=16.5` in the URL freezes the same final frame in `full` and `hole`.

## 3. Wire it, by kind of app

**Plain `index.html`, no build step.** Nothing to install:

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/singularity.css">
  <script>
    /* Before first paint: hide the fallback drawing for the scene; a module error brings it back. */
    if ('noModule' in HTMLScriptElement.prototype) { var gl = document.documentElement.classList; gl.add('gl'); addEventListener('error', function (e) { if (/singularity(\.lib)?\.js/.test(e.filename)) gl.remove('gl') }) }
  </script>
</head>
<body>
  <div class="frame" data-singularity-clip>
    <section class="hero">
      <div class="solar-wrap" aria-hidden="true">
        <div data-singularity data-singularity-mode="hole"><img src="/img/solar-system.svg" alt="" width="380" height="380"></div>
      </div>
      <div class="hero-copy">…</div>
    </section>
  </div>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/dist/singularity.js" onerror="document.documentElement.classList.remove('gl')"></script>
</body>
```

The head snippet matters: without it the fallback drawing flashes for a frame before the scene, and a failed module leaves the hero blank. A site that must not call third parties copies `dist/singularity.js` and `singularity.css` next to the page instead of using the CDN.

**Bundled app (Vite, webpack, Astro, Vue, Svelte).** `npm i @miniiarrr/singularity three`, then, once the anchor is in the DOM:

```js
import { mount } from '@miniiarrr/singularity';      // uses the app's three; '@miniiarrr/singularity/bundle' has three inside
import '@miniiarrr/singularity/singularity.css';
const scene = mount({ mode: 'galaxy', anchor: anchorEl, clip: frameEl });
// on unmount / route change:
scene.destroy();
```

**React and Next.js.** The component renders the anchor (its children are the fallback) and mounts in `useEffect`, so it is safe in a `'use client'` component:

```jsx
import { Singularity } from '@miniiarrr/singularity/react';
import '@miniiarrr/singularity/singularity.css';

<div className="frame" ref={frameRef}>
  <Singularity mode="hole" clip={frameRef}><img src="/img/solar-system.svg" alt="" /></Singularity>
</div>
```

Keep the head snippet in every framework (in Next.js put it in the root layout's `<head>` as an inline script); it is what stops the fallback flashing.

## 4. Lay out the page so the scene shows

These are the rules the scene depends on; each has a concrete failure when broken:

- **The anchor is the square box itself**, 300–440 px wide (the example page: `min(380px, 30vw, 42vh)` desktop, `min(320px, 38vh)` tablet, `min(78vw, 300px)` phone), marked `data-singularity`, with the fallback drawing inside it. Its *width* is the scale of everything and its centre is where the hole sits; mark a stretched column around it and the hole comes out the wrong size or off-centre. Put it in the hero's right column on desktop and first in the DOM so stacked layouts show it above the copy.
- **The scene is three times the anchor box** and runs behind the hero text on purpose. Leave room; do not shrink the anchor to "make it fit".
- **The page background lives on `body` alone** (or `html` alone, never both), and nothing overlapping the hero (frame, hero, its columns) has an opaque `background`. The canvas is fixed at `z-index: -1`, above the page background and below the content; any opaque box over it hides it with a clean console. `body` must not carry `transform` or `filter` (they break fixed positioning).
- **The clip** (`data-singularity-clip`) is the element the scene must stay inside while behind the page, e.g. a page frame. Omit it if there is no frame.
- **Light backgrounds only.** `paper` may follow a different light page colour (`data-singularity-paper` or `colors.paper`); ink and red stay. Dark pages are unsupported (the shadow is an ink disc).
- **One instance per page.** The `gl` class on `<html>` and the canvas are global; call `destroy()` before mounting again.
- **Do not edit the package's `src/`, colours, timeline or scales to fit a page.** If the page cannot satisfy the contract, change the page. Changes to the animation itself happen in its repository (`miniiarrr/singularity-kit`), verified there, and published as a new version.

## 5. Verify before saying it is done

1. Open the page with `?at=16.5` (`full`, `hole`) or `?mode=galaxy&at=40` (`galaxy`) and compare with the package's `reference/final.png` / `reference/galaxy-mode.png` (in the repository): the scene centred on the anchor, the text over it, nothing outside the frame.
2. In the console: no errors and no warning starting with `singularity:`. In the DOM: `canvas.cosmos` is a child of `<body>`, and after the intro (at once in `galaxy` and `hole`) it has the `behind` class.
3. Play it normally: `full` ends behind the page after ~7 s; the other two are never in front. Scroll to the footer and back: no errors.
4. `prefers-reduced-motion: reduce`: a still frame. No WebGL (`--disable-3d-apis`): the fallback drawing shows, `gl` is off `<html>`.
5. Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL; without them screenshots are empty. The package repository's `verify.py` shows every check as Playwright code; adapt it to the new page rather than skipping checks.

## Quick diagnosis

| symptom | cause |
|---|---|
| the drawing stays, nothing animates | read the `singularity:` warning: *no anchor* (script ran before the anchor existed / attribute missing), *mode … is not one of* (typo), *WebGL context* (no WebGL2: correct fallback), a 404 on the module |
| invisible, console clean | an opaque background over the hero, or a background on both `html` and `body` |
| scene covers the text after the intro | the canvas never got `.behind`: an error mid-way through the module |
| the drawing flashes first | head snippet missing or placed after the body |
| hole wrong size or off-centre | the anchor is not the square box |
| two black holes | two mounts; `destroy()` first |
| two copies of three.js | `…/bundle` imported into an app that already has `three`; import `@miniiarrr/singularity` |
