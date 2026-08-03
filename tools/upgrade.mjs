/* DOES A DEPLOY REACH THE CHILD?

   Every other test in this project installs the service worker once, on one
   build, and asks whether the app works. That is a fresh install. It is not what
   a returning visitor does, and the difference had never been measured.

   What a returning visitor does is arrive with an OLD build in the cache and a
   NEW one on the server. Measured on the real thing — the broken review card in
   the cache, the fix on the server — the fix arrived on the THIRD page load. The
   first two showed the previous version with nothing on screen to say why. The
   owner reported a bug, the fix shipped, and he opened the site and saw the bug,
   which is indistinguishable from the fix never having shipped. (D80)

   So: build the tree twice, serve the first, let the worker take hold, swap the
   directory underneath it, and assert the new one arrives on the FIRST return.
   Two trees is why this is its own tool rather than a check inside verify.mjs. */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, cp, rm, mkdtemp } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

/* Two copies of what is committed. The second gets one visible change and a new
   cache version, which is exactly what any real deploy is. */
const base = await mkdtemp(join(tmpdir(), "fp-upgrade-"));
const before = join(base, "before");
const after = join(base, "after");
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
for (const dir of [before, after]) {
  for (const f of tracked) {
    await cp(join(ROOT, f), join(dir, f), { recursive: true }).catch(() => {});
  }
}
{
  const css = join(after, "css/app.css");
  const s = readFileSync(css, "utf8");
  const anchor = ".review-call { margin-bottom: var(--s-6); }";
  if (!s.includes(anchor)) { console.error("upgrade: anchor rule missing from css/app.css"); process.exit(1); }
  writeFileSync(css, s.replace(anchor, `${anchor}\n.review-call { outline: 4px solid rgb(255,0,255); }`));
  const sw = join(after, "sw.js");
  writeFileSync(sw, readFileSync(sw, "utf8").replace(/const VERSION = "[^"]*";/, 'const VERSION = "next-deploy";'));
}

let serving = before;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = createServer(async (q, r) => {
  const p = decodeURIComponent(q.url.split("?")[0]);
  const f = join(serving, p === "/" ? "index.html" : p);
  try {
    const body = await readFile(f);
    const headers = { "content-type": TYPES[extname(f)] ?? "application/octet-stream" };
    // as vercel.json sets them, so the test is testing the real delivery rules
    if (/sw\.js$|index\.html$/.test(f)) headers["cache-control"] = "no-cache, no-store, must-revalidate";
    r.writeHead(200, headers); r.end(body);
  } catch { r.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(8100, r));
const BASE = "http://localhost:8100/";

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const overdue = {};
for (const c of ["form-follows-constraint", "surface-area-to-volume", "locomotion-tradeoffs"]) {
  overdue[c] = { step: 0, ease: 1, reps: 1, lapses: 0, due: Date.now() - 864e5, lastGrade: 1 };
}

/* 1. A child arrives, and the worker takes hold. */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate((o) => localStorage.setItem("fp.progress", JSON.stringify({
  version: 2, prose: 2, content: 2, xp: 0, modules: {}, concepts: o,
  specimens: [], ledger: [], recent: [], prefs: { greeted: "1" },
})), overdue);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".review-call");
const controlled = await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
  null, { timeout: 10000 }).then(() => true).catch(() => false);
check("a first visit leaves a service worker in control", controlled);
await page.waitForTimeout(1000);

/* 2. A deploy happens. */
serving = after;

/* 3. The child comes back — ONCE. */
await page.goto(BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(3000);                   // the update reloads the page under us
await page.waitForSelector(".review-call", { timeout: 10000 }).catch(() => {});
const arrived = await page.evaluate(() =>
  getComputedStyle(document.querySelector(".review-call")).outlineColor);
check("a deploy reaches the child on the FIRST return visit", /255,\s*0,\s*255/.test(arrived),
  `outline is ${arrived} — a deploy that takes three visits reads as a fix that never shipped`);

/* 4. And it does not then reload forever. */
const reloads = await page.evaluate(() => performance.getEntriesByType("navigation").length);
await page.waitForTimeout(2500);
const stable = await page.evaluate(() =>
  getComputedStyle(document.querySelector(".review-call")).outlineColor);
check("and having arrived, it settles instead of reloading in a loop",
  /255,\s*0,\s*255/.test(stable) && reloads < 5, `${reloads} navigations`);

/* 5. Nothing has been cached that a child should not be downloading. */
{
  const list = JSON.parse(readFileSync(join(ROOT, "sw.js"), "utf8")
    .match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  const dev = list.filter((p) => /^tools\/|^docs\/|jsconfig|tsconfig|\.d\.ts$|package/.test(p));
  check("no dev tooling is precached onto a child's device", dev.length === 0, dev.join(", "));
}

await browser.close();
server.close();
await rm(base, { recursive: true, force: true });

let bad = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(62)} ${r.detail}`);
  if (!r.pass) bad++;
}
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
