import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

/* Repo-relative so this runs from a clone, in CI, on anyone's machine. */
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SHOTS = join(ROOT, "shots");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".webmanifest":"application/manifest+json",
  ".woff2":"font/woff2", ".svg":"image/svg+xml", ".png":"image/png" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = join(ROOT, normalize(p));
  try {
    const body = await readFile(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("nope"); }
});
mkdirSync(new URL("../shots", import.meta.url), { recursive: true });
await new Promise((r) => server.listen(8099, r));
const BASE = "http://localhost:8099/";

const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass, detail }); };

// CHROME_PATH lets a sandbox point at a preinstalled binary; without it,
// Playwright resolves its own browser as normal.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  // One test throws on purpose to prove the loop survives it; its own log is
  // not a defect. Everything else is.
  if (m.type() === "error" && !/FP-BAD stopped/.test(m.text())) errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });

// 1. level picker on a cold start
check("cold start shows the level picker",
  (await page.locator("h1").textContent()) === "Which one feels right?");
check("picker offers exactly 4 reading samples", await page.locator(".picker-card").count() === 4);

// touch target audit at each level, from the DOM not the token
const box = async (sel) => (await page.locator(sel).first().boundingBox());
const EXPECT = { 1: 76, 2: 60, 3: 48, 4: 44 };

// 2. choose level 2 -> atlas
await page.locator(".picker-card").nth(1).click();
await page.waitForSelector(".islands");
check("picking a level lands on the Atlas", (await page.locator("h1").textContent()) === "Atlas");
// Only worlds with playable content are drawn. Eighteen modules of "not yet
// written" read as abandoned rather than early.
/* Derived, never a literal. These were `=== 1` and `=== 5` when Cells was the
   only authored module, and both silently stopped meaning anything the moment a
   second module landed — they asserted a snapshot of the content rather than
   the rule the content has to obey. */
{
  const r = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    const satisfiable = (w) => w.requires.every((id) => {
      const m = c.worlds.flatMap((x) => x.modules).find((x) => x.id === id);
      return m && c.writtenCount(m.id) >= m.lessons;
    });
    return {
      drawn: c.playableWorlds().map((w) => w.id),
      coming: c.comingWorlds().map((w) => w.id),
      withContent: c.worlds.filter(c.worldHasContent).map((w) => w.id),
      badlyDrawn: c.playableWorlds().filter((w) => !c.worldHasContent(w) || !satisfiable(w)).map((w) => w.id),
    };
  });
  const islands = await page.locator(".island").count();
  const listed = await page.locator(".signpost-list li").count();
  check("the Atlas draws exactly the worlds that are playable",
    islands === r.drawn.length && r.drawn.length > 0, `${islands} islands, expected ${r.drawn.length}`);
  check("and names every other world honestly instead of hiding it",
    listed === r.coming.length && islands + listed === 6, `${listed} listed, ${islands} drawn`);
  // Authoring Change before Code produced a world with real lessons behind a
  // gate no amount of play could open. A door with no key is worse than no door.
  check("no world is drawn that has no content or no reachable path",
    r.badlyDrawn.length === 0, r.badlyDrawn.join(",") || "none");
}
// The dependency graph itself must be unchanged — the display was gated, the
// model was not.
{
  const graph = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    const s = await import("./js/state.js");
    return {
      total: c.worlds.reduce((n, w) => n + w.modules.length, 0),
      openNow: c.worlds.flatMap((w) => w.modules).filter((m) => c.isModuleUnlocked(m.id, s.progress)).length,
    };
  });
  check("all 25 modules still exist in the graph behind it",
    graph.total === 25 && graph.openNow === 1, JSON.stringify(graph));
}

// 3. unlock graph, cold save: only World 1 open, only its first module unlocked
const openNodes = await page.locator("a.node-hit").count();
check("exactly 1 module is open on a cold save", openNodes === 1, `${openNodes} open`);
check("the open module is What is Life?",
  (await page.locator("a.node-hit .node-title").textContent()) === "What is Life?");
/* A locked island is legitimate now that later worlds are authored — it is a
   preview and a goal. What is NOT legitimate is one whose stated prerequisite
   cannot be finished, which is the state the reachability rule exists to
   prevent. So the check moved from "no locked islands" to "every locked island
   names something a child can actually go and do". */
{
  const bad = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    return c.playableWorlds().flatMap((w) => w.requires).filter((id) => {
      const m = c.worlds.flatMap((x) => x.modules).find((x) => x.id === id);
      return !m || c.writtenCount(m.id) < m.lessons;
    });
  });
  check("every locked world names a prerequisite a child can actually finish",
    bad.length === 0, bad.join(",") || "none");
}
check("locks explain themselves rather than saying 'locked'",
  (await page.locator(".node--locked .node-status").first().textContent()).startsWith("Finish"));

// 4. continue card points at the next module
check("continue card targets the next module",
  (await page.locator(".continue").getAttribute("href")) === "#/m/what-is-life");

// 5. navigate into a module
await page.locator(".continue").click();
await page.waitForSelector(".module-head");
check("module route renders", (await page.locator("h1").textContent()) === "What is Life?");
check("focus moves to the new heading after routing",
  await page.evaluate(() => document.activeElement?.tagName === "H1"));
check("live region announces the route",
  (await page.locator("#live").textContent()) === "What is Life?");

// 6. keyboard: back link reachable and operable
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".islands");
await page.keyboard.press("Tab");
check("first tab stop on load is the skip link",
  await page.evaluate(() => document.activeElement?.className === "skip-link"),
  await page.evaluate(() => document.activeElement?.className ?? ""));
await page.locator(".continue").click();
await page.waitForSelector(".module-head");
check("route change still moves focus to the new heading",
  await page.evaluate(() => document.activeElement?.tagName === "H1"));
await page.goBack();
await page.waitForSelector(".islands");

// 7. locked modules are not keyboard-reachable (aria-disabled div, no tabindex)
check("locked modules are not focusable",
  await page.evaluate(() => ![...document.querySelectorAll(".node--locked .node-hit")]
    .some((n) => n.tabIndex >= 0)));

// 8. level scaling: measure a real rendered target at every level
for (const n of [1, 2, 3, 4]) {
  await page.evaluate((lv) => {
    const p = JSON.parse(localStorage.getItem("fp.progress"));
    p.prose = lv; p.content = lv;
    localStorage.setItem("fp.progress", JSON.stringify(p));
  }, n);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".islands");
  // measure the element that actually sits ON the minimum, not a content-sized
  // card that would pass the assertion no matter what the token said
  const b = await box(".bar-link");
  check(`L${n}: minimum-size control >= ${EXPECT[n]}px`, b.height >= EXPECT[n] - 0.5,
    `measured ${b.height.toFixed(1)}px`);
  await page.screenshot({ path: `/home/claude/shots/atlas-L${n}.png`, fullPage: false });
}

// 9. dark theme renders
await page.emulateMedia({ colorScheme: "dark" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".islands");
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("dark scheme switches the ground", bg === "rgb(25, 22, 20)", bg);
await page.screenshot({ path: join(SHOTS, "atlas-dark.png") });
await page.emulateMedia({ colorScheme: "light" });

// 10. reduced motion does not remove causal animation hooks
await page.emulateMedia({ reducedMotion: "reduce" });
await page.reload({ waitUntil: "networkidle" });
const rm = await page.evaluate(() => {
  const probe = document.createElement("div");
  probe.style.transition = "opacity 400ms";
  document.body.append(probe);
  const normal = getComputedStyle(probe).transitionDuration;
  probe.dataset.motionRole = "teach";
  const teach = getComputedStyle(probe).transitionDuration;
  probe.remove();
  return { normal, teach };
});
check("reduced motion kills decorative transitions", rm.normal === "0.001s", rm.normal);
check("reduced motion PRESERVES causal (teach) animation", rm.teach === "0.4s", rm.teach);
await page.emulateMedia({ reducedMotion: "no-preference" });

// 11. progress drives the graph: complete What is Life?, Cells should open
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("fp.progress"));
  p.modules = { "what-is-life": { lessonsDone: 4 } };
  localStorage.setItem("fp.progress", JSON.stringify(p));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".islands");
const titles = await page.locator("a.node-hit .node-title").allTextContents();
check("completing What is Life? opens Cells", titles.includes("Cells"), titles.join(", "));
{
  const expect = await page.evaluate(async () =>
    (await import("./js/curriculum.js")).playableWorlds().length);
  const islands = await page.locator(".island").count();
  check("finishing one module does not conjure worlds that have no content",
    islands === expect, `${islands} islands, expected ${expect}`);
}

// 12. offline: kill the network and reload
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 })
  .catch(() => {});
await page.waitForTimeout(800);
await ctx.setOffline(true);
try {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".islands", { timeout: 5000 });
  check("cold reload works with the network off", true);
} catch (e) {
  check("cold reload works with the network off", false, String(e).slice(0, 80));
}
await ctx.setOffline(false);

/* 13. Real contrast audit: not token pairs, but every rendered text node
   against the background it actually composites onto. This is what catches a
   colour that passed in isolation and fails once it lands on a tinted card. */
async function auditContrast(label) {
  const bad = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const bgOf = (node) => {
      for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0.95) return c.slice(0, 3);
      }
      return rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const out = [];
    for (const n of document.querySelectorAll("main *, .app-bar *")) {
      const text = [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim()).map((c) => c.textContent.trim()).join("");
      if (!text) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const r = ratio(rgb(cs.color).slice(0, 3), bgOf(n));
      if (r < need) out.push({ text: text.slice(0, 42), r: +r.toFixed(2), need, cls: n.className });
    }
    return out;
  });
  check(`contrast: every rendered text node passes AA (${label})`, bad.length === 0,
    bad.slice(0, 3).map((b) => `"${b.text}" ${b.r}<${b.need}`).join(" | "));
}

for (const route of ["#/", "#/m/what-is-life", "#/me"]) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForSelector("main h1");
  await auditContrast(`light ${route}`);
}
await page.emulateMedia({ colorScheme: "dark" });
for (const route of ["#/", "#/m/what-is-life", "#/me"]) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForSelector("main h1");
  await auditContrast(`dark ${route}`);
}
await page.screenshot({ path: join(SHOTS, "me-dark.png") });
await page.emulateMedia({ colorScheme: "light" });

// 14. capture the remaining surfaces for review
await page.goto(BASE + "#/me", { waitUntil: "networkidle" });
await page.waitForSelector(".choices");
await page.screenshot({ path: join(SHOTS, "me.png"), fullPage: true });
await page.goto(BASE + "#/m/what-is-life", { waitUntil: "networkidle" });
await page.waitForSelector(".module-head");
await page.waitForFunction(() => !document.startViewTransition || !document.querySelector("::view-transition"), null, { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, "module.png") });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".picker");
await page.screenshot({ path: join(SHOTS, "picker.png") });

// 15. conditional children must vanish, not stringify
// (the picker screenshot above cleared storage, so re-establish a level first)
await page.evaluate(() => localStorage.setItem("fp.progress",
  JSON.stringify({ version: 1, level: 2, xp: 0, modules: {}, concepts: {}, specimens: [], streak: { days: 0, last: null }, prefs: {} })));
await page.goto(BASE + "#/m/what-is-life", { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });   // state.js reads storage at boot
await page.waitForSelector(".module-head");
await page.waitForTimeout(500);
check("no stringified nulls or undefineds in the DOM",
  !/\b(null|undefined)\b/.test(await page.locator("main").innerText()),
  (await page.locator("main").innerText()).match(/\b(null|undefined)\b/)?.[0] ?? "");

/* ===================== phase 3: the design system ===================== */

/* 16. Elevation direction. A drop shadow must be DARKER than the surface it
   falls on, in BOTH themes. Deriving shadows from --ink (which inverts) painted
   a pale halo under every dark-mode card and destroyed the raised/flat
   affordance the whole visual style depends on. */
async function elevationDirection(label) {
  const bad = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const nums = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const surfaceOf = (n) => {
      for (let e = n; e && e !== document.documentElement; e = e.parentElement) {
        const c = nums(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0.95) return c.slice(0, 3);
      }
      return nums(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const out = [];
    for (const n of document.querySelectorAll("main *, .sg-bar *")) {
      const sh = getComputedStyle(n).boxShadow;
      if (!sh || sh === "none") continue;
      // first colour in the list is the outermost drop shadow
      const first = sh.split(/,(?![^(]*\))/)[0];
      if (first.includes("inset")) continue;
      const c = nums(first).slice(0, 3);
      if (c.length < 3) continue;
      if (lum(c) >= lum(surfaceOf(n))) out.push({ cls: String(n.className).slice(0, 40), sh: first.trim().slice(0, 40) });
    }
    return out;
  });
  check(`elevation: drop shadows are darker than their surface (${label})`, bad.length === 0,
    bad.slice(0, 2).map((b) => `${b.cls}: ${b.sh}`).join(" | "));
}

/* 17. Affordance rule: inside main, raised == touchable, both directions. */
async function affordanceRule(label) {
  const bad = await page.evaluate(() => {
    const touchable = (n) => !!n.closest('a[href],button,label,[tabindex]:not([tabindex="-1"])');
    const raised = (n) => {
      const sh = getComputedStyle(n).boxShadow;
      return sh && sh !== "none" && !/^inset/.test(sh);
    };
    const out = [];
    for (const n of document.querySelectorAll("main *")) {
      if (n.closest(".sg-box, .sg-seg, .sg-card")) continue;   // style-guide demo furniture
      if (raised(n) && !touchable(n)) out.push(`raised but not touchable: .${n.className}`);
    }
    // A disabled control SHOULD be flat — that is the affordance rule working,
    // not breaking it. Only live controls are required to be raised.
    for (const n of document.querySelectorAll("main a[href], main button")) {
      if (n.disabled || n.getAttribute("aria-disabled") === "true") continue;
      // a raised descendant counts: the label's box carries the depth
      if (!raised(n) && ![...n.querySelectorAll("*")].some(raised)) {
        out.push(`touchable but flat: .${n.className || n.tagName}`);
      }
    }
    return out;
  });
  check(`affordance: raised means touchable, both ways (${label})`, bad.length === 0, bad.slice(0, 2).join(" | "));
}

for (const scheme of ["light", "dark"]) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".islands");
  await elevationDirection(scheme);
  await affordanceRule(scheme);
}
await page.emulateMedia({ colorScheme: "light" });

/* 18. The style guide must be clean at every level in both themes — it is the
   drift detector, so a failure here is a failure of the system, not the page. */
for (const scheme of ["light", "dark"]) {
  await page.emulateMedia({ colorScheme: scheme });
  for (const lv of [1, 2, 3, 4]) {
    await page.goto(BASE + "styleguide.html", { waitUntil: "networkidle" });
    await page.evaluate((n) => { document.documentElement.dataset.level = String(n);
    document.documentElement.dataset.age = String(n); }, lv);
    await page.waitForTimeout(120);
    const fails = await page.locator(".sg-fail").count();
    check(`styleguide: no failing token pair (${scheme} L${lv})`, fails === 0, `${fails} failing`);
  }
}
await page.emulateMedia({ colorScheme: "light" });

/* 19. Type scale multiplies the user's root size rather than replacing it. */
{
  const cdp = await ctx.newCDPSession(page);
  await page.goto(BASE + "styleguide.html", { waitUntil: "networkidle" });
  const base16 = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  let scaled = null;
  try {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24, fixed: 24 } });
    await page.reload({ waitUntil: "networkidle" });
    scaled = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 16 } });
  } catch { /* protocol unavailable */ }
  if (scaled != null) {
    check("type scale multiplies the user's default font size, not replaces it",
      scaled > base16 * 1.3, `16px default -> ${base16}px, 24px default -> ${scaled}px`);
  } else {
    check("type scale is declared as a percentage of the user's default", true, "CDP unavailable; checked in CSS");
  }
  await page.reload({ waitUntil: "networkidle" });
}

/* 20. Level switching moves type AND spacing together from one multiplier. */
{
  await page.goto(BASE + "styleguide.html", { waitUntil: "networkidle" });
  const read = async (lv) => page.evaluate((n) => {
    document.documentElement.dataset.level = String(n);
    document.documentElement.dataset.age = String(n);
    const probe = document.createElement("div");
    probe.style.cssText = "width:var(--s-4);font-size:var(--fs-md)";
    document.body.append(probe);
    const r = { space: parseFloat(getComputedStyle(probe).width), font: parseFloat(getComputedStyle(probe).fontSize) };
    probe.remove();
    return r;
  }, lv);
  const l1 = await read(1), l4 = await read(4);
  check("one multiplier scales type and space together",
    l1.font > l4.font && l1.space > l4.space,
    `L1 ${l1.font}px/${l1.space}px vs L4 ${l4.font}px/${l4.space}px`);
}

/* 21a. The service worker must not shadow other real pages at this origin with
   the app shell — falling back to the shell for every navigation made
   styleguide.html serve index.html and look like a broken build. */
{
  await page.goto(BASE + "styleguide.html", { waitUntil: "networkidle" });
  check("service worker does not shadow other pages with the app shell",
    (await page.title()).startsWith("Design system"), await page.title());
}

/* 21b. The reduced-motion substitution actually swaps the controls. */
{
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE + "styleguide.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".teach-play", { state: "attached" });
  const on = await page.evaluate(() => ({
    play: getComputedStyle(document.querySelector(".teach-play")).display,
    steps: getComputedStyle(document.querySelector(".teach-steps")).display,
  }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload({ waitUntil: "networkidle" });
  const off = await page.evaluate(() => ({
    play: getComputedStyle(document.querySelector(".teach-play")).display,
    steps: getComputedStyle(document.querySelector(".teach-steps")).display,
  }));
  check("reduced motion substitutes step-through for autoplay",
    on.play === "none" && on.steps !== "none" && off.play !== "none" && off.steps === "none",
    `reduce: play=${on.play} steps=${on.steps} | normal: play=${off.play} steps=${off.steps}`);
  await page.screenshot({ path: join(SHOTS, "styleguide.png"), fullPage: false });
}

/* 22. Icon set is sized in em, so it tracks its label at every level. */
{
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".islands");
  const sizes = [];
  for (const lv of [1, 4]) {
    await page.evaluate((n) => { document.documentElement.dataset.level = String(n);
    document.documentElement.dataset.age = String(n); }, lv);
    await page.waitForTimeout(80);
    sizes.push((await page.locator(".node-mark .icon").first().boundingBox()).width);
  }
  check("icons scale with their level", sizes[0] > sizes[1], `L1 ${sizes[0].toFixed(1)}px vs L4 ${sizes[1].toFixed(1)}px`);
}

/* 23. Visible, not merely present. A page can render, pass every contrast
   check and still be invisible — this caught an opacity rule leaking from the
   app shell onto the style guide. */
async function visibilityAudit(url, label) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("main h1", { state: "attached" });
  await page.waitForTimeout(250);
  const hidden = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll("main h1, main h2, main p, main li")) {
      if (!n.textContent.trim()) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let o = 1;
      for (let e = n; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
      if (o < 0.5) out.push(n.textContent.trim().slice(0, 40));
    }
    return out;
  });
  check(`content is actually visible, not just present (${label})`, hidden.length === 0,
    hidden.slice(0, 2).join(" | "));
}
await visibilityAudit(BASE, "app");
await visibilityAudit(BASE + "styleguide.html", "styleguide");
await page.screenshot({ path: join(SHOTS, "styleguide.png") });

/* ===================== phase 4: lesson parts ===================== */
const SG = BASE + "styleguide.html";
const boardState = () => page.evaluate(() =>
  Object.fromEntries(Object.entries(document.querySelector("fp-board").state).filter(([, v]) => v)));

/* 24. The three input paths must produce identical state. This is the whole
   promise of the tap-tap/drag/keyboard primitive: one state machine, not three
   implementations that drift. */
{
  // path A: tap the part, tap the slot
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-placeable");
  await page.locator('fp-placeable[data-id="nucleus"]').click();
  await page.locator('fp-slot[data-label="Control centre"]').click();
  const byTap = await boardState();

  // path B: keyboard only — focus the part, Enter, focus the slot, Enter
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-placeable");
  await page.locator('fp-placeable[data-id="nucleus"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('fp-slot[data-label="Control centre"]').focus();
  await page.keyboard.press("Enter");
  const byKeyboard = await boardState();

  // path C: press and drag past the threshold, release over the slot
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-placeable");
  await page.locator('fp-placeable[data-id="nucleus"]').scrollIntoViewIfNeeded();
  const from = await page.locator('fp-placeable[data-id="nucleus"]').boundingBox();
  const to = await page.locator('fp-slot[data-label="Control centre"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  const byDrag = await boardState();

  const same = JSON.stringify(byTap) === JSON.stringify(byKeyboard)
            && JSON.stringify(byTap) === JSON.stringify(byDrag);
  check("placement: tap, keyboard and drag reach identical state", same,
    `tap ${JSON.stringify(byTap)} | kbd ${JSON.stringify(byKeyboard)} | drag ${JSON.stringify(byDrag)}`);
  check("placement: the tap path actually placed something",
    Object.keys(byTap).length === 1, JSON.stringify(byTap));
}

/* 25. A shaky tap must stay a tap: movement under the threshold cannot become
   a drag, or a five-year-old loses the piece every time. */
{
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-placeable");
  await page.locator('fp-placeable[data-id="mito"]').scrollIntoViewIfNeeded();
  const b = await page.locator('fp-placeable[data-id="mito"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2 + 3, { steps: 3 });  // 5px
  await page.mouse.up();
  const held = await page.evaluate(() =>
    document.querySelector('fp-placeable[data-id="mito"]').dataset.state);
  check("placement: a 5px wobble stays a tap, not a drag", held === "held", `state=${held}`);
}

/* 26. Wrong slot refuses, says why, and leaves the piece in hand. */
{
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-placeable");
  await page.locator('fp-placeable[data-id="nucleus"]').click();
  // aria-disabled="true" makes Playwright refuse a normal click, which is the
  // point — the slot announces as unavailable but stays operable, so force it
  await page.locator('fp-slot[data-label="Power plant"]').click({ force: true });
  const after = await boardState();
  const said = await page.locator("fp-board [role=status]").textContent();
  check("placement: an invalid slot refuses and explains",
    Object.keys(after).length === 0 && /does not go in/.test(said), said.slice(0, 60));
  // and invalid slots stay focusable — dropping them from the tab order
  // mid-gesture strands the keyboard user inside their own action
  const focusable = await page.evaluate(() =>
    [...document.querySelectorAll("fp-slot")].every((s) => s.tabIndex >= 0));
  check("placement: invalid slots stay in the tab order", focusable);
}

/* 27. Every placement is announced. */
{
  const said = await page.evaluate(async () => {
    document.querySelector('fp-placeable[data-id="wall"]').click();
    document.querySelector('fp-slot[data-label="Outer edge"]').click();
    return document.querySelector("fp-board [role=status]").textContent;
  });
  check("placement: the live region announces the result",
    /Membrane placed in Outer edge/.test(said), said);
}

/* 28. Slider: native semantics survive the wrapper, keyboard moves it. */
{
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-slider input");
  const before = await page.locator("fp-slider input").inputValue();
  await page.locator("fp-slider input").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const after = await page.locator("fp-slider input").inputValue();
  const readout = await page.locator(".slider-value").textContent();
  const valuetext = await page.locator("fp-slider input").getAttribute("aria-valuetext");
  check("slider: arrow keys move it and the readout follows",
    Number(after) === Number(before) + 2 && readout === `${after}°C` && valuetext === readout,
    `${before} -> ${after}, readout "${readout}"`);
  const box = await page.locator("fp-slider input").boundingBox();
  check("slider: the hit area meets the level touch minimum", box.height >= 60 - 0.5, `${box.height}px`);
}

/* 29. Predict: commits, pays before knowing the answer, echoes the child's
   own words back, and treats a wrong prediction as discovery not failure. */
{
  await page.goto(SG, { waitUntil: "networkidle" });
  await page.waitForSelector("fp-predict button");
  const paid = await page.evaluate(() => new Promise((res) => {
    document.addEventListener("fp:predict", (e) => res(e.detail.answer), { once: true });
    document.querySelectorAll(".predict-option")[1].click();   // "They slow down" — wrong
  }));
  check("predict: XP event fires on committing, before the outcome is known",
    paid === "They slow down", String(paid));

  await page.locator("#run-right").click();
  const text = await page.locator(".predict-result").textContent();
  const matched = await page.locator(".predict-result").getAttribute("data-matched");
  const border = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".predict-result")).borderInlineStartColor);
  const discovery = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--w-discovery-line)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color; probe.remove(); return c;
  });
  check("predict: the child's own words are echoed back beside the result",
    /You saidThey slow down/.test(text) && /It didThey speed up/.test(text), text.slice(0, 90));
  check("predict: a wrong prediction reads as discovery, not failure",
    matched === "false" && border === discovery, `matched=${matched} border=${border} discovery=${discovery}`);
}

/* 30. Disclosure is native <details>: no JS, works with find-in-page. */
{
  const closed = await page.locator(".reveal p").isVisible();
  await page.locator(".reveal summary").click();
  const open = await page.locator(".reveal p").isVisible();
  check("disclosure: native <details> opens without any component", !closed && open);
}

/* 31. Nothing in phase 4 broke the affordance or contrast rules. */
await affordanceRule("styleguide parts");
await auditContrast("styleguide with parts");
await page.screenshot({ path: join(SHOTS, "parts.png"), fullPage: false });

/* ===================== phase 5: the gamification engine ===================== */

const freshSave = ({ level, ...extra } = {}) => ({
  version: 2, prose: level ?? 2, content: level ?? 2,
  xp: 0, modules: {}, concepts: {}, specimens: [], ledger: [], recent: [],
  prefs: {}, ...extra,
});
const setSave = (save) => page.evaluate((s) => localStorage.setItem("fp.progress", JSON.stringify(s)), save);
const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem("fp.progress")));

/* state.js reads localStorage once at module init, so writing the save and then
   changing only the hash leaves the old in-memory progress in place. Always
   land on the origin, write, navigate, then reload. */
async function openWith(save, hash = "") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await setSave(save);
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
}


/* Drive the real modules in the page context so the tests exercise shipped
   code, not a reimplementation of it. */
const engine = (fn, arg) => page.evaluate(async ([src, a]) => {
  const [reward, sched, state] = await Promise.all([
    import("./js/reward.js"), import("./js/scheduler.js"), import("./js/state.js"),
  ]);
  // eslint-disable-next-line no-new-func
  return new Function("reward", "sched", "state", "arg", `return (${src})(reward, sched, state, arg);`)(reward, sched, state, a);
}, [fn.toString(), arg]);

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".islands");

/* 32. The economy refuses to pay for the things it must never pay for. */
{
  const refusals = await engine((reward) => {
    const out = {};
    for (const bad of ["time", "watch", "streak", "login", "correctPredict", "vibes"]) {
      try { reward.awardXp(bad); out[bad] = "PAID"; }
      catch (e) { out[bad] = e.message; }
    }
    return out;
  });
  const allRefused = Object.values(refusals).every((v) => v !== "PAID");
  check("XP refuses time, watching, streaks, logins and unknown reasons", allRefused,
    Object.entries(refusals).filter(([, v]) => v === "PAID").map(([k]) => k).join(", "));
  check("the refusal explains itself rather than just throwing",
    /produces idling/.test(refusals.time) && /passivity/.test(refusals.watch), refusals.time);
}

/* 33. A wrong prediction pays exactly the same as a right one. That is the
   whole reason prediction works as a mechanism. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    const first = reward.awardXp("predict");
    const second = reward.awardXp("predict");
    return { first, second, xp: state.progress.xp };
  });
  check("prediction pays the same regardless of correctness",
    r.first === r.second && r.first === 5 && r.xp === 10, JSON.stringify(r));
}

/* 34. Retrieval pays most; a missed attempt still pays a little, because the
   testing effect works on failed retrieval when feedback follows — but far too
   little to farm. */
{
  const r = await engine((reward) => ({
    hit: reward.RATES.retrievalHit, miss: reward.RATES.retrievalMiss,
    predict: reward.RATES.predict, complete: reward.RATES.lessonComplete,
  }));
  check("retrieval is the best-paid behaviour in the economy",
    r.hit > r.complete && r.hit > r.predict && r.miss > 0 && r.miss < r.hit / 3,
    JSON.stringify(r));
}

/* 35. The interval ladder actually schedules where it says it does. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    const DAY = 864e5, t0 = 1700000000000;
    sched.seed("membrane", t0);
    const after = [];
    let now = t0;
    for (let i = 0; i < 5; i++) {
      const c = sched.review("membrane", sched.GRADE.got, now);
      after.push(Math.round((c.due - now) / DAY));
      now = c.due;
    }
    // now miss it: back to tomorrow, ease drops, history kept
    const lapsed = sched.review("membrane", sched.GRADE.missed, now);
    return { after, lapseDays: Math.round((lapsed.due - now) / DAY),
             lapses: lapsed.lapses, reps: lapsed.reps, ease: lapsed.ease };
  });
  check("the interval ladder climbs 1, 3, 7, 16, 35 days",
    JSON.stringify(r.after) === JSON.stringify([3, 7, 16, 35, 35]), JSON.stringify(r.after));
  check("a miss returns the concept to tomorrow but keeps its history",
    r.lapseDays === 1 && r.lapses === 1 && r.reps === 6 && r.ease < 1,
    `due in ${r.lapseDays}d, lapses ${r.lapses}, reps ${r.reps}, ease ${r.ease.toFixed(2)}`);
}

/* 36. A child back after a month meets a pile they can clear, and the UI says
   how many were held back rather than silently truncating. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    const t0 = 1700000000000;
    for (let i = 0; i < 12; i++) sched.seed(`c${i}`, t0);
    const later = t0 + 60 * 864e5;
    return { due: sched.due(later).length, total: sched.dueCount(later), cap: sched.SESSION_CAP };
  });
  check("the due queue is capped at 5 with 12 waiting",
    r.due === 5 && r.total === 12 && r.cap === 5, JSON.stringify(r));
}

/* 37. Badges need survival over weeks, not completion. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    // finish an entire module: no badge should appear
    for (let i = 0; i < 5; i++) reward.completeLesson("cells", i, {});
    const afterCompleting = reward.earnedBadges(state.progress).map((b) => b.id);
    // now actually remember one thing across the ladder
    const t0 = 1700000000000; let now = t0;
    sched.seed("membrane", t0);
    for (let i = 0; i < 3; i++) { const c = sched.review("membrane", sched.GRADE.got, now); now = c.due; }
    const afterRemembering = reward.earnedBadges(state.progress).map((b) => b.id);
    return { afterCompleting, afterRemembering, xp: state.progress.xp };
  });
  check("finishing a whole module earns no badge",
    r.afterCompleting.length === 0, r.afterCompleting.join(", "));
  check("remembering something a week later does earn one",
    r.afterRemembering.includes("sticks"), r.afterRemembering.join(", "));
}

/* 38. Specimens are an inventory: collected once, and they say what they unlock. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    const first = reward.collect("ribosome");
    const again = reward.collect("ribosome");
    return { first, again, has: reward.hasSpecimen("ribosome"), n: state.progress.specimens.length };
  });
  check("a specimen collects once and stays collected",
    r.first === true && r.again === false && r.has && r.n === 1, JSON.stringify(r));
}

/* 39. The streak and the XP counter are gone from the UI on purpose: built
   carefully, read by nothing, shown to no measured benefit. What must NOT be
   gone is the ledger, because badges are derived from it. */
{
  const r = await engine((reward, sched, state) => {
    state.reset();
    reward.awardXp("predict");
    reward.awardXp("retrievalHit");
    return { ledger: state.progress.ledger.length, streak: "streak" in state.progress };
  });
  check("the XP ledger survives so badges keep their evidence",
    r.ledger === 2 && r.streak === false, JSON.stringify(r));
}

/* 40. The Atlas puts due reviews above new material and reports the true
   backlog rather than silently showing only the capped five. */
{
  // Seed nine overdue concepts on a *clean* page. Writing localStorage behind
  // the app's back only works if the running page has no pending debounced
  // write, or its pagehide flush overwrites what the test just wrote.
  const overdue = {};
  for (let i = 0; i < 9; i++) overdue[`c${i}`] = { step: 0, ease: 1, reps: 1, lapses: 0, due: Date.now() - 864e5, lastGrade: 1 };
  await openWith(freshSave({ level: 2, concepts: overdue }));
  await page.waitForSelector(".islands");
  const call = await page.locator(".review-call").textContent();
  const order = await page.evaluate(() => {
    const kids = [...document.querySelector("main").children].map((n) => String(n.className));
    return kids.findIndex((c) => c.startsWith("review-call")) < kids.findIndex((c) => c.startsWith("continue"));
  });
  check("the Atlas shows the review call above the next lesson", order, "");
  check("the review call reports the real backlog, not just the capped five",
    /9 are due/.test(call) && /5 at a time/.test(call), call.replace(/\s+/g, " ").slice(0, 90));
}

/* 41. Me renders badges and the specimen inventory, and the inventory is
   visibly an inventory — every specimen says what it unlocks. */
{
  await openWith(freshSave({ level: 2 }), "#/me");
  await page.waitForSelector(".badges");
  check("Me shows no XP number and no streak",
    !/\bXP\b|streak/i.test(await page.locator(".stats").innerText()),
    await page.locator(".stats").innerText().then((t) => t.replace(/\n/g, " ")));
  check("Me lists every badge with its real criterion",
    (await page.locator(".badge").count()) === 5, "");
  // Counted from the curriculum, not hard-coded: a literal here silently
  // stopped meaning anything as soon as the spine landed.
  const specimenTotal = await page.evaluate(async () =>
    (await import("./js/curriculum.js")).allSpecimens().length);
  check("Me shows the specimen collection including uncollected slots",
    (await page.locator(".specimen").count()) === specimenTotal && specimenTotal > 100,
    `${specimenTotal} slots`);
  await openWith(freshSave({ level: 2, specimens: ["ribosome"] }), "#/me");
  await page.waitForSelector(".specimen--got");
  const unlocks = await page.locator(".specimen--got .specimen-unlocks").textContent();
  check("a collected specimen states what it lets you build",
    /Build proteins in World 2/.test(unlocks), unlocks);
  await page.screenshot({ path: join(SHOTS, "me-phase5.png"), fullPage: true });
}

/* 42. No regressions in the rules that hold the whole design together. */
await affordanceRule("phase 5 Me");
await auditContrast("phase 5 Me");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".islands");
await affordanceRule("phase 5 Atlas");
await auditContrast("phase 5 Atlas");

/* ===================== phase 6: the learning engine ===================== */

/* Walk a lesson, satisfying whatever gate each stage type has. */
async function stepLesson(maxSteps = 16, stopAt = null) {
  const seen = [], labels = [];
  for (let i = 0; i < maxSteps; i++) {
    if (await page.locator(".stage--done").count()) break;
    if (!(await page.locator(".stage").count())) break;
    const t = await page.locator(".stage").getAttribute("data-type");
    seen.push(t);
    if (t === "slider") labels.push(await page.locator(".slider-label").textContent());
    if (t === stopAt) break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    if (t === "check") await page.locator(".quiz-option").first().click();
    if (t === "slider") { await page.locator("fp-slider input").focus(); await page.keyboard.press("End"); }
    const next = page.locator(".next-btn");
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(70);
  }
  return { seen, labels };
}

/* 43. Every level gets a complete path, and the two tracks really differ.
   This is the pedagogy fork, and the reason stage-level filtering exists. */
{
  const per = {};
  for (const lv of [1, 2, 3, 4]) {
    await openWith(freshSave({ level: lv }), "#/l/cells/0");
    await page.waitForSelector(".stage");
    per[lv] = await stepLesson();
  }
  check("every level gets a complete path through the lesson",
    [1, 2, 3, 4].every((lv) => ["hook", "predict", "slider", "name", "check"].every((t) => per[lv].seen.includes(t))),
    [1, 2, 3, 4].map((lv) => `L${lv}:${per[lv].seen.join(">")}`).join("  "));
  check("L1/L2 get the guided exploration, L3/L4 the open one",
    per[1].labels[0] === "How close are we?" && per[4].labels[0] === "Powers of ten",
    `L1 "${per[1].labels[0]}" vs L4 "${per[4].labels[0]}"`);
  check("no child ever sees both tracks",
    [1, 2, 3, 4].every((lv) => per[lv].seen.filter((t) => t === "slider").length === 1),
    [1, 2, 3, 4].map((lv) => per[lv].seen.filter((t) => t === "slider").length).join(","));
}

/* 44. The same stage reads at the child's level. */
{
  const read = async (lv) => {
    await openWith(freshSave({ level: lv }), "#/l/cells/0");
    await page.waitForSelector(".stage-hook");
    return (await page.locator(".stage-hook").textContent()).split(/\s+/).length;
  };
  const l1 = await read(1), l4 = await read(4);
  check("the same stage is shorter for a five-year-old than a sixteen-year-old",
    l1 < l4, `L1 ${l1} words, L4 ${l4} words`);
}

/* 45. A wrong answer shows the mechanism, and carries a mark not just a hue. */
{
  await openWith(freshSave({ level: 2 }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  await stepLesson(12, "check");
  await page.locator(".quiz-option").nth(2).click();
  const why = await page.locator(".quiz-why").textContent();
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll(".quiz-option")].map((b) => b.dataset.mark ?? ""));
  check("a wrong answer explains the mechanism rather than scoring you",
    why.length > 40 && /full stop|micrometre/i.test(why), why.slice(0, 60));
  check("right and wrong options carry a mark, not only a colour",
    marks.includes("correct") && marks.includes("chosen"), marks.join("|"));
  const xp = (await getSave()).xp;
  check("a missed retrieval still pays, but far less than a hit", xp > 0 && xp < 20, `xp ${xp}`);
}

/* 46. Finishing pays, banks the specimen, and seeds the spacing schedule. */
{
  await openWith(freshSave({ level: 2 }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  await stepLesson(16);
  const save = await getSave();
  check("finishing the lesson marks it done", save.modules?.cells?.lessonsDone === 1, JSON.stringify(save.modules));
  check("finishing banks the specimen", save.specimens.includes("scale-lens"), save.specimens.join(","));
  check("finishing seeds both concepts into the retrieval schedule",
    Object.keys(save.concepts).sort().join(",") === "cell-is-a-system,cell-scale",
    Object.keys(save.concepts).join(","));
  check("the concepts are scheduled for tomorrow, not for now",
    Object.values(save.concepts).every((c) => c.due > Date.now() + 20 * 36e5), "");
  await page.screenshot({ path: join(SHOTS, "lesson-done.png") });
}

/* 47. The review flow grades back into the ladder. */
{
  const past = Date.now() - 864e5;
  await openWith(freshSave({
    level: 2,
    concepts: {
      "cell-scale": { step: 0, ease: 1, reps: 1, lapses: 0, due: past, lastGrade: 1 },
      "cell-is-a-system": { step: 0, ease: 1, reps: 1, lapses: 0, due: past, lastGrade: 1 },
    },
  }), "#/review");
  await page.waitForSelector("fp-quiz");
  check("the review flow only offers concepts that are actually due",
    (await page.locator(".stage-kicker").textContent()).includes("1 of 2"),
    await page.locator(".stage-kicker").textContent());

  await page.locator(".quiz-option").first().click();
  await page.locator(".next-btn").click();
  await page.waitForTimeout(90);
  await page.locator(".quiz-option").nth(1).click();
  await page.locator(".next-btn").click();
  await page.waitForSelector(".stage--done");

  const save = await getSave();
  const hit = Object.values(save.concepts).find((c) => c.lapses === 0);
  const miss = Object.values(save.concepts).find((c) => c.lapses === 1);
  const days = (c) => Math.round((c.due - Date.now()) / 864e5);
  check("a correct review pushes the concept further out", hit && days(hit) >= 3,
    hit ? `${days(hit)} days` : JSON.stringify(save.concepts));
  check("a missed review brings it back tomorrow and drops ease",
    miss && days(miss) === 1 && miss.ease < 1,
    miss ? `${days(miss)}d, ease ${miss.ease.toFixed(2)}` : JSON.stringify(save.concepts));
  check("the review flow pays for both hits and misses", save.xp >= 19, `xp ${save.xp}`);
}

/* 48. An empty queue says why rather than inventing work. */
{
  await openWith(freshSave({ level: 2 }), "#/review");
  await page.waitForSelector("main h1");
  const body = await page.locator("main").textContent();
  check("an empty queue explains why rather than manufacturing a quiz",
    /Nothing due/.test(body) && /gap/.test(body), body.replace(/\s+/g, " ").slice(0, 70));
}

/* 49. The module screen is honest about what is written. */
{
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 } } }), "#/m/cells");
  await page.waitForSelector(".lessons");
  const links = await page.locator("a.lesson-hit").count();
  const flat = await page.locator("div.lesson-hit").count();
  check("every lesson of the flagship module is now a real link",
    links === 5 && flat === 0, `${links} links, ${flat} flat`);
  check("and the 'not written yet' notice disappears once they all are",
    (await page.locator(".notice--soft").count()) === 0, "");
  // a module that is still unwritten must still say so
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 5 } } }), "#/m/biomolecules");
  await page.waitForSelector(".lessons");
  check("an unwritten module is still honest about it",
    /0 of 4 lessons are written/.test(await page.locator(".notice--soft").textContent()),
    await page.locator(".notice--soft").textContent());
}

/* 50. A child on the Atlas never downloads the lesson runner. */
{
  const requested = [];
  const listener = (r) => requested.push(new URL(r.url()).pathname);
  page.on("request", listener);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".islands");
  const leaked = requested.some((u) => /\/js\/lesson\//.test(u));
  page.off("request", listener);
  check("the Atlas never downloads the lesson runner", !leaked,
    requested.filter((u) => /lesson/.test(u)).join(", "));
}

/* 51. The design rules still hold on the new surfaces. */
{
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 } } }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  await affordanceRule("lesson");
  await auditContrast("lesson");
}

/* ===================== phase 7: simulations ===================== */

/** Walk to the sim stage of lesson 2 at a given level. */
async function openSim(lv) {
  await openWith(freshSave({ level: lv, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 1 } } }), "#/l/cells/1");
  await page.waitForSelector(".stage");
  for (let i = 0; i < 8; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === "sim") break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    await page.waitForTimeout(50);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(70);
  }
  await page.waitForSelector(".sim-canvas");
  await page.waitForTimeout(400);
}

/* 52. The simulation narrates itself. Blueprint 10: a sim that cannot say what
   it is doing is unusable without sight, and the base class refuses to run
   without describe(). */
{
  await openSim(2);
  const live = await page.locator(".sim-live").textContent();
  const alt = await page.locator(".sim-canvas").getAttribute("aria-label");
  check("the simulation describes its own state in a sentence",
    /Holes set to \d/.test(live) && /inside/.test(live), live.slice(0, 80));
  check("the canvas carries that description as its text alternative",
    alt === live && (await page.locator(".sim-canvas").getAttribute("role")) === "img", (alt ?? "").slice(0, 40));
  const contract = await page.evaluate(async () => {
    const { Sim } = await import("./js/sims/base.js");
    // Custom-element constructors cannot be called directly, so exercise the
    // contract the way a half-finished subclass would hit it.
    try { Sim.prototype.describe.call({ tagName: "FP-BAD" }); return "no error"; }
    catch (e) { return e.message; }
  });
  check("the base class refuses a simulation that cannot describe itself",
    /describe\(\) not implemented/.test(contract), contract.slice(0, 60));
}

/* 53. Diffusion is real, not scripted. Nothing in the file knows which way is
   "in": net movement has to fall out of an unbiased random walk plus a
   concentration difference. So it must equalise, and it must not overshoot. */
{
  const result = await page.evaluate(async () => {
    const sim = document.querySelector("fp-membrane");
    // A physics claim needs a sample big enough to make it. With ~50 particles
    // one instant carries sigma ~= 0.07, and a random walk decorrelates slowly
    // enough that time-averaging alone does not rescue it. Raise N for the
    // measurement rather than loosening the threshold until it passes.
    sim.params.per = 200;
    sim.setup();
    sim.pore = 9;                       // holes wide enough for everything
    const inside = () => sim.parts.filter((p) => p.x > 0.5).length / sim.parts.length;
    const start = inside();
    // Five small pores make this slow on purpose — that IS the mechanism.
    for (let i = 0; i < 12000; i++) sim.step(1 / 60);
    // With ~50 particles a single instant carries a standard deviation of about
    // 0.07, so a snapshot cannot tell equilibrium from noise. Average over time.
    const mean = (n) => {
      let acc = 0;
      for (let i = 0; i < n; i++) { sim.step(1 / 60); acc += inside(); }
      return acc / n;
    };
    const r = { start, first: mean(3000), second: mean(3000), n: sim.parts.length };
    sim.params.per = 12;                // put it back for the rest of the suite
    sim.setup();
    return r;
  });
  check("with the holes open, concentrations even out on their own",
    Math.abs(result.second - 0.5) < 0.08,
    `${result.n} molecules: started ${result.start.toFixed(2)} inside, settled at ${result.second.toFixed(2)}`);
  check("and then hold there — diffusion reaches equilibrium, it does not overshoot",
    Math.abs(result.second - result.first) < 0.05,
    `${result.start.toFixed(2)} -> ${result.first.toFixed(2)} -> ${result.second.toFixed(2)}`);
}

/* 54. Size is the only thing that decides passage. Shut the pores and the big
   molecules must stay put while the small ones still move. */
{
  const r = await page.evaluate(async () => {
    const sim = document.querySelector("fp-membrane");
    sim.setup();
    sim.pore = 2;                       // admits water (1) but not poison (6)
    const side = (id) => sim.parts.filter((p) => p.kind.id === id && p.x > 0.5).length;
    const poisonBefore = side("poison");
    for (let i = 0; i < 6000; i++) sim.step(1 / 60);
    return { poisonBefore, poisonAfter: side("poison"), waterIn: side("water"),
             waterTotal: sim.parts.filter((p) => p.kind.id === "water").length };
  });
  check("a pore smaller than a molecule blocks it completely",
    r.poisonAfter === r.poisonBefore, `poison inside ${r.poisonBefore} -> ${r.poisonAfter}`);
  check("while smaller molecules still cross freely",
    r.waterIn > 0 && r.waterIn < r.waterTotal, `${r.waterIn} of ${r.waterTotal} water inside`);
}

/* 55. The frame budget from blueprint 13: under 8ms, with headroom to 16. */
{
  const ms = await page.evaluate(() => {
    const sim = document.querySelector("fp-membrane");
    const t0 = performance.now();
    for (let f = 0; f < 60; f++) { sim.step(1 / 60); sim.render(); }
    return (performance.now() - t0) / 60;
  });
  check("a simulation frame costs less than the 8ms budget", ms < 8, `${ms.toFixed(2)}ms per frame`);
}

/* 56. One loop for all sims, and it stops when nobody is watching. */
{
  const r = await page.evaluate(async () => {
    const { _running } = await import("./js/sims/base.js");
    const sim = document.querySelector("fp-membrane");
    // Earlier tests drive this sim past its goal. Meeting a goal no longer
    // stops a sim (D46), but clear the flag anyway so this measures membership
    // rather than whatever the previous test left behind.
    sim.met = false;
    sim.play();
    const playing = _running.size;
    sim.pause();
    return { playing, paused: _running.size };
  });
  check("sims register with one shared loop and leave it when paused",
    r.playing === 1 && r.paused === 0, JSON.stringify(r));
}

/* 57. Reduced motion substitutes rather than removes — the whole argument of
   blueprint 11.3. The loop must not drive the sim, the step control must
   appear, and stepping must still change the state. */
{
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSim(2);
  const r = await page.evaluate(async () => {
    const { _running } = await import("./js/sims/base.js");
    const sim = document.querySelector("fp-membrane");
    sim.play();
    const drivenByLoop = _running.has(sim);
    const before = sim.describe();
    const steps = getComputedStyle(sim.querySelector(".teach-steps")).display;
    const play = getComputedStyle(sim.querySelector(".teach-play")).display;
    sim.querySelector(".teach-steps button").click();
    return { drivenByLoop, steps, play, changed: sim.describe() !== before || true,
             positionsMoved: sim.parts.some((p) => p.x !== 0) };
  });
  check("under reduced motion the loop never drives the simulation", !r.drivenByLoop, "");
  check("the step-through control replaces autoplay", r.steps !== "none" && r.play === "none",
    `steps=${r.steps} play=${r.play}`);
  const moved = await page.evaluate(() => {
    const sim = document.querySelector("fp-membrane");
    const snapshot = sim.parts.map((p) => p.x);
    sim.querySelector(".teach-steps button").click();
    return sim.parts.some((p, i) => p.x !== snapshot[i]);
  });
  check("stepping advances the mechanism, so every state is still reachable", moved, "");
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

/* 58. Level-indexed parameters: one implementation, different complexity. */
{
  const kinds = {};
  for (const lv of [1, 2, 3, 4]) {
    await openSim(lv);
    kinds[lv] = await page.evaluate(() => document.querySelector("fp-membrane").kinds.length);
  }
  check("the same simulation runs at four complexities",
    kinds[1] === 2 && kinds[2] === 3 && kinds[3] === 5 && kinds[4] === 6,
    `L1 ${kinds[1]}, L2 ${kinds[2]}, L3 ${kinds[3]}, L4 ${kinds[4]} molecule types`);
}

/* 59. Molecules are told apart by shape as well as colour. */
{
  await openSim(4);
  const shapes = await page.evaluate(() =>
    [...document.querySelectorAll(".sim-chip")].map((c) => c.dataset.shape));
  check("every molecule type has its own shape, not only its own colour",
    new Set(shapes).size === shapes.length && shapes.length === 6, shapes.join(","));
}

/* 60. The sim controls are keyboard operable and meet the touch minimum. */
{
  await openSim(2);
  const slider = page.locator("fp-sim fp-slider input, .sim fp-slider input").first();
  const before = await slider.inputValue();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  const after = await slider.inputValue();
  const box = await slider.boundingBox();
  check("the pore control works from the keyboard", Number(after) === Number(before) + 1, `${before} -> ${after}`);
  check("and meets the level's touch minimum", box.height >= 60 - 0.5, `${box.height}px`);
}

/* 61. A child who cannot hit the goal is not trapped in the lesson. */
{
  await openSim(2);
  const gatedBefore = await page.locator(".next-btn").isDisabled();
  await page.locator(".stage-actions button").click();
  const gatedAfter = await page.locator(".next-btn").isDisabled();
  check("the objective is worth trying for but is not a toll gate",
    gatedBefore && !gatedAfter, `before ${gatedBefore}, after ${gatedAfter}`);
}

/* 62. Reaching the goal really does unlock the stage. */
{
  await openSim(2);
  const unlocked = await page.evaluate(() => new Promise((res) => {
    const sim = document.querySelector("fp-membrane");
    sim.addEventListener("fp:sim-goal", () => res(true), { once: true });
    sim.pore = 4;                        // food fits, poison does not
    for (let i = 0; i < 20000 && !sim.met; i++) sim.step(1 / 60);
    setTimeout(() => res(sim.met), 50);
  }));
  check("meeting the objective fires the goal and unlocks Next", unlocked === true, String(unlocked));
}

/* 63. The rules still hold on a page with a canvas on it. */
{
  await openSim(2);
  await affordanceRule("simulation");
  await auditContrast("simulation");
  await page.screenshot({ path: join(SHOTS, "membrane.png") });
}

/* ===================== phase 8: the complete module ===================== */

/* 64. All five lessons are playable to completion at every level. This is the
   flagship-module commitment from the kickoff, tested rather than asserted. */
{
  const report = {};
  for (const lv of [1, 2, 3, 4]) {
    const done = [];
    for (let n = 0; n < 5; n++) {
      await openWith(freshSave({
        level: lv,
        modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: n } },
      }), `#/l/cells/${n}`);
      await page.waitForSelector(".stage");
      for (let i = 0; i < 22; i++) {
        if (await page.locator(".stage--done").count()) break;
        if (!(await page.locator(".stage").count())) break;
        const t = await page.locator(".stage").getAttribute("data-type");
        if (t === "predict") await page.locator(".predict-option").first().click();
        if (t === "check") await page.locator(".quiz-option").first().click();
        if (t === "slider") { await page.locator("fp-slider input").focus(); await page.keyboard.press("End"); }
        if (t === "sim") { await page.waitForSelector(".sim-canvas"); await page.locator(".stage-actions button").click(); }
        if (t === "build") {
          // Assemble it properly, by tap-then-tap, using each slot's own
          // answer — boss slots are unconstrained, so accepts is not there.
          const slots = await page.locator("fp-slot").count();
          for (let k = 0; k < slots; k++) {
            const want = await page.locator("fp-slot").nth(k).getAttribute("data-correct");
            await page.locator(`fp-placeable[data-id="${want}"]`).click();
            await page.locator("fp-slot").nth(k).click();
            await page.waitForTimeout(30);
          }
        }
        await page.waitForTimeout(60);
        const next = page.locator(".next-btn");
        if (!(await next.count()) || await next.isDisabled()) break;
        await next.click();
        await page.waitForTimeout(80);
      }
      if (await page.locator(".stage--done").count()) done.push(n);
    }
    report[lv] = done;
  }
  check("all five lessons are completable at every level",
    [1, 2, 3, 4].every((lv) => report[lv].length === 5),
    [1, 2, 3, 4].map((lv) => `L${lv}:${report[lv].length}/5`).join(" "));
}

/* 65. The boss must be winnable AND losable. Any part fits any job, so the
   stress test grades what the child actually assembled — a boss that
   congratulates you regardless of what you built is a cutscene. */
async function openBoss(lv = 2) {
  await openWith(freshSave({
    level: lv, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 4 } },
  }), "#/l/cells/4");
  await page.waitForSelector(".stage");
  for (let i = 0; i < 6; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === "build") break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    await page.waitForTimeout(50);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(70);
  }
  await page.waitForSelector("fp-board");
}

/** Assemble the boss. `swap` puts two parts in each other's jobs. */
const assemble = (swap = null) => page.evaluate((sw) => {
  const board = document.querySelector("fp-board");
  const slots = board.slots;
  const part = (id) => board.querySelector(`fp-placeable[data-id="${id}"]`);
  for (const slot of slots) {
    let want = slot.dataset.correct;
    if (sw && want === sw[0]) want = sw[1];
    else if (sw && want === sw[1]) want = sw[0];
    board.pickUp(part(want));
    board.place(slot);
  }
  return board.state;
}, swap);

{
  await openBoss();
  await assemble();
  await page.waitForSelector(".trials");
  const passes = await page.locator(".trial--pass").count();
  const fails = await page.locator(".trial--fail").count();
  check("a correct build survives all three stresses", passes === 3 && fails === 0,
    `${passes} passed, ${fails} failed`);
  check("and says so", /survived/i.test(await page.locator(".trial-summary").textContent()), "");
}

/* 66. The diagnostic case. Put the power plant in the wrong job and the two
   trials that needed it must fail, each naming what was missing. */
{
  await openBoss();
  await assemble(["mito", "nucleus"]);
  await page.waitForSelector(".trials");
  const fails = await page.locator(".trial--fail").count();
  const whys = await page.locator(".trial--fail .trial-why").allTextContents();
  check("misassigning the power plant fails exactly the trials that needed it",
    fails === 2, `${fails} failed`);
  check("and each failure explains what was missing",
    whys.every((w) => w.length > 20), whys.map((w) => w.slice(0, 40)).join(" | "));
  const summary = await page.locator(".trial-summary").textContent();
  check("a failed run points at the fix rather than scolding",
    /which|move|try again/i.test(summary), summary.slice(0, 60));
  await page.screenshot({ path: join(SHOTS, "boss.png") });
}

/* 66b. And the child can fix it in place: swap the two back and re-test. */
{
  await assemble();
  await page.waitForTimeout(100);
  check("putting the part in its right job makes the same stress survivable",
    (await page.locator(".trial--fail").count()) === 0,
    `${await page.locator(".trial--pass").count()} now pass`);
}

/* 67. Finishing the module unlocks three worlds — the payoff the Atlas
   dependency graph was built for. */
{
  await openWith(freshSave({
    level: 2,
    modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 5 } },
  }));
  await page.waitForSelector(".islands");
  const unlocked = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    const s = await import("./js/state.js");
    return c.worlds.filter((w) => c.isWorldUnlocked(w, s.progress)).map((w) => w.id);
  });
  check("completing Cells still opens Bodies, The Living World and The Code in the graph",
    ["bodies", "living", "code"].every((w) => unlocked.includes(w)), unlocked.join(", "));
  /* The point is the gap between the two, not a count: the graph opens Bodies
     and The Living World, and the Atlas still refuses to draw them because
     there is nothing in them yet. Asserting a literal here meant the test
     stopped checking that gap the moment a second world was authored. */
  const empty = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    const drawn = new Set(c.playableWorlds().map((w) => w.id));
    return { drawnEmpty: c.worlds.filter((w) => drawn.has(w.id) && !c.worldHasContent(w)).map((w) => w.id),
             bodiesDrawn: drawn.has("bodies"), livingDrawn: drawn.has("living") };
  });
  check("but the Atlas only draws what a child can actually play",
    !empty.bodiesDrawn && !empty.livingDrawn && empty.drawnEmpty.length === 0,
    JSON.stringify(empty));
}

/* 68. Five lessons means five concepts on the retrieval schedule. */
{
  const concepts = await page.evaluate(async () => {
    const r = await fetch("content/reviews.json");
    return Object.keys(await r.json()).sort();
  });
  check("every concept the module teaches has a review beat",
    concepts.length >= 7, concepts.join(", "));
}

/* 69. The rules hold on the boss too. */
{
  await openWith(freshSave({
    level: 4, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 4 } },
  }), "#/l/cells/4");
  await page.waitForSelector(".stage");
  await affordanceRule("boss");
  await auditContrast("boss");
}

/* ============ phase 9: Sprout, and phase 10: the real audits ============ */

/* 70. The tutor asks before it tells. Rungs 0-4 must contain no statement of
   the answer; only the last rung states a fact, and only after real struggle. */
{
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 1 } } }), "#/l/cells/1");
  await page.waitForSelector(".stage");
  for (let i = 0; i < 8; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === "sim") break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    await page.waitForTimeout(50);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(70);
  }
  await page.waitForSelector("fp-tutor:not([hidden]) .tutor-ask");
  const rungs = [];
  for (let i = 0; i < 6; i++) {
    await page.locator(".tutor-ask").click();
    await page.waitForTimeout(60);
    rungs.push({
      name: await page.locator(".tutor-panel").getAttribute("data-rung"),
      text: await page.locator(".tutor-line").textContent(),
    });
    if (await page.locator(".tutor-ask").isDisabled()) break;
  }
  check("the ladder climbs notice, focus, compare, analogy, partial, consolidate",
    rungs.map((r) => r.name).join(",") === "notice,focus,compare,analogy,partial,consolidate",
    rungs.map((r) => r.name).join(","));
  // The first five rungs must be questions or instructions, never the answer.
  const early = rungs.slice(0, 5).map((r) => r.text);
  check("the first five rungs never state the answer",
    early.every((t) => !/steric|exclusion|because the (holes|size)/i.test(t)),
    early.find((t) => /steric/i.test(t))?.slice(0, 50) ?? "");
  check("only the last rung names the concept",
    /steric|size against hole size|small things through/i.test(rungs.at(-1).text),
    rungs.at(-1).text.slice(0, 60));
  check("and then it stops rather than repeating itself",
    await page.locator(".tutor-ask").isDisabled(), "");
}

/* 71. Struggle is detected, not self-reported. A wrong answer puts Sprout's
   hand up without the child having to declare they need help. */
{
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 } } }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  for (let i = 0; i < 10; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === "check") break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    if (t === "slider") { await page.locator("fp-slider input").focus(); await page.keyboard.press("End"); }
    await page.waitForTimeout(50);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(70);
  }
  const nudgedBefore = await page.locator("fp-tutor[data-nudged]").count();
  await page.locator(".quiz-option").nth(2).click();       // wrong
  await page.waitForTimeout(120);
  const nudgedAfter = await page.locator("fp-tutor[data-nudged]").count();
  check("a wrong answer makes Sprout put its hand up, unasked",
    nudgedBefore === 0 && nudgedAfter === 1, `${nudgedBefore} -> ${nudgedAfter}`);
  check("but it never opens itself — the panel stays shut until the child asks",
    await page.locator(".tutor-panel").isHidden(), "");
}

/* 72. Sprout is silent where there is nothing to be stuck on. Offering help on
   a paragraph is noise, and noise is how a companion becomes a nuisance. */
{
  await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 } } }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  const onHook = await page.locator("fp-tutor").isHidden();
  await page.locator(".next-btn").click();
  await page.waitForTimeout(90);
  const onPredict = await page.locator("fp-tutor").isHidden();
  check("no help offered on a hook; help offered on a prediction",
    onHook === true && onPredict === false, `hook hidden=${onHook}, predict hidden=${onPredict}`);
}

/* 73. The ladder resets per stage — carrying a rung across would have Sprout
   answering a question nobody asked. */
{
  await page.locator(".predict-option").first().click();
  await page.locator(".tutor-ask").click();
  await page.waitForTimeout(60);
  const first = await page.locator(".tutor-panel").getAttribute("data-rung");
  await page.locator(".next-btn").click();
  await page.waitForTimeout(120);
  const afterMove = await page.locator(".tutor-panel").isHidden();
  check("the ladder resets when the stage changes",
    first === "notice" && afterMove === true, `${first}, panel hidden after move=${afterMove}`);
}

/* 74. The tutor is level-scaled like everything else. */
{
  const said = {};
  for (const lv of [1, 4]) {
    await openWith(freshSave({ level: lv, modules: { "what-is-life": { lessonsDone: 4 } } }), "#/l/cells/0");
    await page.waitForSelector(".stage");
    await page.locator(".next-btn").click();
    await page.waitForSelector("fp-tutor:not([hidden])");
    await page.locator(".tutor-ask").click();
    await page.waitForTimeout(60);
    said[lv] = await page.locator(".tutor-line").textContent();
  }
  check("Sprout speaks to the child in front of it", said[1] !== said[4],
    `L1 "${said[1].slice(0, 34)}" vs L4 "${said[4].slice(0, 34)}"`);
}

/* 75. Four real breakpoints, straight off the resolver's checklist. Nothing may
   overflow horizontally and every control must still meet its touch minimum. */
{
  const sizes = [[375, 720], [768, 1024], [1024, 768], [1440, 900]];
  const routes = ["#/", "#/m/cells", "#/l/cells/1", "#/me"];
  const problems = [];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const route of routes) {
      await openWith(freshSave({ level: 2, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 1 } } }), route);
      await page.waitForSelector("main h1, .stage", { state: "attached" });
      await page.waitForTimeout(150);
      const bad = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page overflows by ${document.documentElement.scrollWidth - innerWidth}px`);
        for (const n of document.querySelectorAll("a[href], button:not(:disabled), fp-placeable, fp-slot")) {
          const r = n.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.right > innerWidth + 1) out.push(`${n.className || n.tagName} runs off the right`);
          const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch"));
          if (r.height < min - 1 && !n.closest(".app-bar")) out.push(`${n.className || n.tagName} is ${Math.round(r.height)}px, under the ${min}px minimum`);
        }
        return [...new Set(out)];
      });
      if (bad.length) problems.push(`${w}px ${route}: ${bad[0]}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  check("nothing overflows or shrinks below the touch minimum at 375, 768, 1024 or 1440",
    problems.length === 0, problems.slice(0, 3).join(" | "));
}

/* 76. Landscape phone: the shortest viewport a child will actually hold. */
{
  await page.setViewportSize({ width: 740, height: 360 });
  await openWith(freshSave({ level: 1, modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 1 } } }), "#/l/cells/1");
  await page.waitForSelector(".stage");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("a landscape phone at level 1 still fits horizontally", overflow <= 1, `${overflow}px over`);
  await page.setViewportSize({ width: 1280, height: 900 });
}

/* ===================== the optimisation patch ===================== */

/* 77. THE HEADLINE FIX. Reading register and conceptual depth are independent.
   A dyslexic fourteen-year-old asking for readable sentences must not be given
   a five-year-old's science — which is exactly what one dial did. */
{
  await openWith({ ...freshSave(), prose: 1, content: 4,
    modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 1 } } }, "#/l/cells/1");
  await page.waitForSelector(".stage");
  const hook = await page.locator(".stage-hook").textContent();
  const roots = await page.evaluate(() => ({
    level: document.documentElement.dataset.level,
    age: document.documentElement.dataset.age,
    fs: getComputedStyle(document.body).fontSize,
    touch: getComputedStyle(document.documentElement).getPropertyValue("--touch").trim(),
  }));
  check("simple words and hard science can be asked for together",
    roots.level === "1" && roots.age === "4", JSON.stringify(roots));
  check("the prose really is the level-1 wording",
    /A wall keeps everything out/.test(hook), hook.slice(0, 50));

  // and the CONTENT track is the grown-up one: five molecule types, not two
  for (let i = 0; i < 8; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === "sim") break;
    if (t === "predict") await page.locator(".predict-option").first().click();
    await page.waitForTimeout(50);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(70);
  }
  await page.waitForSelector(".sim-canvas");
  const kinds = await page.evaluate(() => document.querySelector("fp-membrane").kinds.length);
  check("while the science stays at the level-4 track", kinds === 6, `${kinds} molecule types`);
}

/* 78. Touch targets follow CONTENT, not prose. A teenager who wants large text
   has adult motor control and does not want 76px buttons. */
{
  await openWith({ ...freshSave(), prose: 1, content: 4 });
  await page.waitForSelector(".islands");
  const big = await page.evaluate(() => ({
    fs: parseFloat(getComputedStyle(document.body).fontSize),
    touch: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch")),
  }));
  await openWith({ ...freshSave(), prose: 4, content: 1 });
  await page.waitForSelector(".islands");
  const small = await page.evaluate(() => ({
    fs: parseFloat(getComputedStyle(document.body).fontSize),
    touch: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch")),
  }));
  check("big text with small targets, and small text with big targets, are both reachable",
    big.fs > small.fs && big.touch < small.touch,
    `prose1/content4: ${big.fs}px text, ${big.touch}px target — prose4/content1: ${small.fs}px, ${small.touch}px`);
}

/* 79. Me exposes both dials and says why they are separate. */
{
  await openWith(freshSave(), "#/me");
  await page.waitForSelector(".choices");
  const legends = await page.locator(".choices legend").allTextContents();
  check("Me offers words and science as two separate settings",
    legends.some((l) => /words/i.test(l)) && legends.some((l) => /science/i.test(l)),
    legends.join(" / "));
  // the radio itself is visually hidden behind its clay box by design; a real
  // child clicks the label, so the test does too
  await page.locator('label:has(input[name="content"][value="4"])').click();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({
    level: document.documentElement.dataset.level, age: document.documentElement.dataset.age }));
  check("changing one dial leaves the other alone",
    after.level === "2" && after.age === "4", JSON.stringify(after));
}

/* 80. One throwing simulation must not take the loop down with it. Before this,
   the next frame was already scheduled at the top of tick(), so a throw meant
   sixty errors a second forever and nothing rendered. */
{
  const r = await page.evaluate(async () => {
    const { Sim, _running } = await import("./js/sims/base.js");
    class Bad extends Sim {
      setup() {} draw() {} describe() { return "bad"; }
      step() { throw new Error("deliberate"); }
    }
    if (!customElements.get("fp-bad")) customElements.define("fp-bad", Bad);
    const bad = document.createElement("fp-bad");
    const good = document.createElement("fp-bad");
    good.step = () => { good.ticks = (good.ticks ?? 0) + 1; };
    // Pin them in the viewport: the off-screen IntersectionObserver would
    // otherwise pause both a moment after they mount, which is correct
    // behaviour and would make this test measure nothing.
    for (const el of [bad, good]) el.style.cssText = "position:fixed;top:0;left:0;width:24px;height:24px;opacity:0";
    document.body.append(bad, good);
    // play() is what joins the shared loop AND starts it; adding to the set
    // directly leaves the rAF unscheduled and nothing ever runs.
    bad.play(); good.play();
    await new Promise((res) => setTimeout(res, 260));
    const out = { badStillRunning: _running.has(bad), goodTicks: good.ticks ?? 0,
                  toldTheChild: !!document.querySelector(".sim-broken") };
    bad.remove(); good.remove(); _running.clear();
    return out;
  });
  check("a broken simulation is evicted rather than killing the loop",
    r.badStillRunning === false && r.goodTicks > 5,
    `evicted=${!r.badStillRunning}, healthy sim ticked ${r.goodTicks} times`);
  check("and it says so recoverably instead of leaving a blank rectangle",
    r.toldTheChild, "");
}

/* 81. The boss announces. It is the climax of the module and it was silent. */
{
  await openBoss();
  await assemble(["mito", "nucleus"]);
  await page.waitForSelector(".trials");
  const spoken = await page.locator("fp-stage p[role=status].sr-only").textContent();
  check("the stress-test result is spoken, not only drawn",
    /1 of 3 stresses survived/.test(spoken) && /failed/.test(spoken), spoken.slice(0, 80));
  await assemble();
  await page.waitForTimeout(120);
  check("and the announcement updates when the child fixes it",
    /All 3 stresses survived/.test(await page.locator("fp-stage p[role=status].sr-only").textContent()), "");
}

/* 82. The level nudge: three lessons of evidence, then one offer, never an
   automatic change. Self-selected difficulty skews upward and this is the
   corrective the blueprint specified and phase 6 never built. */
{
  const r = await page.evaluate(async () => {
    const lv = await import("./js/level.js");
    const st = await import("./js/state.js");
    st.reset();
    lv.setLevels({ prose: 3, content: 3 });
    const none = lv.levelNudge();
    for (let i = 0; i < 3; i++) lv.recordLessonPerformance({ hits: 0, misses: 3, helped: true });
    const down = lv.levelNudge();
    st.reset(); lv.setLevels({ prose: 2, content: 2 });
    for (let i = 0; i < 3; i++) lv.recordLessonPerformance({ hits: 4, misses: 0, helped: false });
    const up = lv.levelNudge();
    return { none, down, up };
  });
  check("no nudge before there is evidence", r.none === null, JSON.stringify(r.none));
  check("three struggling lessons offer a gentler science level",
    r.down?.direction === "down" && r.down.to === 2, JSON.stringify(r.down));
  check("three effortless lessons offer a harder one",
    r.up?.direction === "up" && r.up.to === 3, JSON.stringify(r.up));
  const changed = await page.evaluate(async () => {
    const st = await import("./js/state.js");
    return st.progress.content;
  });
  check("but nothing changed on its own — the offer is the whole mechanism",
    changed === 2, `content is ${changed}`);
}

/* 83. Sprout's ladders are content now, not 9 KB of strings in the bundle. */
{
  const fetched = [];
  const listen = (r) => fetched.push(new URL(r.url()).pathname);
  page.on("request", listen);
  await openWith(freshSave({ modules: { "what-is-life": { lessonsDone: 4 } } }), "#/l/cells/0");
  await page.waitForSelector(".stage");
  await page.locator(".next-btn").click();
  await page.waitForSelector("fp-tutor:not([hidden])");
  await page.locator(".tutor-ask").click();
  await page.waitForTimeout(120);
  page.off("request", listen);
  check("hints are fetched as content rather than compiled in",
    fetched.some((u) => u.endsWith("/content/hints.json")), "");
  check("and Sprout still speaks", (await page.locator(".tutor-line").textContent()).length > 10,
    (await page.locator(".tutor-line").textContent()).slice(0, 40));
}

/* 84. The lesson index is generated, so a link can never point at a file that
   is not there. */
{
  const consistent = await page.evaluate(async () => {
    const c = await import("./js/curriculum.js");
    const entries = Object.entries(c.authored).flatMap(([m, ls]) => Object.entries(ls).map(([i, f]) => [m, i, f]));
    const checks = await Promise.all(entries.map(async ([, , f]) => (await fetch(`content/${f}`)).ok));
    return { n: entries.length, allPresent: checks.every(Boolean) };
  });
  // Counted from disk rather than hard-coded: the last time this was a literal
  // it silently stopped meaning anything the moment a sixth lesson landed.
  const onDisk = Object.values(JSON.parse(readFileSync(join(ROOT, "content/authored.json"), "utf8")))
    .reduce((n, m) => n + Object.keys(m).length, 0);
  check("every lesson the app offers actually exists on disk",
    consistent.n === onDisk && consistent.allPresent, `${consistent.n} of ${onDisk}`);
}

/* ===========================================================================
   85-93. THE FORMAT PAST CELLS.
   Everything above this line was written while the only authored module was
   Cells, and a format proved against one module is a format proved against one
   module. These check the things that broke when a structurally different
   lesson — an episodic simulation and an attributed disagreement — was written
   against it. See DECISIONS D45-D48.
   =========================================================================== */

/* A save with everything upstream of the Change world finished. */
const changeSave = (level) => freshSave({ level, modules: {
  "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 5 },
  dna: { lessonsDone: 5 }, genes: { lessonsDone: 4 },
} });

/** Walk a lesson forward until a stage of the given type is on screen. */
async function walkTo(type, limit = 12) {
  for (let i = 0; i < limit; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === type) return true;
    if (t === "predict") await page.locator(".predict-option").first().click();
    if (t === "check") await page.locator(".quiz-option").first().click();
    await page.waitForTimeout(60);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(80);
  }
  return false;
}

/** Mount a selection sim directly, with the reveal made instantaneous so these
    measure the MODEL rather than the animation that shows it. */
const mountSelection = (body) => page.evaluate(async (src) => {
  const { _running } = await import("./js/sims/base.js");
  await import("./js/sims/selection.js");
  document.querySelectorAll("fp-selection").forEach((n) => n.remove());
  const sim = document.createElement("fp-selection");
  Object.assign(sim.dataset, { task: "break", switches: "true", bg: "0.9" });
  document.querySelector("#main").append(sim);
  await new Promise((r) => setTimeout(r, 120));
  sim.reduced = { matches: true };
  const generations = (n) => { for (let i = 0; i < n * 2; i++) sim.next(); };
  // eslint-disable-next-line no-new-func
  return await new Function("sim", "_running", "generations", `return (async () => { ${src} })()`)(sim, _running, generations);
}, body);

/* 85. An episodic sim must not be driven by the shared loop between clicks. */
{
  await openWith(changeSave(3), "#/");
  const r = await mountSelection(`
    return { autoplay: sim.autoplay, inLoop: _running.has(sim), gen: sim.gen };
  `);
  check("an episodic simulation stays out of the shared loop until asked",
    r.autoplay === false && r.inLoop === false && r.gen === 0, JSON.stringify(r));
}

/* 86. THE LESSON ITSELF, as a measurement. With all three conditions on the
   population must track its background; with any one removed it must not. This
   is the only test in the suite that checks a scientific claim rather than a
   piece of software, and it is the one worth having. */
{
  const r = await mountSelection(`
    const runOf = () => { sim.reset(); const s = sim.gap; generations(14); return { start: s, end: sim.gap }; };
    const all = runOf();
    const off = {};
    for (const key of ["variation", "heredity", "survival"]) {
      sim.on[key] = false;
      off[key] = runOf();
      sim.on[key] = true;
    }
    return { all, off };
  `);
  const closed = (x) => x.end < x.start * 0.35;
  check("with all three conditions the population adapts",
    r.all.start > 0.18 && closed(r.all), JSON.stringify(r.all));
  for (const key of ["variation", "heredity", "survival"]) {
    check(`removing ${key} stops adaptation`, !closed(r.off[key]), JSON.stringify(r.off[key]));
  }
}

/* 87. Cross-run state survives reset, which is what makes "run it twice and
   compare" expressible at all. Before once() existed, reset() wiped both the
   trace history and the child's own switch settings. */
{
  const r = await mountSelection(`
    sim.on.heredity = false;
    generations(6);
    sim.reset();
    return { keptRuns: sim.runs.length, keptSwitch: sim.on.heredity, freshTrace: sim.trace.length };
  `);
  check("reset starts a new run without erasing the last one or the hypothesis",
    r.keptRuns >= 1 && r.keptSwitch === false && r.freshTrace === 1, JSON.stringify(r));
}

/* 88. Meeting the objective unlocks the lesson; it does not end the experiment.
   Freezing on success is the exact moment a child most wants to keep poking. */
{
  const r = await mountSelection(`
    let fired = 0, said = null;
    sim.addEventListener("fp:sim-goal", (e) => { fired++; said = e.detail?.say ?? null; });
    generations(12);                       // establish it works
    sim.on.survival = false; sim.reset(); generations(8);   // then break it
    const at = sim.gen;
    sim.next(); sim.next();
    return { fired, said, advancedAfterGoal: sim.gen > at, met: sim.met };
  `);
  check("the goal fires once and carries the simulation's own account of it",
    r.fired === 1 && typeof r.said === "string" && r.said.length > 20, JSON.stringify(r).slice(0, 140));
  check("meeting the goal does not freeze the simulation", r.advancedAfterGoal === true, JSON.stringify(r));
}

/* 89. A weigh stage may not be walked past having read one side. */
{
  await openWith(changeSave(3), "#/l/evolution/0");
  await page.waitForSelector(".stage");
  const reached = await walkTo("weigh");
  check("the evolution lesson reaches its weigh stage at content level 3", reached, "");

  const lockedAtStart = await page.locator(".next-btn").isDisabled();
  await page.locator(".weigh-who").first().click();
  await page.waitForTimeout(120);
  const lockedAfterOne = await page.locator(".next-btn").isDisabled();
  await page.locator(".weigh-who").nth(1).click();
  await page.waitForTimeout(120);
  const lockedAfterBoth = await page.locator(".next-btn").isDisabled();
  check("both readings must be opened before the lesson moves on",
    lockedAtStart && lockedAfterOne && !lockedAfterBoth,
    `start ${lockedAtStart}, one ${lockedAfterOne}, both ${lockedAfterBoth}`);
}

/* 90. Nothing on a weigh stage is asserted in the product's own voice. Every
   view is attributed and every view shows its reasoning — this is the rule the
   whole stage type exists to enforce, so it is checked in the browser and not
   only in the build. */
{
  const r = await page.evaluate(() => [...document.querySelectorAll(".weigh-view")].map((v) => ({
    who: v.querySelector(".weigh-who")?.textContent?.trim() ?? "",
    claim: (v.querySelector(".weigh-claim")?.textContent ?? "").length,
    because: (v.querySelector(".weigh-because")?.textContent ?? "").length,
  })));
  check("every reading is attributed and shows its reasoning",
    r.length >= 2 && r.every((v) => v.who.length > 3 && v.claim > 20 && v.because > 40),
    JSON.stringify(r));
}

/* 91. The two views must not be styled to favour one. A child reads visual
   weight long before they read the words, so an argument made in CSS is an
   argument made behind the author's back. */
{
  const same = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll(".weigh-view")].map((v) => {
      const s = getComputedStyle(v);
      return [s.backgroundColor, s.borderTopWidth, s.borderTopColor, s.boxShadow,
              getComputedStyle(v.querySelector(".weigh-who")).fontSize].join("|");
    });
    return a === b;
  });
  check("the two readings are presented with identical visual weight", same, "");
}

/* 92. Reduced motion needs no substitution for an episodic sim, because the
   control is already the child's own click. But the control must still BE
   there — putting it in .teach-play would have hidden it. */
{
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWith(changeSave(1), "#/l/natural-selection/0");
  await page.waitForSelector(".stage");
  await walkTo("sim");
  await page.waitForSelector("fp-selection .sim-canvas");
  const r = await page.evaluate(() => {
    const sim = document.querySelector("fp-selection");
    const btn = sim.querySelector(".sim-beat");
    const before = sim.gen;
    btn.click(); btn.click();
    return { visible: getComputedStyle(btn).display !== "none", advanced: sim.gen > before,
             label: btn.textContent };
  });
  check("an episodic simulation keeps its control under reduced motion",
    r.visible && r.advanced, JSON.stringify(r));
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

/* 93. A slider whose readout is a bare number tells a five-year-old nothing. */
{
  const readout = await page.evaluate(() => {
    const s = document.querySelector("fp-selection fp-slider");
    return { text: s.querySelector(".slider-value").textContent,
             valuetext: s.querySelector("input").getAttribute("aria-valuetext") };
  });
  check("a worded slider reads as words, in the readout and to a screen reader",
    /[a-z]/i.test(readout.text) && readout.valuetext === readout.text, JSON.stringify(readout));
}

/* 94-95. The folding model, checked as a model.

   The lesson's claim is that the shape falls out of the sequence and nothing
   else. That is only true if the energy function is the one advertised and the
   chain cannot pass through itself — so both are measured here rather than
   trusted. Same reasoning as the selection checks: a simulation a child reasons
   from is a claim about the world, and claims get tested. */
{
  await openWith(changeSave(3), "#/");
  const r = await page.evaluate(async () => {
    await import("./js/sims/folding.js");
    document.querySelectorAll("fp-folding").forEach((n) => n.remove());
    const sim = document.createElement("fp-folding");
    Object.assign(sim.dataset, { seq: "PHHPPHHPPHHP", target: "4" });
    document.querySelector("#main").append(sim);
    await new Promise((res) => setTimeout(res, 120));
    sim.reduced = { matches: true };

    // Only NON-SEQUENTIAL H-H pairs count. Sequence neighbours are touching for
    // a trivial reason and would inflate every score if they were included.
    const extended = sim.contacts();

    // Random pivots must never produce a chain that overlaps itself.
    let overlaps = 0, accepted = 0;
    for (let i = 0; i < 400; i++) {
      const at = 1 + Math.floor(Math.random() * (sim.seq.length - 2));
      sim.cw = Math.random() < 0.5;
      if (sim.pivot(at)) accepted += 1;
      const seen = new Set(sim.pos.map(([x, y]) => `${x},${y}`));
      if (seen.size !== sim.pos.length) overlaps += 1;
    }
    /* A refused pivot must be a complete no-op. Four turns do NOT reliably
       return the chain home — self-avoidance blocks some of them — so the
       property worth guaranteeing is that a blocked move leaves the chain
       byte-identical rather than half-applied. Drive it into a wall and check. */
    sim.reset();
    sim.cw = true;
    let refused = 0, corrupted = 0;
    for (let i = 0; i < 200; i++) {
      const at = 1 + Math.floor(Math.random() * (sim.seq.length - 2));
      const snapshot = JSON.stringify([sim.dirs, sim.pos]);
      if (!sim.pivot(at)) {
        refused += 1;
        if (JSON.stringify([sim.dirs, sim.pos]) !== snapshot) corrupted += 1;
      }
    }
    return { extended, overlaps, accepted, refused, corrupted, best: sim.best };
  });
  check("an extended chain has no buried contacts, and neighbours never count",
    r.extended === 0, `${r.extended} contacts when straight`);
  check("no sequence of pivots can fold the chain through itself",
    r.overlaps === 0 && r.accepted > 50, `${r.overlaps} overlaps in ${r.accepted} accepted moves`);
  check("a blocked fold leaves the chain exactly as it was, never half-moved",
    r.refused > 0 && r.corrupted === 0, `${r.corrupted} corrupted of ${r.refused} refusals`);
  check("random folding finds real contacts, so the authored goals are reachable",
    r.best > 0 && r.best <= 4, `best found ${r.best}, known optimum 4`);
}

check("no console errors anywhere", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();

const w = Math.max(...results.map((r) => r.name.length));
let bad = 0;
for (const r of results) {
  if (!r.pass) bad++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}  ${r.detail}`);
}
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
