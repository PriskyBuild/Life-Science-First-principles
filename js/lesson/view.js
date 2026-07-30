/* The lesson screen. Lazily imported by the router, so nothing here costs a
   child sitting on the Atlas anything.

   One stage on screen at a time, deliberately. A scrollable lesson invites
   skimming to the quiz; a paged one makes each beat a decision. */

import { el, mount } from "../el.js";
import { icon } from "../icons.js";
import "../components/predict.js";
import "../components/quiz.js";
import { sfx, readStage, stopSpeaking, voiceMode, canSpeak } from "../audio.js";
import { pick, loadLesson, runner, conceptsOf, content } from "./runner.js";
import { awardXp, completeLesson } from "../reward.js";
import { recordLessonPerformance, levelNudge, acceptNudge, declineNudge } from "../level.js";
import { review, GRADE } from "../scheduler.js";
import { getModule, getWorldOf, lessonFile } from "../curriculum.js";
import { loadParts } from "./parts.js";
import { celebrate } from "./celebrate.js";
import { watchForStuck, loadHints } from "./tutor.js";

/* Which lesson file backs which slot comes from content/authored.json, which
   the build generates by looking at what is on disk. A hand-maintained map
   drifts the moment somebody adds a file, and the drift shows up as a link to
   a lesson that does not exist. */

/* The renderers EVERY lesson has: the three prose beats, plus predict and check.
   Measured, not assumed — check appears in 110 lessons of 110 and predict in
   101, so giving either its own module buys nine lessons a few hundred bytes and
   charges the other hundred a separate gzip stream for it. The four that vary
   travel with their part; see parts.js. (D69) */
const PROSE = {
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
  check: (s, ctx) => {
    const q = el("fp-quiz", {
      "data-concept": s.concept,
      "data-question": pick(s.q),
      "data-options": s.options.join("|"),
      "data-answer": String(s.answer),
      "data-why": pick(s.why),
    });
    q.addEventListener("fp:quiz", (e) => {
      sfx(e.detail.correct ? "right" : "wrong");
      awardXp(e.detail.correct ? "retrievalHit" : "retrievalMiss", { concept: s.concept });
      ctx.tally?.(e.detail.correct);
      ctx.allowAdvance();
    });
    return [el("p", { class: "stage-kicker", text: "Check yourself" }), q];
  },

  /* First sentence headlines, the rest drops to body size. Hooks averaged 29
     words above L1 and all of it was set at display size, which is why they "did
     not register" — a typographic fault, not a reading one. Median headline: 29
     words to 14, with no content edited. (D72) */
  hook: (s) => {
    const text = pick(s.t);
    const cut = text.search(/(?<=[.!?])\s/);
    const head = cut > 0 ? text.slice(0, cut) : text;
    const rest = cut > 0 ? text.slice(cut).trim() : "";
    return [
      el("p", { class: "stage-kicker", text: "Have a think" }),
      el("h2", { class: "stage-hook", text: head }),
      rest ? el("p", { class: "stage-lead", text: rest }) : null,
      s.sub ? el("p", { class: "stage-sub", text: pick(s.sub) }) : null,
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

};

/* Acted on before moving on. Gating a paragraph teaches nothing and makes the
   lesson a corridor. */
const GATED = new Set(["predict", "slider", "check", "sim", "build", "weigh"]);

/* --------------------------------------------------------------------- view */
export async function lessonView(moduleId, indexStr) {
  const index = Number(indexStr);
  const path = lessonFile(moduleId, index);
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
  const lv = content();           // stage filtering and sim complexity
  const walk = runner(lesson, lv);
  // Only what this child's path uses; a filtered-out stage is not paid for. (D69)
  const RENDER = { ...PROSE, ...await loadParts(walk.stages.map((s) => s.type)) };
  loadHints();                    // warm the tutor's ladders while the child reads
  const host = el("div", { class: "stage-host" });
  const tutor = el("fp-tutor", { class: "tutor" });
  const bar = el("div", { class: "stage-bar" });
  const backBtn = el("button", { class: "back pressable", onclick: () => { walk.back(); draw(); } },
    icon("back"), el("span", { text: "Back" }));
  /* One handler, behaviour from state: on the done screen this button is the way
     OUT. Two exits, one of them dead, is what made this read as broken. (D70) */
  const nextBtn = el("button", { class: "next-btn pressable", onclick: () => {
    if (walk.done) { location.hash = `#/m/${moduleId}`; return; }
    walk.next();
    draw();
  } }, el("span", { text: "Next" }), icon("next"));

  /* One control per stage rather than a speaker beside every paragraph. A
     five-year-old should not have to choose between four buttons, and the byte
     cost of a per-block control is real. It reads the rendered stage, so no
     stage renderer knows anything about audio. The Stop state is not optional:
     WCAG 1.4.2 requires a stop for anything that starts playing by itself, and
     auto-read at level 1 starts by itself. */
  let reading = false;
  const readBtn = el("button", { class: "read-btn pressable", onclick: () => {
    if (reading) { stopSpeaking(); reading = false; } else reading = readStage(host, endRead);
    paintRead();
  } });
  function paintRead() {
    readBtn.replaceChildren(icon(reading ? "stop" : "read"),
      el("span", { text: reading ? "Stop" : "Read to me" }));
    readBtn.setAttribute("aria-pressed", String(reading));
  }
  function endRead() { reading = false; paintRead(); }
  paintRead();

  const run = { hits: 0, misses: 0, helped: false };
  const ctx = {
    world: world?.id,
    level: lv,
    allowAdvance() { nextBtn.disabled = false; nextBtn.classList.add("m-attend"); },
    tally(correct) { correct ? (run.hits += 1) : (run.misses += 1); },
  };

  function draw() {
    stopSpeaking();                 // never carry one stage's narration into the next
    reading = false;
    if (walk.done) return finish();
    const s = walk.stage;
    mount(host, el("fp-stage", { class: "stage m-enter", role: "group", "data-type": s.type },
      RENDER[s.type](s, ctx)));
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
    readBtn.hidden = !canSpeak() || voiceMode() === "off";
    if (voiceMode() === "auto") reading = readStage(host, endRead);
    paintRead();
  }

  function finish() {
    const concepts = conceptsOf(lesson);
    // completeLesson owns the whole transaction: mark done, pay, bank the
    // specimen, seed the schedule, flush. This is the moment the spacing engine
    // starts running for this child.
    completeLesson(moduleId, index, { concepts, specimen: lesson.specimen });
    sfx("badge");
    recordLessonPerformance(run);
    celebrate();
    const nudge = levelNudge();
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
      /* Offered, never applied. Moving a child's level without asking is a
         thing that happens TO them, and the whole reason this exists is that
         self-selected difficulty skews upward and needed a corrective. */
      nudge ? el("div", { class: "nudge" },
        el("p", { class: "nudge-q", text: nudge.direction === "down"
          ? pick(["That one was hard. Want the science a bit gentler for a while?",
                  "That was a tough one. Shall I make the science a little gentler? The words stay exactly as they are."])
          : pick(["That was easy for you. Want it harder?",
                  "You got everything without help. Shall I make the science harder? The words stay as they are."]) }),
        el("div", { class: "nudge-row" },
          el("button", { class: "back pressable", onclick: (e) => {
            acceptNudge(nudge);
            e.target.closest(".nudge").replaceChildren(el("p", { class: "nudge-q", text: "Done. You can change it back in Me any time." }));
          } }, el("span", { text: nudge.direction === "down" ? "Yes, gentler" : "Yes, harder" })),
          el("button", { class: "back pressable", onclick: (e) => {
            declineNudge();
            e.target.closest(".nudge").remove();
          } }, el("span", { text: "No, leave it" })))) : null,
    ));
    bar.replaceChildren();
    // Sprout too: nothing to be stuck on once the lesson is done. (D70)
    backBtn.hidden = readBtn.hidden = tutor.hidden = true;
    nextBtn.disabled = false;
    nextBtn.classList.add("m-attend");
    mount(nextBtn, el("span", { text: `Back to ${mod.title}` }), icon("next"));
  }

  queueMicrotask(() => {
    draw();
    // Struggle is detected, not self-reported: three seconds short of a minute
    // with no input, or one wrong answer, and Sprout puts its hand up.
    watchForStuck(host, () => tutor.nudge?.());
    tutor.addEventListener("click", () => { run.helped = true; });
  });

  return [
    el("a", { class: "back pressable", href: `#/m/${moduleId}` }, icon("back"), el("span", { text: mod.title })),
    // Was sr-only: a blind child heard the lesson's name, nobody else did. (D72)
    el("h1", { class: "lesson-h", text: lesson.title }),
    el("div", { class: "stage-wrap", "data-world": world.id },
      /* The read control sits with the CONTENT it reads, not with Back and Next.
         Three buttons wrapped the nav row onto three lines on a phone, and a
         stop control below the fold is not a stop control — WCAG 1.4.2 wants it
         findable, not merely present. */
      el("div", { class: "stage-top" },
        el("div", { class: "stage-progress", role: "progressbar" }, bar), readBtn),
      host,
      tutor,
      el("div", { class: "stage-nav" }, backBtn, nextBtn)),
  ];
}

/* --------------------------------------------------------------- review flow */
