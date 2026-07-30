/* The whole build. Not a bundler: it writes the service worker precache list,
   lints the content, and fails on a blown budget. Run: node tools/build.mjs */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, extname, dirname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["tools", "docs", "node_modules", ".git", ".github", "shots"]);
const problems = [];
const fail = (m) => problems.push(m);
/* A warning is a real defect that does not block a deploy. Kept separate from
   fail() rather than downgraded into it, because the day a warning becomes
   ignorable is the day it stops being read. Printed last, and counted. */
const notes = [];
const warn = (m) => notes.push(m);

/* ------------------------------------------------------------------ walk */
function walk(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(ROOT, p).replaceAll("\\", "/"));
  }
  return out;
}

// styleguide.html is a development surface: it must not be precached, must not
// count against the shell budgets, and must not ship to a child's device.
// styleguide.html links the four source stylesheets directly, so it stays a
// development surface and they stay out of the shipped precache.
const DEV_ONLY = new Set([
  "styleguide.html", "styleguide.js",
  "css/worlds.css", "css/tokens.css", "css/base.css", "css/components.css",
  // repo furniture, not app content
  "package.json", "package-lock.json", "vercel.json", "_headers", "README.md", "LICENSE",
  "docs",
]);
/* A DENY list was the wrong shape and it cost the whole offline story. Two
   throwaway diagnostic scripts sitting in the repo root got precached because
   nothing named them; I then deleted them, so cache.addAll() 404'd, the service
   worker install rejected, and the app stopped working offline entirely — with
   no error anywhere until a browser test cut the network. (D68)

   The rule is now positive: a file ships only if its extension is one this app
   actually serves. Anything else in the tree — a scratch script, a bundle, a
   log, a note — cannot reach a child's device by being forgotten about. */
const SHIPPED = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".woff2", ".png", ".svg", ".ico"]);
const files = walk().filter((f) => f !== "sw.js" && SHIPPED.has(extname(f)) && !DEV_ONLY.has(f));
const CSS_ORDER_FOR_BUDGET = ["css/worlds.css", "css/tokens.css", "css/base.css", "css/components.css"];

/* --------------------------------------------------------- content lint */
const curriculum = JSON.parse(readFileSync(join(ROOT, "content/curriculum.json"), "utf8"));
const modules = curriculum.worlds.flatMap((w) => w.modules.map((m) => ({ ...m, world: w })));
const ids = new Set(modules.map((m) => m.id));

if (new Set(modules.map((m) => m.id)).size !== modules.length) fail("duplicate module id");

for (const m of modules) {
  if (!m.title || !m.lessons) fail(`${m.id}: missing title or lesson count`);
  for (const r of m.requires) if (!ids.has(r)) fail(`${m.id}: requires unknown module "${r}"`);
  // Blueprint 8.6: an L1 variant is mandatory, and it has a word ceiling —
  // a sentence a five-year-old cannot finish is not a hook.
  const l1 = Array.isArray(m.hook) ? m.hook[0] : m.hook;
  if (!l1) fail(`${m.id}: no L1 hook variant`);
  else if (l1.split(/\s+/).length > 22) fail(`${m.id}: L1 hook is ${l1.split(/\s+/).length} words (max 22)`);
  if (m.lessonTitles && m.lessonTitles.length !== m.lessons) fail(`${m.id}: lessonTitles length != lessons`);
}
for (const w of curriculum.worlds) {
  for (const r of w.requires) if (!ids.has(r)) fail(`world ${w.id}: requires unknown module "${r}"`);
  if (!Array.isArray(w.tagline) || !w.tagline[0]) fail(`world ${w.id}: no L1 tagline`);
}

/* ------------------------------------------------------- lesson lint + reviews
   Two jobs. First, the pedagogy fork is only real if every level still has a
   complete path through the lesson — a stage filtered out for L1 must not take
   the only naming stage with it. Second, the review flow needs its beats
   without loading whole lessons, so they are extracted here rather than
   maintained as a second copy that drifts. */
const STAGE_TYPES = new Set(["hook", "predict", "slider", "name", "apply", "check", "sim", "build", "weigh"]);
const REGISTERED_SIMS = new Set(files.filter((f) => f.startsWith("js/sims/") && f !== "js/sims/base.js")
  .map((f) => f.slice("js/sims/".length, -3)));
const REQUIRED_PER_LEVEL = [
  ["hook", (t) => t === "hook"],
  ["an exploration", (t) => ["slider", "predict", "sim", "build"].includes(t)],
  ["a naming stage", (t) => t === "name"],
  ["a check", (t) => t === "check"],
];

/* Lessons live in content/<module>/, one file each. Everything directly inside
   content/ is data the build itself writes or the curriculum graph — matching
   on "any json under content" made the linter try to parse its own output. */
const lessonFiles = files.filter((f) => /^content\/[^/]+\/[^/]+\.json$/.test(f));
const reviews = {};
const stageTypes = {};        // lesson id -> the stage types it contains, for the budget

for (const f of lessonFiles) {
  const lesson = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  const where = (msg) => fail(`${f}: ${msg}`);
  if (!lesson.stages?.length) { where("no stages"); continue; }
  stageTypes[lesson.id] = new Set(lesson.stages.map((st) => st.type));

  for (const [i, st] of lesson.stages.entries()) {
    if (!STAGE_TYPES.has(st.type)) where(`stage ${i}: unknown type "${st.type}"`);
    /* A stray key is silent: the renderer ignores what it does not know, so a
       typo'd field simply never appears and nothing reports it. I typed a key
       containing Cyrillic characters into a CRISPR lesson and the build was
       perfectly happy with it. Field names are ASCII identifiers here, always. */
    for (const key of Object.keys(st)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) where(`stage ${i}: field name "${key}" is not a plain identifier`);
    }
    if (st.levels && st.levels.some((l) => l < 1 || l > 4)) where(`stage ${i}: levels out of range`);
    for (const key of ["t", "sub", "q", "why", "question", "note", "after", "evidence", "ask"]) {
      const v = st[key];
      if (v === undefined) continue;
      if (!Array.isArray(v)) { where(`stage ${i}: "${key}" must be an array of level variants`); continue; }
      if (!v[0]) where(`stage ${i}: "${key}" has no L1 variant`);
      /* A sentence a five-year-old cannot finish is not a hook — and neither is
         one a sixteen-year-old cannot, which the first version of this rule
         forgot. It tested v[0] only, so the youngest reader was protected and
         every other level went unguarded: the median hook above level 1 was 29
         words, the longest 44, all set as a display heading. A guard covering one
         variant of four is not a guard. (D72)

         The headline is now the first SENTENCE of the hook, so that is what gets
         measured. A long hook made of short sentences is fine. One long sentence
         is the thing that does not read. */
      else if (st.type === "hook" && key === "t") {
        for (const [lv, variant] of v.entries()) {
          const words = variant.split(/(?<=[.!?])\s+/)[0].split(/\s+/).length;
          const max = lv === 0 ? 20 : 25;
          if (words > max) {
            warn(`${f} stage ${i}: L${lv + 1} hook opens with a ${words}-word sentence `
              + `(max ${max}) — the renderer can only split at a full stop, so this `
              + `one needs a hand`);
          }
        }
      }
    }
    if (st.type === "sim") {
      if (!REGISTERED_SIMS.has(st.sim)) where(`stage ${i}: no simulation named "${st.sim}" in js/sims/`);
      if (!st.goal) where(`stage ${i}: a sim stage needs a goal message`);
    }
    if (st.type === "build") {
      if (!st.parts?.length || !st.slots?.length) where(`stage ${i}: a build stage needs parts and slots`);
      const ids = new Set((st.parts ?? []).map((x) => x.id));
      for (const slot of st.slots ?? []) {
        for (const a of String(slot.accepts ?? "").split(/\s+/).filter(Boolean)) {
          if (!ids.has(a)) where(`stage ${i}: slot accepts "${a}", which is not one of the parts`);
        }
        // Every slot needs a right answer, whether or not placement is constrained.
        const correct = slot.correct ?? slot.accepts;
        if (!correct) where(`stage ${i}: a slot needs "correct" (or "accepts") so the build can be marked`);
        else if (!ids.has(correct)) where(`stage ${i}: slot's correct part "${correct}" is not one of the parts`);
      }
      // A boss whose slots all constrain placement can only ever be won.
      if (st.trials && (st.slots ?? []).every((sl) => sl.accepts)) {
        where(`stage ${i}: every slot constrains what may be dropped, so a complete build is always correct and the trials cannot fail`);
      }
      // A trial that needs a part the child was never given is unwinnable.
      for (const t of st.trials ?? []) {
        for (const n of t.needs ?? []) if (!ids.has(n)) where(`stage ${i}: trial "${t.name?.[0]}" needs "${n}", which is not a part`);
      }
    }
    /* A weigh stage carries interpretations that this product does not itself
       assert, so the one thing it may never do is present one unattributed.
       "Labelled, not smuggled" is a rule about the format, not a habit of the
       author, which means the build has to be the thing that enforces it. */
    if (st.type === "weigh") {
      if (!Array.isArray(st.views) || st.views.length < 2) {
        where(`stage ${i}: a weigh stage needs at least two views — one view is an assertion, not a weighing`);
      }
      for (const [j, v] of (st.views ?? []).entries()) {
        if (!v.who?.trim()) where(`stage ${i}, view ${j}: no "who" — an interpretation must say whose it is`);
        if (!Array.isArray(v.claim) || !v.claim[0]) where(`stage ${i}, view ${j}: "claim" needs an L1 variant`);
        if (!Array.isArray(v.because) || !v.because[0]) where(`stage ${i}, view ${j}: "because" needs an L1 variant — a view without its reasoning is a label`);
      }
    }
    if (st.type === "check") {
      if (!st.concept) where(`stage ${i}: a check must name the concept it tests`);
      if (st.answer == null || !st.options?.length) where(`stage ${i}: check needs options and an answer index`);
      else if (st.answer >= st.options.length) where(`stage ${i}: answer index out of range`);
      else if (st.concept && !reviews[st.concept]) {
        reviews[st.concept] = { q: st.q, options: st.options, answer: st.answer, why: st.why, from: lesson.id };
      }
    }
  }

  /* The module's concept list is a contract, not documentation. A typo'd
     concept id used to lift a review beat into reviews.json that no lesson ever
     seeded — so the child was scheduled to be retested on something that could
     never come due, and nothing anywhere said so. */
  {
    const owner = modules.find((m) => m.id === lesson.module);
    if (!owner) where(`module "${lesson.module}" is not in curriculum.json`);
    else if (!owner.concepts?.length) where(`module "${lesson.module}" declares no concepts`);
    else {
      const allowed = new Set(owner.concepts);
      for (const st of lesson.stages) {
        if (st.concept && !allowed.has(st.concept)) {
          where(`concept "${st.concept}" is not declared in ${lesson.module}'s concepts list`);
        }
      }
    }
    if (lesson.specimen && !(owner?.specimens ?? []).some((s) => s.id === lesson.specimen)) {
      where(`specimen "${lesson.specimen}" is not defined under module ${lesson.module}`);
    }
  }

  // The fork must not strand a level.
  for (const lv of [1, 2, 3, 4]) {
    const mine = lesson.stages.filter((st) => !st.levels || st.levels.includes(lv));
    for (const [label, test] of REQUIRED_PER_LEVEL) {
      if (!mine.some((st) => test(st.type))) where(`level ${lv} has no ${label} — the stage filter stranded it`);
    }
  }
}

writeFileSync(join(ROOT, "content/reviews.json"), JSON.stringify(reviews, null, 2) + "\n");

/* The level dial has to be real across the corpus, not just per lesson. Asserted
   on the median rather than on any one hook, because a single lesson can honestly
   have a short L4 and a long L1 — and a test pinned to one lesson is a test
   pinned to a snapshot. (D72) */
{
  const words = (t) => t.split(/\s+/).length;
  const per = [[], [], [], []];
  for (const f of lessonFiles) {
    const st = JSON.parse(readFileSync(join(ROOT, f), "utf8")).stages.find((x) => x.type === "hook");
    if (!st?.t) continue;
    for (const lv of [0, 1, 2, 3]) per[lv].push(words(st.t[Math.min(lv, st.t.length - 1)]));
  }
  const med = per.map((a) => a.sort((x, y) => x - y)[a.length >> 1] ?? 0);
  if (!(med[0] < med[3])) {
    fail(`hook length does not track the level dial: medians L1 ${med[0]}, L4 ${med[3]}`);
  }
  console.log(`hook length by level (median words): ${med.map((n, i) => `L${i + 1} ${n}`).join("  ")}`);
}

/* --------------------------------------------------- specimen art (authored)
   The drawings are hand-authored, unlike almost everything else under content/.
   A consistent set is what stops line art reading as generated, and consistency
   is not something to leave to the author's memory across 110 drawings — so the
   rules are checked here rather than remembered. (D71) */
{
  const art = JSON.parse(readFileSync(join(ROOT, "content/specimen-art.json"), "utf8"));
  const known = new Set(modules.flatMap((m) => (m.specimens ?? []).map((sp) => sp.id)));
  for (const [id, paths] of Object.entries(art)) {
    if (id.startsWith("_")) continue;                        // the system note
    const where = (msg) => fail(`specimen-art "${id}": ${msg}`);
    if (!known.has(id)) { where("no specimen with this id exists"); continue; }
    if (!Array.isArray(paths) || !paths.length) { where("no paths"); continue; }
    const all = paths.join("");
    /* Relative commands are lowercase, and their numbers are deltas rather than
       coordinates — which would make the grid check below meaningless. Absolute
       only, so every number in the file really is a position. */
    const rel = all.match(/[a-z]/);
    if (rel) where(`relative path command "${rel[0]}" — absolute commands only`);
    for (const n of all.match(/-?\d+(\.\d+)?/g) ?? []) {
      if (Number(n) < -1 || Number(n) > 49) where(`coordinate ${n} is off the 48-unit grid`);
    }
    // A drawing that needs this much path data is a traced photograph, not a
    // drawing that will read at 40 pixels next to twelve others.
    if (all.length > 700) where(`${all.length} characters of path data (max 700)`);
    if (/fill|gradient|stroke|opacity/i.test(all)) where("styling belongs in CSS, not in path data");
  }
  const drawn = Object.keys(art).filter((k) => !k.startsWith("_")).length;
  console.log(`specimen art: ${drawn} of ${known.size} drawn`);
}

/* Which lessons actually exist, generated rather than hand-listed. A hardcoded
   set drifts the moment somebody adds a file, and the drift shows up as a link
   to a lesson that is not there. */
const authored = {};
for (const f of lessonFiles) {
  const lesson = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  (authored[lesson.module] ??= {})[lesson.index] = f.replace(/^content\//, "");
}
writeFileSync(join(ROOT, "content/authored.json"), JSON.stringify(authored, null, 2) + "\n");

/* Reachability: play the graph forward from an empty save. Anything still
   locked when nothing more can be unlocked is unreachable content — the bug
   that is invisible until a child hits the wall. */
{
  const done = new Set();
  for (let moved = true; moved; ) {
    moved = false;
    for (const m of modules) {
      if (done.has(m.id)) continue;
      const worldOk = m.world.requires.every((r) => done.has(r)) &&
        (!m.world.requiresAnyCompleted || done.size >= m.world.requiresAnyCompleted);
      if (worldOk && m.requires.every((r) => done.has(r))) { done.add(m.id); moved = true; }
    }
  }
  const stuck = modules.filter((m) => !done.has(m.id)).map((m) => m.id);
  if (stuck.length) fail(`unreachable modules (cycle or impossible gate): ${stuck.join(", ")}`);
}

/* -------------------------------------------------------------- budgets */
const gz = (p) => gzipSync(readFileSync(join(ROOT, p))).length;
const sum = (list) => list.reduce((n, p) => n + gz(p), 0);
const raw = (list) => list.reduce((n, p) => n + statSync(join(ROOT, p)).size, 0);

// Shell JS is what boots the app. js/components/ and js/sims/ are lesson parts,
// imported lazily by the lesson that needs them, so counting them against the
// shell budget would report a cost no child on the Atlas actually pays.
let shellJs = files.filter((f) => /^js\/[^/]+\.js$/.test(f));   // recomputed from the graph below
/* Three separately-loaded tiers, so each budget reports a cost someone really
   pays. Simulations are imported per-stage: a child in lesson 1 never downloads
   the membrane physics, so counting it against the lesson budget would be a
   number nobody experiences. */
/* A TIER IS THE STATIC IMPORT CLOSURE OF ITS ENTRY POINT, computed rather than
   listed. The hand-maintained list is what hid this phase's bug for eight
   phases: view.js imported all four custom elements statically, so every lesson
   downloaded the placement primitive whether it had a build stage or not, and
   the budget cheerfully reported the union as though some child paid it.

   Following static imports and NOT dynamic import() is the whole trick —
   import() is exactly where one tier ends and the next begins, so the graph
   draws the boundary that a person kept drawing wrong. (D69) */
const STATIC_IMPORT = /(?:^|\n)\s*import\s+(?:[^'"]*?\bfrom\s+)?["']([^"']+)["']/g;
function closure(entry) {
  const seen = new Set();
  (function walk1(f) {
    if (seen.has(f)) return;
    seen.add(f);
    for (const [, spec] of readFileSync(join(ROOT, f), "utf8").matchAll(STATIC_IMPORT)) {
      if (!spec.startsWith(".")) continue;                 // bare specifier: not ours
      const rel = join(dirname(f), spec).split("\\").join("/");
      if (files.includes(rel)) walk1(rel);
      else fail(`${f} statically imports "${spec}", which is not a shipped file`);
    }
  })(entry);
  return [...seen];
}

/* The shell is what booting costs. Everything a route imports on top of that is
   what OPENING the route costs — so a tier is its closure MINUS the shell's,
   because a child who is already looking at the Atlas has those bytes. */
shellJs = closure("js/app.js");
const shell = new Set(shellJs);
const extra = (list) => [...new Set(list)].filter((f) => !shell.has(f));

const componentFiles = files.filter((f) => f.startsWith("js/components/"));
const { PART_OF } = await import(new URL("../js/lesson/parts.js", import.meta.url));
const partFile = (name) => `js/lesson/parts/${name}.js`;
/* A part nothing claims is a part nothing loads and no budget sees. Checked in
   both directions, because either gap is silent — and the components are checked
   through the parts that import them, which is the only path that loads them. */
const partFiles = files.filter((f) => f.startsWith("js/lesson/parts/"));
for (const [type, name] of Object.entries(PART_OF)) {
  if (!partFiles.includes(partFile(name))) fail(`PART_OF maps "${type}" to a missing ${partFile(name)}`);
}
for (const f of partFiles) {
  if (!Object.values(PART_OF).some((n) => partFile(n) === f)) {
    fail(`${f} is not claimed by PART_OF in js/lesson/parts.js: nothing loads it and no budget sees it`);
  }
}
const reached = new Set(["js/lesson/view.js", "js/lesson/review.js", ...partFiles].flatMap((f) => closure(f)));
for (const f of componentFiles) {
  if (!reached.has(f)) fail(`${f} is imported by no part and no route: nothing loads it and no budget sees it`);
}

/* The budget is the worst single VISIT: one route's closure plus the components
   that route's content actually asks for. A lesson and the review flow are
   different routes and neither is charged for the other. */
const routes = [["review", extra(closure("js/lesson/review.js"))]];
for (const [id, types] of Object.entries(stageTypes)) {
  routes.push([id, extra([...closure("js/lesson/view.js"),
    ...[...types].map((t) => PART_OF[t]).filter(Boolean).flatMap((n) => closure(partFile(n)))])]);
}
const [worstId, worstSet] = routes.reduce((a, b) => (sum(b[1]) > sum(a[1]) ? b : a));
/* The spread, because the worst route alone hides the point of splitting: half
   the lessons have no build stage and no longer pay 5 KB for the placement
   primitive and its renderer. A single number would have reported no progress. */
const routeSizes = routes.map(([, set]) => sum(set)).sort((a, b) => a - b);
const kb = (n) => (n / 1024).toFixed(1);
console.log(`lesson routes: ${routes.length}, ${kb(routeSizes[0])}-${kb(routeSizes.at(-1))} KB `
  + `(median ${kb(routeSizes[routeSizes.length >> 1])} KB)`);

/* A sim stage loads base.js plus ONE simulation, never all of them — so the sum
   was measuring a cost nobody pays, and with thirty more sims to write it would
   have failed the build on a number no child would ever download. The budget is
   the worst single stage: base plus the largest sim. */
const simJs = files.filter((f) => f.startsWith("js/sims/"));
/* By CLOSURE, not by file: seven sims render an <fp-slider>, and until this
   phase not one of them imported it — they were free-riding on view.js loading
   it for every lesson, so the sim budget under-reported by 1.2 KB and a lesson
   with no slider stage shipped a broken simulation. (D69) */
const simStage = () => {
  const worst = simJs.filter((f) => f !== "js/sims/base.js")
    .map((f) => extra(closure(f)))
    .reduce((a, b) => (sum(b) > sum(a) ? b : a), []);
  return extra([...closure("js/sims/base.js"), ...worst]);
};
const shellCss = CSS_ORDER_FOR_BUDGET;

const preloadFonts = files.filter((f) => f.includes("fonts/nunito"));

/* Undefined custom property = silent zero. A missing --s-5 costs a whole
   card's padding and reports nothing, so the build checks every reference. */
{
  const css = shellCss.map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
  // declarations can share a line, so anchor on line-start OR ; OR {
  const declared = new Set([...css.matchAll(/(?:^|[;{])\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
  // only flag var() with NO fallback — var(--i, 0) is a deliberate hook for a
  // value the consumer sets inline, and has a defined result when unset
  const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !declared.has(v));
  if (missing.length) fail(`undefined custom properties: ${missing.join(", ")}`);
}

const budgets = [
  ["shell JS (gz)", sum(shellJs), 25 * 1024],
  [`lesson JS (gz, worst route: ${worstId})`, sum(worstSet), 20 * 1024],
  ["sim JS (gz, worst stage)", sum(simStage()), 20 * 1024],
  /* The first number here that matches what a child actually downloads to play
     a lesson: boot, plus the heaviest route, plus the heaviest simulation on it.
     The three tiers above are diagnostics that say WHERE a regression landed;
     this is the one that says whether it matters. */
  // A UNION, not a sum: a lesson with a slider stage and a sim that renders one
  // downloads that element once, and charging it twice would invent a cost.
  ["one lesson, all in (gz)", sum([...new Set([...shellJs, ...worstSet, ...simStage()])]), 64 * 1024],
  ["shell CSS (gz)", sum(shellCss), 20 * 1024],
  ["preloaded fonts", raw(preloadFonts), 35 * 1024],
];
for (const [name, actual, limit] of budgets) {
  if (actual > limit) fail(`budget: ${name} is ${(actual / 1024).toFixed(1)} KB, limit ${(limit / 1024).toFixed(0)} KB`);
}

/* Portability gate. Every file in this repo is supposed to run from a clone,
   in CI, on anyone's machine — and one screenshot line in verify.mjs had my own
   container's home directory hardcoded into it. It passed locally forever and
   failed on the first GitHub Actions run, which is the worst possible place to
   discover it. Absolute paths rooted in a home directory or a Windows drive are
   never correct here; ROOT is derived from import.meta.url for exactly this
   reason. tools/ is scanned too, because that is where it happened. */
{
  const scan = [...files, ...readdirSync(join(ROOT, "tools")).map((f) => `tools/${f}`)]
    .filter((f) => /\.(m?js|json|ya?ml|html|css)$/.test(f));
  const ABS = /(?:^|["'`(\s])(?:\/(?:home|Users|root|tmp)\/[\w.-]+|[A-Za-z]:\\\\)/;
  for (const f of scan) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      if (line.includes("eslint") || /^\s*(\*|\/\/)/.test(line)) continue;   // comments and prose
      if (ABS.test(line)) fail(`${f}:${i + 1}: absolute machine path — this must run from any clone`);
    }
  }
}

/* Syntax gate. `node --check file.js` parses as CommonJS and happily accepts a
   file the browser rejects — an unbalanced paren in screens.js passed every
   local check and only failed as a blank page. Parse each file AS a module. */
{
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, copyFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "fp-syntax-"));
  for (const f of files.filter((f) => f.endsWith(".js"))) {
    const target = join(dir, f.replace(/\//g, "__") + ".mjs");
    copyFileSync(join(ROOT, f), target);
    try {
      execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
    } catch (e) {
      const msg = String(e.stderr).split("\n").find((l) => /SyntaxError/.test(l)) ?? "syntax error";
      fail(`${f}: ${msg.trim()}`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------- bundle css
   Four stylesheets in the head are four render-blocking requests — Lighthouse
   measured 680ms of it. They stay four files to author and become one to ship.
   Order matters: worlds (generated colour) then tokens then base then
   components, exactly as index.html used to link them. */
const CSS_ORDER = ["css/worlds.css", "css/tokens.css", "css/base.css", "css/components.css"];
{
  const parts = CSS_ORDER.map((f) => `/* ===== ${f} ===== */\n${readFileSync(join(ROOT, f), "utf8")}`);
  writeFileSync(join(ROOT, "css/app.css"), parts.join("\n"));
}

/* ------------------------------------------------- write service worker */
const hash = createHash("sha256");
for (const f of files.sort()) hash.update(f).update(readFileSync(join(ROOT, f)));
const version = hash.digest("hex").slice(0, 12);

const precache = JSON.stringify(["./", ...files.sort()], null, 2);
const sw = readFileSync(join(ROOT, "sw.js"), "utf8")
  .replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
  .replace(
    /\/\* __PRECACHE_START__ \*\/[\s\S]*?\/\* __PRECACHE_END__ \*\//,
    `/* __PRECACHE_START__ */\nconst PRECACHE = ${precache};\n/* __PRECACHE_END__ */`
  );
writeFileSync(join(ROOT, "sw.js"), sw);

/* -------------------------------------------------------------- report */
console.log(`modules: ${modules.length} across ${curriculum.worlds.length} worlds, all reachable`);
for (const [name, actual, limit] of budgets) {
  const pct = ((actual / limit) * 100).toFixed(0);
  console.log(`  ${name.padEnd(18)} ${(actual / 1024).toFixed(1).padStart(6)} KB / ${(limit / 1024).toFixed(0)} KB  (${pct}%)`);
}
console.log(`precache: ${files.length + 1} entries, version ${version}`);

if (notes.length) {
  console.log(`\n${notes.length} thing${notes.length === 1 ? "" : "s"} to hand-fix:`);
  for (const n of notes) console.log("  ~ " + n);
}
if (problems.length) {
  console.error("\nFAILED:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(notes.length ? "\nok, with warnings" : "ok");
