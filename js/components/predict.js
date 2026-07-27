/* <fp-predict data-question="What happens when it warms up?"
               data-options="They speed up|They slow down|Nothing changes">

   The pedagogical core of the product, and the smallest component in it.

   Sinha & Kapur's meta-analysis found that the single highest-value feature of
   problem-solving-first instruction is instruction that visibly BUILDS ON the
   learner's own generated solution (g = 0.56). Here that is implemented as
   string interpolation: the child commits to a prediction, and when the
   simulation resolves, echo() renders their own words next to the result.

   It pays XP for making a prediction, NOT for being right (blueprint 7.1).
   Rewarding only correct predictions teaches children to guess safe, which
   destroys the mechanism the simulation depends on. */

class Predict extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "";
    this.answer = null;

    const q = document.createElement("p");
    q.className = "predict-q";
    q.textContent = this.dataset.question ?? "What do you think will happen?";

    this.list = document.createElement("div");
    this.list.className = "predict-options";
    this.list.setAttribute("role", "group");
    this.list.setAttribute("aria-label", q.textContent);

    for (const text of (this.dataset.options ?? "").split("|").filter(Boolean)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "predict-option pressable";
      b.textContent = text;
      b.setAttribute("aria-pressed", "false");
      b.onclick = () => this.commit(text, b);
      this.list.append(b);
    }

    this.result = document.createElement("div");
    this.result.className = "predict-result";
    this.result.hidden = true;

    this.append(q, this.list, this.result);
  }

  commit(text, button) {
    this.answer = text;
    for (const b of this.list.children) {
      const chosen = b === button;
      b.setAttribute("aria-pressed", String(chosen));
      b.disabled = !chosen;          // the unchosen options grey out; the choice stays visible
    }
    this.dataset.state = "committed";
    // XP is paid here, before anything is known about correctness.
    this.dispatchEvent(new CustomEvent("fp:predict", {
      bubbles: true, detail: { answer: text, question: this.dataset.question },
    }));
  }

  /** Called by the simulation when the result is known. `outcome` is what
      actually happened, in the same voice as the options. */
  echo(outcome, { matched = null } = {}) {
    if (!this.answer) return;
    const same = matched ?? this.answer === outcome;
    this.result.hidden = false;
    this.result.dataset.matched = String(same);
    this.result.replaceChildren(
      line("You said", this.answer),
      line("It did", outcome),
      // A wrong prediction is celebrated explicitly. A tutor that only praises
      // correctness teaches children to stop predicting.
      Object.assign(document.createElement("p"), {
        className: "predict-verdict",
        textContent: same
          ? "You called it. Now you know why."
          : "Good — that gap between what you expected and what happened is the whole lesson.",
      }),
    );
    this.result.classList.add("m-attend");
  }
}

function line(kicker, text) {
  const row = document.createElement("p");
  row.className = "predict-line";
  const k = document.createElement("span");
  k.className = "predict-kicker";
  k.textContent = kicker;
  row.append(k, document.createTextNode(text));
  return row;
}

if (!customElements.get("fp-predict")) customElements.define("fp-predict", Predict);
