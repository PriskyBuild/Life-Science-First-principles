/* <fp-quiz> — one retrieval beat.

   Two consumers justify the component: lesson `check` stages and the review
   flow, which must behave identically or the spacing schedule is measuring two
   different things.

   The design rule that matters: feedback shows the MECHANISM, never just the
   verdict. Corrective feedback is what amplifies the testing effect, and
   "Correct!" is not corrective feedback — it is applause. Both a right and a
   wrong answer get the same explanation, because a child who guessed right
   still needs to know why. */

class Quiz extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "";
    this.answered = false;

    const q = document.createElement("p");
    q.className = "quiz-q";
    q.textContent = this.dataset.question ?? "";

    this.list = document.createElement("div");
    this.list.className = "quiz-options";
    this.list.setAttribute("role", "group");
    this.list.setAttribute("aria-label", q.textContent);

    const options = (this.dataset.options ?? "").split("|").filter(Boolean);
    const correct = Number(this.dataset.answer ?? 0);

    options.forEach((text, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-option pressable";
      b.textContent = text;
      b.onclick = () => this.answer(i, correct);
      this.list.append(b);
    });

    this.feedback = document.createElement("div");
    this.feedback.className = "quiz-feedback";
    this.feedback.hidden = true;
    this.feedback.setAttribute("role", "status");

    this.append(q, this.list, this.feedback);
  }

  answer(chosen, correct) {
    if (this.answered) return;
    this.answered = true;
    const right = chosen === correct;
    this.dataset.state = right ? "right" : "wrong";

    [...this.list.children].forEach((b, i) => {
      b.disabled = true;
      if (i === correct) b.dataset.mark = "correct";
      else if (i === chosen) b.dataset.mark = "chosen";
    });

    this.feedback.hidden = false;
    this.feedback.dataset.right = String(right);
    const verdict = document.createElement("p");
    verdict.className = "quiz-verdict";
    // Never colour alone: the verdict is a sentence, and the option carries a
    // mark as well as a hue.
    verdict.textContent = right ? "Yes — and here is why." : "Not this time. Here is what is going on.";
    const why = document.createElement("p");
    why.className = "quiz-why";
    why.textContent = this.dataset.why ?? "";
    this.feedback.replaceChildren(verdict, why);
    this.feedback.classList.add("m-attend");

    this.dispatchEvent(new CustomEvent("fp:quiz", {
      bubbles: true,
      detail: { concept: this.dataset.concept ?? null, correct: right, chosen },
    }));
  }
}

if (!customElements.get("fp-quiz")) customElements.define("fp-quiz", Quiz);
