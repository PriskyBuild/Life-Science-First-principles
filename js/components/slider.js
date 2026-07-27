/* <fp-slider data-label="Temperature" data-min="0" data-max="60" data-value="20"
              data-step="1" data-unit="°C">

   Wraps the native range input rather than rebuilding one. Native gives
   keyboard, screen-reader semantics, touch handling, RTL and OS accessibility
   settings for free — a hand-rolled slider gets none of that and is the single
   most common a11y failure in educational software.

   What the wrapper adds, and the only reason it exists: a visible label, a live
   value readout in the child's units, a hit area that meets the level's touch
   minimum, and one event lesson code can listen to. */

class Slider extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "";

    const id = `sl-${Math.random().toString(36).slice(2, 8)}`;
    const { label = "Value", min = "0", max = "100", value = "50", step = "1", unit = "" } = this.dataset;

    const head = document.createElement("div");
    head.className = "slider-head";
    const name = document.createElement("label");
    name.htmlFor = id;
    name.className = "slider-label";
    name.textContent = label;
    this.readout = document.createElement("output");
    this.readout.className = "slider-value";
    this.readout.htmlFor = id;
    head.append(name, this.readout);

    this.input = document.createElement("input");
    Object.assign(this.input, { type: "range", id, min, max, step, value });
    this.input.className = "slider-input";
    // The visible readout is the accessible one too, so there is no second
    // string to drift out of sync.
    this.input.setAttribute("aria-describedby", `${id}-out`);
    this.readout.id = `${id}-out`;

    this.input.addEventListener("input", () => this.sync(true));
    this.append(head, this.input);
    this.sync(false);
  }

  sync(emit) {
    const unit = this.dataset.unit ?? "";
    this.readout.textContent = `${this.input.value}${unit}`;
    this.input.setAttribute("aria-valuetext", `${this.input.value}${unit}`);
    if (emit) {
      this.dispatchEvent(new CustomEvent("fp:change", {
        bubbles: true, detail: { value: this.value, label: this.dataset.label },
      }));
    }
  }

  get value() { return Number(this.input.value); }
  set value(v) { this.input.value = String(v); this.sync(false); }
}

if (!customElements.get("fp-slider")) customElements.define("fp-slider", Slider);
