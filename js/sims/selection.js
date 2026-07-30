/* <fp-selection> — natural selection with its three conditions on switches.

   THE THING THIS EXISTS TO TEACH. Natural selection is not a force and not a
   preference. It is what happens automatically, with nobody arranging it, when
   three plain facts about a population are all true at once:

     1. VARIATION      — the individuals are not identical.
     2. HEREDITY       — offspring resemble their parents.
     3. DIFFERENTIAL   — the differences change who survives.
        SURVIVAL

   Every one of those is a fact you can check by looking, not a claim about the
   distant past. And the reason they are on switches rather than in a paragraph
   is that the interesting result is a NEGATIVE one: turn any single condition
   off and adaptation stops dead, while the other two carry on doing exactly
   what they were doing. A child who has watched the line go flat three
   different ways owns the mechanism in a way no definition delivers.

   THE HONESTY. Nothing here is scripted. There is no term anywhere in this file
   that pushes the population towards the background. Each beetle takes its own
   survival roll; the survivors breed; the mean shade moves because of who is
   left, never because anything moved it. If the file contained a "drift toward
   bg" line the whole demonstration would be a puppet show, and the flat lines
   under a switched-off condition are the proof that it does not.

   WHAT IT DELIBERATELY DOES NOT MODEL. Differential FERTILITY — some
   individuals leaving more offspring — is a second route to the same result,
   and survivors here all breed equally so that survival is the only channel
   under test. Naming a mechanism you have isolated is honest; quietly modelling
   two and calling it one is not.

   EPISODIC, not continuous. A generation happens when the child asks for it.
   The shared 60Hz loop only reveals the result, which is why this sim needs no
   reduced-motion substitution: with the reveal removed the mechanism is
   untouched, and both motion modes drive the identical two-beat control. */

import { Sim, token, say } from "./base.js";
import "../components/slider.js";

const COLS = 9;

/* The mean mismatch of a population spread evenly across every shade. When
   differential survival is switched OFF this is the risk EVERY beetle runs, so
   the same number die — only which ones becomes arbitrary. Holding the death
   rate fixed is what makes the comparison a controlled one: if switching the
   condition off also changed how many died, a child could not tell which of the
   two changes made the adaptation stop. */
const FLAT = 1 / 3;

const CONDITIONS = [
  { key: "variation", label: ["All different", "Variation"],
    say: ["the beetles all being different from each other", "variation in the population"] },
  { key: "heredity", label: ["Babies like parents", "Heredity"],
    say: ["babies coming out like their parents", "the trait being heritable"] },
  { key: "survival", label: ["Hiding helps", "Survival differs"],
    say: ["hiding well making any difference to who gets eaten", "survival depending on the trait"] },
];

const clamp = (v) => Math.max(0, Math.min(1, v));
/* The ground and the beetles are drawn from ONE lightness ramp, because
   lightness IS the trait under selection and no palette token can express a
   continuum. It is gated instead: no text is ever drawn on the field, so the
   solved-token contrast rule has nothing to bind on, and the ramp stops short
   of both ends so a beetle is never pure black on pure black. */
const grey = (shade) => `hsl(32 16% ${Math.round(88 - clamp(shade) * 68)}%)`;

class Selection extends Sim {
  /* Episodic: a generation happens when the child asks, not sixty times a
     second. The loop is borrowed for the half-second reveal and handed back. */
  get autoplay() { return false; }

  /* Mount-lifetime state. reset() must not touch any of it: the switches ARE
     the child's hypothesis, and the finished traces are the only record that
     the last run happened. Wiping either on "start again" made the compare-two-
     runs task literally unwinnable. D45. */
  once() {
    this.runs = [];
    this.on = { variation: true, heredity: true, survival: true };
    this.seen = { adapted: false, broken: new Set() };
  }

  setup() {
    this.n = this.params.n ?? 36;
    this.bg = this.params.bg ?? 0.75;
    this.pressure = this.params.pressure ?? 0.8;
    this.mutation = this.params.mutation ?? 0.06;
    this.task = this.params.task ?? "watch";   // "watch" | "break"

    // A finished run becomes a ghost line behind the new one. That picture —
    // this run against the last one — is the entire point of the open track.
    if (this.trace?.length > 2) this.runs = [...this.runs, { trace: this.trace, bg: this.bg }].slice(-4);

    this.gen = 0;
    this.phase = "alive";
    this.reveal = 1;
    this.bugs = Array.from({ length: this.n }, (_, i) =>
      this.hatch(this.on.variation ? Math.random() : 0.5, i));
    this.trace = [this.mean()];
    this.start = this.gap;
  }

  hatch(shade, i) {
    const rows = Math.ceil(this.n / COLS);
    return {
      shade: clamp(shade),
      x: ((i % COLS) + 0.5) / COLS + (Math.random() - 0.5) * 0.04,
      y: (Math.floor(i / COLS) + 0.5) / rows + (Math.random() - 0.5) * 0.08,
      eaten: false,
    };
  }

  mean() { return this.bugs.reduce((s, b) => s + b.shade, 0) / this.bugs.length; }
  /** How far the population is from matching its ground. Adaptation is this
      number falling, and nothing in this file is allowed to lower it directly. */
  get gap() { return Math.abs(this.mean() - this.bg); }
  get allOn() { return CONDITIONS.every((c) => this.on[c.key]); }
  get off() { return CONDITIONS.filter((c) => !this.on[c.key]); }
  /** Whether this run is an experiment at all: if the beetles already match the
      ground there is nothing for selection to do, and a flat line proves
      nothing. Saying so is a lesson about controls, not an error message. */
  get room() { return this.start > 0.18; }

  /* ------------------------------------------------------------- mechanism */

  risk(b) { return this.on.survival ? Math.abs(b.shade - this.bg) : FLAT; }

  hunt() {
    for (const b of this.bugs) b.eaten = Math.random() < this.pressure * this.risk(b);
    // A population wiped to nothing is a blank rectangle, not a lesson. Sparing
    // the two least-at-risk is the same rule doing the same job at the limit —
    // and with survival switched off every risk is equal, so it spares two
    // arbitrary beetles rather than smuggling selection back in.
    if (this.bugs.filter((b) => !b.eaten).length < 2) {
      [...this.bugs]
        .sort((a, b) => this.risk(a) - this.risk(b) || Math.random() - 0.5)
        .slice(0, 2).forEach((b) => { b.eaten = false; });
    }
    this.phase = "hunted";
    this.begin();
  }

  breed() {
    const parents = this.bugs.filter((b) => !b.eaten);
    const sigma = this.on.variation ? this.mutation : 0;
    this.bugs = Array.from({ length: this.n }, (_, i) => {
      let shade;
      if (this.on.heredity) {
        // Parents are taken in turn, so every survivor leaves the same number
        // of offspring and differential SURVIVAL is the only channel at work.
        const p = parents[i % parents.length];
        shade = p.shade + (Math.random() + Math.random() + Math.random() - 1.5) * sigma * 1.4;
      } else {
        // Offspring resemble nobody. The predator still ate the mismatched
        // beetles — and by the next generation it made no difference at all,
        // which is exactly what heredity is for.
        shade = this.on.variation ? Math.random() : 0.5;
      }
      return this.hatch(shade, i);
    });
    this.gen += 1;
    this.trace.push(this.mean());
    this.phase = "alive";
    this.begin();
    this.judge();
  }

  reset() { super.reset(); this.syncControls(); }

  /** One beat forward: hunt, then breed, then hunt again. Two acts rather than
      one button labelled "next generation", because they are two different
      conditions and doing them separately is what makes that visible. */
  next() { this.phase === "alive" ? this.hunt() : this.breed(); }

  /** Start the reveal. Under reduced motion resume() declines and the new state
      is simply already there — the model never depended on the animation. */
  begin() {
    this.reveal = 0;
    if (!this.resume()) this.reveal = 1;
    this.render();
    this.announce();
    this.syncControls();
  }

  step(dt) {
    this.reveal = Math.min(this.reveal + dt / (this.params.beat ?? 0.5), 1);
    if (this.reveal >= 1) this.settle();
  }

  judge() {
    const off = this.off;
    if (!this.room) return;
    if (this.allOn && this.gap < this.start * 0.35) this.seen.adapted = true;
    // Exactly one condition off is the only clean experiment. Two at once still
    // stops adaptation, but it does not tell you which one was responsible —
    // and that distinction is worth more than the result.
    if (off.length === 1 && this.gen >= 5 && this.gap > this.start * 0.7) {
      this.seen.broken.add(off[0].key);
    }

    if (this.task === "break") {
      if (this.seen.adapted && this.seen.broken.size) {
        const names = [...this.seen.broken]
          .map((k) => say(CONDITIONS.find((c) => c.key === k).say));
        const left = CONDITIONS.filter((c) => !this.seen.broken.has(c.key)).length;
        this.succeed({ say: say([
          `You stopped it by taking away ${names[0]}.`,
          `You broke it by removing ${names[0]}. Two other switches are still there — either one stops it too.`,
          `Removing ${names[0]} halted the adaptation while the other two conditions carried on unchanged. ` +
            `${left} condition${left === 1 ? "" : "s"} left to try.`,
          `Adaptation ceased on the removal of ${names[0]}, with the remaining conditions held constant. ` +
            `The result generalises: the three are jointly sufficient and individually necessary, ` +
            `which is why selection needs no agent to arrange it.`,
        ]) });
      }
    } else if (this.seen.adapted) {
      this.succeed({ say: say([
        `After ${this.gen} rounds the beetles match the ground. Nobody changed them — the ones that showed up got eaten.`,
        `${this.gen} generations, and the population now matches its background. No beetle changed colour: the mismatched ones simply left fewer offspring.`,
        `Mean shade converged on the background in ${this.gen} generations. No individual changed; the distribution did.`,
        `The population mean tracked the background over ${this.gen} generations with no individual-level change whatsoever — the shift is entirely in which individuals contributed offspring.`,
      ]) });
    }
  }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    // Everything lives in .sim-controls rather than the play/step pair: the two
    // motion modes drive the identical control here, so there is nothing to
    // substitute and a second copy of the button would be dead weight.
    const ground = document.createElement("fp-slider");
    Object.assign(ground.dataset, {
      label: say(["The ground", "The ground", "Background shade", "Background shade"]),
      min: "0", max: "6", value: String(Math.round(this.bg * 6)), step: "1",
      words: "Snow|Pale sand|Sand|Grey stone|Dark stone|Dark soil|Almost black",
    });
    ground.addEventListener("fp:change", (e) => {
      this.bg = e.detail.value / 6;
      this.start = this.gap;          // a new ground is a new question
      this.render();
      this.announce();
    });
    this.controls.append(ground);

    if (this.params.switches) {
      const box = document.createElement("div");
      box.className = "sim-switches";
      const legend = document.createElement("p");
      legend.className = "sim-switch-note";
      legend.textContent = say([
        "Turn one off and run it again.",
        "Turn one off and run it again. Then put it back and try another.",
        "Switch exactly one off, run five generations, and watch what the line does.",
        "Remove one condition at a time, holding the other two, and note which removals halt adaptation.",
      ]);
      for (const c of CONDITIONS) {
        const b = document.createElement("button");
        b.className = "sim-switch pressable";
        b.dataset.key = c.key;
        b.onclick = () => {
          this.on[c.key] = !this.on[c.key];
          // Changing the hypothesis restarts the population: a run that changed
          // its own rules halfway through would not answer anything.
          this.reset();
          this.syncControls();
        };
        box.append(b);
      }
      this.controls.append(box, legend);
      this.switches = box;
    }

    this.beat = document.createElement("button");
    this.beat.className = "sim-btn pressable sim-beat";
    this.beat.onclick = () => this.next();

    const again = document.createElement("button");
    again.className = "sim-btn pressable";
    again.textContent = say(["Start again", "Start again", "New population", "New population"]);
    again.onclick = () => this.reset();

    const row = document.createElement("div");
    row.className = "sim-play";        // NOT teach-play: this control survives reduced motion
    row.append(this.beat, again);
    this.controls.append(row);

    const key = document.createElement("ul");
    key.className = "sim-legend";
    key.innerHTML =
      `<li><span class="sim-chip" data-shape="circle" style="--chip:var(--ink-3)"></span>A beetle</li>` +
      `<li><span class="sim-chip" data-shape="cross" style="--chip:var(--w-wrong-line)"></span>Eaten this round</li>`;
    this.append(key);

    this.syncControls();
  }

  syncControls() {
    if (this.beat) {
      this.beat.textContent = this.phase === "alive"
        ? say(["Send the bird", "Send the bird", "Run predation", "Run predation"])
        : say(["Let them have babies", "Let the survivors breed", "Breed the survivors", "Breed the survivors"]);
    }
    for (const b of this.switches?.children ?? []) {
      const c = CONDITIONS.find((x) => x.key === b.dataset.key);
      const on = this.on[c.key];
      // Both states are touchable, so both stay raised — the affordance rule
      // says elevation means "you may press this", and it must not be
      // borrowed to mean "this is switched on". Word and aria carry the state.
      b.setAttribute("aria-pressed", String(on));
      b.textContent = `${say(c.label)}: ${on ? "on" : "off"}`;
    }
  }

  /* ------------------------------------------------------------- narration */

  describe() {
    const eaten = this.bugs.filter((b) => b.eaten).length;
    const off = this.off;
    const pale = this.mean() < this.bg;

    const where = !this.room
      ? say([
          "The beetles already match this ground, so there is nothing to change. Move the ground slider first.",
          "The population already matches this ground, so nothing can improve. Move the ground to somewhere they do not match.",
          "The population already sits on its background, so there is no room to adapt and a flat line would prove nothing. Move the background first.",
          "Initial mismatch is below the threshold at which a change would be detectable. Displace the background before running, or the null result is uninterpretable.",
        ])
      : this.gap < this.start * 0.35
        ? say(["The beetles match the ground now.", "The population now matches its background.",
               "Mean shade has converged on the background.", "The population mean has tracked the background to within a third of the starting mismatch."])
        : say([
            `The beetles are still too ${pale ? "pale" : "dark"} for this ground.`,
            `The population is still ${pale ? "paler" : "darker"} than its background.`,
            `Mean shade is still ${pale ? "below" : "above"} the background by ${this.gap.toFixed(2)}.`,
            `Mean shade differs from background by ${this.gap.toFixed(2)}, against a starting mismatch of ${this.start.toFixed(2)}.`,
          ]);

    /* With the predator picking at random the mean still wanders, and roughly
       one run in twenty wanders the right way far enough to look like the real
       thing. That is genetic drift, and it is not a defect to be suppressed —
       it is the reason "the population changed" and "the population adapted"
       are two different claims. Name it when it happens. */
    const luck = !this.on.survival && this.room && this.gap < this.start * 0.5
      ? say([
          "It drifted closer, but by luck — the bird is not looking at colour at all.",
          "It has moved closer, but nothing made it: with the predator choosing at random, the average wanders on its own.",
          "The mean has moved closer without any selection acting. This is drift — change without adaptation.",
          "Directional change in the absence of differential survival: sampling drift, not adaptation. Re-run it and the direction will not repeat.",
        ])
      : "";

    const names = off.map((c) => say(c.label)).join(" and ");
    const switches = off.length
      ? say([
          `You have switched off: ${names}.`,
          `Switched off: ${names}.`,
          `Conditions removed: ${names}.`,
          `Conditions removed: ${names}. ${off.length > 1
            ? "Removing more than one at a time cannot isolate which was responsible."
            : "One at a time isolates the cause."}`,
        ])
      : "";

    const beat = this.phase === "hunted"
      ? say([`${eaten} got eaten. ${this.n - eaten} are left.`,
             `${eaten} of ${this.n} were taken; ${this.n - eaten} survived to breed.`,
             `${eaten} of ${this.n} predated this round.`,
             `${eaten} of ${this.n} predated; survivors breed at equal rate, so survival is the only channel.`])
      : say([`Round ${this.gen + 1}. Nobody has been eaten yet.`,
             `Generation ${this.gen + 1}, before the predator.`,
             `Generation ${this.gen + 1}, pre-predation.`,
             `Generation ${this.gen + 1}, pre-predation.`]);

    return [beat, where, luck, switches].filter(Boolean).join(" ");
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    const fieldH = Math.round(h * 0.58);
    this.drawField(ctx, w, fieldH);
    this.drawTrace(ctx, w, fieldH + 10, h - fieldH - 14);
  }

  drawField(ctx, w, fh) {
    ctx.fillStyle = grey(this.bg);
    ctx.fillRect(0, 0, w, fh);

    for (const b of this.bugs) {
      const going = this.phase === "hunted" && b.eaten;
      const t = going ? this.reveal : 0;
      const r = 9 * (1 - t * 0.6);
      const x = b.x * w;
      const y = 10 + b.y * (fh - 20);

      ctx.globalAlpha = 1 - t * 0.7;
      ctx.fillStyle = grey(b.shade);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      // A hairline so a perfectly camouflaged beetle is still locatable. Real
      // camouflage would make it invisible; a sim you cannot read teaches
      // nothing, so this is the same legibility-over-realism trade the membrane
      // makes by drawing its pores at the size they admit.
      ctx.strokeStyle = b.shade > 0.5 ? "hsl(32 16% 82%)" : "hsl(32 16% 22%)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.72);
      ctx.lineTo(x, y + r * 0.72);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (going) cross(ctx, x, y, 7 + t * 3, token("--w-wrong-line"));
    }
  }

  drawTrace(ctx, w, top, th) {
    const pad = 22;
    const span = Math.max(10, this.trace.length, ...this.runs.map((r) => r.trace.length));
    const px = (i) => pad + (i / (span - 1)) * (w - pad - 8);
    const py = (v) => top + 6 + clamp(v) * (th - 12);

    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, top, w, th);

    // The y axis IS the trait: a strip of the same ramp the beetles are drawn
    // from, so "the line went down" and "the beetles went darker" are the same
    // statement rather than two things to reconcile.
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = grey(i / 23);
      ctx.fillRect(4, py(i / 23) - (th - 12) / 46, 11, (th - 12) / 23 + 1);
    }

    // the ground: what the population is being compared against
    ctx.strokeStyle = token("--ink-3");
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, py(this.bg));
    ctx.lineTo(w - 8, py(this.bg));
    ctx.stroke();
    ctx.setLineDash([]);

    const line = (trace, colour, width) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      trace.forEach((v, i) => ctx[i ? "lineTo" : "moveTo"](px(i), py(v)));
      ctx.stroke();
    };
    ctx.globalAlpha = 0.4;
    for (const r of this.runs) line(r.trace, token("--ink-3"), 2);
    ctx.globalAlpha = 1;
    line(this.trace, token("--w-change-line"), 3);

    const last = this.trace.length - 1;
    ctx.fillStyle = token("--w-change-line");
    ctx.beginPath();
    ctx.arc(px(last), py(this.trace[last]), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Drawn twice: a pale halo under a coloured stroke, so the mark reads on any
   shade of ground. The ground here is a continuum, so there is no one colour
   that could have been chosen instead. */
function cross(ctx, x, y, r, colour) {
  for (const [c, width] of [["hsl(32 16% 95%)", 5], [colour, 2.5]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
}

if (!customElements.get("fp-selection")) customElements.define("fp-selection", Selection);
export default Selection;
