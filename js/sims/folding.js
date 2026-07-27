/* <fp-folding> — why a string of beads becomes one particular shape.

   THE IDEA. A protein is made as a floppy chain and ends up as a precise
   machine, and nothing folds it. There is no mould and no instructions for the
   shape — the shape is a CONSEQUENCE of the sequence, arrived at by the chain
   falling into its lowest-energy arrangement. Which is why the same sequence
   always gives the same shape, in a cell or in a test tube, and why changing
   one bead can wreck it.

   THE MODEL. This is the HP lattice model — Dill, 1985 — and it is a real one
   that real papers use, not a cartoon invented for children. Every residue is
   just oily (H) or water-loving (P), the chain lives on a square grid, and the
   only energy term is: two oily residues touching on the grid, without being
   neighbours in the chain, is worth -1. That single rule reproduces the thing
   that matters — a hydrophobic core forming on the inside with the polar
   residues left facing out — from nothing but "oil avoids water".

   WHAT IT DELIBERATELY LEAVES OUT. Real folding has hydrogen bonding, backbone
   geometry, side-chain packing and three dimensions. None of them is the reason
   a protein folds at all; the hydrophobic effect is. Modelling one cause well
   is honest. Modelling five badly would look more impressive and teach less.

   THE MOVE is a pivot: tap a residue and everything after it swings ninety
   degrees. That is the standard Monte Carlo move for lattice proteins. An
   earlier version of this comment claimed four taps always return you to where
   you started and that every arrangement is reachable; a test caught both as
   false. Self-avoidance refuses some pivots, which breaks the first, and pivot
   moves are not provably ergodic on a lattice, which breaks the second. What is
   true, and is what the child actually needs, is that **a refused move changes
   nothing at all** — the chain is never left half-moved — and that the refusal
   is shown, because "that one is blocked" is a fact about the shape.

   The buttons ARE the interaction rather than a keyboard fallback for it, so
   the accessible path and the primary path are the same path. */

import { Sim, token, say } from "./base.js";

const DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1]];        // E, N, W, S
const key = (x, y) => `${x},${y}`;

class Folding extends Sim {
  /* Episodic: the chain moves when the child moves it. */
  get autoplay() { return false; }

  once() { this.best = 0; }

  setup() {
    // H = oily, P = water-loving. The default is a sequence whose best fold
    // buries every oily residue, so the goal is reachable and looks like a core.
    this.seq = (this.params.seq ?? "PHHPPHHPPHHP").toUpperCase().split("");
    this.target = this.params.target ?? 4;
    this.dirs = new Array(this.seq.length - 1).fill(0);   // start fully extended
    this.cw = true;
    this.moves = 0;
    this.layout();
  }

  /** Walk the bond directions into grid positions. */
  layout() {
    let x = 0, y = 0;
    this.pos = [[0, 0]];
    for (const d of this.dirs) {
      x += DIRS[d][0]; y += DIRS[d][1];
      this.pos.push([x, y]);
    }
  }

  /** No two residues may occupy the same square. A chain that can pass through
      itself is not a chain, and the constraint is most of what makes folding
      hard rather than obvious. */
  valid(pos) { return new Set(pos.map(([x, y]) => key(x, y))).size === pos.length; }

  /** Contacts: two oily residues on adjacent squares that are NOT next to each
      other in the chain. Sequence neighbours are excluded because they are
      touching for a trivial reason — they are tied together. */
  contacts(pos = this.pos) {
    const at = new Map(pos.map(([x, y], i) => [key(x, y), i]));
    let n = 0;
    for (let i = 0; i < pos.length; i++) {
      if (this.seq[i] !== "H") continue;
      const [x, y] = pos[i];
      for (const [dx, dy] of DIRS) {
        const j = at.get(key(x + dx, y + dy));
        if (j != null && j > i + 1 && this.seq[j] === "H") n += 1;
      }
    }
    return n;
  }

  /** Pivot everything downstream of residue i by ninety degrees. Rejected if it
      would fold the chain through itself — and the rejection is shown, because
      "that one is blocked" is information about the shape. */
  pivot(i) {
    const turn = this.cw ? 3 : 1;
    const dirs = this.dirs.map((d, k) => (k >= i ? (d + turn) % 4 : d));
    const before = this.dirs;
    this.dirs = dirs;
    this.layout();
    if (!this.valid(this.pos)) {
      this.dirs = before;
      this.layout();
      this.blocked = i;
      this.render(); this.announce();
      return false;
    }
    this.blocked = null;
    this.moves += 1;
    const c = this.contacts();
    this.best = Math.max(this.best, c);
    if (c >= this.target) {
      /* Deliberately does NOT claim this is the best possible fold. The
         authored target is set where a child can actually land it, which for
         the longer chains is below the true optimum — so saying "that is the
         best it can do" would be a nice sentence and a false one, and a child
         who then found a better fold would have caught the app lying. */
      this.succeed({ say: say([
        `You got ${c} pairs of the oily beads touching in the middle. That is a folded protein — and there may still be a better fold in there.`,
        `${c} oily contacts, buried inside, with the water-loving ones facing out. Nothing folded it for you and nothing folds a real one either. See if you can do better.`,
        `${c} hydrophobic contacts. The native state is not chosen — it is whatever arrangement nothing beats, so keep going and find out whether this is it.`,
        `${c} H–H contacts, reached by search. Worth noting that you searched and a real chain cannot: a 100-residue protein sampling every conformation would outlast the universe, yet folds in milliseconds. That gap is Levinthal's paradox, and the resolution is that the landscape is a funnel rather than a flat space to be searched.`,
      ]) });
    }
    this.render(); this.announce(); this.syncControls();
    return true;
  }

  reset() { super.reset(); this.syncControls(); }

  /* -------------------------------------------------------------- controls */

  buildControls() {
    const row = document.createElement("div");
    row.className = "sim-switches";
    this.pivots = [];
    // One button per joint. These are not a keyboard fallback for dragging on
    // the canvas — they are the interaction, so there is one code path.
    for (let i = 1; i < this.seq.length - 1; i++) {
      const b = document.createElement("button");
      b.className = "sim-btn pressable sim-base";
      b.textContent = String(i + 1);
      b.setAttribute("aria-label", say([
        `Bend at bead ${i + 1}, the ${this.seq[i] === "H" ? "oily" : "watery"} one`,
        `Pivot at residue ${i + 1} (${this.seq[i] === "H" ? "hydrophobic" : "polar"})`,
      ]));
      b.onclick = () => this.pivot(i);
      row.append(b);
      this.pivots.push(b);
    }
    this.controls.append(row);

    const dir = document.createElement("button");
    dir.className = "sim-switch pressable";
    dir.onclick = () => { this.cw = !this.cw; this.syncControls(); };
    this.dirBtn = dir;

    const again = document.createElement("button");
    again.className = "sim-btn pressable";
    again.textContent = say(["Straighten it out", "Straighten it out", "Unfold", "Unfold"]);
    again.onclick = () => this.reset();

    const play = document.createElement("div");
    play.className = "sim-play";        // not teach-play: survives reduced motion
    play.append(dir, again);
    this.controls.append(play);

    const legend = document.createElement("ul");
    legend.className = "sim-legend";
    legend.innerHTML =
      `<li><span class="sim-chip" data-shape="circle" style="--chip:var(--w-code-line)"></span>${say(["Oily — hates water", "Hydrophobic"])}</li>` +
      `<li><span class="sim-chip" data-shape="square" style="--chip:var(--w-frontier-line)"></span>${say(["Watery — likes water", "Polar"])}</li>`;
    this.append(legend);
    this.syncControls();
  }

  syncControls() {
    if (this.dirBtn) {
      this.dirBtn.setAttribute("aria-pressed", String(this.cw));
      this.dirBtn.textContent = say([
        `Bending: ${this.cw ? "this way" : "the other way"}`,
        `Pivot direction: ${this.cw ? "clockwise" : "anticlockwise"}`,
      ]);
    }
  }

  step() { this.settle(); }          // nothing ticks; the child drives it

  /* ------------------------------------------------------------- narration */

  describe() {
    const c = this.contacts();
    const blocked = this.blocked != null
      ? say([` Bead ${this.blocked + 1} will not bend that way — the chain would run into itself.`,
             ` Residue ${this.blocked + 1} is blocked: that pivot would make the chain overlap.`])
      : "";
    return `${say([
      `${c} pairs of oily beads are touching. You need ${this.target}.`,
      `${c} oily contacts out of a target of ${this.target}.`,
      `${c} hydrophobic contacts; target ${this.target}. Each one lowers the energy by one unit.`,
      `${c} H–H contacts against a target of ${this.target}; free energy −${c}. Only non-sequential contacts count.`,
    ])}${blocked}`;
  }

  /* ------------------------------------------------------------------ draw */

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, w, h);

    const xs = this.pos.map((p) => p[0]), ys = this.pos.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 4) + 2;
    const cell = Math.min(w, h) / span;
    const ox = w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * cell;
    const oy = h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * cell;
    const px = (i) => ox + this.pos[i][0] * cell;
    const py = (i) => oy + this.pos[i][1] * cell;
    const r = Math.max(6, Math.min(cell * 0.3, 16));

    // Contacts drawn first and drawn thick: this is the thing being maximised,
    // so it should be the most visible thing on screen.
    const at = new Map(this.pos.map(([x, y], i) => [key(x, y), i]));
    ctx.strokeStyle = token("--w-code-line");
    ctx.lineWidth = 5;
    ctx.setLineDash([2, 5]);
    ctx.lineCap = "round";
    for (let i = 0; i < this.pos.length; i++) {
      if (this.seq[i] !== "H") continue;
      const [x, y] = this.pos[i];
      for (const [dx, dy] of DIRS) {
        const j = at.get(key(x + dx, y + dy));
        if (j != null && j > i + 1 && this.seq[j] === "H") {
          ctx.beginPath(); ctx.moveTo(px(i), py(i)); ctx.lineTo(px(j), py(j)); ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);

    // the backbone
    ctx.strokeStyle = token("--ink-3");
    ctx.lineWidth = 3;
    ctx.beginPath();
    this.pos.forEach((_, i) => ctx[i ? "lineTo" : "moveTo"](px(i), py(i)));
    ctx.stroke();

    // Shape carries the type as well as hue: circles are oily, squares watery.
    ctx.font = `700 ${Math.round(r * 0.9)}px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.pos.forEach((_, i) => {
      const oily = this.seq[i] === "H";
      ctx.fillStyle = token(oily ? "--w-code-line" : "--w-frontier-line");
      ctx.beginPath();
      if (oily) ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
      else ctx.rect(px(i) - r * 0.88, py(i) - r * 0.88, r * 1.76, r * 1.76);
      ctx.fill();
      if (i === this.blocked) {
        ctx.strokeStyle = token("--w-wrong-line"); ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.fillStyle = token("--paper");
      ctx.fillText(String(i + 1), px(i), py(i) + 1);
    });
  }
}

if (!customElements.get("fp-folding")) customElements.define("fp-folding", Folding);
export default Folding;
