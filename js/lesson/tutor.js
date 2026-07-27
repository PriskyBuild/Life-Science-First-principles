/* Sprout — the learning companion. Blueprint 9.

   Rule-based, offline, deterministic, zero cost, no backend, no data leaves the
   device. Behind one async interface so a live model can be substituted later
   without touching a call site.

   IT NEVER GIVES ANSWERS until the last rung. The ladder escalates only on real
   struggle, and rungs 0-2 are the whole product for most children:

     0 notice      "Something changed when you did that. Did you see what?"
     1 focus       "Watch just the blue ones this time."
     2 compare     "Those got through. Those didn't. What's different?"
     3 analogy     "A door that only lets some people through — where else?"
     4 partial     "Size matters here. What else might?"
     5 consolidate names the concept, then immediately asks them to apply it

   Only rung 5 states a fact, and it is reached only after genuine struggle.

   Lessons may author their own ladder per stage. Where they have not, the
   generic ladder below is used — written per stage TYPE, so the tutor is useful
   from the first lesson rather than waiting for 125 lessons to be annotated.
   ponytail: generic ladders, not per-stage authoring, until a real child shows
   the generic ones falling short. */

import { pick } from "./runner.js";

export const RUNGS = ["notice", "focus", "compare", "analogy", "partial", "consolidate"];

/* Level-scaled register: the same rung, said the way this child is spoken to. */
/* The ladders live in content/hints.json, not here.

   They were 9 KB of strings compiled into the lesson bundle, which is why that
   budget sat at 93% — one component from failing — for prose that is not code.
   As content they are fetched with the lesson, cached, and editable by someone
   who does not write JavaScript. Sprout's voice should not need a build. */
let GENERIC = null;

export async function loadHints() {
  if (GENERIC) return GENERIC;
  try {
    GENERIC = await (await fetch("content/hints.json")).json();
  } catch {
    GENERIC = {};        // no hints is a quiet tutor, not a broken lesson
  }
  return GENERIC;
}

/* Stages with nothing to be stuck on. Offering help on a paragraph is noise. */
const SILENT = new Set(["hook", "name", "apply", "slider"]);

const ladderFor = (stage) => stage?.hints ?? GENERIC?.[stage?.type] ?? null;

/** The interface a live model would implement. Async by design so swapping in
    a network-backed tutor later touches nothing but this function. */
export async function ask({ stage, rung = 0 }) {
  await loadHints();
  const ladder = ladderFor(stage);
  if (!ladder) return null;
  const n = Math.min(rung, ladder.length - 1);
  return { rung: n, name: RUNGS[n], text: pick(ladder[n]), last: n >= ladder.length - 1 };
}

/* Synchronous, so setStage can decide visibility without awaiting: once the
   hints have loaded it is exact, and before then it errs toward offering help
   for the stage types that always have a ladder. */
const ALWAYS_HAS_A_LADDER = new Set(["predict", "sim", "build", "check"]);
export const canHelp = (stage) =>
  !!stage && !SILENT.has(stage.type) && (!!stage.hints || ALWAYS_HAS_A_LADDER.has(stage.type));

/* ------------------------------------------------------------------ element */
/* Non-modal by construction: it is a details/summary in the flow of the page.
   It never traps focus, never covers the thing the child is working on, and
   never appears without them asking or genuinely struggling. */
class Tutor extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "";
    this.rung = 0;

    this.button = document.createElement("button");
    this.button.className = "tutor-ask pressable";
    this.button.type = "button";
    this.button.onclick = () => this.next();

    this.panel = document.createElement("div");
    this.panel.className = "tutor-panel";
    this.panel.setAttribute("role", "status");
    this.panel.setAttribute("aria-live", "polite");
    this.panel.hidden = true;

    this.append(this.button, this.panel);
    this.setStage(this.stage ?? null);      // a stage set before connection still applies
  }

  /* Tolerates being called before connection: the lesson creates the element
     and sets its stage in the same tick that builds the DOM, so the first call
     always lands before connectedCallback. */
  setStage(stage) {
    this.stage = stage;
    this.rung = 0;
    if (!this.panel) return;
    this.panel.hidden = true;
    this.panel.replaceChildren();
    this.hidden = !canHelp(stage);
    this.button.textContent = this.label(0);
    delete this.dataset.nudged;
  }

  label(rung) {
    return rung === 0 ? "I'm stuck" : "Still stuck";
  }

  /** Called by the stuck detector. Draws attention once, never opens itself —
      a panel that appears on its own is a thing that happened TO the child. */
  nudge() {
    if (this.hidden || this.dataset.nudged || !this.panel.hidden) return;
    this.dataset.nudged = "";
    this.button.classList.add("m-attend");
  }

  async next() {
    const turn = await ask({ stage: this.stage, rung: this.rung });
    if (!turn) return;
    this.rung += 1;
    this.panel.hidden = false;
    this.panel.dataset.rung = turn.name;
    this.panel.replaceChildren(
      Object.assign(document.createElement("p"), { className: "tutor-line", textContent: turn.text }),
    );
    this.panel.classList.remove("m-attend");
    void this.panel.offsetWidth;
    this.panel.classList.add("m-attend");
    this.button.textContent = turn.last ? "That's all I've got" : this.label(this.rung);
    this.button.disabled = turn.last;
    this.button.classList.remove("m-attend");
  }
}

if (!customElements.get("fp-tutor")) customElements.define("fp-tutor", Tutor);

/* ----------------------------------------------------------- stuck detector */
/* Detected, never self-reported. A child who has to press "I need help" to be
   noticed is a child who has already decided they are bad at this. */
export function watchForStuck(root, onStuck, { idleMs = 45000 } = {}) {
  let timer = 0;
  let misses = 0;

  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onStuck("idle"), idleMs);
  };

  const activity = () => reset();
  for (const ev of ["pointerdown", "keydown", "input", "fp:change"]) {
    root.addEventListener(ev, activity, { passive: true });
  }
  // A wrong answer is the strongest signal there is, and it needs no timer.
  root.addEventListener("fp:quiz", (e) => { if (!e.detail.correct && ++misses >= 1) onStuck("wrong"); });
  reset();

  return () => { clearTimeout(timer); for (const ev of ["pointerdown", "keydown", "input", "fp:change"]) root.removeEventListener(ev, activity); };
}
