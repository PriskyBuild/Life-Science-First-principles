/* <fp-web> — a food web you can take a species out of.

   THE MODEL is the standard tri-trophic Lotka–Volterra system with logistic
   growth at the bottom — a real model, taught in every ecology course:

       dP/dt = rP(1 − P/K) − aPH        plants, with a carrying capacity
       dH/dt = baPH − mH − cHC          herbivores
       dC/dt = dcHC − nC                carnivores

   Nothing in it is scripted. Every number the child sees is the state of three
   coupled equations, and the interesting results are consequences rather than
   outcomes anybody arranged.

   MEASURED BEFORE ANY LESSON WAS WRITTEN AGAINST IT:

     • Plants alone climb to K = 100 and stop there. Not because anything caps
       them — because the growth term goes to zero when P reaches K.
     • The full web settles at 66.7 / 15.0 / 14.3 and stays there.
     • Remove the carnivore and herbivores go 15 → 33.4 while plants CRASH from
       66.7 to 25.7 — down to 39% of where they were. That is a trophic
       cascade: taking away the top changed the bottom, through a level nobody
       touched. It is the Yellowstone wolf result, in three equations.

   WHAT IT DOES NOT SHOW, and is therefore not used to teach: these are counts
   of individuals, not biomass, and a carnivore does not weigh what a herbivore
   weighs. So the equilibrium here is NOT a biomass pyramid and the lessons do
   not present it as one — the ten-percent rule is taught from real ecological
   figures in a separate stage. Using a model for what it actually demonstrates
   is the whole of D51, D55 and D57, and this is the fourth time. */

import { Sim, token, say } from "./base.js";

const K = 100, R = 0.9, A = 0.02, B = 0.35, M = 0.18, C_ = 0.02, D = 0.4, N = 0.12;
const RATE = 10;          // model time units per real second
const SUB = 0.02;         // integration substep
const SPAN = 240;         // trace samples

const LEVELS = [
  { key: "plants", label: ["Plants", "Producers"], hue: "--w-living-line" },
  { key: "herbivores", label: ["Plant eaters", "Herbivores"], hue: "--w-change-line" },
  { key: "carnivores", label: ["Hunters", "Carnivores"], hue: "--w-wrong-line" },
];

class Web extends Sim {
  once() {
    this.on = { plants: true, herbivores: true, carnivores: true };
    this.seen = {};
  }

  setup() {
    this.task = this.params.task ?? "cascade";      // "capacity" | "cascade"
    this.P = this.params.p0 ?? (this.task === "capacity" ? 5 : 60);
    this.H = this.on.herbivores ? (this.params.h0 ?? 25) : 0;
    this.C = this.on.carnivores ? (this.params.c0 ?? 8) : 0;
    if (!this.on.plants) this.P = 0;
    this.t = 0;
    this.steady = 0;
    this.trace = [];
  }

  step(dt) {
    this.t += dt;
    let m = dt * RATE;
    const n = Math.max(1, Math.ceil(m / SUB)), h = m / n;
    for (let i = 0; i < n; i++) {
      const dP = this.on.plants ? R * this.P * (1 - this.P / K) - A * this.P * this.H : -this.P;
      const dH = this.on.herbivores ? B * A * this.P * this.H - M * this.H - C_ * this.H * this.C : -this.H;
      const dC = this.on.carnivores ? D * C_ * this.H * this.C - N * this.C : -this.C;
      const was = [this.P, this.H, this.C];
      this.P = Math.max(0, this.P + dP * h);
      this.H = Math.max(0, this.H + dH * h);
      this.C = Math.max(0, this.C + dC * h);
      // "Settled" means nothing is moving, measured rather than assumed.
      const move = Math.abs(this.P - was[0]) + Math.abs(this.H - was[1]) + Math.abs(this.C - was[2]);
      this.steady = move < 0.0004 ? this.steady + h : 0;
    }
    if (this.trace.length > SPAN) this.trace.shift();
    this.trace.push([this.P, this.H, this.C]);
    this.judge();
  }

  get settled() { return this.steady > 8; }

  judge() {
    if (!this.settled) return;

    if (this.task === "capacity") {
      if (this.on.plants && !this.on.herbivores && Math.abs(this.P - K) < 2) {
        this.succeed({ say: say([
          `The plants grew fast, then slowed down, then stopped at ${Math.round(this.P)}. Nothing stopped them — they ran out of room.`,
          `Growth slowed as numbers rose and stopped at ${Math.round(this.P)}. Nothing imposed that ceiling; it is where new growth exactly balances what the space can support.`,
          `The population settled at carrying capacity. The logistic term falls to zero as P approaches K, so the ceiling is a consequence of the growth rule rather than a limit added to it.`,
          `P → K by construction of the logistic term, and the approach is asymptotic rather than abrupt. Worth noting that real populations frequently overshoot and oscillate around K instead, because reproduction responds to conditions with a lag this model does not include.`,
        ]) });
      }
      return;
    }

    // cascade: the child must see the full web settled AND the web without its top
    const key = this.on.carnivores ? "full" : "noTop";
    if (this.on.plants && this.on.herbivores) {
      this.seen[key] = { P: this.P, H: this.H, C: this.C };
    }
    if (this.seen.full && this.seen.noTop) {
      const dP = Math.round((1 - this.seen.noTop.P / this.seen.full.P) * 100);
      const up = Math.round((this.seen.noTop.H / this.seen.full.H - 1) * 100);
      this.succeed({ say: say([
        `Taking the hunters away made the plants drop by ${dP} out of every 100. You never touched the plants.`,
        `Removing the top level cut the plants by ${dP}% and raised the plant-eaters by ${up}%. Nothing was done to the plants directly at all.`,
        `Removal of the carnivore produced a ${up}% rise in herbivores and a ${dP}% fall in plants — an effect propagating two levels down, through a level that was never manipulated.`,
        `A trophic cascade: ${up}% more herbivores, ${dP}% fewer plants, from a single removal two levels up. This is the Yellowstone wolf result in three equations, and it is why "this species only eats that one" is never a sufficient account of what removing it does.`,
      ]) });
    }
  }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    if (this.params.switches) {
      const box = document.createElement("div");
      box.className = "sim-switches";
      for (const lv of LEVELS) {
        const b = document.createElement("button");
        b.className = "sim-switch pressable";
        b.dataset.key = lv.key;
        b.onclick = () => {
          this.on[lv.key] = !this.on[lv.key];
          this.reset();               // a run that changes its own rules halfway answers nothing
          this.syncControls();
        };
        box.append(b);
      }
      this.controls.append(box);
      this.switches = box;
    }

    const again = document.createElement("button");
    again.className = "sim-btn pressable";
    again.textContent = say(["Start again", "Start again", "Re-run", "Re-run"]);
    again.onclick = () => this.reset();
    const row = document.createElement("div");
    row.className = "sim-play";     // not teach-play: survives reduced motion
    row.append(again);
    this.controls.append(row);
    this.syncControls();
  }

  syncControls() {
    for (const b of this.switches?.children ?? []) {
      const lv = LEVELS.find((x) => x.key === b.dataset.key);
      const on = this.on[lv.key];
      b.setAttribute("aria-pressed", String(on));
      b.textContent = `${say(lv.label)}: ${on ? "here" : "gone"}`;
    }
  }

  reset() { super.reset(); this.syncControls(); }

  /* ------------------------------------------------------------- narration */

  describe() {
    const n = (x) => Math.round(x);
    const gone = LEVELS.filter((l) => !this.on[l.key]).map((l) => say(l.label).toLowerCase());
    const state = this.settled
      ? say(["Nothing is changing any more.", "The web has settled.",
             "The system has reached equilibrium.", "The system has reached a stable equilibrium."])
      : say(["Still changing.", "Still settling.", "Not yet at equilibrium.", "Not yet at equilibrium."]);
    const missing = gone.length
      ? say([` You have taken away the ${gone.join(" and ")}.`,
             ` Removed: ${gone.join(", ")}.`,
             ` Removed from the web: ${gone.join(", ")}.`,
             ` Removed from the web: ${gone.join(", ")}.`])
      : "";
    return say([
      `${n(this.P)} plants, ${n(this.H)} plant eaters, ${n(this.C)} hunters. `,
      `Plants ${n(this.P)}, herbivores ${n(this.H)}, carnivores ${n(this.C)}. `,
      `P ${n(this.P)}, H ${n(this.H)}, C ${n(this.C)}. `,
      `P ${n(this.P)}, H ${n(this.H)}, C ${n(this.C)}. `,
    ]) + state + missing;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    const top = 10, barH = 20, gap = 8;
    const vals = [this.P, this.H, this.C];
    LEVELS.forEach((lv, i) => {
      const y = top + i * (barH + gap);
      ctx.fillStyle = token("--hairline");
      ctx.fillRect(12, y, w - 24, barH);
      ctx.fillStyle = token(lv.hue);
      ctx.fillRect(12, y, Math.min(1, vals[i] / K) * (w - 24), barH);
      ctx.fillStyle = token("--ink");
      ctx.font = `700 11px ${getComputedStyle(this).fontFamily}`;
      ctx.textAlign = "left";
      ctx.fillText(`${say(lv.label).toUpperCase()}  ${Math.round(vals[i])}`, 18, y + barH / 2 + 4);
      if (!this.on[lv.key]) {
        ctx.strokeStyle = token("--ink-3");
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, y + barH / 2); ctx.lineTo(w - 12, y + barH / 2); ctx.stroke();
      }
    });

    // the three lines over time: the shape is the lesson, not the final number
    const tTop = top + 3 * (barH + gap) + 6;
    const tH = h - tTop - 8;
    if (tH > 20 && this.trace.length > 1) {
      LEVELS.forEach((lv, i) => {
        ctx.strokeStyle = token(lv.hue);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        this.trace.forEach((row, j) => {
          const x = 12 + (j / Math.max(1, SPAN - 1)) * (w - 24);
          const y = tTop + tH - Math.min(1, row[i] / K) * tH;
          ctx[j ? "lineTo" : "moveTo"](x, y);
        });
        ctx.stroke();
      });
      // carrying capacity, so "it stopped there" has something to have stopped at
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = token("--ink-3");
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(12, tTop); ctx.lineTo(w - 12, tTop); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = token("--ink-3");
      ctx.font = `600 10px ${getComputedStyle(this).fontFamily}`;
      ctx.fillText(say(["AS MANY AS THERE IS ROOM FOR", "CARRYING CAPACITY"]), 16, tTop + 12);
    }
  }
}

if (!customElements.get("fp-web")) customElements.define("fp-web", Web);
export default Web;
