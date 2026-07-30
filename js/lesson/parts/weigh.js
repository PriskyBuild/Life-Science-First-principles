/* The weigh stage. Native <details>, so there is no component to import — but
   only eight lessons in 110 have one, which is reason enough to lift it out. */

import { el } from "../../el.js";
import { pick } from "../runner.js";

export const RENDER = {
  /* Two or more ATTRIBUTED readings of the same evidence.

     A disagreement stated as two beliefs is a stand-off and a child can only
     pick a side. Stated as two sets of EXPECTATIONS it becomes something a
     person can go and check, which is the only version worth teaching. So
     `predicts` is the field that does the work here, not `claim`.

     `who` is mandatory and the build enforces it: this format cannot assert an
     interpretation without saying whose it is. The page never speaks in its own
     voice on a weigh stage — every sentence belongs to somebody named.

     Native <details> rather than a custom disclosure, so keyboard, screen
     reader and find-in-page all work without being rebuilt. Both views must be
     opened before Next unlocks: reading one side and moving on is the failure
     mode this whole stage type exists to prevent. */
  weigh: (s, ctx) => {
    const opened = new Set();
    const cards = s.views.map((v, i) => {
      const card = el("details", { class: "weigh-view" },
        el("summary", { class: "weigh-who pressable" }, el("span", { text: v.who })),
        el("div", { class: "weigh-body" },
          el("p", { class: "weigh-claim", text: pick(v.claim) }),
          el("p", { class: "weigh-because", text: pick(v.because) }),
          v.predicts ? el("p", { class: "weigh-predicts" },
            el("strong", { text: "So it expects to find: " }),
            el("span", { text: pick(v.predicts) })) : null));
      card.addEventListener("toggle", () => {
        if (!card.open) return;
        opened.add(i);
        if (opened.size === s.views.length) ctx.allowAdvance();
      });
      return card;
    });
    return [
      el("p", { class: "stage-kicker", text: s.views.length === 2
        ? "Two readings of the same evidence" : "Readings of the same evidence" }),
      el("p", { class: "stage-lead", text: pick(s.t) }),
      s.evidence ? el("p", { class: "weigh-evidence" },
        el("strong", { text: "Not in dispute: " }), el("span", { text: pick(s.evidence) })) : null,
      el("div", { class: "weigh-views" }, cards),
      // An open question, deliberately with nowhere to type. Not everything
      // worth asking a child is a thing to be marked.
      s.ask ? el("p", { class: "weigh-ask", text: pick(s.ask) }) : null,
    ];
  },
};
