/* The three shell screens. Lessons are not here — they arrive in phase 8 as
   lazily imported modules, which is why nothing below knows what a lesson is. */

import { el } from "./el.js";
import { icon as svgIcon, svgEl } from "./icons.js";
import { progress, reset, update } from "./state.js";
import { LEVELS, DEFAULT_LEVEL, setLevel } from "./level.js";
import {
  worlds, getModule, getWorldOf, isComplete, isModuleUnlocked,
  isWorldUnlocked, worldProgress, lockReason, nextUp, completedCount, allSpecimens,
} from "./curriculum.js";
import { due, dueCount, SESSION_CAP } from "./scheduler.js";
import { BADGES, earnedBadges, hasSpecimen } from "./reward.js";

const lvl = () => progress.level ?? DEFAULT_LEVEL;

/* Which lessons actually exist. Kept here rather than guessed from the lesson
   count so the module screen can be honest about what is written. */
const AUTHORED = new Set(["cells/0", "cells/1", "cells/2", "cells/3", "cells/4"]);

/** Text nodes carry variants and fall back to the nearest lower level, so
    content can ship with two variants and be refined later without a schema
    change. Blueprint 8.6. */
const pick = (v) => (Array.isArray(v) ? v[Math.min(lvl() - 1, v.length - 1)] : v);


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
    el("div", { class: "islands" }, worlds.map(island)),
  ];
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
        const written = AUTHORED.has(`${id}/${i}`);
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
      const written = [...AUTHORED].filter((k) => k.startsWith(`${id}/`)).length;
      return written >= m.lessons ? null : el("p", { class: "notice notice--soft", text:
        `${written} of ${m.lessons} lessons are written. The engine, the format and the review schedule underneath them are already running.` });
    })(),
  ];
}

/* ------------------------------------------------------------------------- me */
function choiceGroup(legend, name, options, currentValue, onPick) {
  return el("fieldset", { class: "choices" },
    el("legend", { text: legend }),
    el("div", { class: "choice-row" },
      options.map((o) =>
        el("label", { class: "choice" },
          el("input", {
            type: "radio", name, value: String(o.value),
            "data-fk": `${name}:${o.value}`,          // survives the repaint, see app.js
            checked: String(o.value) === String(currentValue),
            onchange: () => onPick(o.value),
          }),
          el("span", { class: "choice-box pressable" },
            el("span", { class: "choice-label", text: o.label }),
            o.hint ? el("span", { class: "choice-hint", text: o.hint }) : null)))));
}

/* Preferences go through state.update like everything else — one persistence
   path, one place migrations have to know about. applyRoot() reads them back
   onto <html> so CSS is the only consumer. */
function setPref(key, value) {
  update((p) => { p.prefs[key] = value || null; });
}

function badgeShelf() {
  const earned = new Set(earnedBadges(progress).map((b) => b.id));
  return el("section", { class: "shelf" },
    el("h2", { text: "Badges" }),
    // Every criterion reads the retrieval schedule, never the completion count.
    // "Finished the module" is not a badge; "still had it three weeks later" is.
    el("p", { class: "shelf-note", text: pick([
      "You get these for remembering things later, not for finishing things.",
      "Awarded on what you still remember weeks later — not on what you completed.",
    ]) }),
    el("ul", { class: "badges" }, BADGES.map((b) =>
      el("li", { class: `badge${earned.has(b.id) ? " badge--earned" : ""}` },
        el("span", { class: "badge-mark" }, svgIcon(earned.has(b.id) ? "done" : "lock")),
        el("span", {},
          el("span", { class: "badge-title", text: b.title }),
          el("span", { class: "badge-why", text: b.why }))))));
}

function specimenShelf() {
  const all = allSpecimens();
  if (!all.length) return null;
  return el("section", { class: "shelf" },
    el("h2", { text: "Specimens" }),
    el("p", { class: "shelf-note", text: pick([
      "These are parts, not stickers. You use them to build things later.",
      "Each is a working component: collecting it here is what lets you build with it in a later world.",
    ]) }),
    el("ul", { class: "specimens" }, all.map(({ specimen, module }) => {
      const got = hasSpecimen(specimen.id);
      return el("li", { class: `specimen${got ? " specimen--got" : ""}`, "data-world": module.worldId },
        el("span", { class: "specimen-title", text: got ? specimen.title : "Not collected" }),
        el("span", { class: "specimen-blurb", text: got ? pick(specimen.blurb) : `From ${module.title}` }),
        el("span", { class: "specimen-unlocks", text: got ? specimen.unlocks : "" }));
    })));
}

export function me() {
  const stats = [
    ["XP", progress.xp],
    ["Modules complete", completedCount(progress)],
    ["Day streak", progress.streak.days],
    ["Specimens", progress.specimens.length],
  ];

  return [
    el("a", { class: "back pressable", href: "#/" }, svgIcon("back"), el("span", { text: "Atlas" })),
    el("h1", { text: "Me" }),
    el("ul", { class: "stats" }, stats.map(([k, v]) =>
      el("li", {}, el("span", { class: "stat-v", text: String(v) }), el("span", { class: "stat-k", text: k })))),

    badgeShelf(),
    specimenShelf(),

    choiceGroup("Which sentence feels right?", "level",
      LEVELS.map((l) => ({ value: l.n, label: l.label, hint: l.sample })), lvl(), setLevel),

    choiceGroup("Colours", "theme", [
      { value: "", label: "Match my device" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" },
    ], progress.prefs.theme ?? "", (v) => setPref("theme", v)),

    choiceGroup("Reading", "face", [
      { value: "", label: "Standard" },
      { value: "hyperlegible", label: "Easier to read", hint: "A font designed for low vision and dyslexia" },
    ], progress.prefs.face ?? "", (v) => setPref("face", v)),

    el("button", {
      class: "danger pressable",
      onclick: () => { if (confirm("Erase all progress? This cannot be undone.")) { reset(); location.hash = "#/"; } },
    }, "Erase all progress"),
  ];
}

/* ---------------------------------------------------------------- level picker */
export function levelPicker() {
  return [
    el("h1", { text: "Which one feels right?" }),
    el("p", { class: "lede", text: "Tap the sentence that sounds most like you. You can change it any time." }),
    el("ul", { class: "picker" }, LEVELS.map((l) =>
      el("li", {},
        el("button", { class: "picker-card pressable", onclick: () => { setLevel(l.n); location.hash = "#/"; } },
          el("span", { class: "picker-sample", text: l.sample }),
          el("span", { class: "picker-age", text: `Ages ${l.label}` }))))),
  ];
}
