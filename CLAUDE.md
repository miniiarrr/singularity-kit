# singularity-kit: integration notes for Claude

This repository is the rakhimkulov&co landing animation (a galaxy collapses into a black hole; a surfer rides the disc round it), published as the npm package **`@miniiarrr/singularity`** so sites can run it **unchanged**. It is the reference implementation and the source of truth: rakhimkulov.co installs the package like any other site. `README.md` has the full contract; this file is the procedure and the rules.

There are three animations, chosen by the `mode` option (or `data-singularity-mode` on the anchor): `full` (the whole story: collapse, explosion, black hole, surfer), `galaxy` (the galaxy alone, turning forever, the stars parting for the pointer) and `hole` (the black hole from its birth, the gas condensing, the surfer gathering and riding). Every mode is a slice of the one timeline (`MODES` in `src/timeline.js`), so `?at=`/`?from=`/`from`/`at` mean the same scene time in all of them.

## Adding it to a site

1. **Ship the files.** `npm i @miniiarrr/singularity three` for bundled apps (`import { mount } from '@miniiarrr/singularity'`; `…/bundle` has three.js inside; `…/react` is the React component); static pages load `dist/singularity.js` from a CDN (`https://cdn.jsdelivr.net/npm/@miniiarrr/singularity@1/dist/singularity.js`) or a copy, plus `singularity.css`. Optionally `example/solar-system.svg` (+ `example/solar-system.css` if inlined) as the fallback drawing. rakhimkulov.co itself serves everything same-origin.
2. **Mark the anchor.** A square box in the hero, 300–440 px wide, `data-singularity`, right column on desktop, above the copy when stacked (put it first in the DOM). Put the fallback content inside it. Its width is the scale of everything; the black hole (or the galaxy) is drawn three times its size, centred on it. Add `data-singularity-mode="galaxy"` or `"hole"` for those modes.
3. **Mark the clip.** `data-singularity-clip` on the element the scene must stay inside while behind the page (the page frame). Omit it if there is no frame.
4. **Wire the page.** `<link rel="stylesheet">` to `singularity.css`, the head snippet from the README (adds `gl` to `<html>` before first paint), and at the end of `<body>` `<script type="module" src=".../singularity.js" onerror="document.documentElement.classList.remove('gl')">`. SPAs: `mount({ mode, anchor, clip })` after the anchor exists and `destroy()` on unmount; React: `<Singularity mode="…">fallback</Singularity>` from `@miniiarrr/singularity/react`.
5. **Check the background rules.** The page background on `body` only (or `html` only); no opaque background on anything that overlaps the hero; no `transform`/`filter` on `body`. Otherwise the scene, which is painted at `z-index: -1`, is hidden.
6. **Verify.** Open the page with `?at=16.5` and compare with `reference/final.png` (`full` and `hole`) or `?at=40` with `reference/galaxy-mode.png` (`galaxy`): the scene centred on the anchor, the text over it, nothing outside the frame. Then, for `full`, `?at=4.8` (explosion in front) and a normal load (the intro plays, ends behind the page); for every mode reduced motion (a still frame) and a WebGL-less run if you can (`--disable-3d-apis`: the drawing shows). `verify.py` does all this for `example/`; adapt its checks to the new page rather than skipping them. Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader`.

## Rules

- **Do not edit `src/` to fit a site.** Everything site-specific goes through the page (the anchor, the clip, the data attributes) or `mount()` options: `mode`, `from`, `at`, `colors`. If the page cannot satisfy the contract, change the page.
- **The identity is fixed:** colours (ink `#17160F`, red `#C63A1C`; `paper` may follow a different light background), the timeline `T`, `GALAXY_ZOOM`/`HOLE_ZOOM`, `REF_BOX`, dot sizes, seeds, the shaders, the surfer, pointer reach and depth. Do not "tune" them for a page. Dark backgrounds are not supported. The three modes are the only choice of animation; do not invent a fourth per site.
- **One instance per page.** The `gl` class and the canvas are global.
- **Keep the head snippet.** Without it the fallback flashes before the scene, and a module error leaves the page blank in the hero.
- **The fonts are not in the kit.** The brand fonts are licensed separately; the example uses a system serif on purpose.
- **Changes to the animation itself** happen here, with `npm run build`, `verify.py`, and a look at `git diff --stat reference/`; then a new version is published (below) and the sites bump their dependency. Never fork per site.
- **Generated files:** `dist/` and `reference/` are outputs of `npm run build` and `verify.py`. Don't hand-edit them.
- **What ships** is the `files` list in `package.json` (`src/`, `dist/`, `react/`, `index.d.ts`, `singularity.css`, `SKILL.md`, the docs and `LICENSE`); `example/`, `reference/` and `verify.py` stay in the repository. `SKILL.md` is the Claude Code skill for integrating the package (consumers copy it to `.claude/skills/singularity/`); keep it in step with this file and the README when the contract or the options change. The source entry imports `three` bare (peer dependency); `dist/` bundles three.js `0.186.1`.

## Publishing

```bash
cd singularity-kit
npm install                          # once: esbuild + three (build-time only)
python3 verify.py                    # green, and `git diff --stat reference/` as expected
npm version patch|minor|major        # bumps package.json, commits and tags (needs a clean tree)
npm publish                          # prepublishOnly rebuilds dist/; public, scoped
git push --follow-tags
```

`npm login` once, as the `miniiarrr` account. `npm pack --dry-run` shows what would ship.

## Before saying it is done

- No console errors or `singularity:` warnings on load.
- `?at=16.5` matches `reference/final.png` in composition (`full`, `hole`); `?mode=galaxy&at=40` matches `reference/galaxy-mode.png`; the phone layout matches `reference/final-phone.png`.
- `full`: the intro ends behind the page (`canvas.cosmos.behind` present after ~7.2 s); `galaxy` and `hole` are never in front. Scrolling to the footer and back raises no errors.
- Reduced motion: a still frame. No WebGL: the drawing. Nothing is drawn outside the clip element.
- On rakhimkulov.co, no requests leave the origin.
