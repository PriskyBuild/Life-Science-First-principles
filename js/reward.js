/* The XP economy and badges. Blueprint 7.

   One design constraint governs everything here: if the reward loop and the
   learning loop are different loops, the child optimises the reward loop and
   stops learning. Every rate below is chosen so that the fastest way to
   maximise it is also the strongest learning behaviour available.

   The rates are a closed table and awardXp() refuses anything not in it. That
   refusal is the whole point — "just give a little XP for watching the intro"
   is how an economy like this rots, and it should fail loudly at the call site
   rather than pass review as a one-line diff. */

import { progress, update, flush } from "./state.js";
import { survived, seed } from "./scheduler.js";

export const RATES = Object.freeze({
  /* Prediction is paid REGARDLESS of correctness. Prediction is the mechanism
     by which a simulation teaches; paying only for correct predictions teaches
     children to guess safe, which destroys the mechanism. */
  predict: 5,

  /* Retrieval is the best-evidenced effect in the field, so it pays the most.
     A missed attempt still pays a little, because the testing effect works on
     failed retrieval too PROVIDED corrective feedback follows — and the review
     UI always gives it. It pays far less than success, so there is nothing to
     farm. */
  retrievalHit: 15,
  retrievalMiss: 4,

  /* Consolidation. */
  challenge: 10,
  lessonComplete: 12,

  /* Curiosity that is off the critical path. */
  discovery: 8,
});

/* Named so the refusal message can explain itself rather than just throwing.
   Each of these is a thing some future version of this file will be tempted to
   pay for. */
const NEVER_PAID = Object.freeze({
  time: "Paying for time on task produces idling, not learning.",
  watch: "Paying for watching an animation produces passivity.",
  streak: "Streaks are a retention mechanic, not a learning one; paying XP for them corrupts the XP signal.",
  login: "Paying for showing up is a habit loop, not a learning loop.",
  correctPredict: "Prediction is paid via `predict`, at the same rate whether right or wrong. See blueprint 7.1.",
});

/** The only way XP enters the system. `reason` must be a key of RATES. */
export function awardXp(reason, { concept = null, multiplier = 1 } = {}) {
  if (reason in NEVER_PAID) {
    throw new Error(`refusing to award XP for "${reason}": ${NEVER_PAID[reason]}`);
  }
  const rate = RATES[reason];
  if (rate == null) {
    throw new Error(`unknown XP reason "${reason}". Add it to RATES with a written justification, or use an existing one.`);
  }
  const amount = Math.round(rate * multiplier);
  update((p) => {
    p.xp += amount;
    p.ledger = [{ reason, amount, concept, at: Date.now() }, ...(p.ledger ?? [])].slice(0, 50);
  });
  return amount;
}

/* ---------------------------------------------------------------- specimens */

/** Specimens are not cosmetic. A collected specimen is a part the child can
    use in later modules — collecting a ribosome in World 1 is why you can
    build a protein in World 2 — which makes the collection an inventory rather
    than a sticker book. */
export function collect(specimenId) {
  if (progress.specimens.includes(specimenId)) return false;
  update((p) => { p.specimens.push(specimenId); });
  return true;
}

export const hasSpecimen = (id) => progress.specimens.includes(id);

/* ------------------------------------------------------------------ badges */

/* Badges are evidence of mastery, not attendance. "Finished the Cells module"
   is not a badge. "Still had it three weeks later" is. Every criterion below
   reads the retrieval scheduler, never the completion count. */
export const BADGES = [
  {
    id: "sticks",
    title: "It stuck",
    why: "Remembered something a week after you learned it.",
    earned: (p) => Object.values(p.concepts).some((c) => survived(c, 7)),
  },
  {
    id: "durable",
    title: "Still there",
    why: "Remembered something a month after you learned it.",
    earned: (p) => Object.values(p.concepts).some((c) => survived(c, 35)),
  },
  {
    id: "five-deep",
    title: "Five deep",
    why: "Five different ideas all held for a week or more.",
    earned: (p) => Object.values(p.concepts).filter((c) => survived(c, 7)).length >= 5,
  },
  {
    id: "guesser",
    title: "Brave guesser",
    why: "Made twenty predictions. Being wrong counts — that is the point.",
    earned: (p) => (p.ledger ?? []).filter((e) => e.reason === "predict").length >= 20,
  },
  {
    id: "came-back",
    title: "Came back",
    why: "Cleared a review that had been waiting more than a fortnight.",
    earned: (p) => Object.values(p.concepts).some((c) => c.lapses === 0 && c.reps >= 4),
  },
];

/** Badges are derived from progress, never stored — so they can never drift
    out of sync with the evidence that justified them, and changing a criterion
    re-evaluates the whole history rather than needing a migration. */
export const earnedBadges = (p = progress) => BADGES.filter((b) => b.earned(p));

/* ---------------------------------------------------------------- lessons */

/** Called when a lesson finishes: marks it done, pays completion, banks the
    specimen, and seeds its concepts into the retrieval schedule.

    Seeding lives here rather than at the call site because the flush has to
    come last, and a caller that flushed and *then* seeded silently lost the
    schedule — which is exactly what happened the first time this was split. */
export function completeLesson(moduleId, lessonIndex, { concepts = [], specimen = null } = {}) {
  /* Read BEFORE the write, because the write is what makes it look done.
     The completion bonus is paid once per lesson, ever. A dead Finish button was
     calling this on every click and paying 12 XP each time — the exact thing
     NEVER_PAID exists to prevent, arriving through a CSS bug rather than a bad
     call site. This guard is conservative by design: `lessonsDone` is a
     high-water mark, so finishing an EARLIER lesson after a later one pays no
     bonus. Under-paying once is a much smaller wrong than being farmable. (D70) */
  const alreadyDone = (progress.modules[moduleId]?.lessonsDone ?? 0) > lessonIndex;
  update((p) => {
    const m = (p.modules[moduleId] ??= { lessonsDone: 0 });
    m.lessonsDone = Math.max(m.lessonsDone, lessonIndex + 1);
  });
  if (!alreadyDone) awardXp("lessonComplete");
  if (specimen) collect(specimen);
  for (const c of concepts) seed(c);
  // Finishing a lesson is the one write a child would be genuinely upset to
  // lose. Do not let any of it sit in a debounce.
  flush();
  return concepts;
}
