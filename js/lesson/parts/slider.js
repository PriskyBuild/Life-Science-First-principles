/* The slider exploration, with the element it drives. */

import { el } from "../../el.js";
import { pick } from "../runner.js";
import "../../components/slider.js";

export const RENDER = {
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
};
