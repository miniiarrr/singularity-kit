#!/usr/bin/env python3
"""
Smoke test for the kit, run against example/index.html: the scene mounts
behind the page and inside the frame (nothing is drawn outside it), the
explosion comes in front, reduced motion shows a still frame, the gas parts
for the pointer, the galaxy and hole modes are the full animation's own frames
(identical before the collapse / after the fly-in) and play on their own,
destroy() and a second mount() from the library bundle work, and without WebGL
the fallback drawing is shown. It also refreshes reference/*.png (galaxy,
explosion, final frame on desktop and phone, galaxy mode, the hole's birth),
so `git diff --stat reference/` shows whether the look changed.

Usage:
    python3 verify.py [--port 8766] [--no-shots]

Requirements:
    pip install playwright && python3 -m playwright install chromium
"""

import argparse
import asyncio
import base64
import os
import signal
import subprocess
import sys
import time

from playwright.async_api import async_playwright

KIT = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.join(KIT, "reference")
PAGE = "/example/"
FINAL = PAGE + "?at=16.5"  # the final frame: the surfer on the crest of the arc over the hole

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"

# Headless Chromium only has software WebGL behind these flags.
GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]

STATE = """() => {
    const c = document.querySelector('canvas.cosmos'), a = document.querySelector('[data-singularity]');
    return { gl: document.documentElement.classList.contains('gl'), canvas: !!c,
             inBody: !!c && c.parentElement === document.body,
             fixed: !!c && getComputedStyle(c).position === 'fixed',
             behind: !!c && c.classList.contains('behind'),
             anchor: a ? getComputedStyle(a).visibility : null };
}"""


def check(label, ok, detail=""):
    print(f"  {PASS if ok else FAIL}  {label}" + (f" — {detail}" if detail else ""))
    return ok


async def run(port, shots):
    base = f"http://localhost:{port}"
    ok_all = True
    if shots:
        os.makedirs(REFERENCE, exist_ok=True)

    async def open_page(browser, path, width=1440, height=900, **ctx_args):
        ctx = await browser.new_context(viewport={"width": width, "height": height}, **ctx_args)
        page = await ctx.new_page()
        errors, external = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: external.append(r.url)
                if "localhost" not in r.url and "127.0.0.1" not in r.url else None)
        await page.goto(base + path, wait_until="networkidle")
        await page.add_style_tag(content=".cursor { animation: none }")  # the blinking cursor would make the shots random
        await page.wait_for_timeout(600)
        return ctx, page, errors, external

    async def anchor_shot(page):
        """Screenshot of the anchor's box (the element itself is visibility: hidden)."""
        r = await page.evaluate("(r => ({x: r.left, y: r.top, width: r.width, height: r.height}))"
                                "(document.querySelector('[data-singularity]').getBoundingClientRect())")
        return await page.screenshot(clip=r)

    async def darkness(page, x, y, size=20):
        """Mean darkness against the bone background in a patch around (x, y)."""
        png = await page.screenshot(clip={"x": x - size / 2, "y": y - size / 2, "width": size, "height": size})
        return await page.evaluate("""async (b64) => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + b64;
            await img.decode();
            const g = new OffscreenCanvas(img.width, img.height).getContext('2d');
            g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, img.width, img.height).data;
            let s = 0;
            for (let i = 0; i < d.length; i += 4) s += Math.max(0, 227 - (d[i] + d[i + 1] + d[i + 2]) / 3);
            return s / (d.length / 4);
        }""", base64.b64encode(png).decode())

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=GL_ARGS)

        print("\n── Mount ──")
        ctx, page, errors, external = await open_page(browser, FINAL)
        s = await page.evaluate(STATE)
        ok_all &= check(
            "final frame: canvas in <body>, fixed, behind the page; anchor hidden; no errors, no external requests",
            s["gl"] and s["canvas"] and s["inBody"] and s["fixed"] and s["behind"]
            and s["anchor"] == "hidden" and not errors and not external,
            f"{s}, errors={errors}, external={external}",
        )
        # nothing is drawn outside the frame (the clip), plenty inside it next to the edge
        fx, cy = await page.evaluate("""() => {
            const f = document.querySelector('[data-singularity-clip]').getBoundingClientRect();
            const a = document.querySelector('[data-singularity]').getBoundingClientRect();
            return [f.right, a.top + a.height / 2 + 0.2 * a.width];
        }""")
        inside, outside = await darkness(page, fx - 14, cy), await darkness(page, fx + 16, cy)
        ok_all &= check("clipped to the frame: ink inside its edge, none outside",
                        inside > 3 and outside == 0, f"inside={inside:.1f}, outside={outside:.1f}")
        if shots:
            await page.screenshot(path=os.path.join(REFERENCE, "final.png"))
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?at=2.4")
        s = await page.evaluate(STATE)
        ok_all &= check("galaxy (2.4 s) behind the page", s["behind"] and not errors, f"{s}, errors={errors}")
        if shots:
            await page.screenshot(path=os.path.join(REFERENCE, "galaxy.png"))
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?at=4.8")
        s = await page.evaluate(STATE)
        ok_all &= check("explosion (4.8 s) in front of the page", s["canvas"] and not s["behind"] and not errors, f"{s}")
        if shots:
            await page.screenshot(path=os.path.join(REFERENCE, "explosion.png"))
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, FINAL, width=390, height=844)
        s = await page.evaluate(STATE)
        sw = await page.evaluate("document.documentElement.scrollWidth")
        ok_all &= check("phone (390×844): behind the page, no horizontal overflow",
                        s["behind"] and sw <= 390 and not errors, f"{s}, scrollWidth={sw}")
        if shots:
            await page.screenshot(path=os.path.join(REFERENCE, "final-phone.png"))
        await ctx.close()

        print("\n── Motion ──")
        ctx, page, errors, _ = await open_page(browser, PAGE, reduced_motion="reduce")
        s = await page.evaluate(STATE)
        shot1 = await anchor_shot(page)
        await page.wait_for_timeout(700)
        shot2 = await anchor_shot(page)
        ok_all &= check("prefers-reduced-motion: the final frame, still",
                        s["behind"] and shot1 == shot2, f"behind={s['behind']}, static={shot1 == shot2}")
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE)
        await page.wait_for_timeout(1500)
        t1 = await anchor_shot(page)
        await page.wait_for_timeout(500)
        t2 = await anchor_shot(page)
        ok_all &= check("the intro plays (frames differ)", t1 != t2 and not errors, f"errors={errors}")
        await ctx.close()

        print("\n── Pointer ──")
        ctx, page, errors, _ = await open_page(browser, FINAL)
        # a point on the dense disc left of the shadow, clear of the surfer (he rides the arc above it)
        x, y = await page.evaluate("""() => {
            const r = document.querySelector('[data-singularity]').getBoundingClientRect();
            return [r.left + r.width / 2 - 0.45 * r.width, r.top + r.height / 2 + 0.14 * r.width];
        }""")
        before = await darkness(page, x, y, 16)
        await page.mouse.move(x - 60, y - 40)
        await page.mouse.move(x, y, steps=6)
        await page.wait_for_timeout(400)
        after = await darkness(page, x, y, 16)
        ok_all &= check("the gas backs away from the pointer", before > 15 and after < before * 0.5,
                        f"ink under the pointer {before:.0f} → {after:.0f}")
        await ctx.close()

        print("\n── Modes ──")
        # galaxy mode is the opening of the full animation, extended: the same frames up to the collapse
        ctx, page, errors, _ = await open_page(browser, PAGE + "?at=1")
        opening = await anchor_shot(page)
        await ctx.close()
        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=galaxy&at=1")
        s = await page.evaluate(STATE)
        same = await anchor_shot(page) == opening
        ok_all &= check("galaxy mode at 1 s: the full animation's own frame, behind the page",
                        s["behind"] and same and not errors, f"{s}, identical={same}, errors={errors}")
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=galaxy&at=40")
        s = await page.evaluate(STATE)
        # a point on the disc, below left of the core (the galaxy spans three boxes)
        x, y = await page.evaluate("""() => {
            const r = document.querySelector('[data-singularity]').getBoundingClientRect();
            return [r.left + r.width / 2 - 0.55 * r.width, r.top + r.height / 2 + 0.3 * r.width];
        }""")
        before = await darkness(page, x, y, 16)
        await page.mouse.move(x - 60, y - 40)
        await page.mouse.move(x, y, steps=6)
        await page.wait_for_timeout(400)
        after = await darkness(page, x, y, 16)
        ok_all &= check("galaxy mode at 40 s: still there, behind the page; the stars back away from the pointer",
                        s["behind"] and not errors and before > 2 and after < before * 0.6,
                        f"{s}, ink under the pointer {before:.1f} → {after:.1f}")
        if shots:
            await page.mouse.move(0, 0)
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(REFERENCE, "galaxy-mode.png"))
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=galaxy")
        await page.wait_for_timeout(1000)
        g1 = await anchor_shot(page)
        await page.wait_for_timeout(500)
        g2 = await anchor_shot(page)
        s = await page.evaluate(STATE)
        ok_all &= check("galaxy mode plays (frames differ), never in front", g1 != g2 and s["behind"] and not errors,
                        f"{s}, errors={errors}")
        await ctx.close()

        # hole mode starts at the birth with the camera already arrived: the same frames from the fly-in's end on
        ctx, page, errors, _ = await open_page(browser, FINAL)
        final = await anchor_shot(page)
        await ctx.close()
        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=hole&at=16.5")
        s = await page.evaluate(STATE)
        same = await anchor_shot(page) == final
        ok_all &= check("hole mode at 16.5 s: the full animation's final frame",
                        s["behind"] and same and not errors, f"{s}, identical={same}, errors={errors}")
        await ctx.close()

        disc = """() => {
            const r = document.querySelector('[data-singularity]').getBoundingClientRect();
            return [r.left + r.width / 2 - 0.45 * r.width, r.top + r.height / 2 + 0.14 * r.width];
        }"""
        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=hole&at=5.4")
        s = await page.evaluate(STATE)
        x, y = await page.evaluate(disc)
        early = await darkness(page, x, y, 16)
        await ctx.close()
        ctx, page, errors2, _ = await open_page(browser, PAGE + "?mode=hole&at=7.4")
        x, y = await page.evaluate(disc)
        later = await darkness(page, x, y, 16)
        ok_all &= check("hole mode: the birth close-up, behind the page (the gas condenses over the first seconds)",
                        s["behind"] and not errors and not errors2 and later > 15 and early < later * 0.5,
                        f"{s}, ink on the disc {early:.0f} → {later:.0f}")
        await ctx.close()
        if shots:
            ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=hole&at=6.4")
            await page.screenshot(path=os.path.join(REFERENCE, "hole-birth.png"))
            await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=hole")
        await page.wait_for_timeout(1000)
        h1 = await anchor_shot(page)
        await page.wait_for_timeout(500)
        h2 = await anchor_shot(page)
        s = await page.evaluate(STATE)
        ok_all &= check("hole mode plays (frames differ), never in front", h1 != h2 and s["behind"] and not errors,
                        f"{s}, errors={errors}")
        await ctx.close()

        ctx, page, errors, _ = await open_page(browser, PAGE + "?mode=hole", reduced_motion="reduce")
        s = await page.evaluate(STATE)
        r1 = await anchor_shot(page)
        await page.wait_for_timeout(700)
        r2 = await anchor_shot(page)
        ok_all &= check("hole mode under prefers-reduced-motion: the final frame, still",
                        s["behind"] and r1 == r2 == final, f"behind={s['behind']}, static={r1 == r2}, final={r1 == final}")
        await ctx.close()

        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        warnings = []
        page.on("console", lambda m: warnings.append(m.text) if m.type == "warning" and m.text.startswith("singularity:") else None)
        await page.goto(base + PAGE + "?mode=nope", wait_until="networkidle")
        await page.wait_for_timeout(600)
        s = await page.evaluate(STATE)
        ok_all &= check("unknown mode: no canvas, `gl` off, the drawing shown, one `singularity:` warning",
                        not s["gl"] and not s["canvas"] and s["anchor"] == "visible" and len(warnings) == 1,
                        f"{s}, warnings={warnings}")
        await ctx.close()

        print("\n── Lifecycle ──")
        ctx, page, errors, _ = await open_page(browser, FINAL)
        await page.evaluate("window.singularity.destroy()")
        s = await page.evaluate(STATE)
        ok_all &= check("destroy(): canvas removed, `gl` off, fallback visible",
                        not s["canvas"] and not s["gl"] and s["anchor"] == "visible" and not errors, f"{s}")
        await page.evaluate("() => import('/dist/singularity.lib.js').then(m => { window.again = m.mount(); })")
        await page.wait_for_timeout(1000)
        s = await page.evaluate(STATE)
        ok_all &= check("mount() from the library bundle: canvas back, behind the page",
                        s["canvas"] and s["gl"] and s["behind"] and not errors, f"{s}, errors={errors}")
        await ctx.close()
        await browser.close()

        print("\n── Fallback ──")
        browser = await p.chromium.launch(args=["--disable-3d-apis"])
        ctx, page, errors, _ = await open_page(browser, PAGE)
        s = await page.evaluate(STATE)
        ok_all &= check("without WebGL: no canvas, `gl` off, the drawing shown",
                        not s["gl"] and not s["canvas"] and s["anchor"] == "visible", f"{s}")
        await browser.close()

    print()
    print(f"{PASS} All checks passed." if ok_all else f"{FAIL} Some checks failed.")
    return ok_all


def start_server(port):
    proc = subprocess.Popen(["python3", "-m", "http.server", str(port), "--directory", KIT],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    return proc


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--no-shots", action="store_true", help="do not refresh reference/*.png")
    args = ap.parse_args()
    srv = start_server(args.port)
    try:
        ok = asyncio.run(run(args.port, not args.no_shots))
    finally:
        srv.send_signal(signal.SIGTERM)
    sys.exit(0 if ok else 1)
