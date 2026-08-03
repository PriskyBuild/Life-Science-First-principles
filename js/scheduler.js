/* Spaced retrieval. Blueprint 7.3 — the engine, not a feature.

   Retrieval practice and spacing are the two best-evidenced interventions in
   the learning sciences, they benefit children as young as infancy, and
   corrective feedback amplifies them. A single end-of-lesson quiz is the weak
   form of this; the effect lives in re-testing across days.

   SM-2-lite: a fixed interval ladder with a per-concept ease multiplier. Full
   SM-2 tunes ease from a six-point self-rated difficulty scale, which a
   seven-year-old cannot supply honestly. Three grades derived from observed
   performance is what we can actually measure.
   ponytail: fixed ladder, not a fitted forgetting curve — revisit if review
   accuracy data ever says the ladder is wrong. */

import { progress, update, flush } from "./state.js";

const DAY = 864e5;

/** Days between reviews. Chosen so a concept met on Monday returns Tuesday,
    Friday, the next week, a fortnight later, then a month later. */
export const LADDER = [1, 3, 7, 16, 35];

/** A child back after a month meets a manageable pile, not a punishment. */
export const SESSION_CAP = 5;

export const GRADE = { missed: 0, got: 1, easy: 2 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const blank = () => ({ step: 0, ease: 1, reps: 0, lapses: 0, due: 0, lastGrade: null });

/** Has this child met this concept before? The schedule is the record of what
    has been named and tested, so it is also the honest answer to "do I already
    own this" — which is what keeps a naming already highlighted on a second
    visit instead of replaying a moment that has passed. (D87) */
export const met = (conceptId) => !!progress.concepts[conceptId];

/** First encounter: schedule the concept for tomorrow. */
export function seed(conceptId, now = Date.now()) {
  update((p) => {
    if (p.concepts[conceptId]) return;
    p.concepts[conceptId] = { ...blank(), due: now + LADDER[0] * DAY };
  });
}

/** Record a review outcome and reschedule. Returns the new record. */
export function review(conceptId, grade, now = Date.now()) {
  update((p) => {
    const c = (p.concepts[conceptId] ??= blank());
    c.reps += 1;
    c.lastGrade = grade;

    if (grade === GRADE.missed) {
      c.lapses += 1;
      c.step = 0;                       // back to tomorrow, not back to zero history
      c.ease = clamp(c.ease * 0.85, 0.6, 1.6);
    } else {
      c.step = clamp(c.step + (grade === GRADE.easy ? 2 : 1), 0, LADDER.length - 1);
      if (grade === GRADE.easy) c.ease = clamp(c.ease * 1.15, 0.6, 1.6);
    }

    const days = LADDER[c.step] * c.ease;
    c.due = now + Math.round(days * DAY);
  });
  flush();     // a graded review must survive the child closing the tab
  return progress.concepts[conceptId];
}

/** Concepts due now, oldest first, capped. */
export function due(now = Date.now(), cap = SESSION_CAP) {
  return Object.entries(progress.concepts)
    .filter(([, c]) => c.due && c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .slice(0, cap)
    .map(([id]) => id);
}

/** How many are waiting in total, so the UI can say "5 of 12" honestly rather
    than silently truncating — blueprint 15, no silent caps. */
export const dueCount = (now = Date.now()) =>
  Object.values(progress.concepts).filter((c) => c.due && c.due <= now).length;

/** A concept has survived a gap of at least `days` if its ladder step says so.
    This is what badges are awarded on — see reward.js. */
export const survived = (c, days) => !!c && LADDER[c.step] >= days && c.lastGrade !== GRADE.missed;
