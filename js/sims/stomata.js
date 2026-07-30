/* <fp-stomata> — the hole a leaf cannot afford to open and cannot afford to shut.

   THE IDEA. A leaf needs carbon dioxide from the air to make sugar, and the
   only way in is through pores. But the inside of a leaf is wet, so every pore
   that lets carbon dioxide in lets water out. One control, two demands, pulling
   opposite ways — and no setting satisfies both. That is not a design flaw; it
   is the central constraint of being a plant, and essentially all of plant
   physiology is a response to it.

   THE MEASUREMENTS, taken before any lesson goal was written against them:

     • On a steady day, sugar climbs with aperture up to about 7 and then STOPS
       climbing, because past that point light rather than carbon dioxide is the
       limiting factor. Opening further costs water and buys nothing. Real
       stomatal conductance saturates for exactly this reason.
     • At aperture 10 the leaf dies at 50 seconds, having made LESS sugar than
       a leaf held at 5 — a maximum that loses to a middle.
     • On a dry day the optimum moves down: 5 survives on a knife edge, 6 dies.
       The best setting is a property of the weather, not of the plant.

   So the answer is different every time, which is why this is a simulation and
   not a number to be told. The child discovers that the best aperture depends
   on conditions, and at the higher levels that the best STRATEGY is to change
   it during the day — which is what real plants do, and what CAM plants take to
   its logical extreme by opening only at night. */

import { Sim, token, say } from "./base.js";
import "../components/slider.js";

class Stomata extends Sim {
  once() { this.best = 0; }

  setup() {
    this.aperture = this.params.aperture ?? 4;
    this.light = this.params.light ?? 6;      // photosynthesis ceiling
    this.dry = this.params.dry ?? 1;          // evaporative demand of the air
    this.roots = this.params.roots ?? 2.2;    // water supply, per second
    this.upkeep = this.params.upkeep ?? 0.5;  // what staying alive costs
    this.heat = this.params.heat ?? 0;        // midday spike, higher levels
    this.target = this.params.target ?? 200;
    this.span = this.params.span ?? 60;       // seconds in the "day"

    this.water = 100;
    this.sugar = 0;
    this.t = 0;
    this.dead = false;
    this.history = new Array(150).fill(100);
  }

  /** How thirsty the air is right now. The midday spike is what makes a fixed
      setting the wrong answer at higher levels. */
  get demand() {
    const mid = this.heat && this.t > this.span * 0.35 && this.t < this.span * 0.65;
    return this.dry * (1 + (mid ? this.heat : 0));
  }

  /** Photosynthesis is limited by whichever is scarcer — the carbon dioxide
      coming through the pores, or the light. Once light is the limit, opening
      wider adds nothing at all and still costs water. */
  get made() { return Math.min(this.light, this.aperture * 0.9); }
  get losing() { return this.aperture * 0.42 * this.demand; }

  step(dt) {
    if (this.dead || this.met) return;
    this.t += dt;
    this.water = Math.min(100, this.water + (Math.min(this.roots, 100 - this.water) - this.losing) * dt);
    this.sugar += (this.made - this.upkeep) * dt;
    this.best = Math.max(this.best, this.sugar);

    this.history.push(this.water);
    this.history.shift();

    if (this.water <= 0) {
      this.water = 0;
      this.dead = true;
      this.announce();
      return;
    }
    if (this.sugar >= this.target) {
      this.succeed({ say: say([
        `You made enough sugar and the leaf did not dry out. Open too far and it dies with less than that.`,
        `Enough sugar, water still in hand. Notice that opening all the way would have made LESS sugar, because the leaf dies before the day ends.`,
        `Target reached with water in reserve. Past about seven the light becomes limiting, so opening further costs water and adds no sugar — which is why maximum aperture is never the answer.`,
        `Target met. Two separate reasons the maximum loses: beyond CO₂ saturation the marginal sugar is zero while the marginal water cost is not, and cavitation risk rises non-linearly. Real stomata are regulated continuously against precisely this.`,
      ]) });
    }
  }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    const s = document.createElement("fp-slider");
    Object.assign(s.dataset, {
      label: say(["How far open?", "How far open?", "Stomatal aperture", "Stomatal aperture"]),
      min: "0", max: "10", value: String(this.aperture), step: "1",
      words: "Shut|Barely|A crack|Narrow|Part open|Half|Wider|Open|Wide|Very wide|All the way",
    });
    s.addEventListener("fp:change", (e) => { this.aperture = e.detail.value; this.announce(); });
    this.controls.append(s);

    const b = document.createElement("button");
    b.className = "sim-btn pressable";
    b.textContent = say(["Start the day again", "Start the day again", "New day", "New day"]);
    b.onclick = () => this.reset();
    const row = document.createElement("div");
    row.className = "sim-play";     // not teach-play: survives reduced motion
    row.append(b);
    this.controls.append(row);
  }

  /* ------------------------------------------------------------- narration */

  describe() {
    if (this.dead) {
      return say([
        "The leaf has dried out and stopped. It was open too far for this air.",
        "The leaf has wilted: water ran out. The pores were open wider than this air allowed.",
        "Water potential collapsed — aperture exceeded what the evaporative demand permitted.",
        "Desiccation: transpirational loss exceeded root supply for long enough to exhaust the leaf's water. In a real plant this is where xylem cavitation begins, and it is not fully reversible.",
      ]);
    }
    const limit = this.aperture * 0.9 >= this.light
      ? say([" Opening wider now adds no more sugar — there is not enough light to use it.",
             " Carbon dioxide is no longer the limit; light is. Wider costs water and adds nothing.",
             " Light-limited: marginal sugar per unit aperture is now zero.",
             " Light-limited: the marginal return on aperture has fallen to zero while its marginal cost has not."])
      : "";
    const hot = this.heat && this.t > this.span * 0.35 && this.t < this.span * 0.65
      ? say([" It is the hottest part of the day and water is going fast.",
             " Midday: evaporative demand has risen sharply.",
             " Midday peak in evaporative demand.",
             " Midday peak in evaporative demand — this is where a fixed aperture stops being viable."])
      : "";
    return say([
      `Water ${Math.round(this.water)} out of 100. Sugar ${Math.round(this.sugar)} of ${this.target}.`,
      `Water at ${Math.round(this.water)}%, sugar ${Math.round(this.sugar)} of ${this.target}.`,
      `Leaf water ${Math.round(this.water)}%; sugar ${Math.round(this.sugar)}/${this.target}; losing ${this.losing.toFixed(1)} a second against ${this.roots.toFixed(1)} coming up.`,
      `Leaf water ${Math.round(this.water)}%; assimilate ${Math.round(this.sugar)}/${this.target}; transpiration ${this.losing.toFixed(1)} against root supply ${this.roots.toFixed(1)}.`,
    ]) + limit + hot;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    const leafH = h * 0.52;
    // the leaf, drawn drier as it loses water — colour AND the wilt of the edge
    const wet = this.water / 100;
    ctx.fillStyle = this.dead ? token("--w-wrong-line") : token("--w-living-line");
    ctx.globalAlpha = 0.35 + wet * 0.65;
    ctx.beginPath();
    ctx.ellipse(w / 2, leafH / 2 + 6, w * 0.4, leafH * 0.4 * (0.6 + wet * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // the pores, drawn at the width they are actually set to
    const open = this.aperture / 10;
    for (let i = 0; i < 7; i++) {
      const x = w / 2 - w * 0.28 + (i / 6) * w * 0.56;
      const y = leafH / 2 + 6;
      ctx.fillStyle = token("--sunk");
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(1.5, open * 7), 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const bar = (label, frac, colour, top) => {
      const pad = 14, bh = 16;
      ctx.fillStyle = token("--hairline");
      ctx.fillRect(pad, top, w - pad * 2, bh);
      ctx.fillStyle = colour;
      ctx.fillRect(pad, top, Math.max(0, Math.min(1, frac)) * (w - pad * 2), bh);
      ctx.fillStyle = token("--ink");
      ctx.font = `700 11px ${getComputedStyle(this).fontFamily}`;
      ctx.textAlign = "left";
      ctx.fillText(label, pad + 6, top + bh / 2 + 4);
    };
    bar(say(["WATER", "WATER"]), this.water / 100,
      this.water < 25 ? token("--w-wrong-line") : token("--w-frontier-line"), leafH + 10);
    bar(say(["SUGAR", "SUGAR"]), this.sugar / this.target, token("--w-correct-line"), leafH + 34);

    // water over the day, so a child can see the slope rather than only the level
    const top = leafH + 60, th = h - top - 8;
    if (th > 12) {
      ctx.strokeStyle = token("--w-frontier-line");
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.history.forEach((v, i) => {
        const x = 14 + (i / (this.history.length - 1)) * (w - 28);
        ctx[i ? "lineTo" : "moveTo"](x, top + th - (v / 100) * th);
      });
      ctx.stroke();
    }
  }
}

if (!customElements.get("fp-stomata")) customElements.define("fp-stomata", Stomata);
export default Stomata;
