/* Level = two independent dials. Blueprint 6.4, corrected.

   `prose`   — reading register. Drives type size, line length, wording.
   `content` — conceptual depth. Drives which stages a child sees and how
               complex a simulation starts.

   They were one dial until a review noticed what that does to a dyslexic
   fourteen-year-old: choosing readable sentences also handed them a
   five-year-old's biology. Reading ability and conceptual maturity are
   independent axes and the product now treats them that way.

   Two root attributes fall out of it, each with a reason:
     data-level  <- prose    type, measure, motion  (reading concerns)
     data-age    <- content  touch targets, gaps    (motor concerns)

   Touch target size follows CONTENT, because it measures a hand. A teenager
   who wants large text has adult motor control and does not want 76px buttons.
*/

import { progress, update } from "./state.js";

export const LEVELS = [
  { n: 1, label: "5 to 7",   sample: "Cells are tiny bags that are alive." },
  { n: 2, label: "8 to 10",  sample: "A cell is a tiny living factory with walls, power and instructions." },
  { n: 3, label: "11 to 13", sample: "Cells maintain an internal environment distinct from their surroundings, using membranes to control what enters and leaves." },
  { n: 4, label: "14 to 16", sample: "Cells sustain a non-equilibrium internal state through selective permeability and active transport, at continuous metabolic cost." },
];

export const DEPTH = [
  { n: 1, label: "Just the idea", hint: "The shortest version, one thing at a time." },
  { n: 2, label: "The idea and why", hint: "How it works, with a reason." },
  { n: 3, label: "The mechanism", hint: "Real names, real numbers, more to control." },
  { n: 4, label: "The whole argument", hint: "Where the simple story breaks down." },
];

export const DEFAULT_LEVEL = 2;

export const prose = () => progress.prose ?? DEFAULT_LEVEL;
export const content = () => progress.content ?? DEFAULT_LEVEL;

/** The single place root attributes are written. CSS reads them; nothing else
    in the app makes a presentational decision. */
export function applyRoot() {
  const root = document.documentElement;
  root.dataset.level = String(prose());
  root.dataset.age = String(content());
  for (const key of ["theme", "face"]) {
    const v = progress.prefs?.[key];
    if (v) root.dataset[key] = v; else delete root.dataset[key];
  }
}

const clamp = (n) => Math.min(4, Math.max(1, n | 0));

export function setLevels({ prose: pr, content: co } = {}) {
  update((p) => {
    if (pr != null) p.prose = clamp(pr);
    if (co != null) p.content = clamp(co);
    // Answering the picker sets both; the two only diverge if someone
    // deliberately separates them in Me.
    p.recent = [];
  });
}

/** True until the child has chosen. The picker asks them to pick the sentence
    that feels right — never to type their age. */
export const needsPicker = () => progress.prose == null;

/* ---------------------------------------------------------- the level nudge
   Self-selected difficulty skews upward: children pick the clever-sounding
   sentence and grown-ups pick for them. The blueprint specified a corrective
   and it was never built, which left the inference a one-shot guess.

   Three lessons of evidence, then one quiet offer. Never an automatic change —
   moving a child's level without asking is a thing that happens TO them. */
const WINDOW = 3;

export function recordLessonPerformance({ hits, misses, helped }) {
  update((p) => {
    p.recent = [...(p.recent ?? []), { hits, misses, helped }].slice(-WINDOW);
  });
}

/** Returns { direction, from, to } when the evidence is clear, else null. */
export function levelNudge(p = progress) {
  const runs = p.recent ?? [];
  if (runs.length < WINDOW) return null;
  const asked = runs.filter((r) => r.hits + r.misses > 0);
  if (asked.length < WINDOW) return null;

  const accuracy = asked.reduce((n, r) => n + r.hits / (r.hits + r.misses), 0) / asked.length;
  const leaning = runs.filter((r) => r.helped).length;

  // Struggling: low accuracy, or reaching for the tutor every single time.
  if (accuracy < 0.45 || leaning === WINDOW) {
    const to = clamp(content() - 1);
    return to < content() ? { direction: "down", from: content(), to } : null;
  }
  // Coasting: everything right, never stuck.
  if (accuracy > 0.95 && leaning === 0) {
    const to = clamp(content() + 1);
    return to > content() ? { direction: "up", from: content(), to } : null;
  }
  return null;
}

export function acceptNudge(nudge) {
  setLevels({ content: nudge.to });
}

export function declineNudge() {
  update((p) => { p.recent = []; });
}
