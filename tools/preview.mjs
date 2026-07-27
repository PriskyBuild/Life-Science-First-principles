/* Screenshot the product for a human to look at. Not a test — verify.mjs is the
   test. This exists because "186/186 passed" tells you nothing about whether a
   child would want to touch it. Run: node tools/preview.mjs */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mkdirSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = join(ROOT, "shots/preview");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("nope"); }
});
mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(8098, r));
const BASE = "http://localhost:8098/";

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

const shots = [];
async function shoot(page, name, caption) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push({ name, caption, file });
  console.log("  •", name);
}

const save = (over = {}) => ({
  version: 2, prose: 2, content: 2, xp: 0, modules: {}, concepts: {},
  specimens: [], ledger: [], recent: [], prefs: {}, ...over,
});
const DONE_TO_CHANGE = {
  "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 5 },
  dna: { lessonsDone: 5 }, genes: { lessonsDone: 4 },
};

async function open(page, s, hash = "") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((v) => localStorage.setItem("fp.progress", JSON.stringify(v)), s);
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(350);
}

/** Step a lesson forward until a stage of the given type is showing. */
async function walkTo(page, type, limit = 14) {
  for (let i = 0; i < limit; i++) {
    const t = await page.locator(".stage").getAttribute("data-type");
    if (t === type) return true;
    if (t === "predict") await page.locator(".predict-option").first().click();
    if (t === "check") await page.locator(".quiz-option").first().click();
    await page.waitForTimeout(80);
    await page.locator(".next-btn").click();
    await page.waitForTimeout(120);
  }
  return false;
}

/* ---------------------------------------------------------------- phone */
{
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await open(page, save({ prose: null, content: null }));
  await shoot(page, "01-picker", "Cold start. Four reading samples, not four age labels — a child picks the one that feels right to read.");

  await open(page, save({ modules: { "what-is-life": { lessonsDone: 4 }, cells: { lessonsDone: 2 } } }));
  await shoot(page, "02-atlas", "The Atlas. Only worlds with a playable route are drawn; the rest are named honestly below rather than shown as locked doors.");

  await open(page, save({ modules: DONE_TO_CHANGE }), "#/m/natural-selection");
  await shoot(page, "03-module", "A module. Written lessons are raised and tappable; unwritten ones are flat and dashed — the affordance rule does the honesty.");

  // The beetle simulation, guided track, part-way through a run.
  await open(page, save({ prose: 2, content: 2, modules: DONE_TO_CHANGE }), "#/l/natural-selection/0");
  await page.waitForSelector(".stage");
  await walkTo(page, "sim");
  await page.waitForSelector("fp-selection .sim-canvas");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sim = document.querySelector("fp-selection");
    sim.reduced = { matches: true };
    for (let i = 0; i < 9; i++) { sim.next(); sim.next(); }
    sim.next();                     // leave it mid-hunt, so the eaten are marked
  });
  await page.waitForTimeout(250);
  await shoot(page, "04-selection-l2", "Natural selection, guided track. The beetles now match the ground and not one of them ever changed colour. The trace underneath is the population mean walking to the dashed background line.");

  await open(page, save({ prose: 1, content: 1, modules: DONE_TO_CHANGE }), "#/l/natural-selection/0");
  await page.waitForSelector(".stage");
  await shoot(page, "05-hook-l1", "The same lesson's hook at level 1. Not a translation of the level-4 sentence — a different, shorter sentence about less.");

  await ctx.close();
}

/* -------------------------------------------------------------- desktop */
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Open track: the three conditions on switches.
  await open(page, save({ prose: 3, content: 3, modules: DONE_TO_CHANGE }), "#/l/natural-selection/0");
  await page.waitForSelector(".stage");
  await walkTo(page, "sim");
  await page.waitForSelector("fp-selection .sim-canvas");
  await page.evaluate(() => {
    const sim = document.querySelector("fp-selection");
    sim.reduced = { matches: true };
    for (let i = 0; i < 10; i++) { sim.next(); sim.next(); }   // establish it works
    sim.on.heredity = false; sim.reset();
    for (let i = 0; i < 8; i++) { sim.next(); sim.next(); }    // then break it
  });
  await page.waitForTimeout(400);
  await shoot(page, "06-selection-switches", "Open track, level 3. Heredity switched off: the same beetles still get eaten and the line goes flat. The faint line behind is the previous run, when it worked.");

  // The weigh stage, both readings open.
  await open(page, save({ prose: 3, content: 3, modules: DONE_TO_CHANGE }), "#/l/evolution/2");
  await page.waitForSelector(".stage");
  await walkTo(page, "weigh");
  await page.locator(".weigh-who").first().click();
  await page.waitForTimeout(150);
  await page.locator(".weigh-who").nth(1).click();
  await page.waitForTimeout(250);
  await shoot(page, "07-weigh", "The weigh stage. Both readings attributed, both showing their actual reasoning and what each expects to find, styled identically — and neither is the page's own voice.");

  await open(page, save({ prose: 2, content: 2, specimens: ["membrane", "mitochondrion", "pale-beetle"],
    modules: DONE_TO_CHANGE }), "#/me");
  await page.waitForSelector(".specimens");
  await shoot(page, "08-me", "Me. Specimens are parts you build with later, not stickers — and the empty slots are visible, which is what makes it a collection.");

  await open(page, save({ prose: 3, content: 3, prefs: { theme: "dark" }, modules: DONE_TO_CHANGE }));
  await shoot(page, "09-atlas-dark", "Dark mode. Shadows are fixed values rather than derived from the ink colour — deriving them painted pale halos under every card.");

  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${shots.length} shots -> shots/preview/`);
console.log(JSON.stringify(shots.map(({ name, caption }) => ({ name, caption })), null, 1));
