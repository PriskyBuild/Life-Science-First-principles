/* <fp-membrane> — the project's technical bet (blueprint 15.1).

   If diffusion cannot be made both scientifically honest and legible to an
   eight-year-old, the "operate the mechanism" thesis needs re-examining. So
   this is built second, not fortieth.

   The honesty: nothing pushes the molecules. Each one takes a random walk with
   a fixed step length; net movement from crowded to empty falls out of that and
   is never scripted. A child can watch the outside empty into the inside and
   then stop, and what they are watching really is Fick's first law emerging
   from noise. There is no "flow" variable anywhere in this file.

   The legibility: molecules are told apart by SHAPE as well as colour, because
   roughly one boy in twelve cannot use the hue; the membrane's pores are drawn
   at the size they actually admit, so the rule is visible rather than stated;
   and the whole thing narrates itself in a sentence. */

import { Sim, token } from "./base.js";
import "../components/slider.js";

/* size is the only property that decides passage — bigger than the pore and it
   bounces. Shape is the redundant channel that makes colour non-load-bearing. */
const KINDS = [
  { id: "water",   label: "Water",   size: 1, shape: "circle", hue: "--w-frontier-line", side: "both" },
  { id: "poison",  label: "Poison",  size: 6, shape: "triangle", hue: "--w-wrong-line",  side: "out" },
  { id: "food",    label: "Food",    size: 3, shape: "square",  hue: "--w-correct-line", side: "out" },
  { id: "waste",   label: "Waste",   size: 3, shape: "diamond", hue: "--w-change-line",  side: "in" },
  { id: "salt",    label: "Salt",    size: 2, shape: "cross",   hue: "--w-code-line",    side: "out" },
  { id: "protein", label: "Protein", size: 9, shape: "hex",     hue: "--w-bodies-line",  side: "in" },
];

const PORES = 5;
const BAND = 10;

class Membrane extends Sim {
  setup() {
    const n = Math.max(2, Math.min(this.params.kinds ?? 3, KINDS.length));
    this.kinds = KINDS.slice(0, n);
    this.pore = this.params.pore ?? 3;
    this.temp = this.params.temp ?? 1;
    this.target = this.params.target ?? 0.6;
    this.elapsed = 0;
    this.held = 0;

    const per = this.params.per ?? 14;
    this.parts = [];
    for (const kind of this.kinds) {
      const count = kind.id === "water" ? Math.round(per * 1.4) : per;
      for (let i = 0; i < count; i++) {
        // Everything starts on the side it belongs to, so the first thing a
        // child sees is a difference — and difference is what diffusion eats.
        const inside = kind.side === "in" || (kind.side === "both" && i % 2 === 0);
        this.parts.push({
          kind,
          x: inside ? 0.55 + Math.random() * 0.42 : 0.03 + Math.random() * 0.42,
          y: 0.05 + Math.random() * 0.9,
          a: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  buildControls() {
    const add = (label, min, max, value, key, unit = "") => {
      const s = document.createElement("fp-slider");
      Object.assign(s.dataset, { label, min, max, value, step: "1", unit });
      s.addEventListener("fp:change", (e) => { this[key] = e.detail.value; this.render(); this.announce(); });
      this.controls.append(s);
    };
    add("How big are the holes?", 1, 9, this.pore, "pore");
    if (this.params.temp != null) add("Warmth", 1, 3, this.temp, "temp");

    const mk = (cls, text, fn) => {
      const b = document.createElement("button");
      b.className = `sim-btn pressable ${cls}`;
      b.textContent = text;
      b.onclick = fn;
      return b;
    };
    this.playControls.append(mk("", "Start again", () => this.reset()));
    // The reduced-motion substitution: same mechanism, child-driven.
    this.stepControls.append(
      mk("", "Step forward", () => this.stepOnce(40)),
      mk("", "Start again", () => { this.setup(); this.render(); this.announce(); }),
    );

    const legend = document.createElement("ul");
    legend.className = "sim-legend";
    for (const k of this.kinds) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="sim-chip" data-shape="${k.shape}" style="--chip:var(${k.hue})"></span>`;
      li.append(document.createTextNode(`${k.label} — ${k.size <= this.pore ? "fits" : "too big"}`));
      li.dataset.kind = k.id;
      legend.append(li);
    }
    this.legend = legend;
    this.append(legend);
  }

  /* Random walk. The direction wanders, the step length does not — so this is
     diffusion, not drift, and no term in it knows which way is "in". */
  step(dt) {
    this.elapsed += dt;
    const speed = 0.055 * this.temp;
    for (const p of this.parts) {
      p.a += (Math.random() - 0.5) * 1.6;
      const nx = p.x + Math.cos(p.a) * speed * dt * 10;
      const ny = p.y + Math.sin(p.a) * speed * dt * 10;

      if (ny < 0.02 || ny > 0.98) p.a = -p.a; else p.y = ny;

      const crossing = (p.x - 0.5) * (nx - 0.5) <= 0;
      if (crossing) {
        // A pore admits what is smaller than it, at the height where it exists.
        const inPore = this.poreAt(p.y);
        if (inPore && p.kind.size <= this.pore) p.x = nx;
        else p.a = Math.PI - p.a;
      } else if (nx < 0.02 || nx > 0.98) {
        p.a = Math.PI - p.a;
      } else {
        p.x = nx;
      }
    }
    this.checkGoal();
  }

  poreAt(y) {
    const gap = (0.02 + this.pore * 0.012) / 2;
    for (let i = 0; i < PORES; i++) {
      const c = (i + 0.5) / PORES;
      if (Math.abs(y - c) < gap) return true;
    }
    return false;
  }

  counts() {
    const out = {};
    for (const k of this.kinds) out[k.id] = { in: 0, total: 0 };
    for (const p of this.parts) {
      out[p.kind.id].total += 1;
      if (p.x > 0.5) out[p.kind.id].in += 1;
    }
    return out;
  }

  checkGoal() {
    const c = this.counts();
    const food = c.food ?? c.water;
    const poison = c.poison;
    const fedEnough = food.in / food.total >= this.target;
    const safe = !poison || poison.in / poison.total < 0.2;
    // Hold the state for a moment, so a lucky instant does not count as success.
    this.held = fedEnough && safe ? this.held + 1 : 0;
    if (this.held > 90) this.succeed({ seconds: Math.round(this.elapsed) });
  }

  /* Description is a sentence about state, not a data dump. It is what a child
     using a screen reader hears, and what everyone else could hear if they
     asked — so it says whether things are going well, not just the numbers. */
  describe() {
    const c = this.counts();
    const bits = this.kinds
      .filter((k) => k.id !== "water")
      .map((k) => `${c[k.id].in} of ${c[k.id].total} ${k.label.toLowerCase()} inside`);
    const blocked = this.kinds.filter((k) => k.size > this.pore).map((k) => k.label.toLowerCase());
    const verdict = this.met
      ? "The cell has what it needs and the poison is out."
      : blocked.length
        ? `Holes this size block ${blocked.join(" and ")}.`
        : "Holes this size let everything through.";
    return `Holes set to ${this.pore}. ${bits.join(", ")}. ${verdict}`;
  }

  onResize() { this.updateLegend(); }

  /* fit() renders once before buildControls() has run, so this must tolerate
     being called before the legend exists rather than assume lifecycle order. */
  updateLegend() {
    if (!this.legend) return;
    for (const li of this.legend.children) {
      const k = this.kinds.find((x) => x.id === li.dataset.kind);
      li.lastChild.textContent = `${k.label} — ${k.size <= this.pore ? "fits" : "too big"}`;
    }
  }

  draw(ctx) {
    const { w, h } = this;
    const mid = w / 2;
    this.updateLegend();

    ctx.fillStyle = token("--sunk");
    ctx.fillRect(0, 0, mid, h);
    ctx.fillStyle = token("--w-origins-tint");
    ctx.fillRect(mid, 0, w - mid, h);

    ctx.fillStyle = token("--ink-3");
    ctx.font = `600 12px ${getComputedStyle(this).fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText("OUTSIDE", mid / 2, 18);
    ctx.fillText("INSIDE", mid + (w - mid) / 2, 18);

    // membrane with its pores drawn at the size they admit
    ctx.fillStyle = token("--w-origins-line");
    const gap = (0.02 + this.pore * 0.012) * h;
    let y = 0;
    for (let i = 0; i < PORES; i++) {
      const c = ((i + 0.5) / PORES) * h;
      ctx.fillRect(mid - BAND / 2, y, BAND, Math.max(0, c - gap / 2 - y));
      y = c + gap / 2;
    }
    ctx.fillRect(mid - BAND / 2, y, BAND, Math.max(0, h - y));

    for (const p of this.parts) shape(ctx, p.kind, p.x * w, p.y * h, 4 + p.kind.size * 0.7, token(p.kind.hue));
  }
}

function shape(ctx, kind, x, y, r, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  switch (kind.shape) {
    case "square": ctx.rect(x - r, y - r, r * 2, r * 2); break;
    case "triangle": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); break;
    case "diamond": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
    case "cross": ctx.rect(x - r, y - r / 3, r * 2, r / 1.5); ctx.rect(x - r / 3, y - r, r / 1.5, r * 2); break;
    case "hex":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    default: ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

if (!customElements.get("fp-membrane")) customElements.define("fp-membrane", Membrane);
export default Membrane;
