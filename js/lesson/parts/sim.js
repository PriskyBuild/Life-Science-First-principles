/* The simulation stage. The sim MODULES were already per-stage lazy; this is
   the renderer around them, which a lesson with no sim stage no longer pays for.

   Simulations are imported by name, only when a stage asks for one. A child who
   never reaches lesson 2 never downloads the physics. */

import { el, mount } from "../../el.js";
import { pick } from "../runner.js";
import { sfx } from "../../audio.js";
import { celebrate } from "../celebrate.js";

/** Level-indexed simulation parameters: one shared implementation, different
    starting complexity. L1's membrane has two molecule types, L4's has six. */
function paramsFor(stage, lv) {
  return { ...(stage.params ?? {}), ...(stage.paramsByLevel?.[String(lv)] ?? {}) };
}

const SIMS = {
  membrane: () => import("../../sims/membrane.js"),
  energy: () => import("../../sims/energy.js"),
  selection: () => import("../../sims/selection.js"),
  replication: () => import("../../sims/replication.js"),
  folding: () => import("../../sims/folding.js"),
  spike: () => import("../../sims/spike.js"),
  stomata: () => import("../../sims/stomata.js"),
  web: () => import("../../sims/web.js"),
  outbreak: () => import("../../sims/outbreak.js"),
};

export const RENDER = {
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
      node.addEventListener("fp:sim-goal", (e) => {
        celebrate();
        goal.hidden = false;
        /* Two sentences with two different authors. The lesson's `goal` says
           what the objective was; `detail.say` is the simulation's own account
           of what THIS child actually did — which switch they threw, how many
           generations it took — and no string in the JSON can know that. */
        sfx("right");
        mount(goal,
          el("span", { text: pick(s.goal) }),
          e.detail?.say ? el("span", { class: "stage-said", text: e.detail.say }) : null);
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
};
