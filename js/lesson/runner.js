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

import { progress } from "../state.js";
import { DEFAULT_LEVEL } from "../level.js";

export const level = () => progress.level ?? DEFAULT_LEVEL;

/** Resolve a text node for the current level. Falls back downward, never up:
    an L4 child seeing L2 prose is a missed opportunity, an L1 child seeing L4
    prose is a wall. */
export function pick(node, lv = level()) {
  if (!Array.isArray(node)) return node ?? "";
  return node[Math.min(lv - 1, node.length - 1)] ?? node[0] ?? "";
}

/** Stages with no `levels` are for everyone. */
export const forLevel = (stages, lv = level()) =>
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

/** Every concept a lesson tests, in order. Drives what gets seeded into the
    retrieval schedule on completion. */
export const conceptsOf = (lesson) =>
  [...new Set(lesson.stages.filter((s) => s.concept).map((s) => s.concept))];

/** Walks a lesson for one level. Deliberately a plain object with an index —
    a state machine class here would be an abstraction over `i++`. */
export function runner(lesson, lv = level()) {
  const stages = forLevel(lesson.stages, lv);
  let i = 0;
  return {
    get stage() { return stages[i]; },
    get index() { return i; },
    get total() { return stages.length; },
    get done() { return i >= stages.length; },
    next() { i = Math.min(i + 1, stages.length); return stages[i]; },
    back() { i = Math.max(i - 1, 0); return stages[i]; },
    goto(n) { i = Math.max(0, Math.min(n, stages.length - 1)); return stages[i]; },
  };
}
