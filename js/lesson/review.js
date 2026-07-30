/* The review screen. A DIFFERENT ROUTE from a lesson, and it used to live in
   view.js — so every child opening any lesson downloaded the whole spaced-
   retrieval flow, and every child doing their reviews downloaded the nine stage
   renderers they were not going to see. Neither pays for the other now. (D69)

   Retrieval, not revision: the beat is always a question first. */

import { el, mount } from "../el.js";
import { icon } from "../icons.js";
import { pick } from "./runner.js";
import { awardXp } from "../reward.js";
import { review, GRADE } from "../scheduler.js";
import { watchForStuck } from "./tutor.js";
import "../components/quiz.js";

export async function reviewView() {
  const { due } = await import("../scheduler.js");
  const beats = await (await fetch("content/reviews.json")).json();
  const queue = due().filter((id) => beats[id]);

  if (!queue.length) {
    return [
      el("a", { class: "back pressable", href: "#/" }, icon("back"), el("span", { text: "Atlas" })),
      el("h1", { text: "Nothing due" }),
      el("p", { class: "notice notice--soft", text:
        "Come back tomorrow. Spacing only works if there is a gap — testing yourself twice in one sitting is just reading twice." }),
    ];
  }

  const host = el("div", { class: "stage-host" });
  let i = 0;

  function draw() {
    if (i >= queue.length) {
      mount(host, el("div", { class: "stage stage--done m-enter" },
        el("p", { class: "stage-kicker", text: "Done" }),
        el("h2", { text: `${queue.length} tested.` }),
        el("p", { class: "stage-sub", text: pick([
          "The ones you got will come back later. The ones you missed come back sooner.",
          "Anything you missed returns tomorrow; anything you got moves further out.",
          "Missed items reset to a one-day interval; correct ones move up the ladder.",
          "Lapses reset the interval and drop ease; successes advance the step and hold it.",
        ]) }),
        el("a", { class: "back pressable", href: "#/" }, icon("back"), el("span", { text: "Atlas" }))));
      return;
    }
    const beat = beats[queue[i]];
    const q = el("fp-quiz", {
      "data-concept": queue[i],
      "data-question": pick(beat.q),
      "data-options": beat.options.join("|"),
      "data-answer": String(beat.answer),
      "data-why": pick(beat.why),
    });
    q.addEventListener("fp:quiz", (e) => {
      // Pay first, grade second: review() ends with a flush, so ordering it
      // last makes the whole beat one durable transaction rather than leaving
      // the XP in a debounce behind it.
      awardXp(e.detail.correct ? "retrievalHit" : "retrievalMiss", { concept: e.detail.concept });
      review(e.detail.concept, e.detail.correct ? GRADE.got : GRADE.missed);
      next.disabled = false;
      next.classList.add("m-attend");
    });
    const next = el("button", { class: "next-btn pressable", onclick: () => { i += 1; draw(); } },
      el("span", { text: i === queue.length - 1 ? "Finish" : "Next" }), icon("next"));
    next.disabled = true;
    const tutor = el("fp-tutor", { class: "tutor" });
    mount(host, el("fp-stage", { class: "stage m-enter", role: "group", "data-type": "check" },
      el("p", { class: "stage-kicker", text: `From earlier — ${i + 1} of ${queue.length}` }),
      q,
      tutor,
      el("div", { class: "stage-nav" }, next)));
    tutor.setStage?.({ type: "check" });
    watchForStuck(host, () => tutor.nudge?.());
  }

  queueMicrotask(draw);

  return [
    el("a", { class: "back pressable", href: "#/" }, icon("back"), el("span", { text: "Atlas" })),
    el("h1", { text: "Do you still have it?" }),
    el("p", { class: "lede", text: pick([
      "Things you learned a while ago. Guess even if you are not sure.",
      "Ideas from earlier lessons. Answering from memory is what makes them stay.",
      "Retrieval, not revision. Trying to recall beats re-reading, even when you get it wrong.",
      "Spaced retrieval. Attempting recall before checking is what produces the effect; a wrong attempt with feedback still counts.",
    ]) }),
    el("div", { class: "stage-wrap", "data-world": "discovery" }, host),
  ];
}
