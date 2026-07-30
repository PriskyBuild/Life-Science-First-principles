/* The build stage and the boss, with the placement primitive it drives. This is
   the largest part in the tier by some way, and most lessons do not have one. */

import { el } from "../../el.js";
import { icon } from "../../icons.js";
import { pick } from "../runner.js";
import { sfx } from "../../audio.js";
import "../../components/board.js";

export const RENDER = {
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
    /* The climax of the whole module was silent to a screen reader: the trials
       rendered as a plain div. A concise spoken summary goes first, then the
       readable detail — announcing the full list verbatim would be a paragraph
       of speech nobody asked for. */
    const spoken = el("p", { class: "sr-only", role: "status", "aria-live": "polite" });

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
      const won = results.filter((r) => r.survived).length;
      sfx(won === results.length ? "right" : "wrong");
      spoken.textContent = won === results.length
        ? `All ${results.length} stresses survived. ${pick(s.win)}`
        : `${won} of ${results.length} stresses survived. ${results.filter((r) => !r.survived).map((r) => pick(r.name)).join(" and ")} failed.`;
      verdict.classList.add("m-attend");
      // Surviving everything is the win. Failing is not a wall: the child sees
      // exactly which part was missing and can put it in and test again.
      ctx.allowAdvance();
    });

    return [
      el("p", { class: "stage-kicker", text: s.guided ? "Put it together" : "Build it" }),
      el("p", { class: "stage-lead", text: pick(s.t) }),
      board,
      spoken,
      verdict,
    ];
  },
};
