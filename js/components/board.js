/* <fp-board> / <fp-placeable> / <fp-slot>

   The single most important accessibility decision in the blueprint (§1.2),
   implemented once. Nielsen Norman's developmental research is blunt: children
   aged 5-7 struggle with dragging, and precise dragging stays hard well past
   that. So drag is NOT the interaction — it is a progressive enhancement over
   one state machine:

       tap to pick up  ->  tap to place        (the base interaction)
       Enter/Space     ->  Enter/Space         (same code path, free)
       press and drag  ->  release over a slot (same code path)

   Every path calls board.pickUp() and board.place(). There is no second
   implementation to keep in sync, and the keyboard and screen-reader paths are
   not a retrofit — they are the primary path with a pointer glued on top.

   Light DOM, no shadow root, so design tokens and the level system apply. */

const DRAG_THRESHOLD = 8;   // px before a press becomes a drag, so a shaky tap stays a tap

/* `connectedCallback` fires on EVERY insertion, and this component moves
   elements between tray and slots — so unguarded it adds a duplicate listener
   per placement, and duplicate handlers cancel out. (D66) Setup runs once per
   element; everything that changes lives in refresh(). */
const wire = (el) => { if (el.wired) return false; el.wired = true; return true; };

class Board extends HTMLElement {
  connectedCallback() {
    if (!wire(this)) return;
    this.held = null;
    this.setAttribute("role", "group");
    if (this.dataset.label) this.setAttribute("aria-label", this.dataset.label);
    this.live = document.createElement("div");
    this.live.className = "sr-only";
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    this.append(this.live);
    this.refresh();
  }

  get placeables() { return [...this.querySelectorAll("fp-placeable")]; }
  get slots() { return [...this.querySelectorAll("fp-slot")]; }

  say(message) { this.live.textContent = message; }

  accepts(slot, item) {
    const list = slot.dataset.accepts?.trim();
    return !list || list.split(/\s+/).includes(item.dataset.id);
  }

  pickUp(item) {
    if (item === this.held) return this.drop();     // tapping the held item puts it back
    this.held = item;
    const open = this.slots.filter((s) => this.accepts(s, item) && !s.item).length;
    this.say(`${item.dataset.label} picked up. ${open} place${open === 1 ? "" : "s"} available.`);
    this.refresh();
  }

  drop() {
    if (!this.held) return;
    this.say(`${this.held.dataset.label} put back.`);
    this.held = null;
    this.refresh();
  }

  /** The one place a placement happens, whatever gesture triggered it. */
  place(slot, item = this.held) {
    if (!item) return false;
    if (!this.accepts(slot, item)) {
      this.say(`${item.dataset.label} does not go in ${slot.dataset.label}.`);
      return false;
    }
    if (slot.item && slot.item !== item) this.unplace(slot.item, { quiet: true });
    if (item.placedIn && item.placedIn !== slot) this.unplace(item, { quiet: true });

    slot.item = item;
    // NOT `item.slot`: HTMLElement.slot is a native string property (the shadow
    // DOM slot name), so assigning an element to it silently stringifies and
    // every read afterwards is "[object HTMLElement]". Moving a placed piece
    // threw instead of moving. Native names are a minefield on custom elements.
    item.placedIn = slot;
    slot.append(item);
    this.held = null;
    this.say(`${item.dataset.label} placed in ${slot.dataset.label}.`);
    this.refresh();
    this.dispatchEvent(new CustomEvent("fp:place", {
      bubbles: true, detail: { item: item.dataset.id, slot: slot.dataset.label, state: this.state },
    }));
    return true;
  }

  unplace(item, { quiet = false } = {}) {
    if (!item.placedIn) return;
    const from = item.placedIn;
    from.item = null;
    item.placedIn = null;
    (this.home ??= this.querySelector("[data-tray]") ?? this).append(item);
    if (!quiet) this.say(`${item.dataset.label} taken out of ${from.dataset.label}.`);
    this.refresh();
  }

  get state() {
    return Object.fromEntries(this.slots.map((s) => [s.dataset.label, s.item?.dataset.id ?? null]));
  }

  refresh() {
    for (const item of this.placeables) {
      item.dataset.state = item === this.held ? "held" : item.placedIn ? "placed" : "home";
      item.setAttribute("aria-pressed", String(item === this.held));
    }
    for (const slot of this.slots) {
      const valid = this.held ? this.accepts(slot, this.held) : null;
      slot.dataset.state = slot.item ? "filled" : valid === true ? "valid" : valid === false ? "invalid" : "empty";
      // A slot that cannot take what you are holding is still focusable; it just
      // says so. Removing it from the tab order mid-gesture loses the keyboard user.
      slot.setAttribute("aria-disabled", String(valid === false));
      /* Its name says what it holds, so it is rewritten here. Optional call:
         in hand-written markup the board upgrades before its slots, so the
         first refresh sees plain elements with no methods yet. (D66) */
      slot.label?.();
    }
    this.toggleAttribute("data-holding", !!this.held);
  }
}

/* --- shared button-ish behaviour for the two interactive parts --- */
class Part extends HTMLElement {
  /** Returns whether it wired: a subclass must gate on it, or its own
      addEventListener puts the duplicate straight back. (D66) */
  connectedCallback() {
    if (!wire(this)) return false;
    this.setAttribute("role", "button");
    this.tabIndex = 0;
    this.classList.add("pressable");
    /* A placed piece is a CHILD of its slot, so both see one tap. Each part
       owns its activation and stops there, or the slot reverses it. (D66) */
    this.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.activate(); }
      if (e.key === "Escape") { e.stopPropagation(); this.board?.drop(); }
    });
    this.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.activate(); });
    this.label();
    return true;
  }
  get board() { return this.closest("fp-board"); }
  label() {
    const parts = [this.dataset.label, this.extraLabel?.()].filter(Boolean);
    this.setAttribute("aria-label", parts.join(", "));
  }
}

class Placeable extends Part {
  connectedCallback() {
    if (!super.connectedCallback()) return;
    this.addEventListener("pointerdown", (e) => this.startDrag(e));
  }
  /* A placed piece taps back INTO the hand, not just out of its slot: two taps
     to change an answer, and it returns to the tray so the hand is visible. */
  activate() {
    const board = this.board;
    if (!board) return;
    if (this.placedIn && board.held !== this) board.unplace(this, { quiet: true });
    board.pickUp(this);
  }

  /* Drag writes to the same pickUp/place calls a tap does. */
  startDrag(e) {
    if (e.button > 0) return;
    const board = this.board;
    if (!board) return;
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, hovered = null;

    const move = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;  // still a tap
      if (!dragging) {
        dragging = true;
        this.setPointerCapture(ev.pointerId);
        board.pickUp(this);
        this.dataset.dragging = "";
      }
      this.style.translate = `${dx}px ${dy}px`;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = under?.closest?.("fp-slot");
      if (slot !== hovered) {
        hovered?.removeAttribute("data-over");
        hovered = slot && board.accepts(slot, this) ? slot : null;
        hovered?.setAttribute("data-over", "");
      }
    };

    const end = (ev) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      hovered?.removeAttribute("data-over");
      if (!dragging) return;                 // never crossed the threshold: the click handler runs
      ev.preventDefault();
      delete this.dataset.dragging;
      this.style.translate = "";
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("fp-slot");
      if (under) board.place(under); else board.drop();
    };

    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  }
}

class Slot extends Part {
  extraLabel() { return this.item ? `holds ${this.item.dataset.label}` : "empty"; }
  activate() {
    const board = this.board;
    if (!board) return;
    if (board.held) board.place(this);
    // Tapping a full slot is the same gesture as tapping the piece in it.
    else if (this.item) this.item.activate();
    else board.say(`${this.dataset.label} is empty. Pick something up first.`);
  }
}

for (const [name, ctor] of [["fp-board", Board], ["fp-placeable", Placeable], ["fp-slot", Slot]]) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
