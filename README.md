# @miniiarrr/singularity

The rakhimkulov&co landing animation, as an npm package, so it looks and behaves on any site exactly as it does on rakhimkulov.co. A galaxy of ink dots spirals into its centre, the centre blows up and debris flies past the viewer, a tiny black hole forms where the galaxy was, the camera flies in, and a surfer made of the same dots gathers out of the gas and rides the disc all the way round the hole. The gas parts for the pointer, and so does he: the company, managing uncertainty.

It plays in three **modes**, chosen by one parameter:

| mode | what plays |
|---|---|
| `full` | the whole story above, about 9 s of intro, then the surfer rides for as long as the page is open (default) |
| `galaxy` | the galaxy alone: its arms and the red core turning slowly, forever; the stars back away from the pointer |
| `hole` | the black hole alone, seen close up from its birth: the gas condenses around it (~3 s), the surfer gathers out of the gas (~4 s) and rides |

This folder, in the website repository, is the reference implementation: rakhimkulov.co builds from it and the package is published from it. Integrating it with an AI coding assistant? `SKILL.md` is a ready-made skill for Claude Code (see *For AI coding assistants*); `CLAUDE.md` is the short procedure and the rules.

```
singularity-kit/  (= the package)
├── src/                      the source: six ES modules on three.js (the main entry; imports `three` bare)
├── dist/singularity.js       prebuilt, auto-mounting, three.js inside: one <script type="module"> and it runs
├── dist/singularity.lib.js   the same as a library: import { mount } (three.js inside)
├── react/                    <Singularity mode="…"> for React and Next.js
├── index.d.ts                TypeScript types
├── singularity.css           the five CSS rules the page needs
├── SKILL.md                  a Claude Code skill: how to place, wire and verify it (any mode, any framework)
├── example/index.html        a minimal page in the brand's frame that runs it (repository only)
├── example/solar-system.svg  the drawing shown without WebGL (and its CSS motion, solar-system.css)
├── reference/*.png           what it must look like (repository only)
├── verify.py                 Playwright smoke test of the example; refreshes reference/ (repository only)
├── package.json              exports below; peer dependency three ≥ 0.160 (react optional)
├── LICENSE                   all rights reserved; three.js is MIT
└── CLAUDE.md                 the integration procedure and the rules, for an AI assistant
```

## Install

```bash
npm install @miniiarrr/singularity three      # bundled apps (Vite, webpack, Next, Astro…)
```

| import | what it is | when |
|---|---|---|
| `@miniiarrr/singularity` | the source; `three` comes from your app (peer dependency) | bundled apps: one copy of three.js |
| `@miniiarrr/singularity/bundle` | `dist/singularity.lib.js`, three.js inside (~560 KB raw, ~120 KB brotli) | no bundler, or you don't use three elsewhere |
| `@miniiarrr/singularity/auto` | `dist/singularity.js`: mounts itself when the DOM is ready | script tags |
| `@miniiarrr/singularity/react` | `<Singularity>` | React, Next.js |
| `@miniiarrr/singularity/singularity.css` | the stylesheet | always, once |

Plain `index.html` pages don't install anything: load the auto-mounting bundle from a CDN, or copy `dist/singularity.js` and `singularity.css` next to the page.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/singularity.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/dist/singularity.js"></script>
```

The bundles contain three.js: about 560 KB raw, 122 KB brotli / 146 KB gzip, loaded as a deferred module, off the critical path. rakhimkulov.co serves its copy same-origin.

## For AI coding assistants

`SKILL.md` teaches Claude Code the whole integration: choosing a mode, the anchor and clip, the wiring per framework, the background rules and the verification steps. Install it in the project that uses the package, so Claude picks it up whenever the animation comes up:

```bash
mkdir -p .claude/skills/singularity
cp node_modules/@miniiarrr/singularity/SKILL.md .claude/skills/singularity/SKILL.md
```

Then ask, for example, "add the singularity in hole mode to the hero of src/pages/index.astro". The skill points Claude at this README and `CLAUDE.md` inside the package for the details. Other assistants: paste `CLAUDE.md` (the rules) into their context and let them read this file.

## Quick start: a static page

1. Put the anchor in the hero: a square box where the black hole (or the galaxy) should sit, marked `data-singularity`. Its content, if any, is what visitors without WebGL see. Add `data-singularity-mode="galaxy"` or `"hole"` to pick a mode (`full` needs no attribute).
2. Mark the page frame `data-singularity-clip` (optional; see *The clip*).
3. Add the stylesheet and the head snippet to `<head>`, and the script tag at the end of `<body>`.

```html
<head>
  …
  <link rel="stylesheet" href="/css/singularity.css">
  <link rel="modulepreload" href="/js/singularity.js">
  <script>
    /* Before first paint: hide the fallback drawing for the scene; a module error brings it back. */
    if ('noModule' in HTMLScriptElement.prototype) { var gl = document.documentElement.classList; gl.add('gl'); addEventListener('error', function (e) { if (/singularity(\.lib)?\.js/.test(e.filename)) gl.remove('gl') }) }
  </script>
</head>
<body>
  <div class="frame" data-singularity-clip>
    …
    <section class="hero">
      <div class="solar-wrap" aria-hidden="true">
        <div data-singularity data-singularity-mode="hole"><img src="/img/solar-system.svg" alt="" width="380" height="380"></div>
      </div>
      <div class="hero-copy">…</div>
    </section>
    …
  </div>
  <script type="module" src="/js/singularity.js" onerror="document.documentElement.classList.remove('gl')"></script>
</body>
```

`example/index.html` is exactly this (in `full` mode), with the brand's frame, header rule and hero grid around it. Serve the kit folder and open it:

```bash
cd singularity-kit
python3 -m http.server 8000        # then http://localhost:8000/example/
```

Add `?mode=galaxy` or `?mode=hole` to see the other modes, `?at=16.5` to freeze the final frame, `?at=4.8` for the explosion, `?from=10` to skip the intro.

## Single-page apps and bundlers

```js
import { mount } from '@miniiarrr/singularity';          // or '@miniiarrr/singularity/bundle'
import '@miniiarrr/singularity/singularity.css';

const scene = mount({ mode: 'hole', anchor: anchorEl, clip: frameEl });   // after the anchor is in the DOM
// on route change / unmount:
scene.destroy();
```

React (and Next.js: the component only touches the DOM inside `useEffect`, so it is safe in a client component; the module never touches `document` at import time):

```jsx
import { Singularity } from '@miniiarrr/singularity/react';
import '@miniiarrr/singularity/singularity.css';

<div className="frame" ref={frameRef}>
  …
  <div className="solar-wrap" aria-hidden="true">
    <Singularity mode="galaxy" clip={frameRef}>
      <img src="/img/solar-system.svg" alt="" width="380" height="380" />   {/* the fallback */}
    </Singularity>
  </div>
  …
</div>
```

`<Singularity>` renders the anchor `<div data-singularity>` (extra props go on it), mounts the scene when it appears and destroys it when it unmounts or `mode`, `clip`, `colors`, `from` or `at` change. `clip` takes an element, a ref or a selector; leave it out to use the element marked `data-singularity-clip`, pass `null` for none.

Vue, Svelte, Astro: call `mount()` in the mounted hook and `destroy()` on unmount, or use the static-page setup with a plain `<script type="module">`. Keep the head snippet in every case so the fallback does not flash.

`destroy()` stops the loop, removes every listener and observer, frees the GPU buffers and the context, removes the canvas and takes `gl` off `<html>` (the fallback shows again).

### Options

| option | default | |
|---|---|---|
| `mode` | `data-singularity-mode` on the anchor, then `'full'` | `'full'`, `'galaxy'` or `'hole'` |
| `anchor` | `'[data-singularity]'` | element or selector; required to exist |
| `clip` | `'[data-singularity-clip]'` | element, selector, or `null` for none |
| `colors.ink` | `#17160F` | the dots (or `data-singularity-ink` on the anchor) |
| `colors.red` | `#C63A1C` | the accents: hot gas, the board, the flash (`data-singularity-red`) |
| `colors.paper` | `#EAE6DA` | the page background; used where the surfer crosses the shadow (`data-singularity-paper`) |
| `from` | the mode's start | scene time to start playing from, seconds (below) |
| `at` | — | scene time to freeze at, seconds; the pointer still works |

Returns `{ canvas, mode, destroy() }`; on failure `canvas` and `mode` are `null`, the fallback is shown and a warning starting with `singularity:` is logged. The auto-mounting bundle keeps its handle on `window.singularity`.

**Scene time.** Every mode is a slice of one timeline, so seconds mean the same everywhere: `full` runs it from 0, `hole` starts it at 4.9 s (the birth) with the camera already arrived, `galaxy` runs its opening second forever. `from` and `at` (and the URL parameters `?from=`, `?at=`, which override them, as does `?mode=`) are in that time, clamped to the mode's start. So `{ mode: 'hole', from: 16.5 }` skips the birth and opens with the surfer riding, and `?at=16.5` is the same frame in `full` and `hole`.

## The contract: what the page provides

**The anchor** (`data-singularity`, or the `anchor` option). The scene is projected so its centre lands on the centre of this element, and every size on screen scales with its *width*: the galaxy and the black hole are three times as big as the box. Make it square and between about 300 and 440 px wide (the site uses `min(380px, 30vw, 42vh)` on desktop, `min(320px, 38vh)` on tablets, `min(78vw, 300px)` on phones); dot sizes are tuned for 380 px and the dot count thins on smaller boxes to keep the stipple density, but does not grow on bigger ones. The rect is re-read every frame, so it can be laid out responsively and scrolls with the page. On rakhimkulov.co it is the right-hand column of the hero on desktop and sits above the copy on stacked layouts. Its content is the fallback: hidden by `visibility: hidden` while the scene runs (CSS animations inside stopped), shown when WebGL is missing or anything fails.

**The clip** (`data-singularity-clip`, or the `clip` option). While the scene is behind the page it is drawn only inside this element's padding box, i.e. inside its border. On rakhimkulov.co that is the 1 px ink frame around the whole page, so the galaxy never spills into the bone margin outside the frame. Without a clip the scene uses the whole viewport.

**The background.** The canvas covers the viewport, fixed, with `z-index: -1`: it is painted above the page background and below the page content. That works only if the page background is set on `body` alone (or `html` alone), never on both, and nothing that overlaps the hero carries an opaque background of its own: no `background` on the frame, the hero or its columns. Text, rules and borders over the scene are fine; the point is that the hole runs behind them. `body` must not have `transform` or `filter` (they break fixed positioning).

**The `gl` class on `<html>`.** Present while the scene runs; it hides the anchor's content and shows the canvas. The head snippet adds it before first paint so the fallback never flashes, and removes it on a script error in the module. `mount()` adds it too, and removes it when it cannot start (no anchor, no WebGL2, an unknown mode), when the WebGL context is lost, and in `destroy()`. `singularity.css` ties the two together; don't rename the class or the attributes without updating that file.

**Layout order.** The canvas is appended to `<body>`, so the anchor may sit inside any grid, flex column or transformed element. In `full` mode the explosion (4.15 s to 7.2 s) plays *in front* of the page at `z-index: 10`, with pointer events off, so nothing is blocked; `galaxy` and `hole` are always behind the page.

**One instance per page.** The `gl` class and the canvas are global.

## What happens on the page

`full`:

| time | |
|---|---|
| 0 – 1 s | the galaxy fades in behind the page, three times the anchor box, turning slowly |
| 1 – 4 s | everything spirals into the centre, faster and faster; the red core grows and spins up |
| 4.15 s | the canvas comes in front of the page |
| 4.3 s | the core blows up; the page shakes; debris streaks past the viewer and towards the middle of the page |
| 4.9 s | a tiny black hole forms where the core was; gas condenses around it |
| 5.0 – 8.6 s | the camera flies in until the hole and its disc are three times the box, optically centred on the anchor |
| 7.2 s | debris gone: the canvas goes back behind the page |
| 8.9 s | the surfer gathers out of the gas and rides the disc round the hole, carving in and out, banking into turns |
| after | the gas keeps swirling for as long as the page is open (the motion repeats exactly every 600 s); the camera sways a little |

`galaxy`: the first second of `full`, then the galaxy simply keeps turning (each radius at its own speed, so the arms wind slowly) and the camera sways; the collapse never comes. `hole`: scene time starts at 4.9 s with the camera where `full` arrives at 8.6 s, so the shadow grows and the gas condenses out of a wide, slow swirl in front of the viewer, the surfer gathers 4 s in, and from 8.6 s on the frames are `full`'s own.

- **Scroll.** The scene follows the anchor. Once the intro is over (at once in `galaxy` and `hole`) and the anchor is scrolled about 1.5 boxes out of view, drawing stops (nothing runs while the reader is further down); it resumes when it comes back.
- **Pointer.** The gas (in `galaxy` mode, the stars) backs away from the pointer sideways and closes again behind it, leaving a short fading wake. When the pointer comes within about 1.3 of his heights of the surfer he crouches, his dots pull tight, and he carves hard across the flow or airs ahead, whichever takes him farther from it. Touch works the same while a finger is down.
- **Reduced motion.** With `prefers-reduced-motion: reduce` a still frame is shown with no pointer response: 16.5 s (the surfer on the crest of the arc over the hole) in `full` and `hole`, 1 s in `galaxy`. Switching the setting while the page is open takes effect at once.
- **No WebGL2**, a failed script, a lost context: `gl` comes off `<html>`, the canvas is removed, the anchor's content shows. The fallback on rakhimkulov.co is the animated solar-system drawing (`example/solar-system.svg`; inline it and include `example/solar-system.css` for the CSS motion, or use an `<img>` and it stays still).
- **URL parameters.** `?mode=<mode>` picks the mode, `?at=<seconds>` freezes the timeline at that moment (the gas still parts for the pointer), `?from=<seconds>` plays from there. They are read from the page URL and win over the options, so they work on any page the scene is on; use `?at=16.5` for screenshots and visual comparison with `reference/final.png`.
- **Every frame is a closed-form function of time**, evaluated on the GPU: no simulation state, so any moment can be drawn directly and a dropped frame changes nothing. Each mode builds only the layers it draws.
- **Cost.** About 50 000 dots at full size in `full` (fewer on small boxes; `galaxy` draws about 26 000, `hole` about 25 000), one draw call per layer, no depth buffer, device pixel ratio capped at 2. Shaders are compiled up front, asynchronously where the GPU allows, before the first frame is shown.

## Identity: what stays the same

The animation *is* the identity; the page supplies only where it sits and which of the three modes plays. Keep:

- the colours: ink `#17160F` dots and red `#C63A1C` accents on bone `#EAE6DA`. `paper` may follow a different light page background; the ink and the red do not change. Dark backgrounds are untested and would need shader work (the shadow is an ink disc).
- the timeline `T` and the mode table `MODES`, the scales `GALAXY_ZOOM` / `HOLE_ZOOM` (3), the reference box `REF_BOX` (380 px), the shutter, the pointer reach and depth, the surfer's size, track and reactions;
- the stipple: every particle is a round dot smeared by a 1/50 s shutter; the same seeds, so every visitor sees the same galaxy;
- the placement: in the hero, right column on desktop, above the copy when stacked, behind the page text, inside the page frame; the page background on `body`.

What may vary per site: the mode, the anchor's exact size within the range above, the clip element, the fallback content, `paper`, `from`.

If the animation itself needs to change, change it in the website repository's `singularity-kit/` (the source of truth), rebuild, run the verification there, publish a new version, and update the dependency on the other sites. Don't fork the source per site.

## Building from source and publishing

```bash
cd singularity-kit
npm install          # three + esbuild, build-time only
npm run build        # → dist/singularity.js (auto-mounting) and dist/singularity.lib.js (library)
```

Both are ES modules, ES2020, minified. `src/auto.js` is the auto-mounting entry (calls `mount()` once the DOM is parsed, keeps the handle on `window.singularity`); `src/main.js` exports `mount`, `COLORS`, `MODES` and `T`. Bundling the source yourself: use `src/main.js` as the entry and let your bundler resolve `three`.

Publishing (needs `npm login` as `miniiarrr`; `prepublishOnly` rebuilds `dist/`):

```bash
python3 verify.py                  # green, and `git diff --stat reference/` shows only what you meant to change
npm version patch|minor|major      # bumps package.json; commit it
npm publish                        # public, scoped; `npm pack --dry-run` shows what ships
```

## Verifying

```bash
pip install playwright && python3 -m playwright install chromium   # once
python3 verify.py
```

Serves the kit folder and drives `example/index.html` in headless Chromium: the canvas is in `<body>`, fixed and behind the page at the final frame, with nothing drawn outside the frame; the galaxy is behind the page and the explosion in front; the phone layout has no horizontal overflow; reduced motion shows a still frame and the intro plays otherwise; the gas parts for the pointer; `galaxy` mode at 1 s and `hole` mode at 16.5 s are pixel-identical to `full` at those times, both play on their own, never in front, the stars part for the pointer, the gas condenses at the hole's birth, an unknown mode falls back; `destroy()` removes everything and `mount()` from the library bundle brings it back; without WebGL the drawing is shown. It also rewrites `reference/*.png`, so after a change `git diff --stat reference/` tells you whether the look moved. Pass `--no-shots` to leave them alone.

Headless Chromium only has software WebGL behind `--use-angle=swiftshader --enable-unsafe-swiftshader`; any screenshot tooling of your own needs the same flags.

## Troubleshooting

- **The drawing stays and nothing animates.** Look for a console warning starting with `singularity:`. *No anchor*: the script ran before the anchor existed, or the attribute is missing. *mode … is not one of*: a typo in `mode` or `data-singularity-mode`. *Error creating WebGL context*: no WebGL2 (the fallback is correct behaviour). A 404 on the module: the `src` path.
- **The scene is invisible but the console is clean.** Something over the hero has an opaque background, or both `html` and `body` have one. Only `body` (or only `html`) carries the page background.
- **The scene covers the text after the intro.** The canvas never got `.behind`: an error mid-way through the module. Check the console.
- **The drawing flashes before the scene appears.** The head snippet is missing or runs after the body.
- **The hole is the wrong size or off-centre.** The anchor is not the square box: e.g. it is the stretched column around it. Mark the box itself.
- **Two copies of three.js in the bundle.** You imported `…/bundle` in an app that already has `three`; import `@miniiarrr/singularity` instead.
- **Headless screenshots are empty.** Chromium flags, see *Verifying*.
- **Two black holes.** Two mounts on one page; call `destroy()` before mounting again.

## How the source is organised

- `timeline.js`: every time (`T`), the mode table (`MODES`), the infall law, the camera path per mode, the scales; the CPU-side mirror of the shader physics.
- `particles.js`: what exists: the galaxy (arms, disc, bulge, halo, red knots, clusters, planets, small black holes, fly-by swarms, all seeded), the core, the gas disc, the shadow quad.
- `shaders.js`: every position as a closed-form function of time, on the GPU; the capsule dot, the sideways push field, the lens (Beloborodov's approximation), the shadow with its photon ring; `STEADY`, the galaxy that never collapses.
- `surfer.js`: the surfer: 14 ellipsoid body parts posed by a rig (leg IK, lean, twist, balancing arms), his riding as a closed function of time, his reactions, his shader.
- `main.js`: `mount()`: the mode, the renderer, the canvas, the layers the mode has, the projection onto the anchor, the pointer wake, the scissor, the loop, `destroy()`.
- `auto.js`: the auto-mounting entry. `react/index.js`: the React component. `index.d.ts`: the types. `SKILL.md`: the Claude Code skill; `CLAUDE.md`: the integration notes for any assistant.

three.js is MIT licensed (its notice is in `LICENSE` and at the end of the bundles). The animation itself is © rakhimkulov&co, all rights reserved: see `LICENSE`. The rakhimkulov&co brand fonts are licensed separately and are not part of this package; the example uses a system serif.
