/* The whole build. Not a bundler: it writes the service worker precache list,
   lints the content, and fails on a blown budget. Run: node tools/build.mjs */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["tools", "docs", "node_modules", ".git", ".github", "shots"]);
const problems = [];
const fail = (m) => problems.push(m);

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
const files = walk().filter((f) => f !== "sw.js" && !f.endsWith(".woff") && !DEV_ONLY.has(f));
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

for (const f of lessonFiles) {
  const lesson = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  const where = (msg) => fail(`${f}: ${msg}`);
  if (!lesson.stages?.length) { where("no stages"); continue; }

  for (const [i, st] of lesson.stages.entries()) {
    if (!STAGE_TYPES.has(st.type)) where(`stage ${i}: unknown type "${st.type}"`);
    if (st.levels && st.levels.some((l) => l < 1 || l > 4)) where(`stage ${i}: levels out of range`);
    for (const key of ["t", "sub", "q", "why", "question", "note", "after", "evidence", "ask"]) {
      const v = st[key];
      if (v === undefined) continue;
      if (!Array.isArray(v)) { where(`stage ${i}: "${key}" must be an array of level variants`); continue; }
      if (!v[0]) where(`stage ${i}: "${key}" has no L1 variant`);
      // A sentence a five-year-old cannot finish is not a hook.
      else if (st.type === "hook" && key === "t" && v[0].split(/\s+/).length > 26) {
        where(`stage ${i}: L1 hook is ${v[0].split(/\s+/).length} words (max 26)`);
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
const shellJs = files.filter((f) => /^js\/[^/]+\.js$/.test(f));
/* Three separately-loaded tiers, so each budget reports a cost someone really
   pays. Simulations are imported per-stage: a child in lesson 1 never downloads
   the membrane physics, so counting it against the lesson budget would be a
   number nobody experiences. */
const lessonJs = files.filter((f) => f.startsWith("js/lesson/") || f.startsWith("js/components/"));
/* A sim stage loads base.js plus ONE simulation, never all of them — so the sum
   was measuring a cost nobody pays, and with thirty more sims to write it would
   have failed the build on a number no child would ever download. The budget is
   the worst single stage: base plus the largest sim. */
const simJs = files.filter((f) => f.startsWith("js/sims/"));
const simStage = () => {
  const base = simJs.filter((f) => f === "js/sims/base.js");
  const worst = simJs.filter((f) => f !== "js/sims/base.js")
    .sort((a, b) => gz(b) - gz(a)).slice(0, 1);
  return [...base, ...worst];
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
  ["lesson JS (gz, lazy)", sum(lessonJs), 20 * 1024],
  ["sim JS (gz, worst stage)", sum(simStage()), 20 * 1024],
  ["shell CSS (gz)", sum(shellCss), 20 * 1024],
  ["preloaded fonts", raw(preloadFonts), 35 * 1024],
];
for (const [name, actual, limit] of budgets) {
  if (actual > limit) fail(`budget: ${name} is ${(actual / 1024).toFixed(1)} KB, limit ${(limit / 1024).toFixed(0)} KB`);
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

if (problems.length) {
  console.error("\nFAILED:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("ok");
