/* The three shell screens. Lessons are not here — they arrive in phase 8 as
   lazily imported modules, which is why nothing below knows what a lesson is. */

import { el } from "./el.js";
import { icon as svgIcon, svgEl } from "./icons.js";
import { progress, setPref } from "./state.js";
import { LEVELS, prose, content, setLevels } from "./level.js";
import {
  worlds, getModule, getWorldOf, isComplete, isModuleUnlocked,
  isWorldUnlocked, worldProgress, lockReason, nextUp, completedCount, specimensByWorld,
  playableWorlds, comingWorlds, writtenCount, isWritten,
} from "./curriculum.js";
import { due, dueCount, SESSION_CAP } from "./scheduler.js";

const lvl = prose;   /* text variants are a reading decision, always */

/* Ownership, in one place. Shown on the front door and under Me, and the only
   two strings in the app that make a claim about who this belongs to. */
export const OWNER = "© 2026 PriskyBuild";
export const LICENCE = "All rights reserved";

/** Text nodes carry variants and fall back to the nearest lower level, so
    content can ship with two variants and be refined later without a schema
    change. Blueprint 8.6. */
export const pick = (v) => (Array.isArray(v) ? v[Math.min(lvl() - 1, v.length - 1)] : v);


/* ---------------------------------------------------------------- progress ring */
function ring(fraction, hue) {
  const R = 15.5, C = 2 * Math.PI * R;
  const s = svgEl("svg");
  s.setAttribute("viewBox", "0 0 36 36");
  s.setAttribute("class", "ring");
  s.setAttribute("aria-hidden", "true");
  // A zero-length dash with a round linecap still paints a dot, which reads as
  // "1% done" on a module nobody has touched. Omit the fill entirely at zero.
  const arcs = fraction > 0 ? [["ring-track", 1], ["ring-fill", fraction]] : [["ring-track", 1]];
  for (const [cls, frac] of arcs) {
    const c = svgEl("circle");
    c.setAttribute("cx", "18"); c.setAttribute("cy", "18"); c.setAttribute("r", String(R));
    c.setAttribute("class", cls);
    c.style.stroke = cls === "ring-fill" ? `var(--w-${hue}-line)` : "var(--hairline)";
    c.style.strokeDasharray = `${(C * frac).toFixed(2)} ${C.toFixed(2)}`;
    s.append(c);
  }
  return s;
}

/* ---------------------------------------------------------------------- atlas */
function moduleNode(m, world, next) {
  const done = isComplete(m.id, progress);
  const open = isModuleUnlocked(m.id, progress);
  const isNext = m.id === next;
  const state = done ? "done" : !open ? "locked" : isNext ? "next" : "open";
  const doneCount = Math.min(progress.modules[m.id]?.lessonsDone ?? 0, m.lessons);

  const status = done ? "Complete"
    : !open ? lockReason(m.id, progress) || "Locked"
    : isNext ? "Start here"
    : `${doneCount} of ${m.lessons} lessons`;

  const inner = [
    el("span", { class: "node-mark" }, svgIcon(done ? "done" : !open ? "lock" : "next")),
    el("span", { class: "node-body" },
      el("span", { class: "node-title", text: m.title }),
      // The Continue card above already shows this module's hook. Repeating it
      // 200px later reads as a rendering bug, not as emphasis.
      isNext ? null : el("span", { class: "node-hook", text: pick(m.hook) }),
      // Status is text, never colour alone — 1 in 12 boys cannot use the colour.
      el("span", { class: "node-status", text: status })),
  ];

  return el("li", { class: `node node--${state}`, "data-world": world.id },
    open
      ? el("a", { class: "node-hit pressable", href: `#/m/${m.id}`,
                  "aria-current": isNext ? "step" : null }, inner)
      : el("div", { class: "node-hit", "aria-disabled": "true" }, inner));
}

function island(world) {
  const openWorld = isWorldUnlocked(world, progress);
  const frac = worldProgress(world, progress);
  const next = nextUp(progress);

  return el("section", {
    class: `island${openWorld ? "" : " island--locked"}`,
    "data-world": world.id,
    "aria-labelledby": `w-${world.id}`,
    style: `view-transition-name: island-${world.id}`,
  },
    el("header", { class: "island-head" },
      ring(frac, world.id),
      el("div", {},
        el("h2", { id: `w-${world.id}`, text: world.title }),
        el("p", { class: "island-tag", text: pick(world.tagline) })),
      el("span", { class: "island-pct", text: `${Math.round(frac * 100)}%` })),
    el("ul", { class: "chain" }, world.modules.map((m) => moduleNode(m, world, next))));
}

export function atlas() {
  const next = nextUp(progress);
  const m = next && getModule(next);
  const ready = due().length, waiting = dueCount();
  return [
    el("h1", { text: "Atlas" }),
    el("p", { class: "lede", text: pick([
      "Every place here is something alive. Pick one and go.",
      "Twenty-five modules across six worlds. Most of them are already open to you.",
    ]) }),
    // Reviews sit above new material: a due retrieval is worth more than the
    // next lesson, and the Atlas should say so. Flat, not raised — the review
    // flow itself lands in phase 6, and the affordance rule forbids dressing
    // a non-control up as one.
    ready ? el("a", { class: "review-call pressable", href: "#/review", "data-world": "discovery" },
        el("span", { class: "continue-kicker", text: "Ready to test" }),
        el("span", { class: "continue-title", text:
          `${ready} idea${ready === 1 ? "" : "s"} you learned earlier` }),
        el("span", { class: "continue-hook", text: waiting > ready
          // no silent caps: say what was held back, blueprint 15
          ? `${waiting} are due; ${SESSION_CAP} at a time is deliberate, so coming back after a month is not a punishment.`
          : "Testing yourself is worth more than reading it again — it is the strongest effect in the field." }),
        svgIcon("next", "icon icon--lg")) : null,
    m ? el("a", { class: "continue pressable", href: `#/m/${m.id}`, "data-world": getWorldOf(m.id).id },
        el("span", { class: "continue-kicker", text: progress.xp ? "Continue" : "Start here" }),
        el("span", { class: "continue-title", text: m.title }),
        el("span", { class: "continue-hook", text: pick(m.hook) }),
        svgIcon("next", "icon icon--lg")) : null,
    el("div", { class: "islands" }, playableWorlds().map(island)),
    signpost(),
  ];
}

/* One card instead of eighteen empty modules. Finishing Cells used to open
   eight modules that all said "not yet written", which reads as abandoned
   rather than early. A small map that feels finished beats a large one that
   feels broken. */
function signpost() {
  const coming = comingWorlds();
  if (!coming.length) return null;
  return el("section", { class: "signpost" },
    el("h2", { text: pick(["More is being built", "Still being built"]) }),
    /* This used to say "the one you are in is finished", which stopped being
       true the moment a lesson was authored in a module that is not complete.
       Copy that states a fact about the content has to be computed from the
       content, or it becomes a lie quietly and nobody notices. */
    el("p", { class: "shelf-note", text: pick([
      `${coming.length} more worlds are being made. You can play everything on the map above.`,
      `${coming.length} more worlds are being written. Some are waiting on lessons earlier in the map, so they will appear on their own as those are finished.`,
    ]) }),
    el("ul", { class: "signpost-list" }, coming.map((w) =>
      el("li", { "data-world": w.id },
        el("span", { class: "signpost-title", text: w.title }),
        el("span", { class: "signpost-tag", text: pick(w.tagline) })))));
}

/* --------------------------------------------------------------------- module */
export function module(id) {
  const m = getModule(id);
  if (!m) return [el("h1", { text: "Not found" }), el("a", { href: "#/", text: "Back to the Atlas" })];
  const world = getWorldOf(id);
  const open = isModuleUnlocked(id, progress);
  const doneCount = Math.min(progress.modules[id]?.lessonsDone ?? 0, m.lessons);
  const titles = m.lessonTitles ?? [];

  return [
    el("a", { class: "back pressable", href: "#/" }, svgIcon("back"), el("span", { text: "Atlas" })),
    el("div", { class: "module-head", "data-world": world.id },
      el("p", { class: "module-world", text: world.title }),
      el("h1", { text: m.title, style: `view-transition-name: island-${world.id}` }),
      el("p", { class: "module-hook", text: pick(m.hook) })),
    open ? null : el("p", { class: "notice", text: lockReason(id, progress) || "Locked" }),
    el("h2", { text: `${m.lessons} lessons` }),
    el("ol", { class: "lessons", "data-world": world.id },
      Array.from({ length: m.lessons }, (_, i) => {
        const written = isWritten(id, i);
        const inner = [
          el("span", { class: "lesson-n", text: String(i + 1) }),
          el("span", { class: "lesson-t", text: titles[i] ?? "Not yet written" }),
          i < doneCount ? svgIcon("done") : written ? svgIcon("next") : null,
        ];
        // Written lessons are links and are raised; unwritten ones are flat and
        // dashed. The affordance rule does the honesty for us.
        return el("li", { class: `lesson${i < doneCount ? " lesson--done" : ""}${written ? " lesson--open" : ""}` },
          written && open
            ? el("a", { class: "lesson-hit pressable", href: `#/l/${id}/${i}` }, inner)
            : el("div", { class: "lesson-hit" }, inner));
      })),
    (() => {
      const written = writtenCount(id);
      return written >= m.lessons ? null : el("p", { class: "notice notice--soft", text:
        `${written} of ${m.lessons} lessons are written. The engine, the format and the review schedule underneath them are already running.` });
    })(),
  ];
}

/* ------------------------------------------------------------------------- me */
export async function welcome() {
  const c = await fetch("content/welcome.json").then((r) => r.json())
    .catch(() => ({ headline: "A child runs the experiment first. The name for it comes after." }));
  return [
    el("img", { class: "owner-mark", src: "assets/publisher-mark.png",
      width: 320, height: 320, alt: "", decoding: "async" }),
    el("h1", { class: "welcome-h", text: c.headline }),
    c.lede ? el("p", { class: "lede", text: c.lede }) : null,
    c.facts ? el("ul", { class: "welcome-facts" }, c.facts.map(([k, v]) =>
      el("li", {}, el("span", { class: "welcome-k", text: k }),
        el("span", { class: "welcome-v", text: v })))) : null,
    /* data-world is not decoration. .next-btn paints itself from --w-deep, which
       only exists inside a world, so outside one it rendered cream text on a cream
       page: present, sized, shadowed and invisible. (D72) */
    el("button", { class: "next-btn pressable m-attend", "data-world": "discovery",
      onclick: () => { setPref("greeted", "1"); location.hash = "#/"; } },
      el("span", { text: c.cta ?? "Start" }), svgIcon("next")),
    c.note ? el("p", { class: "welcome-note", text: c.note }) : null,
    el("p", { class: "owner-line", text: `${OWNER} · ${LICENCE}` }),
  ];
}

export function levelPicker() {
  return [
    el("h1", { text: "Which one feels right?" }),
    el("p", { class: "lede", text: "Tap the sentence that sounds most like you. You can change it any time." }),
    el("ul", { class: "picker" }, LEVELS.map((l) =>
      el("li", {},
        el("button", { class: "picker-card pressable",
          onclick: () => { setLevels({ prose: l.n, content: l.n }); location.hash = "#/"; } },
          el("span", { class: "picker-sample", text: l.sample }),
          el("span", { class: "picker-age", text: `Ages ${l.label}` }))))),
  ];
}
