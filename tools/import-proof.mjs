/* DOES THE IMPORTER PRODUCE SOMETHING THE FORMAT ACCEPTS, AND IS IT STILL THE
   DRAWING THAT WENT IN?

   Two different questions, and the first version of this tool passed the first
   while failing the second spectacularly: four circles came out as four straight
   lines, and the report said "4 filled, 8 paths" and looked like success. A
   converter that reports what it did rather than what it produced will tell you
   it worked right up until you look at the picture.

   So this feeds a known drawing through and checks the OUTPUT: on the grid, in
   the safe area, absolute commands only, fills before line work, and — the one
   that caught the real bug — that a shape which was round is still round. (D85) */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const box = mkdtempSync(join(tmpdir(), "fp-import-"));
const src = join(box, "in.svg");

/* A deliberately awkward drawing: a transform to flatten, a group to walk
   through, a rect and a polyline as well as circles and a path, one unfilled
   stroke, and an artboard that is neither square nor 48 units. */
writeFileSync(src, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140">
  <g transform="translate(20 10) scale(1.5)">
    <circle cx="40" cy="40" r="30" fill="#79EBE3"/>
    <rect x="70" y="20" width="40" height="24" fill="#033633"/>
    <path d="M10 70 q30 -20 60 0" fill="none" stroke="#000"/>
  </g>
  <polyline points="150,20 170,60 150,100" fill="none" stroke="#000"/>
  <ellipse cx="60" cy="115" rx="24" ry="10" fill="#FFFFFF"/>
</svg>`);

const out = execFileSync("node", [join(ROOT, "tools/import-art.mjs"), "cells", src, "--dry"],
  { cwd: ROOT, encoding: "utf8", env: process.env });
check("it reads a drawing with groups, transforms and mixed shape types",
  /5 shapes/.test(out), out.split("\n")[0]);

/* Import for real into a scratch copy of the art file, then read it back. */
const artFile = join(ROOT, "content/module-art.json");
const had = (() => { try { return readFileSync(artFile, "utf8"); } catch { return null; } })();
execFileSync("node", [join(ROOT, "tools/import-art.mjs"), "cells", src],
  { cwd: ROOT, encoding: "utf8", env: process.env });
const art = JSON.parse(readFileSync(artFile, "utf8"));
if (had === null) rmSync(artFile); else writeFileSync(artFile, had);

const entries = art.cells;
const dOf = (e) => (Array.isArray(e) ? e[0] : e);
const nums = (d) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/* ---- the format's own rules ---------------------------------------------- */
const all = entries.flatMap((e) => nums(dOf(e)));
check("every coordinate is on the 48-unit grid",
  all.every((v) => v >= 0 && v <= 48), `${all.filter((v) => v < 0 || v > 48).length} off`);
check("and inside the 4..44 safe area",
  Math.min(...all) >= 3.9 && Math.max(...all) <= 44.1,
  `${Math.min(...all).toFixed(1)}..${Math.max(...all).toFixed(1)}`);
check("absolute commands only",
  entries.every((e) => !/[mlhvcsqtaz]/.test(dOf(e).replace(/[A-Z]/g, ""))), "");
check("fills come before line work",
  (() => { let seenStroke = false;
    for (const e of entries) { if (Array.isArray(e)) { if (seenStroke) return false; } else seenStroke = true; }
    return true; })(), "");
check("at least one colour, and none of them is a hex value",
  entries.some((e) => Array.isArray(e)) && !/#|rgb/.test(JSON.stringify(entries)), "");
check("under the forty-path limit", entries.length <= 40, `${entries.length} paths`);

/* ---- and it is still the drawing that went in ---------------------------- */

/* THE ONE THAT CAUGHT THE REAL BUG. Ramer–Douglas–Peucker measures every point
   against the line from the first to the last, and on a closed ring those are the
   same point — so the baseline has no length, every distance reads as zero, and a
   circle simplifies to two points. Round things must still be round. */
const round = entries.filter((e) => Array.isArray(e)).map((e) => {
  const d = dOf(e), n = nums(d);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  return { points: (d.match(/[ML]/g) ?? []).length, w, h };
});
const circle = round.find((s) => Math.abs(s.w - s.h) < 1.5 && s.w > 8);
check("a circle survives as a circle, not as a straight line",
  !!circle && circle.points >= 8, circle ? `${circle.points} points, ${circle.w.toFixed(1)}x${circle.h.toFixed(1)}` : "no round shape found");

check("a shape is not flattened into a line",
  round.every((s) => s.w > 0.5 && s.h > 0.5), round.map((s) => `${s.w.toFixed(1)}x${s.h.toFixed(1)}`).join(" "));

/* Uniform scale: the source is 200x140, so the import must not stretch it. */
const spanX = Math.max(...all.filter((_, i) => i % 2 === 0)) - Math.min(...all.filter((_, i) => i % 2 === 0));
check("the drawing is scaled uniformly, not stretched to fill the box",
  spanX <= 40.2, `${spanX.toFixed(1)} wide of 40`);

/* Colour became role, and the biggest dark shape did not become the pale one. */
const roles = entries.filter((e) => Array.isArray(e)).map((e) => e[1]);
check("light, mid and dark all map to different roles",
  new Set(roles).size >= 3, roles.join(", "));

rmSync(box, { recursive: true, force: true });

let bad = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(60)} ${r.detail}`);
  if (!r.pass) bad++;
}
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
