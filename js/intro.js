/* THE CHILD'S FIRST THIRTY SECONDS.

   The front door is written for the parent. When they hand the device over, the
   first thing the child met was "Which one feels right?" — four sentences to
   measure yourself against. Of every screen in the product it is the only one
   that asks before it gives, and it was the one a five-year-old saw first.

   So this sits between the handover and the picker, and it is not a splash
   screen. A splash is a wait, and nothing here may make a child wait to be shown
   a logo. It is the thesis performed instead of stated: you touch it, it does
   something, and the word arrives afterwards.

   ONE CELL, AND THEY DIVIDE IT. Tap and it splits. Tap again and both split.
   Five taps and there are thirty-two, all descended from the one they started
   with, each half the size of its parent — which is what actually happens in a
   cleaving embryo, where the cells divide without the whole growing. The count
   doubling in front of them IS the lesson: 1, 2, 4, 8, 16, 32. Then the name.

   THE ONE SCREEN THAT CANNOT USE THE TWO DIALS. It runs before either has been
   set, so there is no prose level to write to. Everything here is one register,
   short enough for a five-year-old and not so soft that a fifteen-year-old feels
   handled. That constraint is why the copy is this plain.

   DOM AND CSS, NOT CANVAS. Cells are elements, movement is a CSS transition,
   breathing is a CSS animation. No render loop, no canvas, no frame budget —
   and reduced motion is then a media query rather than a code path. Further down
   the ladder, and it does more. (D81) */

import { el } from "./el.js";
import { icon as svgIcon } from "./icons.js";
import { setPref } from "./state.js";

/* Five taps to thirty-two, and it keeps going after that rather than locking.
   Freezing the moment a child most wants to keep poking is the exact mistake the
   simulations were built to avoid. */
const CAP = 256;

/* The golden angle. Successive children push apart at 137.5°, which is what a
   sunflower does with its seeds, and it fills a space evenly without a single
   call to random — so the same taps always give the same picture, and a test can
   assert against it. */
const GOLDEN = 2.39996;

/* What to say at each size. Chosen so the first line a child ever reads in this
   product is an instruction they can obey in one second. */
const BEATS = [
  { n: 1,  h: "Poke it.",                         s: "Go on. Nothing in here breaks." },
  { n: 2,  h: "Again.",                           s: "One became two." },
  { n: 4,  h: "And again.",                       s: "Two became four. Notice they got smaller." },
  { n: 8,  h: "Keep going.",                      s: "It doubles every single time." },
  { n: 16, h: "Keep going.",                      s: "Sixteen. All of them from the one you started with." },
  { n: 32, h: "Look what you made.",              s: "Thirty-two, and not one of them is new — they are all the first one, split up." },
  { n: 64, h: "This is how you were made.",       s: "You started as one cell and did this about forty-five times." },
];

const beatFor = (n) => BEATS.filter((b) => n >= b.n).at(-1);

export function intro() {
  let cells = [{ x: 50, y: 50 }];
  let taps = 0;

  const field = el("div", { class: "intro-field", "aria-hidden": "true" });
  const head = el("h1", { class: "intro-h" });
  const sub = el("p", { class: "intro-sub" });
  const tally = el("p", { class: "intro-count", "aria-live": "polite", "aria-atomic": "true" });
  const named = el("div", { class: "intro-named", hidden: true },
    el("p", { class: "intro-kicker", text: "Now it has a name" }),
    el("p", { class: "intro-name", text: "Dividing." }),
    el("p", { class: "intro-sub", text:
      "You did it before you knew the word. That is the order everything here happens in." }));

  /* ONE BIG CONTROL, NOT A HUNDRED SMALL ONES. Every cell being a button would
     mean a keyboard user tabbing through two hundred and fifty-six of them, and
     a screen reader reading each. The field is the control; the cells are what
     it looks like. */
  const poke = el("button", { class: "intro-poke pressable", type: "button",
    "aria-describedby": "intro-count", onclick: () => divide() }, field);

  function paint() {
    const b = beatFor(cells.length);
    head.textContent = b.h;
    sub.textContent = b.s;
    tally.textContent = cells.length === 1 ? "1 cell" : `${cells.length} cells`;
    poke.setAttribute("aria-label", `Divide the cells. There ${cells.length === 1 ? "is 1" : `are ${cells.length}`} now.`);
    named.hidden = cells.length < 32;

    /* Cleavage divides without growing: the whole stays the size it was and each
       cell is half the volume of its parent. So the radius follows the count,
       and a child watching sees them get smaller without being told to. */
    const r = Math.max(2.2, 34 / Math.sqrt(cells.length));
    field.style.setProperty("--r", `${r}%`);
    field.replaceChildren(...cells.map((c, i) =>
      el("span", { class: "intro-cell", style: `--x:${c.x}%; --y:${c.y}%; --d:${(i % 12) * 260}ms` })));
  }

  function divide() {
    if (cells.length >= CAP) return;
    taps++;
    const reach = 42 / Math.sqrt(cells.length * 2);
    cells = cells.flatMap((c, i) => {
      const a = i * GOLDEN + taps;
      const dx = Math.cos(a) * reach, dy = Math.sin(a) * reach * 0.68;
      return [{ x: c.x + dx, y: c.y + dy }, { x: c.x - dx, y: c.y - dy }];
    }).map((c) => ({ x: Math.min(94, Math.max(6, c.x)), y: Math.min(92, Math.max(8, c.y)) }));
    paint();
  }

  paint();
  tally.id = "intro-count";

  return [
    el("section", { class: "intro", "data-world": "origins" },
      head,
      sub,
      poke,
      tally,
      named,
      /* Always available, from the first second. A child who does not want to
         play must not be trapped, and a parent who is showing three children in
         a row should not have to divide cells three times. */
      el("button", { class: "next-btn pressable m-attend", "data-world": "origins",
        onclick: () => { setPref("met", "1"); location.hash = "#/"; } },
        el("span", { text: "I'm ready" }), svgIcon("next"))),
  ];
}
