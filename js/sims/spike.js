/* <fp-spike> — why a nerve signal is the same size however hard you poke it.

   THE IDEA. A nerve does not send a bigger signal for a bigger stimulus. It
   sends the SAME signal, or none. Below a threshold nothing happens at all;
   above it you get a full spike, and doubling the stimulus does not make the
   spike bigger. That is the all-or-nothing law, and it is the single most
   counter-intuitive fact about nerves: strength is not carried by size.

   THE MODEL is FitzHugh–Nagumo, a real reduced model that appears in the
   computational neuroscience literature, not a cartoon:

       dv/dt = v − v³/3 − w + I
       dw/dt = ε(v + a − bw)

   Two variables — a fast one that spikes and a slow one that recovers — and
   from those five terms you get a genuine threshold, a genuine spike shape,
   and a genuine refractory period during which a second stimulus does nothing.
   None of that is scripted; it falls out of the equations.

   WHAT IT GETS WRONG, MEASURED. I checked the f–I curve before authoring any
   goals: firing rate runs from 0.31 Hz just above threshold to 0.41 Hz at its
   fastest. A real neuron spans two orders of magnitude, so this model badly
   compresses rate coding, and the lessons therefore do NOT teach a rate curve
   from it. What it does show correctly, and what is taught: the sharp
   threshold, near-constant amplitude (peak 1.75 against 1.81 for a stimulus
   67% stronger), and the fact that firing STOPS again above about I = 1.4.
   That last one is not an artefact — it is depolarisation block, which is why
   very high extracellular potassium silences a heart and why some anaesthetics
   work. Teaching the window rather than the curve is the honest use of it.

   INTEGRATION. Euler at a substep of 0.02 model units, several per frame, so
   the cubic stays stable while model time runs fast enough to watch. */

import { Sim, token, say } from "./base.js";

const A = 0.7, B = 0.8, EPS = 0.08;
const REST_V = -1.1994, REST_W = -0.6243;   // the fixed point, so it starts settled
const RATE = 15;          // model time units per real second
const SUB = 0.02;         // integration substep
const WINDOW = 8;         // seconds of trace on screen
const FIRE = 1.0;         // v above this counts as a spike

class Spike extends Sim {
  once() { this.strengths = new Set(); this.states = new Set(); }

  setup() {
    this.task = this.params.task ?? "threshold";      // "threshold" | "window"
    this.amp = this.params.amp ?? 6;                  // slider units, pulse height
    this.current = this.params.current ?? 0;          // slider units, sustained
    this.v = REST_V; this.w = REST_W;
    this.pulse = 0;
    this.spikes = 0;
    this.lastPeak = null;
    this.peak = -9;
    this.above = false;
    this.t = 0;
    /* Time since the last SPIKE, not time spent below threshold. Those differ
       in exactly the state this sim exists to show: under depolarisation block
       the membrane is stuck high, so "below threshold" never accumulates and a
       cell that has been silent for ten seconds reports as busy. Measuring the
       thing you actually mean matters more here than usual, because the wrong
       metric is silent rather than wrong-looking. */
    this.sinceSpike = 0;
    this.trace = new Array(Math.round(WINDOW * 60)).fill(REST_V);
  }

  /** Injected current: the sustained level plus whatever is left of a poke. */
  get I() { return this.current * 0.1 + (this.pulse > 0 ? this.amp * 0.2 : 0); }

  poke() {
    this.pulse = 0.6 / RATE;              // a brief pulse, in seconds
    this.strengths.add(this.amp);
    this.announce();
  }

  step(dt) {
    this.t += dt;
    if (this.pulse > 0) this.pulse -= dt;
    let m = dt * RATE;
    const n = Math.max(1, Math.ceil(m / SUB)), h = m / n;
    for (let i = 0; i < n; i++) {
      const dv = this.v - (this.v ** 3) / 3 - this.w + this.I;
      const dw = EPS * (this.v + A - B * this.w);
      this.v += dv * h;
      this.w += dw * h;
    }
    this.peak = Math.max(this.peak, this.v);

    if (!this.above && this.v > FIRE) {
      this.above = true;
      this.spikes += 1;
      this.sinceSpike = 0;
    }
    if (this.above && this.v < 0) {
      this.above = false;
      this.lastPeak = this.peak;
      this.peak = -9;
    }
    this.sinceSpike += dt;

    this.trace.push(this.v);
    this.trace.shift();
    this.judge();
  }

  judge() {
    if (this.task === "threshold") {
      /* The lesson is that a harder poke does not make a bigger spike. So the
         goal needs the child to have fired at TWO different strengths — one
         spike proves nothing about size — and to have tried one that did
         nothing, because the threshold is half the idea. */
      const fired = [...this.strengths].filter((s) => s * 0.2 >= 1.05);
      const failed = [...this.strengths].filter((s) => s * 0.2 < 1.05);
      if (this.spikes >= 2 && fired.length >= 2 && failed.length >= 1) {
        this.succeed({ say: say([
          `Every spike was the same size, however hard you poked. A harder poke does not shout louder.`,
          `You fired it at ${fired.length} different strengths and every spike was the same height. Below a certain poke, nothing at all; above it, always the same answer.`,
          `Spike amplitude was independent of stimulus magnitude across the range you tested, and subthreshold stimuli produced no spike at all. That is the all-or-nothing law, and it means intensity cannot be encoded in size.`,
          `Amplitude invariance plus a sharp threshold. The consequence is the interesting part: since size carries no information, stimulus intensity has to be encoded some other way — in rate, and in how many fibres are recruited.`,
        ]) });
      }
      return;
    }

    // "window": silent below, firing in the middle, silent again above.
    const state = this.sinceSpike > 4 ? (this.current * 0.1 > 1.35 ? "blocked" : "quiet")
      : this.spikes > 0 ? "firing" : null;
    if (state) this.states.add(state);
    if (this.states.has("quiet") && this.states.has("firing") && this.states.has("blocked")) {
      this.succeed({ say: say([
        `Too little and nothing happens. Too much and it stops again. There is a window.`,
        `Silence below, firing in the middle, silence again above. Two different reasons for the same quiet.`,
        `You found both edges. Below threshold there is not enough drive; above about 1.4 the slow variable cannot reset between spikes and firing stops — depolarisation block, which is a real and dangerous state, not a modelling artefact.`,
        `Both boundaries located. The upper one is depolarisation block: sustained drive holds the membrane past the point where the recovery variable can reset, so the cell is silenced by too much excitation rather than too little. It is why severe hyperkalaemia stops a heart, and it is why "more signal" is not monotonically more signal.`,
      ]) });
    }
  }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    const add = (label, max, value, key, words) => {
      const s = document.createElement("fp-slider");
      Object.assign(s.dataset, { label, min: "0", max: String(max), value: String(value), step: "1" });
      if (words) s.dataset.words = words;
      s.addEventListener("fp:change", (e) => { this[key] = e.detail.value; this.announce(); });
      this.controls.append(s);
    };

    if (this.task === "threshold") {
      add(say(["How hard to poke it", "How hard to poke it", "Stimulus strength", "Stimulus amplitude"]), 12, this.amp, "amp");
      const b = document.createElement("button");
      b.className = "sim-btn pressable";
      b.textContent = say(["Poke it", "Poke it", "Stimulate", "Deliver pulse"]);
      b.onclick = () => this.poke();
      const row = document.createElement("div");
      row.className = "sim-play";       // not teach-play: survives reduced motion
      row.append(b, this.againBtn());
      this.controls.append(row);
    } else {
      add(say(["How much push, all the time", "Steady push", "Sustained current", "Injected current"]), 16, this.current, "current");
      const row = document.createElement("div");
      row.className = "sim-play";
      row.append(this.againBtn());
      this.controls.append(row);
    }
  }

  againBtn() {
    const b = document.createElement("button");
    b.className = "sim-btn pressable";
    b.textContent = say(["Start again", "Start again", "Reset", "Reset"]);
    b.onclick = () => this.reset();
    return b;
  }

  /* ------------------------------------------------------------- narration */

  describe() {
    const size = this.lastPeak != null
      ? say([` The last spike reached ${this.lastPeak.toFixed(1)}.`,
             ` Last spike peaked at ${this.lastPeak.toFixed(2)}.`,
             ` Last peak ${this.lastPeak.toFixed(2)}.`,
             ` Last peak ${this.lastPeak.toFixed(2)}.`])
      : "";
    if (this.task === "threshold") {
      const set = say([`Poke strength is ${this.amp} out of 12.`,
                       `Stimulus strength ${this.amp} of 12.`,
                       `Stimulus amplitude ${(this.amp * 0.2).toFixed(2)}.`,
                       `Stimulus amplitude ${(this.amp * 0.2).toFixed(2)}; threshold is near 1.05.`]);
      const n = say([` ${this.spikes} spike${this.spikes === 1 ? "" : "s"} so far.`,
                     ` ${this.spikes} spike${this.spikes === 1 ? "" : "s"} fired.`,
                     ` ${this.spikes} spikes.`, ` ${this.spikes} spikes.`]);
      return set + n + size;
    }
    const quiet = this.sinceSpike > 4;
    const state = !quiet ? say(["It is firing over and over.", "Firing repetitively.",
                                "Repetitive firing.", "Repetitive firing."])
      : this.current * 0.1 > 1.35
        ? say(["Pushed so hard it has gone quiet again.", "Silent — but from too much, not too little.",
               "Silent under excess drive: depolarisation block.",
               "Depolarisation block: silenced by excess drive rather than insufficient drive."])
        : say(["Not enough to set it off.", "Below threshold — nothing happens.",
               "Subthreshold; no firing.", "Subthreshold; no firing."]);
    return say([`Steady push is ${this.current} out of 16. `, `Sustained current ${this.current} of 16. `,
                `Injected current ${(this.current * 0.1).toFixed(2)}. `,
                `Injected current ${(this.current * 0.1).toFixed(2)}. `]) + state + size;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    const pad = 8;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    const lo = -2.2, hi = 2.4;
    const py = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);

    // resting level and the firing threshold, both as reference lines
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = token("--hairline");
    ctx.beginPath(); ctx.moveTo(0, py(REST_V)); ctx.lineTo(w, py(REST_V)); ctx.stroke();
    ctx.strokeStyle = token("--w-change-line");
    ctx.beginPath(); ctx.moveTo(0, py(FIRE)); ctx.lineTo(w, py(FIRE)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = token("--w-bodies-line");
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const n = this.trace.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      ctx[i ? "lineTo" : "moveTo"](x, py(this.trace[i]));
    }
    ctx.stroke();

    // the pulse, drawn while it is being delivered so cause and effect are visible
    if (this.pulse > 0) {
      ctx.fillStyle = token("--w-correct-line");
      ctx.fillRect(w - 5, pad, 5, h - pad * 2);
    }

    ctx.fillStyle = token("--ink-3");
    ctx.font = `600 11px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillText(say(["RESTING", "RESTING"]), 6, py(REST_V) - 6);
    ctx.fillText(say(["GOES OFF ABOVE HERE", "THRESHOLD"]), 6, py(FIRE) - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${this.spikes}`, w - 8, 16);
  }
}

if (!customElements.get("fp-spike")) customElements.define("fp-spike", Spike);
export default Spike;
