/* <fp-sim> — the base every simulation extends. Blueprint 8.2, 10, 11.3, 13.

   Four contracts, and a simulation that breaks any of them is not finished:

   1. ONE LOOP. Every running sim is stepped by a single requestAnimationFrame,
      not one each. Ten sims on a page must cost one frame's overhead, not ten.
      The loop pauses when the document is hidden and each sim pauses when it
      scrolls out of view.

   2. IT MUST DESCRIBE ITSELF. describe() returns a sentence about the current
      state, written into a live region. A simulation that cannot narrate itself
      is unusable without sight, and retrofitting that at lesson forty is
      ruinous — so the base class throws if a subclass has not implemented it.

   3. CAUSAL MOTION IS SUBSTITUTED, NOT REMOVED. Under prefers-reduced-motion
      the loop does not drive this sim; a step control does. The child still
      reaches every state of the mechanism, under their own control, with no
      involuntary motion. `animation: none` would delete the lesson.

   4. FIXED TIMESTEP. step() always receives the same dt, so the physics is
      identical on a 60Hz laptop, a 120Hz tablet and a step-through click.
      A dt that varies with frame rate makes a simulation teach different
      things to different children. */

const TICK = 1 / 60;          // seconds per simulation step, always
const MAX_CATCHUP = 5;        // never simulate more than this many steps per frame

/* ------------------------------------------------------------- shared loop */
const running = new Set();
let frame = 0;
let last = 0;

function tick(now) {
  frame = requestAnimationFrame(tick);
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  let steps = Math.min(Math.round(elapsed / TICK) || 1, MAX_CATCHUP);
  for (const sim of running) {
    for (let i = 0; i < steps; i++) sim.step(TICK);
    sim.render();
  }
  if (!running.size) { cancelAnimationFrame(frame); frame = 0; }
}

function start() {
  if (frame || !running.size) return;
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { cancelAnimationFrame(frame); frame = 0; }
    else start();
  });
}

/* --------------------------------------------------------------- base class */
export class Sim extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "";

    // Causal animation: this subtree is exempt from the blanket reduced-motion
    // rule in base.css precisely so the substitution below can happen instead.
    this.dataset.motionRole = "teach";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "sim-canvas";
    // The canvas is an image with a text alternative that updates. That is what
    // makes the simulation usable without sight.
    this.canvas.setAttribute("role", "img");
    this.ctx = this.canvas.getContext("2d");

    this.live = document.createElement("p");
    this.live.className = "sim-live";
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");

    this.controls = document.createElement("div");
    this.controls.className = "sim-controls";

    this.stepControls = document.createElement("div");
    this.stepControls.className = "teach-steps";
    this.playControls = document.createElement("div");
    this.playControls.className = "teach-play sim-play";

    this.append(this.canvas, this.controls, this.playControls, this.stepControls, this.live);

    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.params = this.readParams();
    this.setup();
    this.fit();

    new ResizeObserver(() => this.fit()).observe(this);
    // Off-screen sims burn battery for nobody.
    this.io = new IntersectionObserver(([e]) => (e.isIntersecting ? this.play() : this.pause()), { threshold: 0.1 });
    this.io.observe(this);

    this.buildControls();
    this.render();
    this.announce();
  }

  disconnectedCallback() { this.pause(); this.io?.disconnect(); }

  /** Params come from data-* attributes; anything JSON-ish is parsed. */
  readParams() {
    const out = {};
    for (const [k, v] of Object.entries(this.dataset)) {
      if (k === "ready" || k === "motionRole") continue;
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
    return out;
  }

  fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.clientWidth || 320;
    // Aspect alone gives a 1000px-tall canvas on a desktop, which turns a
    // simulation into a scroll. Clamp to something a child can see all of.
    const h = Math.round(Math.max(200, Math.min(w * (this.params.aspect ?? 0.6), 420)));
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    this.onResize?.();
    this.render();
  }

  play() {
    // Under reduced motion the loop never drives this sim; the step control does.
    if (this.reduced.matches || this.finished) return;
    running.add(this);
    start();
  }

  pause() { running.delete(this); }

  /** One manual step-through beat: a visible slice of mechanism, not one frame. */
  stepOnce(steps = 30) {
    for (let i = 0; i < steps; i++) this.step(TICK);
    this.render();
    this.announce();
  }

  render() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.draw(this.ctx);
    if (++this._sinceSpoken > 45) this.announce();
  }

  announce() {
    this._sinceSpoken = 0;
    const text = this.describe();
    if (text !== this.live.textContent) {
      this.live.textContent = text;
      this.canvas.setAttribute("aria-label", text);
    }
  }

  reset() {
    this.finished = false;
    this.setup();
    this.render();
    this.announce();
    this.play();
  }

  /** Fired once when the stage's objective is met, so the lesson can unlock. */
  succeed(detail = {}) {
    if (this.finished) return;
    this.finished = true;
    this.pause();
    this.dispatchEvent(new CustomEvent("fp:sim-goal", { bubbles: true, detail }));
  }

  /* ---- subclass contract ---- */
  setup() { throw new Error(`${this.tagName}: setup() not implemented`); }
  step() { throw new Error(`${this.tagName}: step() not implemented`); }
  draw() { throw new Error(`${this.tagName}: draw() not implemented`); }
  describe() {
    throw new Error(
      `${this.tagName}: describe() not implemented. A simulation that cannot say what it is ` +
      `doing is unusable without sight — see blueprint 10.`
    );
  }
  buildControls() {}
}

/** Colour lookups go through the stylesheet, so a sim can never invent a hue
    that has not been through the contrast solver. */
export function token(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export { TICK, running as _running };
