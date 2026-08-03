/* TURN A DRAWING INTO OUR FORMAT.

   The bottleneck was never a library. It was that the drawings were authored by
   typing path coordinates, which is not how anybody draws. So: draw in whatever
   you like — Figma, Inkscape, Lorien with a tablet, Illustrator — export an SVG,
   and this converts it.

   WHAT IT HAS TO FIX, and why none of the drawing tools can do it themselves:
     · they emit concrete hex colours; we need roles that resolve against each
       world's palette, so a drawing inherits its hue and dark mode
     · they emit whatever coordinate space the artboard had; we need a 48-unit
       grid with a 4..44 safe area
     · they emit transforms, groups, clip paths and metadata; we need flat,
       absolute path data the build can check coordinate by coordinate
     · they have no opinion about how many paths is too many

   THE BROWSER IS THE PARSER. Playwright is already a dev dependency, and Chromium
   has a complete SVG implementation — so every shape type, every transform and
   every unit is handled by something that has been getting this right for twenty
   years, instead of by a regex. getPointAtLength() walks any geometry element the
   same way, which is why circles, rects, polylines and paths all come out as one
   kind of thing here.

   Usage:  node tools/import-art.mjs <module-id> <drawing.svg> [--dry]

   It writes into content/module-art.json and prints what it did. Nothing about
   this ships; it is a desk tool. (D85) */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [, , moduleId, svgPath, ...flags] = process.argv;
const DRY = flags.includes("--dry");

if (!moduleId || !svgPath) {
  console.error("usage: node tools/import-art.mjs <module-id> <drawing.svg> [--dry]");
  process.exit(1);
}
if (!existsSync(svgPath)) { console.error(`no such file: ${svgPath}`); process.exit(1); }

const known = new Set(JSON.parse(readFileSync(join(ROOT, "content/curriculum.json"), "utf8"))
  .worlds.flatMap((w) => w.modules.map((m) => m.id)));
if (!known.has(moduleId)) {
  console.error(`"${moduleId}" is not a module in content/curriculum.json`);
  process.exit(1);
}

/* ------------------------------------------------------------------ extract */

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await (await browser.newContext()).newPage();
await page.setContent(`<body style="margin:0">${readFileSync(svgPath, "utf8")}</body>`,
  { waitUntil: "load" });

const shapes = await page.evaluate(() => {
  const svg = document.querySelector("svg");
  if (!svg) return null;

  const lum = (css) => {
    const m = css.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    if (m.length > 3 && Number(m[3]) === 0) return null;          // transparent
    const [r, g, b] = m.slice(0, 3).map((n) => Number(n) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const out = [];
  for (const el of svg.querySelectorAll("path,circle,ellipse,rect,line,polyline,polygon")) {
    if (typeof el.getTotalLength !== "function") continue;
    const total = el.getTotalLength();
    if (!total) continue;

    /* One sample every 0.6 device units, capped. Dense enough that a tight curve
       keeps its shape, and RDP throws away everything that was not needed. */
    const n = Math.min(900, Math.max(12, Math.round(total / 0.6)));
    const ctm = el.getCTM();
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const p = el.getPointAtLength((i / n) * total);
      pts.push(ctm ? { x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f }
                   : { x: p.x, y: p.y });
    }
    const cs = getComputedStyle(el);
    out.push({
      pts,
      closed: Math.hypot(pts[0].x - pts[n].x, pts[0].y - pts[n].y) < 0.4,
      fillL: lum(cs.fill),
      area: Math.abs(pts.reduce((s, p, i) =>
        s + (p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y), 0) / 2),
    });
  }
  return { out };
});

await browser.close();

if (!shapes || !shapes.out.length) {
  console.error("no drawable shapes found in that SVG");
  process.exit(1);
}

/* ------------------------------------------------------- fit to the 48 grid */

const all = shapes.out.flatMap((s) => s.pts);
const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
/* 4..44 is the specimen art's safe area and it is what stops a drawing touching
   the edge of the box it sits in. Uniform scale, so nothing is stretched. */
const scale = 40 / Math.max(maxX - minX, maxY - minY, 1e-6);
const offX = 4 + (40 - (maxX - minX) * scale) / 2;
const offY = 4 + (40 - (maxY - minY) * scale) / 2;
const to48 = (p) => ({ x: (p.x - minX) * scale + offX, y: (p.y - minY) * scale + offY });

/* Simplify in GRID units, not source units, so the tolerance means the same
   thing whatever size the artboard was. 0.35 of 48 is about a third of a pixel
   at the size these are drawn. */
/* Ramer–Douglas–Peucker, defined HERE rather than passed across as a string.
   The first version built it in the browser and shipped it over with toString(),
   which silently broke the recursion: an arrow function assigned to a const has
   no name to call itself by once it has been through new Function(). The browser
   samples points. It has no business defining algorithms. */
const rdp = (pts, eps) => {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let far = 0, worst = -1;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > far) { far = d; worst = i; }
  }
  return far > eps
    ? [...rdp(pts.slice(0, worst + 1), eps).slice(0, -1), ...rdp(pts.slice(worst), eps)]
    : [a, b];
};
const round = (n) => Math.round(n * 10) / 10;

/* A CLOSED RING BREAKS RDP, and it breaks it silently. The algorithm measures
   every point against the line from the first to the last — and on a ring those
   are the same point, so the baseline has zero length, every distance computes
   as nothing, and a perfect circle simplifies to two points. The first test run
   turned four circles into four straight lines and reported success.

   Cut the ring at the point furthest from the start and simplify the two arcs
   separately, which is what gives each half a baseline that means something. */
const simplify = (pts, eps, closed) => {
  if (!closed || pts.length < 4) return rdp(pts, eps);
  const a = pts[0];
  let far = -1, at = 1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - a.x, pts[i].y - a.y);
    if (d > far) { far = d; at = i; }
  }
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
};

const paths = shapes.out.map((s) => {
  const pts = simplify(s.pts.map(to48), 0.35, s.closed);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`).join(" ")
    + (s.closed ? " Z" : "");
  return { d, fillL: s.fillL, area: s.area, points: pts.length };
});

/* ------------------------------------------------------ colours become roles */

/* Nothing keeps the colour it was drawn in. Three roles, resolved at render time
   against the module's world palette — which is the only reason a drawing can
   inherit dark mode and cannot introduce a colour the palette generator never
   gated. Luminance decides which: dark ink is `deep`, mid tones are `fill`,
   near-white is `tint`, and an unfilled shape is line work. */
const roleOf = (L) => (L == null ? null : L < 0.35 ? "deep" : L > 0.8 ? "tint" : "fill");

const filled = paths.filter((p) => p.fillL != null).sort((a, b) => b.area - a.area);
const stroked = paths.filter((p) => p.fillL == null);

const entries = [
  ...filled.map((p) => [p.d, roleOf(p.fillL)]),
  /* The outline of every filled shape, drawn again on top, is what makes these
     read as drawings rather than as flat shapes. */
  ...filled.map((p) => p.d),
  ...stroked.map((p) => p.d),
];

/* -------------------------------------------------------------------- report */

const off = entries.flatMap((e) => (Array.isArray(e) ? e[0] : e).match(/-?\d+(\.\d+)?/g) ?? [])
  .map(Number).filter((v) => v < 0 || v > 48);

console.log(`${moduleId}: ${entries.length} paths from ${shapes.out.length} shapes`);
console.log(`  ${filled.length} filled (${filled.map((p) => roleOf(p.fillL)).join(", ") || "—"}), ${stroked.length} stroke-only`);
console.log(`  points after simplification: ${paths.reduce((n, p) => n + p.points, 0)}`);
if (off.length) console.log(`  WARNING ${off.length} coordinate(s) off the grid — check the source for stray objects`);
if (entries.length > 40) {
  console.log(`  REFUSED: ${entries.length} paths is over the limit of 40. Simplify the drawing:`);
  console.log("           fewer separate objects, and flatten groups before exporting.");
  process.exit(1);
}

if (DRY) { console.log("  --dry: nothing written"); process.exit(0); }

const file = join(ROOT, "content/module-art.json");
const art = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {
  _system: [
    "AUTHORED IN A DRAWING TOOL, imported by tools/import-art.mjs.",
    "48-unit grid, safe area 4..44, absolute commands, fills before line work.",
    "Roles resolve against the module's world palette — no drawing names a colour.",
  ],
};
art[moduleId] = entries;
writeFileSync(file, JSON.stringify(art, null, 2) + "\n");
console.log(`  written to content/module-art.json`);
