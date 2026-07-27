/* The lesson screen. Lazily imported by the router, so nothing here costs a
   child sitting on the Atlas anything.

   One stage on screen at a time, deliberately. A scrollable lesson invites
   skimming to the quiz; a paged one makes each beat a decision. */

import { el, mount } from "../el.js";
import { icon } from "../icons.js";
import { pick, loadLesson, runner, conceptsOf, level } from "./runner.js";
import { awardXp, completeLesson } from "../reward.js";
import { review, GRADE } from "../scheduler.js";
import { getModule, getWorldOf } from "../curriculum.js";
import "../components/predict.js";
import "../components/slider.js";
import "../components/quiz.js";
import "../components/board.js";
import { watchForStuck, canHelp } from "./tutor.js";

const LESSONS = {
  "cells/0": "cells/01-city-in-a-speck.json",
  "cells/1": "cells/02-the-wall-that-chooses.json",
  "cells/2": "cells/03-the-power-plant.json",
  "cells/3": "cells/04-the-instruction-room.json",
  "cells/4": "cells/05-build-a-cell.json",
};

/* Simulations are imported by name, only when a stage asks for one. A child who
   never reaches lesson 2 never downloads the physics. */
const SIMS = {
  membrane: () => import("../sims/membrane.js"),
  energy: () => import("../sims/energy.js"),
};

/** Level-indexed simulation parameters: one shared implementation, different
    starting complexity. L1's membrane has two molecule types, L4's has six. */
function paramsFor(stage, lv) {
  return { ...(stage.params ?? {}), ...(stage.paramsByLevel?.[String(lv)] ?? {}) };
}

/* ------------------------------------------------------------ stage renderers */
const RENDER = {
  hook: (s) => [
    el("p", { class: "stage-kicker", text: "Have a think" }),
    el("h2", { class: "stage-hook", text: pick(s.t) }),
    s.sub ? el("p", { class: "stage-sub", text: pick(s.sub) }) : null,
  ],

  predict: (s, ctx) => {
    const p = el("fp-predict", {
      "data-question": pick(s.question),
      "data-options": s.options.join("|"),
    });
    // XP is paid on committing, before anything is known about correctness.
    p.addEventListener("fp:predict", () => {
      awardXp("predict", { concept: s.concept ?? null });
      ctx.allowAdvance();
    });
    const run = el("button", { class: "back pressable", onclick: () => { p.echo(s.outcome); run.disabled = true; } },
      icon("next"), el("span", { text: "See what happens" }));
    run.disabled = true;
    p.addEventListener("fp:predict", () => { run.disabled = false; }, { once: true });
    return [
      el("p", { class: "stage-kicker", text: "Predict first" }),
      p,
      s.note ? el("p", { class: "stage-note", text: pick(s.note) }) : null,
      el("div", { class: "stage-actions" }, run),
    ];
  },

  /* The exploration. `guided: true` is the L1/L2 track — the caption names what
     the child is seeing as they see it, which is the implicit scaffolding PhET
     found makes a simulation teach rather than entertain. The L3/L4 version
     asks them to predict where the answer falls before the label arrives. */
  slider: (s, ctx) => {
    const caption = el("p", { class: "stage-caption", text: s.captions[s.value] });
    const after = el("p", { class: "stage-after", text: pick(s.after) });
    after.hidden = true;
    let reached = false;
    const sl = el("fp-slider", {
      "data-label": s.label, "data-min": s.min, "data-max": s.max,
      "data-value": s.value, "data-step": "1",
    });
    sl.addEventListener("fp:change", (e) => {
      caption.textContent = s.captions[e.detail.value] ?? "";
      if (!reached && e.detail.value === s.max) {
        reached = true;
        after.hidden = false;
        after.classList.add("m-attend");
        ctx.allowAdvance();
      }
    });
    return [
      el("p", { class: "stage-kicker", text: s.guided ? "Have a look" : "Work it out" }),
      el("p", { class: "stage-lead", text: pick(s.t) }),
      sl,
      el("div", { class: "stage-readout", "data-world": ctx.world }, caption),
      after,
    ];
  },

  /* The naming. On the guided track this arrives one stage after the
     exploration; on the open track the child has already got there. */
  name: (s) => [
    el("p", { class: "stage-kicker", text: "So that is what it is" }),
    el("h2", { class: "stage-name", text: pick(s.t) }),
    s.sub ? el("p", { class: "stage-sub", text: pick(s.sub) }) : null,
  ],

  apply: (s) => [
    el("p", { class: "stage-kicker", text: s.kicker ?? "Why this matters" }),
    el("p", { class: "stage-lead", text: pick(s.t) }),
  ],

  sim: (s, ctx) => {
    const holder = el("div", { class: "sim-holder" });
    const goal = el("p", { class: "stage-after" });
    goal.hidden = true;

    SIMS[s.sim]().then(() => {
      const node = document.createElement(`fp-${s.sim}`);
      node.className = "sim";
      for (const [k, v] of Object.entries(paramsFor(s, ctx.level))) {
        node.dataset[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      node.addEventListener("fp:sim-goal", () => {
        celebrate();
        goal.hidden = false;
        goal.textContent = pick(s.goal);
        goal.classList.add("m-attend");
        ctx.allowAdvance();
      });
      holder.replaceChildren(node);
    });

    // A child who cannot reach the goal is not trapped in the lesson. The
    // objective is worth trying for; it is not a toll gate.
    const skip = el("button", { class: "back pressable", onclick: () => { skip.hidden = true; ctx.allowAdvance(); } },
      el("span", { text: "I have had enough of this one" }));

    return [
      el("p", { class: "stage-kicker", text: s.guided ? "Try it" : "Work it out" }),
      el("p", { class: "stage-lead", text: pick(s.t) }),
      holder,
      goal,
      el("div", { class: "stage-actions" }, skip),
    ];
  },

  /* The build stage. Drives the phase 4 placement primitive from lesson JSON,
     so tap-tap, keyboard and drag all work here for free.

     `trials` turns it into the boss: once everything is placed, each trial
     names a part and what happens without it, and the result is computed from
     what the child ACTUALLY assembled. A boss that congratulates you regardless
     of what you built is a cutscene. */
  build: (s, ctx) => {
    const board = el("fp-board", { "data-label": pick(s.t) },
      el("div", { "data-tray": true },
        s.parts.map((part) => el("fp-placeable", { "data-id": part.id, "data-label": part.label }, part.label))),
      el("div", { class: "board-slots" },
        // `accepts` constrains what may be dropped — right for a guided build,
        // where the point is learning the names. The boss omits it, so any part
        // fits any job and `correct` decides whether the assignment was right.
        // Without that distinction a complete build was always a correct build,
        // and the stress test could only ever be won: a cutscene, not a boss.
        s.slots.map((slot) => el("fp-slot", {
          "data-accepts": slot.accepts ?? null,
          "data-correct": slot.correct ?? slot.accepts ?? null,
          "data-label": pick(slot.label),
        }))));

    const verdict = el("div", { class: "trials" });
    verdict.hidden = true;

    board.addEventListener("fp:place", () => {
      const slots = board.slots;
      if (slots.some((slot) => !slot.item)) return;      // still assembling

      // A part only counts if it is doing the job it was placed in.
      const working = new Set(slots.filter((slot) => slot.item.dataset.id === slot.dataset.correct)
        .map((slot) => slot.item.dataset.id));

      if (!s.trials) {
        if (working.size === slots.length) ctx.allowAdvance();
        return;
      }
      const results = s.trials.map((t) => ({ ...t, survived: t.needs.every((n) => working.has(n)) }));
      verdict.hidden = false;
      verdict.replaceChildren(
        el("h3", { text: pick(s.trialsTitle ?? ["Now let's test it", "Stress test"]) }),
        el("ul", { class: "trial-list" }, results.map((r) =>
          el("li", { class: `trial trial--${r.survived ? "pass" : "fail"}` },
            icon(r.survived ? "done" : "lock"),
            el("span", {},
              el("strong", { text: pick(r.name) }),
              el("span", { class: "trial-why", text: pick(r.survived ? r.pass : r.fail) }))))),
        el("p", { class: "trial-summary", text: results.every((r) => r.survived)
          ? pick(s.win) : pick(s.lose) }),
      );
      verdict.classList.add("m-attend");
      // Surviving everything is the win. Failing is not a wall: the child sees
      // exactly which part was missing and can put it in and test again.
      ctx.allowAdvance();
    });

    return [
      el("p", { class: "stage-kicker", text: s.guided ? "Put it together" : "Build it" }),
      el("p", { class: "stage-lead", text: pick(s.t) }),
      board,
      verdict,
    ];
  },

  check: (s, ctx) => {
    const q = el("fp-quiz", {
      "data-concept": s.concept,
      "data-question": pick(s.q),
      "data-options": s.options.join("|"),
      "data-answer": String(s.answer),
      "data-why": pick(s.why),
    });
    q.addEventListener("fp:quiz", (e) => {
      awardXp(e.detail.correct ? "retrievalHit" : "retrievalMiss", { concept: s.concept });
      ctx.allowAdvance();
    });
    return [el("p", { class: "stage-kicker", text: "Check yourself" }), q];
  },
};

/* Stages that must be acted on before the child can move on. Everything else
   advances freely — gating a paragraph behind a click teaches nothing and
   just makes the lesson feel like a corridor. */
const GATED = new Set(["predict", "slider", "check", "sim", "build"]);

/* One short pulse, on achievement only — never on every press. The resolver's
   own guidance says do not overuse it, and a phone buzzing on each tap is
   miserable. prefers-reduced-motion is the opt-out: it is the existing signal
   for "less stimulation, please", and adding a second toggle for one line of
   code would be a setting nobody asked for. */
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate?.(14);
}

/* --------------------------------------------------------------------- view */
export async function lessonView(moduleId, indexStr) {
  const index = Number(indexStr);
  const path = LESSONS[`${moduleId}/${index}`];
  const mod = getModule(moduleId);
  const world = getWorldOf(moduleId);

  if (!path) {
    return [
      el("a", { class: "back pressable", href: `#/m/${moduleId}` }, icon("back"), el("span", { text: mod?.title ?? "Back" })),
      el("h1", { text: "Not written yet" }),
      el("p", { class: "notice", text:
        "This lesson has not been authored. The engine, the format and lesson one are real; the rest of the module arrives in phase 8." }),
    ];
  }

  const lesson = await loadLesson(path);
  const lv = level();
  const walk = runner(lesson, lv);
  const host = el("div", { class: "stage-host" });
  const tutor = el("fp-tutor", { class: "tutor" });
  const bar = el("div", { class: "stage-bar" });
  const backBtn = el("button", { class: "back pressable", onclick: () => { walk.back(); draw(); } },
    icon("back"), el("span", { text: "Back" }));
  const nextBtn = el("button", { class: "next-btn pressable", onclick: () => { walk.next(); draw(); } },
    el("span", { text: "Next" }), icon("next"));

  const ctx = {
    world: world?.id,
    level: lv,
    allowAdvance() { nextBtn.disabled = false; nextBtn.classList.add("m-attend"); },
  };

  function draw() {
    if (walk.done) return finish();
    const s = walk.stage;
    mount(host, el("fp-stage", { class: "stage m-enter", "data-type": s.type }, RENDER[s.type](s, ctx)));
    // Sprout re-arms per stage: the ladder is about THIS problem, and carrying
    // a rung across stages would have it answering a question nobody asked.
    tutor.setStage?.(s);
    bar.replaceChildren(...Array.from({ length: walk.total }, (_, i) =>
      el("span", { class: `tick${i < walk.index ? " tick--done" : i === walk.index ? " tick--now" : ""}` })));
    bar.setAttribute("aria-label", `Step ${walk.index + 1} of ${walk.total}`);
    backBtn.disabled = walk.index === 0;
    nextBtn.disabled = GATED.has(s.type);
    nextBtn.classList.remove("m-attend");
    nextBtn.querySelector("span").textContent = walk.index === walk.total - 1 ? "Finish" : "Next";
    host.querySelector(".stage")?.setAttribute("tabindex", "-1");
    host.querySelector(".stage")?.focus({ preventScroll: true });
  }

  function finish() {
    const concepts = conceptsOf(lesson);
    // completeLesson owns the whole transaction: mark done, pay, bank the
    // specimen, seed the schedule, flush. This is the moment the spacing engine
    // starts running for this child.
    completeLesson(moduleId, index, { concepts, specimen: lesson.specimen });
    celebrate();
    mount(host, el("div", { class: "stage stage--done m-enter" },
      el("p", { class: "stage-kicker", text: "Done" }),
      el("h2", { text: pick([
        "You finished it.",
        "Lesson complete.",
        "Lesson complete — and it is now on your review schedule.",
        "Complete. Both concepts are now queued for spaced retrieval.",
      ]) }),
      el("p", { class: "stage-sub", text: pick([
        "We will ask you about this again in a few days, so it sticks.",
        "You will see these ideas again in a day or two. That is what makes them stay.",
        "Spaced retrieval is scheduled: tomorrow, then three days, then a week. Testing beats re-reading.",
        "Queued at 1, 3, 7, 16 and 35 days, adjusted by how you do. Retrieval, not review.",
      ]) }),
      lesson.specimen ? el("p", { class: "stage-note", text: "Specimen collected. Check Me." }) : null,
      el("a", { class: "back pressable", href: `#/m/${moduleId}` }, icon("back"), el("span", { text: "Back to the module" }))));
    bar.replaceChildren();
    backBtn.hidden = nextBtn.hidden = true;
  }

  queueMicrotask(() => {
    draw();
    // Struggle is detected, not self-reported: three seconds short of a minute
    // with no input, or one wrong answer, and Sprout puts its hand up.
    watchForStuck(host, () => tutor.nudge?.());
  });

  return [
    el("a", { class: "back pressable", href: `#/m/${moduleId}` }, icon("back"), el("span", { text: mod.title })),
    el("h1", { class: "sr-only", text: lesson.title }),
    el("div", { class: "stage-wrap", "data-world": world.id },
      el("div", { class: "stage-progress", role: "progressbar" }, bar),
      host,
      tutor,
      el("div", { class: "stage-nav" }, backBtn, nextBtn)),
  ];
}

/* --------------------------------------------------------------- review flow */
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
    mount(host, el("fp-stage", { class: "stage m-enter", "data-type": "check" },
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

if (!customElements.get("fp-stage")) {
  customElements.define("fp-stage", class extends HTMLElement {
    connectedCallback() { this.setAttribute("role", "group"); }
  });
}
