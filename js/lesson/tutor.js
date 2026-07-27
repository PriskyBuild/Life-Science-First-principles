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
const GENERIC = {
  predict: [
    ["Have a guess. You cannot get it wrong here.",
     "Just pick one. A guess you have made is what makes the answer stick.",
     "Commit to something. Being wrong on purpose is a legitimate strategy.",
     "Anchor on a prediction. The size of the correction is what you will retain."],
    ["Read the choices again. Which one feels most likely?",
     "Read them again. Which would you bet a small amount on?",
     "Narrow it to two, then pick between them.",
     "Eliminate the one you are most confident is wrong, then choose."],
    ["Two of them cannot both be true. Which?",
     "Look for the two that disagree most. The answer is usually one of them.",
     "Which two options are actually opposites? The real answer is rarely the neutral one.",
     "The neutral option is almost never right in a designed question. Discount it and compare the rest."],
    ["Have you seen anything like this before?",
     "Has anything you already know behaved like this?",
     "What is the nearest thing you already understand?",
     "What analogous system do you already have a model for?"],
    ["Think about what usually happens when something gets bigger.",
     "Think about what changes when you make an opening bigger — not just for one thing.",
     "Consider the effect on everything, not only the thing you want.",
     "Consider the effect on the full population of species, not the target one."],
    ["It is fine to just pick one and find out. That is what this is for.",
     "Pick one and run it. The result is the teaching, not the guess.",
     "Commit and test. An unconfirmed prediction teaches nothing either way.",
     "Commit, then falsify. The prediction only has value once it meets the result."],
  ],
  sim: [
    ["Try moving the slider and watch what happens.",
     "Move the slider and watch. Something changes — see if you can catch what.",
     "Change one thing at a time and watch what responds.",
     "Vary one parameter and observe. Changing two at once tells you nothing about either."],
    ["Watch just one kind of thing. Ignore the rest.",
     "Pick one kind of molecule and follow only that one.",
     "Track a single species and ignore the others for a moment.",
     "Isolate one species and characterise its behaviour before considering the system."],
    ["Some got through and some did not. What is different about them?",
     "Some crossed and some bounced. What do the ones that crossed have in common?",
     "Compare what crossed with what did not. The difference is one property.",
     "Partition by outcome and find the property that separates the sets."],
    ["It is a bit like a gate that only lets small things through.",
     "Think of a sieve, or a gate with a height limit on it.",
     "Think of any filter you know: what does it use to decide?",
     "Every physical filter discriminates on some property. Which one is available here?"],
    ["The size of the holes matters. What else does?",
     "Hole size is half of it. What about the thing trying to get through?",
     "Passage depends on two quantities, not one. You control one of them.",
     "The criterion is relational: pore versus molecule. You control only one side."],
    ["The holes let small things through and stop big ones. Try setting them so only the good stuff fits.",
     "Passage depends on size against hole size. Find the setting where food fits and poison does not — then check it holds.",
     "This is steric exclusion. Find the pore size between the two molecule sizes, then verify it is stable.",
     "Steric exclusion: set the pore between the two radii. Then check whether that setting satisfies every requirement at once — it may not, and that gap is the point."],
  ],
  build: [
    ["Read what each place says it needs.",
     "Read each label. It says what job that place does.",
     "Read the job descriptions before moving anything.",
     "Read each slot's stated function first; the assignment is determined by it."],
    ["Start with the one you are most sure about.",
     "Do the easy one first. That leaves fewer choices for the rest.",
     "Place the certain ones first and let elimination handle the rest.",
     "Fix the constrained assignments first; the remainder collapses."],
    ["One of them keeps things out. Which part does that?",
     "One job is about keeping things out. Which part did that in the earlier lesson?",
     "Match each job to the lesson it came from.",
     "Each role maps onto one mechanism you have already operated. Recall the mechanism, not the name."],
    ["Think of it like a house: walls, power, plans, builders.",
     "A house has walls, power, plans and builders. Same four jobs here.",
     "Any autonomous system needs a boundary, energy, information and machinery.",
     "Boundary, energy, information, machinery — the same four functions in any self-maintaining system."],
    ["The wall keeps things out. Now do the other three.",
     "The membrane is the wall. That leaves energy, instructions and building.",
     "Boundary is the membrane. Assign energy, information and synthesis.",
     "Membrane is the boundary. The remaining three map to mitochondrion, nucleus and ribosome."],
    ["Membrane keeps things out, mitochondrion makes energy, nucleus keeps instructions, ribosome builds. Put them in and see what survives.",
     "Membrane is the boundary, mitochondrion the power, nucleus the archive, ribosome the factory. Place them and watch which stresses it survives.",
     "Membrane, mitochondrion, nucleus, ribosome — boundary, energy, information, synthesis. Assign them and read which trials pass.",
     "Boundary, energy, archive, synthesis. Assign accordingly, then note which trials each component rescues — that mapping is the lesson."],
  ],
  check: [
    ["Have a go. Getting it wrong tells you something too.",
     "Answer anyway. A wrong answer with an explanation teaches more than skipping.",
     "Attempt it. Failed retrieval with feedback still strengthens the memory.",
     "Attempt regardless. The testing effect survives failure provided feedback follows."],
    ["Think back to what you just did.",
     "Think back to what actually happened in the simulation.",
     "Recall the mechanism you just operated, not the words around it.",
     "Reconstruct from the mechanism you just manipulated rather than from the prose."],
    ["One of these is the opposite of what you saw.",
     "One answer contradicts what you watched happen. Cross it off.",
     "Eliminate the option incompatible with what you observed.",
     "Discard whichever option your own observation falsifies."],
    ["What would happen if it were true?",
     "Take each answer and ask what would follow if it were right.",
     "Test each option by its consequence rather than its plausibility.",
     "Evaluate each by entailment: what would have to be true elsewhere?"],
    ["It is to do with size.",
     "The answer is about one property of the thing, not about the cell doing anything.",
     "Nothing active happened. That rules some options out.",
     "No energy was expended by the system. That constrains the answer set."],
    ["Pick the one that matches what you saw, then read why. The why is the part worth keeping.",
     "Choose and read the explanation. The explanation is the point of the question.",
     "Answer, then read the mechanism. The correction is what makes it stick.",
     "Answer, then read the mechanism given. The feedback, not the score, is what does the work."],
  ],
};

/* Stages with nothing to be stuck on. Offering help on a paragraph is noise. */
const SILENT = new Set(["hook", "name", "apply", "slider"]);

const ladderFor = (stage) => stage?.hints ?? GENERIC[stage?.type] ?? null;

/** The interface a live model would implement. Async by design so swapping in
    a network-backed tutor later touches nothing but this function. */
export async function ask({ stage, rung = 0 }) {
  const ladder = ladderFor(stage);
  if (!ladder) return null;
  const n = Math.min(rung, ladder.length - 1);
  return { rung: n, name: RUNGS[n], text: pick(ladder[n]), last: n >= ladder.length - 1 };
}

export const canHelp = (stage) => !!stage && !SILENT.has(stage.type) && !!ladderFor(stage);

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
