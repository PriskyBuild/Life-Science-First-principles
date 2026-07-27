/* <fp-energy> — the cell's running cost.

   The misconception this exists to break: that ATP is a battery a cell keeps
   charged. It is not. A human turns over roughly its own body weight in ATP
   every day and holds only a few seconds' worth at any moment. ATP is a FLOW,
   and a cell that stops making it dies in seconds rather than running down.

   So this is a stock-and-flow with a deliberately tiny stock. The child sets
   two things — how much glucose gets in, and how many power plants convert it —
   and discovers the trade-off that makes the lesson: power plants have an
   upkeep of their own, so more is not simply better. There is a best answer and
   it is not the maximum of either slider. */

import { Sim, token } from "./base.js";

class Energy extends Sim {
  setup() {
    this.doors = this.params.doors ?? 3;      // glucose let in per second
    this.plants = this.params.plants ?? 2;    // mitochondria
    this.demand = this.params.demand ?? 4;    // what staying alive costs, per second
    this.upkeep = this.params.upkeep ?? 0.6;  // what each plant costs to run
    this.yield_ = this.params.yield ?? 2.2;   // ATP per glucose, per plant per second
    this.spike = this.params.spike ?? 0;      // extra demand later, for higher levels

    this.atp = 60;            // percent — a few seconds of supply, not a tank
    this.glucose = 0;
    this.elapsed = 0;
    this.survived = 0;
    this.dead = false;
    this.pulse = 0;
    this.history = new Array(120).fill(60);
  }

  buildControls() {
    const add = (label, min, max, value, key) => {
      const s = document.createElement("fp-slider");
      Object.assign(s.dataset, { label, min, max, value, step: "1" });
      s.addEventListener("fp:change", (e) => { this[key] = e.detail.value; this.announce(); });
      this.controls.append(s);
    };
    add("Food doors open", 0, 8, this.doors, "doors");
    add("Power plants", 0, 6, this.plants, "plants");

    const mk = (text, fn) => {
      const b = document.createElement("button");
      b.className = "sim-btn pressable";
      b.textContent = text;
      b.onclick = fn;
      return b;
    };
    this.playControls.append(mk("Start again", () => this.reset()));
    this.stepControls.append(
      mk("Step forward", () => this.stepOnce(40)),
      mk("Start again", () => { this.setup(); this.render(); this.announce(); }),
    );
  }

  get need() {
    // Demand rises partway through at higher levels: a cell does not get to
    // pick a setting once and stop paying attention.
    const extra = this.spike && this.elapsed > 12 ? this.spike : 0;
    return this.demand + extra + this.plants * this.upkeep;
  }

  get made() {
    // Limited by whichever is scarcer — glucose coming in, or plants to burn it.
    return Math.min(this.glucose, this.plants * this.yield_);
  }

  step(dt) {
    if (this.dead) return;
    this.elapsed += dt;
    this.glucose = Math.min(this.glucose + this.doors * dt, 12);

    const burned = Math.min(this.glucose, this.made * dt);
    this.glucose -= burned;
    this.atp += (this.made - this.need) * dt * 6;
    this.atp = Math.min(this.atp, 100);
    if (this.made > this.need) this.pulse = Math.min(this.pulse + dt * 4, 1);
    else this.pulse = Math.max(this.pulse - dt * 2, 0);

    this.history.push(this.atp);
    this.history.shift();

    if (this.atp <= 0) { this.atp = 0; this.dead = true; this.announce(); return; }

    // Alive and not coasting on a full tank: that is the thing to hold.
    this.survived = this.atp > 15 ? this.survived + dt : 0;
    if (this.survived > (this.params.hold ?? 20)) this.succeed({ seconds: Math.round(this.elapsed) });
  }

  describe() {
    const state = this.dead ? "The cell has run out of energy and stopped."
      : this.met ? "The cell has held steady long enough. That setting works."
      : this.made > this.need + 0.2 ? "Making more than it needs — the level is climbing."
      : this.made < this.need - 0.2 ? "Spending more than it makes — the level is falling."
      : "Making almost exactly what it needs.";
    return `Energy at ${Math.round(this.atp)} percent. ${this.plants} power plant${this.plants === 1 ? "" : "s"}, ` +
      `${this.doors} food door${this.doors === 1 ? "" : "s"}. ` +
      `Making ${this.made.toFixed(1)} a second, needing ${this.need.toFixed(1)}. ${state}`;
  }

  draw(ctx) {
    const { w, h } = this;
    const pad = 14;
    const barH = Math.min(48, h * 0.18);

    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    // the stock: deliberately small, and it moves fast
    ctx.fillStyle = token("--hairline");
    ctx.fillRect(pad, pad, w - pad * 2, barH);
    const level = (this.atp / 100) * (w - pad * 2);
    ctx.fillStyle = this.dead ? token("--w-wrong-line")
      : this.atp < 25 ? token("--w-change-line") : token("--w-correct-line");
    ctx.fillRect(pad, pad, level, barH);

    ctx.fillStyle = token("--ink");
    ctx.font = `700 13px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillText(`ENERGY ${Math.round(this.atp)}%`, pad + 8, pad + barH / 2 + 5);

    // the trace: this is where a child sees that it is a flow, not a tank
    const top = pad * 2 + barH;
    const traceH = h - top - pad;
    ctx.strokeStyle = token("--line");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, top + traceH * 0.85);
    ctx.lineTo(w - pad, top + traceH * 0.85);
    ctx.stroke();

    ctx.strokeStyle = token("--w-origins-line");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.history.forEach((v, i) => {
      const x = pad + (i / (this.history.length - 1)) * (w - pad * 2);
      const y = top + traceH - (v / 100) * traceH * 0.85;
      ctx[i ? "lineTo" : "moveTo"](x, y);
    });
    ctx.stroke();

    // plants and glucose, so the two sliders have something to be about
    const cy = top + traceH * 0.5;
    for (let i = 0; i < this.plants; i++) {
      const x = pad + 30 + i * 46;
      const r = 13 + this.pulse * 3;
      ctx.fillStyle = token("--w-change-line");
      ctx.beginPath();
      ctx.ellipse(x, cy, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = token("--w-correct-line");
    for (let i = 0; i < Math.round(this.glucose); i++) {
      const x = w - pad - 16 - (i % 6) * 18;
      const y = cy + Math.floor(i / 6) * 18 - 18;
      ctx.beginPath();
      ctx.rect(x - 5, y - 5, 10, 10);
      ctx.fill();
    }

    ctx.fillStyle = token("--ink-3");
    ctx.font = `600 11px ${getComputedStyle(this).fontFamily}`;
    ctx.fillText("POWER PLANTS", pad + 8, top + traceH - 6);
    ctx.textAlign = "right";
    ctx.fillText("GLUCOSE WAITING", w - pad - 8, top + traceH - 6);
    ctx.textAlign = "left";
  }
}

if (!customElements.get("fp-energy")) customElements.define("fp-energy", Energy);
export default Energy;
