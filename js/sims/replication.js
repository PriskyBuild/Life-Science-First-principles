/* <fp-replication> — why a ladder made of pairs can copy itself.

   THE IDEA. Watson and Crick's paper ends with the most famous understatement
   in biology: "It has not escaped our notice that the specific pairing we have
   postulated immediately suggests a possible copying mechanism." That sentence
   is the whole lesson. The copying is not a separate machine bolted on — it
   falls straight out of the shape. A only fits T, C only fits G, so a single
   strand is not half a molecule. It is a complete instruction for rebuilding
   the other half.

   So the child does not watch a copy happen. They ARE the polymerase: the
   template is exposed one base at a time and they choose what goes opposite.
   A wrong base will not stick, and it will not stick for a reason they can see.

   Two tasks, because the interesting question changes with age:
     "pair"     — place the bases yourself. Episodic; advances when you act.
     "fidelity" — the polymerase runs itself, and you set how fast. Speed buys
                  errors. Proofreading buys them back and costs time. There is
                  a best setting and it is not the maximum of either.

   ONE HONEST SIMPLIFICATION. A real fork unzips a duplex and copies BOTH
   strands at once, in opposite directions, one of them in fragments. Drawing
   three strands on a phone produces a diagram nobody can read, so the main view
   shows one template and its new partner — and the moment the copy completes,
   the inset draws what actually resulted: two duplexes, each keeping one old
   strand. That is the semiconservative result, and it is the part that is worth
   the pixels. The lesson's `name` stage says the rest in words. */

import { Sim, token, say } from "./base.js";

/* Letters are the redundant channel here, and a better one than shape: the
   base IS a letter, so nothing has to be looked up in a legend. */
const PAIR = { A: "T", T: "A", C: "G", G: "C" };
const HUE = { A: "--w-code-line", T: "--w-correct-line", C: "--w-change-line", G: "--w-frontier-line" };
const BASES = ["A", "T", "C", "G"];
const WINDOW = 13;                 // bases visible at once, so a phone can read them

class Replication extends Sim {
  /* "pair" waits for the child; "fidelity" genuinely ticks. One base class,
     both behaviours, decided by the stage's params. */
  get autoplay() { return this.task === "fidelity"; }

  once() { this.best = null; }     // best error count across runs, survives reset

  setup() {
    this.n = this.params.n ?? 24;
    this.task = this.params.task ?? "pair";
    this.speed = this.params.speed ?? 3;          // bases per second, fidelity task
    this.proofread = this.params.proofread ?? true;
    this.allow = this.params.allow ?? 1;          // errors tolerated by the goal

    this.template = Array.from({ length: this.n }, () => BASES[Math.floor(Math.random() * 4)]);
    this.copy = new Array(this.n).fill(null);
    this.i = 0;
    this.errors = 0;
    this.rejected = 0;
    this.shake = 0;
    this.clock = 0;
    this.done = false;
  }

  /* ------------------------------------------------------------- mechanism */

  /** The only rule in the file. Everything else is presentation. */
  fits(base, at = this.i) { return PAIR[this.template[at]] === base; }

  /** Returns true if the base was accepted. A refusal is information, so it is
      not silent — it shakes, it is counted, and describe() says why. */
  place(base) {
    if (this.done) return false;
    if (!this.fits(base)) {
      this.rejected += 1;
      this.shake = 1;
      this.render(); this.announce();
      return false;
    }
    this.copy[this.i] = base;
    this.i += 1;
    this.finishIfDone();
    this.begin();
    return true;
  }

  /** The polymerase running itself. Faster means less time to check the fit,
      so the misincorporation rate rises with speed — and proofreading catches
      most of what gets through, which is why real polymerase is slower than it
      could be. Both of those are the actual trade-off, not a metaphor for it. */
  autoPlace() {
    const right = PAIR[this.template[this.i]];
    const slip = 0.012 * this.speed * this.speed;      // errors climb faster than rate
    let base = Math.random() < slip
      ? BASES.filter((b) => b !== right)[Math.floor(Math.random() * 3)]
      : right;
    // Proofreading: a second look, which is why it costs time rather than luck.
    if (this.proofread && base !== right && Math.random() < 0.92) base = right;
    if (base !== right) this.errors += 1;
    this.copy[this.i] = base;
    this.i += 1;
    this.finishIfDone();
  }

  finishIfDone() {
    if (this.i < this.n) return;
    this.done = true;
    this.settle();
    this.best = this.best == null ? this.errors : Math.min(this.best, this.errors);
    if (this.errors <= this.allow) {
      this.succeed({ say: this.task === "pair"
        ? say([
            `You copied all ${this.n} of them, and every single one was decided by the letter opposite it.`,
            `All ${this.n} placed. You never had a choice about any of them — the template decided every one.`,
            `${this.n} bases placed, each determined entirely by its partner. A single strand carries the whole instruction for the other.`,
            `${this.n} bases, zero degrees of freedom. That is the sense in which each strand is a complete specification of the duplex rather than half of one.`,
          ])
        : say([
            `Copied with ${this.errors} mistake${this.errors === 1 ? "" : "s"} at speed ${this.speed}.`,
            `${this.errors} error${this.errors === 1 ? "" : "s"} at speed ${this.speed}. Slower would have been cleaner; too slow and the cell never finishes dividing.`,
            `${this.errors} misincorporation${this.errors === 1 ? "" : "s"} at rate ${this.speed}${this.proofread ? " with proofreading" : " without proofreading"}. The trade-off is real: fidelity costs time.`,
            `${this.errors} error${this.errors === 1 ? "" : "s"} at rate ${this.speed}${this.proofread ? ", proofreading on" : ", proofreading off"}. Real polymerase runs at roughly 10⁻⁸ per base with proofreading and about 10⁻⁵ without — three orders of magnitude bought by checking twice.`,
          ]) });
    }
  }

  step(dt) {
    this.shake = Math.max(0, this.shake - dt * 5);
    if (this.task !== "fidelity" || this.done) { if (!this.shake) this.settle(); return; }
    this.clock += dt * this.speed;
    while (this.clock >= 1 && !this.done) { this.clock -= 1; this.autoPlace(); }
  }

  /** Borrow the loop for the shake, then hand it back. */
  begin() { if (!this.resume()) this.shake = 0; this.render(); this.announce(); this.syncControls?.(); }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    if (this.task === "pair") {
      const tray = document.createElement("div");
      tray.className = "sim-switches";
      for (const b of BASES) {
        const btn = document.createElement("button");
        btn.className = "sim-btn pressable sim-base";
        btn.style.setProperty("--chip", `var(${HUE[b]})`);
        btn.textContent = b;
        btn.setAttribute("aria-label", say([`Put ${b} here`, `Place base ${b}`, `Place ${b}`, `Place ${b}`]));
        btn.onclick = () => this.place(b);
        tray.append(btn);
      }
      this.controls.append(tray);
    } else {
      const s = document.createElement("fp-slider");
      Object.assign(s.dataset, {
        label: say(["How fast?", "How fast?", "Copying rate", "Copying rate"]),
        min: "1", max: "8", value: String(this.speed), step: "1",
      });
      s.addEventListener("fp:change", (e) => { this.speed = e.detail.value; this.announce(); });
      this.controls.append(s);

      if (this.params.proofswitch) {
        const p = document.createElement("button");
        p.className = "sim-switch pressable";
        p.onclick = () => { this.proofread = !this.proofread; this.reset(); this.syncControls(); };
        this.proofBtn = p;
        const box = document.createElement("div");
        box.className = "sim-switches";
        box.append(p);
        this.controls.append(box);
      }
    }

    const again = document.createElement("button");
    again.className = "sim-btn pressable";
    again.textContent = say(["Start again", "Start again", "New strand", "New strand"]);
    again.onclick = () => this.reset();
    const row = document.createElement("div");
    row.className = "sim-play";      // not teach-play: survives reduced motion
    row.append(again);
    this.controls.append(row);
    this.syncControls();
  }

  syncControls() {
    if (this.proofBtn) {
      this.proofBtn.setAttribute("aria-pressed", String(this.proofread));
      this.proofBtn.textContent = `${say(["Check each one", "Proofreading"])}: ${this.proofread ? "on" : "off"}`;
    }
  }

  reset() { super.reset(); this.syncControls(); }

  /* ------------------------------------------------------------- narration */

  describe() {
    if (this.done) {
      return say([
        `Finished. Two ladders now, and each one kept half of the old one.`,
        `Copy complete: ${this.errors} error${this.errors === 1 ? "" : "s"}. Two double strands, each keeping one original half.`,
        `Replication complete with ${this.errors} misincorporation${this.errors === 1 ? "" : "s"}. Each duplex retains one parental strand.`,
        `Complete: ${this.errors} error${this.errors === 1 ? "" : "s"} over ${this.n} bases. Each daughter duplex retains one parental strand — semiconservative, as Meselson and Stahl showed by density.`,
      ]);
    }
    const want = PAIR[this.template[this.i]];
    const at = `${this.i} of ${this.n} copied.`;
    if (this.task === "fidelity") {
      return `${at} ${say([
        `Going at speed ${this.speed}. ${this.errors} wrong so far.`,
        `Rate ${this.speed}, proofreading ${this.proofread ? "on" : "off"}. ${this.errors} error${this.errors === 1 ? "" : "s"} so far.`,
        `Rate ${this.speed}, proofreading ${this.proofread ? "on" : "off"}, ${this.errors} misincorporation${this.errors === 1 ? "" : "s"}.`,
        `Rate ${this.speed}, proofreading ${this.proofread ? "on" : "off"}, ${this.errors} misincorporation${this.errors === 1 ? "" : "s"}. Error rate climbs faster than rate does.`,
      ])}`;
    }
    const slip = this.rejected
      ? say([
          ` ${this.rejected} did not fit. Only one letter ever fits.`,
          ` ${this.rejected} refused so far — each base has exactly one partner.`,
          ` ${this.rejected} rejected. Pairing is not a preference; the wrong base does not physically fit.`,
          ` ${this.rejected} rejected. The specificity is geometric — a purine pairs with a pyrimidine or the rungs do not span the gap.`,
        ])
      : "";
    return `${at} ${say([
      `The letter opposite is ${this.template[this.i]}, so you need ${want}.`,
      `Template shows ${this.template[this.i]}; its partner is ${want}.`,
      `Template base ${this.template[this.i]} — the complement is ${want}.`,
      `Template base ${this.template[this.i]}; complement ${want}.`,
    ])}${slip}`;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    // Scroll the window so the fork stays readable rather than running off.
    const first = Math.max(0, Math.min(this.i - Math.floor(WINDOW / 2), this.n - WINDOW));
    const shown = Math.min(WINDOW, this.n);
    const cw = (w - 24) / shown;
    const r = Math.min(cw * 0.36, 15);
    const topY = h * 0.3;
    const botY = h * 0.62;

    ctx.font = `700 ${Math.round(r * 1.15)}px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let k = 0; k < shown; k++) {
      const idx = first + k;
      const x = 12 + cw * (k + 0.5);
      const placed = this.copy[idx];
      const isFork = idx === this.i;

      // rung: drawn only where the pair is actually made
      if (placed) {
        ctx.strokeStyle = token("--hairline");
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, topY + r); ctx.lineTo(x, botY - r); ctx.stroke();
      }
      base(ctx, this.template[idx], x, topY, r);

      if (placed) {
        const wrong = placed !== PAIR[this.template[idx]];
        base(ctx, placed, x, botY, r, wrong ? token("--w-wrong-line") : null);
      } else if (isFork) {
        const jitter = this.shake ? Math.sin(this.shake * 40) * 4 : 0;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = this.shake ? token("--w-wrong-line") : token("--w-line");
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x + jitter, botY, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.fillStyle = token("--ink-3");
    ctx.font = `600 11px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillText(say(["THE OLD ONE", "TEMPLATE"]).toUpperCase(), 12, topY - r - 12);
    ctx.fillText(say(["THE NEW ONE", "NEW STRAND"]).toUpperCase(), 12, botY + r + 14);

    if (this.done) this.drawResult(ctx, w, h);
  }

  /* The payoff: two duplexes, each half old and half new. This is the picture
     the word "semiconservative" is about, and it is worth more than the word. */
  drawResult(ctx, w, h) {
    const y = h - 30;
    const bw = (w - 48) / 2;
    ctx.textAlign = "center";
    ctx.font = `600 10px ${getComputedStyle(this).fontFamily}`;
    for (let d = 0; d < 2; d++) {
      const x = 16 + d * (bw + 16);
      ctx.fillStyle = token("--w-code-line");
      ctx.fillRect(x, y - 9, bw, 7);
      ctx.fillStyle = token("--w-fill");
      ctx.fillRect(x, y, bw, 7);
      ctx.fillStyle = token("--ink-3");
      ctx.fillText(say(["one old, one new", "one parental strand kept"]), x + bw / 2, y + 22);
    }
  }
}

function base(ctx, letter, x, y, r, ring) {
  ctx.fillStyle = token(HUE[letter]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 3.5; ctx.stroke(); }
  // The letter is the redundant channel, and it is the thing being taught.
  ctx.fillStyle = token("--paper");
  ctx.fillText(letter, x, y + 1);
}

if (!customElements.get("fp-replication")) customElements.define("fp-replication", Replication);
export default Replication;
