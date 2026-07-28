/* <fp-outbreak> — why a few percent of coverage decides whether an epidemic happens.

   THE MODEL is SIR — susceptible, infectious, recovered — which is the standard
   compartmental model of an epidemic and about as old as mathematical
   epidemiology itself:

       dS/dt = −βSI/N
       dI/dt =  βSI/N − γI
       dR/dt =  γI

   R₀ = β/γ is the average number of people one infectious person infects in a
   fully susceptible population. Nothing about the threshold is put in by hand:
   it emerges because dI/dt is positive only while βS/N > γ, which stops being
   true once enough of the population is immune.

   MEASURED BEFORE ANY LESSON WAS WRITTEN AGAINST IT, per 1,000 people:

     R₀ = 3, no vaccination     941 ever infected, peak 302 at day 54
     R₀ = 3, 50% vaccinated     261 ever infected, peak 32
     R₀ = 3, 67% vaccinated      13 ever infected — the outbreak dies
     R₀ = 15, 90% vaccinated     58 ever infected
     R₀ = 15, 93% vaccinated     12 ever infected

   Those last two are the reason this simulation exists. Measles has a threshold
   of about 93%, and the difference between 90% and 93% coverage is the
   difference between an outbreak and no outbreak. It is not a gradual trade —
   it is a threshold, and it is why measles returns to places where coverage
   slipped by a few points and nothing else changed. */

import { Sim, token, say } from "./base.js";

const N = 1000;
const RATE = 12;          // model days per real second
const SUB = 0.1;          // integration substep, in days
const SPAN = 260;

class Outbreak extends Sim {
  once() { this.seen = { outbreak: false, stopped: false }; }

  setup() {
    this.task = this.params.task ?? "spread";       // "spread" | "threshold"
    this.r0 = this.params.r0 ?? 3;
    this.vac = this.params.vac ?? 0;                // slider units, percent/10
    this.days = this.params.days ?? 14;             // infectious period

    this.R = N * (this.vac / 10);
    this.S = N - this.R - 1;
    this.I = 1;
    this.t = 0;
    this.peak = 1;
    this.trace = [];
    this.over = false;
  }

  get gamma() { return 1 / this.days; }
  get beta() { return this.r0 * this.gamma; }
  /** The share of the population that has to be immune before it cannot spread.
      Not a parameter — a consequence of dI/dt turning negative. */
  get threshold() { return Math.max(0, 1 - 1 / this.r0); }
  get everInfected() { return Math.round(N - this.S - N * (this.vac / 10)); }

  step(dt) {
    if (this.over) return;
    this.t += dt * RATE;
    let m = dt * RATE;
    const n = Math.max(1, Math.ceil(m / SUB)), h = m / n;
    for (let i = 0; i < n; i++) {
      const inf = this.beta * this.S * this.I / N;
      const rec = this.gamma * this.I;
      this.S -= inf * h;
      this.I += (inf - rec) * h;
      this.R += rec * h;
    }
    this.peak = Math.max(this.peak, this.I);
    if (this.trace.length > SPAN) this.trace.shift();
    this.trace.push([this.S, this.I, this.R]);

    if (this.I < 0.5 || this.t > 400) { this.over = true; this.settle(); this.judge(); this.announce(); }
  }

  judge() {
    const share = this.everInfected / N;
    if (share > 0.15) this.seen.outbreak = true;
    if (share < 0.05 && this.vac > 0) this.seen.stopped = true;

    if (this.task === "spread") {
      if (this.seen.outbreak) {
        this.succeed({ say: say([
          `${this.everInfected} people out of 1,000 caught it, and it was fastest around day ${Math.round(this.t / 3)}.`,
          `${this.everInfected} of 1,000 infected. Notice it ended while people were still susceptible — an epidemic stops before it runs out of people.`,
          `Final size ${this.everInfected}/1,000 with ${Math.round(this.S)} never infected. The epidemic ends when susceptibles fall below the level that sustains transmission, not when they run out.`,
          `Final size ${this.everInfected}/1,000, ${Math.round(this.S)} still susceptible at the end. That overshoot-and-stop is a general property: transmission ceases once S/N < 1/R₀, which happens well before exhaustion of the susceptible pool.`,
        ]) });
      }
      return;
    }
    if (this.seen.outbreak && this.seen.stopped) {
      this.succeed({ say: say([
        `You found the point where it stops. Below it there is an outbreak; above it there is not.`,
        `You found the threshold. A few percent either side of it is the difference between an outbreak and none — it is a cliff, not a slope.`,
        `Threshold located at about ${Math.round(this.threshold * 100)}% for R₀ = ${this.r0}. Below it the outbreak grows; above it each case infects fewer than one other and transmission dies out.`,
        `The threshold is 1 − 1/R₀ = ${Math.round(this.threshold * 100)}% here, and it is not a parameter of the model — it is where dI/dt changes sign. That is why coverage targets are hard numbers rather than aspirations, and why losing three points of measles coverage restores epidemics that were absent for decades.`,
      ]) });
    }
  }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    const add = (label, max, value, key, words) => {
      const s = document.createElement("fp-slider");
      Object.assign(s.dataset, { label, min: "0", max: String(max), value: String(value), step: "1" });
      if (words) s.dataset.words = words;
      s.addEventListener("fp:change", (e) => { this[key] = e.detail.value; this.reset(); });
      this.controls.append(s);
    };
    if (this.params.catchy) {
      add(say(["How catchy is it?", "How catchy is it?", "R₀", "R₀"]), 15, this.r0, "r0");
    }
    if (this.params.protect) {
      add(say(["How many are protected?", "How many are protected?", "Coverage", "Vaccine coverage"]), 10, this.vac, "vac",
        "nobody|10%|20%|30%|40%|half|60%|70%|80%|90%|everybody");
    }
    const b = document.createElement("button");
    b.className = "sim-btn pressable";
    b.textContent = say(["Run it again", "Run it again", "Re-run", "Re-run"]);
    b.onclick = () => this.reset();
    const row = document.createElement("div");
    row.className = "sim-play";        // not teach-play: survives reduced motion
    row.append(b);
    this.controls.append(row);
  }

  /* ------------------------------------------------------------- narration */

  describe() {
    const pct = Math.round(this.vac * 10);
    const state = this.over
      ? say([`It is over. ${this.everInfected} of 1,000 caught it.`,
             `Over: ${this.everInfected} of 1,000 infected, ${Math.round(this.S)} never were.`,
             `Ended. Final size ${this.everInfected}/1,000; ${Math.round(this.S)} remained susceptible.`,
             `Ended. Final size ${this.everInfected}/1,000; ${Math.round(this.S)} susceptible remaining.`])
      : say([`${Math.round(this.I)} people are ill right now.`,
             `${Math.round(this.I)} currently infectious, day ${Math.round(this.t)}.`,
             `I = ${Math.round(this.I)} at day ${Math.round(this.t)}.`,
             `I = ${Math.round(this.I)} at day ${Math.round(this.t)}.`]);
    const cover = this.params.protect
      ? say([` ${pct} in every 100 were protected before it started.`,
             ` Coverage ${pct}%.`,
             ` Coverage ${pct}%; the threshold for R₀ = ${this.r0} is ${Math.round(this.threshold * 100)}%.`,
             ` Coverage ${pct}% against a threshold of ${Math.round(this.threshold * 100)}%.`])
      : "";
    return state + cover;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);
    const pad = 10, gh = h - pad * 2;

    // stacked bands: never-ill at the bottom, ill in the middle, over-it on top
    const band = (pick, colour) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(pad, h - pad);
      this.trace.forEach((row, i) => {
        const x = pad + (i / Math.max(1, SPAN - 1)) * (w - pad * 2);
        ctx.lineTo(x, h - pad - (pick(row) / N) * gh);
      });
      const lastX = pad + ((this.trace.length - 1) / Math.max(1, SPAN - 1)) * (w - pad * 2);
      ctx.lineTo(lastX, h - pad);
      ctx.closePath();
      ctx.fill();
    };
    if (this.trace.length > 1) {
      band((r) => r[0] + r[1] + r[2], token("--w-bodies-line"));     // recovered on top
      band((r) => r[0] + r[1], token("--w-wrong-line"));             // infectious
      band((r) => r[0], token("--hairline"));                        // still susceptible
    }

    ctx.fillStyle = token("--ink");
    ctx.font = `700 12px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillText(this.over
      ? `${this.everInfected} of 1000 caught it`
      : `${Math.round(this.I)} ill now`, pad + 4, pad + 14);
    ctx.fillStyle = token("--ink-3");
    ctx.font = `600 10px ${getComputedStyle(this).fontFamily}`;
    ctx.fillText(say(["STILL WELL", "SUSCEPTIBLE"]), pad + 4, h - pad - 6);
  }
}

if (!customElements.get("fp-outbreak")) customElements.define("fp-outbreak", Outbreak);
export default Outbreak;
