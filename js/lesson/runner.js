/* The lesson runner. Blueprint 1.1 and 8.6.

   Two things live here and nothing else does:

   1. THE PEDAGOGY FORK. Sinha & Kapur's meta-analysis found explore-before-
      instruction is worth g = 0.50 for ages 11-16 and **g = -0.09 for ages
      7-11** — it reverses sign at exactly the ages half this product serves.
      So a lesson carries both tracks and each stage declares which levels it
      is for. L1/L2 get a guided exploration with the naming close behind;
      L3/L4 get the free version and reach the name by their own route.
      tools/build.mjs fails the build if any level loses a complete path.

   2. VARIANT RESOLUTION. A text node is an array of up to four strings and
      falls back to the nearest lower level, so a lesson can ship with two
      variants and be refined later without a schema change. One lesson file,
      not four. */

import { prose, content } from "../level.js";

export { prose, content };
/** Kept as an alias so older call sites read naturally; it means PROSE. */
export const level = prose;

/** Resolve a text node for the reading register. Falls back downward, never up:
    an L4 child seeing L2 prose is a missed opportunity, an L1 child seeing L4
    prose is a wall. */
export function pick(node, lv = prose()) {
  if (!Array.isArray(node)) return node ?? "";
  return node[Math.min(lv - 1, node.length - 1)] ?? node[0] ?? "";
}

/** Stage filtering is a CONTENT decision, never a prose one — this is where
    the pedagogy fork lives, and it must not move because a child asked for
    bigger text. */
export const forLevel = (stages, lv = content()) =>
  stages.filter((s) => !s.levels || s.levels.includes(lv));

const cache = new Map();

export async function loadLesson(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`content/${path}`);
  if (!res.ok) throw new Error(`lesson ${path}: ${res.status}`);
  const lesson = await res.json();
  cache.set(path, lesson);
  return lesson;
}

/** Every concept a lesson TESTS, in order. Drives what gets seeded into the
    retrieval schedule on completion.

    CHECK STAGES ONLY, and that word is doing work. This used to seed from any
    stage carrying a concept id, which put two concepts into the schedule that
    no beat could ever answer: `content/reviews.json` is lifted from check
    stages, the review screen drops a concept it has no beat for, and `review()`
    is the only thing that advances a due date. So those two came due, were
    silently skipped, never advanced, and came due again — for ever. The Atlas
    counted them honestly and was wrong every day of the child's life.

    The rule underneath it is not a caching detail. A retrieval beat needs a
    right answer. A `predict` stage has an outcome rather than a mark, because a
    wrong prediction is the point of the stage. A `weigh` stage has no answer AT
    ALL, on purpose — turning an attributed disagreement into a flashcard with a
    correct option would be this platform quietly picking a side. So "seeded" and
    "testable" have to be the same set, and the way to guarantee that is to
    derive one from the other rather than to remember. (D87) */
export const conceptsOf = (lesson) =>
  [...new Set(lesson.stages.filter((s) => s.type === "check" && s.concept).map((s) => s.concept))];

/** Walks a lesson for one level. Deliberately a plain object with an index —
    a state machine class here would be an abstraction over `i++`. */
export function runner(lesson, lv = content()) {
  const stages = forLevel(lesson.stages, lv);
  let i = 0;
  return {
    get stage() { return stages[i]; },
    // The path THIS child will walk, so the loader can fetch exactly the
    // custom elements it needs and no others.
    get stages() { return stages; },
    get index() { return i; },
    get total() { return stages.length; },
    get done() { return i >= stages.length; },
    next() { i = Math.min(i + 1, stages.length); return stages[i]; },
    back() { i = Math.max(i - 1, 0); return stages[i]; },
    goto(n) { i = Math.max(0, Math.min(n, stages.length - 1)); return stages[i]; },
  };
}
