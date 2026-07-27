/* Level = age band 1..4. It sets one attribute; CSS does the rest.
   Nothing presentational is decided in JavaScript — see blueprint 6.4. */

import { progress, update } from "./state.js";

export const LEVELS = [
  { n: 1, label: "5 to 7",   sample: "Cells are tiny bags that are alive." },
  { n: 2, label: "8 to 10",  sample: "A cell is a tiny living factory with walls, power and instructions." },
  { n: 3, label: "11 to 13", sample: "Cells maintain an internal environment distinct from their surroundings, using membranes to control what enters and leaves." },
  { n: 4, label: "14 to 16", sample: "Cells sustain a non-equilibrium internal state through selective permeability and active transport, at continuous metabolic cost." },
];

export const DEFAULT_LEVEL = 2;

/** The single place root attributes are written. CSS reads them; nothing else
    in the app makes a presentational decision. */
export function applyRoot() {
  const root = document.documentElement;
  root.dataset.level = String(progress.level ?? DEFAULT_LEVEL);
  for (const key of ["theme", "face"]) {
    const v = progress.prefs?.[key];
    if (v) root.dataset[key] = v; else delete root.dataset[key];
  }
}

export function setLevel(n) {
  update((p) => { p.level = Math.min(4, Math.max(1, n | 0)); });
}

/** True until the child has chosen. The picker asks them to pick the sentence
    that feels right — never to type their age. */
export const needsPicker = () => progress.level == null;
