/* The Me screen: progress, badges, the specimen shelf and every setting.

   A ROUTE, not the landing — so it is imported when somebody opens it, and a
   child booting to the Atlas never downloads any of it. Same reasoning as the
   lesson tier in D69: a bundle should cost what the screen you are on costs. */

import { el, mount } from "./el.js";
import { icon as svgIcon, svgOf } from "./icons.js";
import { progress, reset, setPref } from "./state.js";
import { LEVELS, DEPTH, prose, content, setLevels } from "./level.js";
import { specimensByWorld, completedCount } from "./curriculum.js";
import { BADGES, earnedBadges, hasSpecimen } from "./reward.js";
import { sfx, canSpeak } from "./audio.js";
import { OWNER, LICENCE, pick } from "./screens.js";

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

/* The drawings arrive AFTER the shelf, never before it, and the shelf is fully
   readable without them. A picture is the reward for collecting the thing; it is
   not allowed to be a prerequisite for reading about it. One fetch, cached, and a
   failure is silence rather than an empty screen. (D71) */
let artPromise;
function drawSpecimen(slot, id) {
  artPromise ??= fetch("content/specimen-art.json").then((r) => r.json()).catch(() => ({}));
  artPromise.then((art) => {
    if (art[id] && slot.isConnected) {
      slot.replaceChildren(svgOf(art[id], { cls: "specimen-art", box: 48 }));
    }
  });
}

/* Grouped by world, and a world you have not opened yet collapses to one line.
   Flat, this was thirteen filled cards followed by ninety-seven identical grey
   ones — an enormous scroll of nothing, and the drawings made the emptiness more
   conspicuous rather than less. Native <details>, so keyboard, screen reader and
   find-in-page work without any of it being rebuilt. A world with something in it
   opens by default: what you have found should never need a click. (D73) */
function specimenShelf() {
  const groups = specimensByWorld();
  if (!groups.length) return null;
  const held = groups.reduce((n, g) => n + g.items.filter((i) => hasSpecimen(i.specimen.id)).length, 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return el("section", { class: "shelf" },
    el("div", { class: "shelf-head" },
      el("h2", { text: "Specimens" }),
      el("span", { class: "shelf-count", text: `${held} of ${total}` })),
    el("p", { class: "shelf-note", text: pick([
      "These are parts, not stickers. You use them to build things later.",
      "Each is a working component: collecting it here is what lets you build with it in a later world.",
    ]) }),
    groups.map(({ world, items }) => {
      const mine = items.filter((i) => hasSpecimen(i.specimen.id)).length;
      const box = el("details", { class: "shelf-world", "data-world": world.id },
        el("summary", { class: "shelf-summary pressable" },
          el("span", { class: "shelf-world-name", text: world.title }),
          el("span", { class: "shelf-world-count", text: `${mine} of ${items.length}` })),
        el("ul", { class: "specimens" }, items.map(({ specimen, module }) => {
          const got = hasSpecimen(specimen.id);
          // Only for collected ones: seeing the drawing IS the reveal.
          const slot = got ? el("span", { class: "specimen-slot" }) : null;
          if (slot) drawSpecimen(slot, specimen.id);
          return el("li", { class: `specimen${got ? " specimen--got" : ""}`, "data-world": module.worldId },
            slot,
            el("span", { class: "specimen-title", text: got ? specimen.title : "Not collected" }),
            el("span", { class: "specimen-blurb", text: got ? pick(specimen.blurb) : `From ${module.title}` }),
            el("span", { class: "specimen-unlocks", text: got ? specimen.unlocks : "" }));
        })));
      box.open = mine > 0;
      return box;
    }));
}

export function me() {
  /* No XP number and no streak. Both were built carefully and read by nothing:
     not a badge, not a screen, not a decision. A score with no evidence that a
     child wants it is a number that teaches score-watching. Badges stay,
     because they are evidence of mastery, and specimens stay because they are
     content. See DECISIONS D37. */
  const stats = [
    ["Modules finished", completedCount(progress)],
    ["Specimens", progress.specimens.length],
    ["Badges", earnedBadges(progress).length],
  ];

  return [
    el("a", { class: "back pressable", href: "#/" }, svgIcon("back"), el("span", { text: "Atlas" })),
    el("h1", { text: "Me" }),
    el("ul", { class: "stats" }, stats.map(([k, v]) =>
      el("li", {}, el("span", { class: "stat-v", text: String(v) }), el("span", { class: "stat-k", text: k })))),

    badgeShelf(),
    specimenShelf(),

    /* Two dials, deliberately separate and deliberately explained. Reading
       ability and conceptual maturity are independent, and the child who needs
       that most is the one who cannot get at it if they are one control. */
    el("p", { class: "shelf-note", text: pick([
      "You can change how the words are written and how hard the science is, one at a time.",
      "Words and science are separate settings. Make the words easier without making the science easier — that is allowed, and it is what it is for.",
    ]) }),
    choiceGroup("How should the words be written?", "prose",
      LEVELS.map((l) => ({ value: l.n, label: l.label, hint: l.sample })), prose(),
      (v) => setLevels({ prose: v })),
    choiceGroup("How deep should the science go?", "content",
      DEPTH.map((d) => ({ value: d.n, label: d.label, hint: d.hint })), content(),
      (v) => setLevels({ content: v })),

    choiceGroup("Colours", "theme", [
      { value: "", label: "Match my device" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" },
    ], progress.prefs.theme ?? "", (v) => setPref("theme", v)),

    /* Sound defaults ON: it is synthesised, so it costs nothing to ship, and
       the confirmation chime on switching it back on is the fastest way to know
       what the setting does. Voice defaults are DERIVED from the prose dial
       rather than fixed — see audio.js. There is no music control because there
       is no music. */
    choiceGroup("Sounds", "sound", [
      { value: "", label: "On", hint: "Quiet clicks and chimes as you play" },
      { value: "off", label: "Off" },
    ], progress.prefs.sound ?? "", (v) => { setPref("sound", v); sfx("pick"); }),

    canSpeak() ? choiceGroup("Reading aloud", "voice", [
      { value: "", label: "Match my reading level", hint: "Reads by itself at level 1, on request above it" },
      { value: "auto", label: "Always read to me" },
      { value: "ask", label: "Only when I ask" },
      { value: "off", label: "Never" },
    ], progress.prefs.voice ?? "", (v) => setPref("voice", v)) : null,

    choiceGroup("Letter shapes", "face", [
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
/* ------------------------------------------------------------------ welcome
   The front door, written for the ADULT — the parent is who decides whether this
   gets used. Until this existed, the first screen was the reading-level picker,
   offering four sentences about cells to someone who had not been told what the
   thing was. Real feedback, and fair. (D72)

   THE COPY LIVES IN content/welcome.json, not here. It is content, it will be
   revised by someone who does not want to open a JavaScript file to do it, and
   1.5 KB of prose in the shell is 1.5 KB every child downloads to boot. Only the
   headline and the button are inline, so a failed fetch still leaves a screen
   that says something and a control that works. (D73) */
