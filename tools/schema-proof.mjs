/* A guard that has never been seen to fail is not a guard. Break one thing at a
   time, confirm the schema names it, and confirm a clean lesson still passes. */
import { readFileSync } from "node:fs";
import { checkLesson } from "./schema.mjs";

const base = JSON.parse(readFileSync("content/animals/02-big-small-and-why-it-matters.json", "utf8"));
const ctx = { sims: new Set(["membrane", "selection"]) };
const run = (l) => { const out = []; checkLesson(l, (m, lv) => out.push(`${lv ?? "fail"}: ${m}`), ctx); return out; };
const clone = () => JSON.parse(JSON.stringify(base));

const cases = [
  ["a clean lesson passes",              (l) => l,                                             false],
  ["unknown field on the lesson",        (l) => (l.autor = "me", l)],
  ["unknown field on a stage",           (l) => (l.stages[0].subtitle = "x", l)],
  ["a Cyrillic field name",              (l) => (l.stages[0]["т"] = ["x"], l)],
  ["id disagreeing with index",          (l) => (l.index = 7, l)],
  ["missing principle",                  (l) => (delete l.principle, l)],
  ["a principle that is a paragraph",    (l) => (l.principle = "word ".repeat(40), l)],
  ["a hook with no L1 variant",          (l) => (l.stages[0].t[0] = "", l)],
  ["an answer index out of range",       (l) => (l.stages[5].answer = 9, l)],
  ["a check with no concept",            (l) => (delete l.stages[5].concept, l)],
  ["options that repeat",                (l) => (l.stages[5].options[1] = l.stages[5].options[0], l)],
  ["an option that is level-variant",    (l) => (l.stages[5].options[1] = ["a", "b"], l)],
  ["a predict outcome not in options",   (l) => (l.stages[1].outcome = "something else", l)],
  ["feedback with the wrong count",      (l) => (l.stages[5].fb = ["only one"], l)],
  ["feedback with an empty entry",       (l) => (l.stages[5].fb = ["a", "", "c"], l)],
  ["an unknown stage type",              (l) => (l.stages[0].type = "lecture", l)],

  /* The naming stage. The first three are shape; the last three are the reason
     the field exists at all — a term the renderer cannot find is a highlight
     that silently does not happen, which is invisible unless something refuses
     to build. Level 2 is used for the term cases because "Surface area" is in
     that sentence and nowhere near the others. (D87) */
  ["a naming with no concept",           (l) => (delete l.stages[4].concept, l)],
  ["a naming with no term at all",       (l) => (delete l.stages[4].term, l)],
  ["a term empty at every level",        (l) => (l.stages[4].term = ["", "", "", ""], l)],
  ["a term missing from its sentence",   (l) => (l.stages[4].term[1] = "mitochondria", l)],
  ["a term that is only part of a word", (l) => (l.stages[4].term[1] = "Surf", l)],
  ["a term appearing twice",             (l) => (l.stages[4].t[1] += " Surface area again.", l)],
  ["more terms than levels",             (l) => (l.stages[4].term = ["a", "b", "c", "d", "e"], l)],
];

let bad = 0;
for (const [name, mutate, shouldFail = true] of cases) {
  const out = run(mutate(clone()));
  const failed = out.some((m) => m.startsWith("fail"));
  const ok = failed === shouldFail;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "MISS"}  ${name.padEnd(34)} ${out.filter(m=>m.startsWith("fail"))[0]?.slice(6, 96) ?? ""}`);
}
console.log(bad ? `\n${bad} guard(s) did not fire` : "\nevery guard fires, and a clean lesson passes");
process.exit(bad ? 1 : 0);
