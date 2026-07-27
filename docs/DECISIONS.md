# Decision log

One entry per decision that changed, refined or contradicted the Phase 1 blueprint.
Newest last. The blueprint is the plan; this file is what survived contact with a browser.

**Running it:** any static server from the repo root — `python3 -m http.server 8000`, then
`http://localhost:8000`. No install, no build step to develop. Before committing:
`node tools/build.mjs` (writes the service-worker precache list, lints content, enforces budgets)
and `python3 tools/gen-palette.py` if a hue changed.

---

### D1 — Font budget splits into preloaded and deferred
*Phase 2. Supersedes blueprint §13 "Fonts, preloaded ≤ 35KB (2 faces, 3 weights)".*

Measured after subsetting: Nunito 400 + 700 = 25.1 KB, Baloo 2 600 = 16.5 KB, total 41.6 KB —
over the 35 KB line I set before measuring anything. Rather than degrade the typography to hit
a number I invented, the budget splits by *blocking behaviour*: Nunito is preloaded (25.1 KB,
72% of budget) and carries first paint; Baloo 2 is display-only with `font-display: optional`,
so it never blocks and never shifts layout. First visit renders headings in Nunito, the service
worker precaches Baloo, every later visit has it. Zero CLS by construction rather than by
metric-matching guesswork.

Rejected on the way: Nunito Variable was measured at 31.5 KB subsetted — *worse* than two static
weights, because variable fonts only pay off at three or more weights and we use two.

### D2 — Colours are solved against every surface they can land on, not just the page
*Phase 2. Refines blueprint §6.2.*

The generator originally gated each colour against `--paper` alone. The rendered-contrast audit
(see D6) then found six real failures the token-level check could not see: `--w-text` at 4.37:1
on its own `--w-*-tint` card, `--ink-3` at 4.19:1 on `--sunk`, world headings at 4.48:1 on
`--surface` in dark mode. Every one of them passed in isolation and failed in composition.

`tools/palette.py:solve()` now takes a *list* of grounds and requires the gate against all of
them simultaneously; `gen-palette.py` passes paper, surface, sunk and the ramp's own tint.
Neutral ink additionally gates against all nine tints. This is the generalisable lesson: a
contrast check on token pairs proves nothing about a page.

### D3 — Files added to the blueprint's structure
*Phase 2. Extends blueprint §8.4.*

- `js/el.js` — twelve lines replacing a template library; strings become text nodes so the app
  is XSS-safe by default rather than by remembering to escape.
- `js/curriculum.js` — evaluates the unlock graph. Unlock *rules* live in the JSON; this only
  reads them. Kept out of `state.js`, which is about persistence and nothing else.
- `tools/palette.py` / `tools/gen-palette.py` — the colour solver. `css/worlds.css` is generated
  output and must not be hand-edited.

`js/screens/` was not created: three shell screens are one cohesive file at ~230 lines, and the
per-route lazy loading in the blueprint is for *lessons*, which are not shell.

### D4 — The custom elements are deferred to Phase 4
*Phase 2. Defers blueprint §8.3.*

Phase 2 has no behaviour that needs a custom element — the Atlas is links and CSS. Registering
ten elements now would be scaffolding for later, and later can scaffold for itself. They arrive
in Phase 4 attached to the behaviour that justifies them.

### D5 — Focus is not moved on the first paint
*Phase 2. New; not anticipated by the blueprint.*

Moving focus to the `<h1>` on every render is correct for route changes and wrong on initial
load: it puts the skip link *behind* the user, where forward tabbing can never reach it. The
router now moves focus only on subsequent paints. Caught by a browser test, not by reading.

Related: elements carrying `data-fk` survive a repaint with focus intact, so a keyboard user
changing a radio in Me is not thrown back to the heading each time state changes.

### D6 — The build fails on four classes of silent bug
*Phase 2. Extends blueprint §13.*

Each of these was added because the bug it catches actually happened during Phase 2:

| Guard | The bug it caught |
|---|---|
| Undefined custom properties | `--s-5` and `--s-10` were referenced but never declared. CSS resolves an undefined `var()` to nothing and reports nothing — every card lost its padding and the layout broke silently. |
| Graph reachability | A cycle or an impossible gate makes content unreachable, and nobody finds out until a child hits the wall. |
| L1 hook word ceiling (22) | A sentence a five-year-old cannot finish is not a hook. |
| Rendered-contrast audit (in the browser test, not the build) | See D2. |

The DOM test suite also asserts no stringified `null` appears anywhere, after
`replaceChildren(null)` rendered the literal text "null" on the module screen — the kind of bug
that ships because it looks like content.

### D7 — Level 2 is the CSS default
*Phase 2. Refines blueprint §6.4.*

`:root` carries the L2 token values, and `[data-level="2"]` repeats them. If localStorage is
blocked, corrupt, or JavaScript fails before `applyRoot()` runs, the page still renders at a
sane size rather than with an unset `--touch` and zero-height controls.

---

### D8 — Elevation is built from fixed shade and rim, never from `--ink`
*Phase 3. Fixes a real defect shipped in Phase 2.*

`--clay-rest` derived its shadow colour from `--ink`, which inverts between themes. In dark
mode that painted a **pale halo below every card** — a light source under the page — which
destroys the raised/flat affordance the entire visual language depends on. Replaced with
`--shade` (always darker than the surface) and `--rim` (always lighter), emitted per theme by
the palette generator, composed into a five-step elevation scale `--e0 … --e3` plus
`--e-press`. `verify.mjs` now asserts, in both themes, that every drop shadow is darker than
the surface it falls on.

### D9 — Icons are path data in a module, not an SVG sprite
*Phase 3. Deviates from blueprint §12.*

A sprite needs either a build step that inlines it into `index.html` (breaking zero-build
development) or an external `<use href>` (which Safari does not support). Path data in
`js/icons.js` costs nothing at this size, works in dev, and lets a lazily-loaded Phase 8
lesson import only the icons it uses.

### D10 — One multiplier scales type and space; touch targets do not follow
*Phase 3. Refines blueprint §6.4.*

`html { font-size: calc(var(--type-scale) * 100%) }` multiplies the user's own root size
rather than replacing it, so a child who has set larger text in their OS keeps that preference
and gets level scaling on top. Spacing derives from rem and follows automatically — the three
magic pixel values in the Phase 2 table are gone.

`--touch` deliberately does **not** derive from type. It measures a hand, not a typeface, and
tying it to font size would shrink the target for a child who prefers small text.

### D11 — `<fp-reveal>` deleted before it was written
*Phase 4. Removes a blueprint §8.3 component.*

Native `<details>`/`<summary>` already does action-gated progressive disclosure with keyboard
support, screen-reader semantics and find-in-page, and lesson code can open it by setting one
attribute. Styled as `.reveal`; no component.

Also deferred out of Phase 4 for the same reason — nothing yet needs them: `<fp-stage>` and
`<fp-quiz>` (Phase 6), `<fp-sim>` (Phase 7), `<fp-specimen>` and `<fp-progress>` (Phase 5),
`<fp-tutor>` (Phase 9). Phase 4 shipped the three with behaviour that plain HTML cannot express.

### D12 — The placement primitive has one state machine, not three
*Phase 4. Implements blueprint §1.2, the most important a11y decision in the project.*

`<fp-board>` owns "what is held" and the live region. `<fp-placeable>` and `<fp-slot>` are the
two interactive parts. Tap-to-pick / tap-to-place is the base interaction; Enter and Space run
the identical code path; drag is a pointer-event layer that calls the same `pickUp()` and
`place()` methods once movement exceeds an 8px threshold, so a shaky tap stays a tap.

Keyboard and screen-reader support are not a retrofit here — they are the primary path with a
pointer glued on top. `verify.mjs` asserts all three paths reach byte-identical board state.

An invalid slot announces `aria-disabled="true"` but stays in the tab order: removing a target
from the tab order mid-gesture strands a keyboard user inside their own action.

### D13 — Budgets split shell from lesson JS
*Phase 4. Refines blueprint §13.*

`js/components/` and `js/sims/` are imported lazily by the lesson that needs them. Counting
them against the shell budget reported a cost no child on the Atlas actually pays. Now two
gates: shell JS ≤ 25 KB (currently 9.5), lesson JS ≤ 20 KB (currently 5.1).

### D14 — Four more guards, each added because the bug happened
*Phases 3–4.*

| Guard | The bug it caught |
|---|---|
| Elevation direction, both themes | D8 — pale halos under every dark-mode card. |
| Visibility audit | The style guide rendered, passed every contrast check, and was **invisible**: the shell's `body:not([data-ready]) main` opacity rule was scoped to bare `main` and caught it too. Now scoped to `#main`. |
| Service worker must not shadow other pages | The navigation fallback returned the app shell for *every* navigation, so `styleguide.html` served `index.html` and looked like a broken build. Now: exact document first, shell only as fallback. |
| Affordance rule, both directions | Ongoing. A disabled control is correctly flat, so `:disabled` and `aria-disabled="true"` are exempt from "touchable must be raised". |

---

### D15 — XP has one door, and it refuses
*Phase 5. Implements blueprint §7.1 as an enforced rule rather than a convention.*

`reward.js` owns a frozen `RATES` table and is the only way XP enters the system. The generic
`awardXp(amount)` that lived in `state.js` is **deleted** — a function that adds an arbitrary
number of points is the hole an economy leaks through.

`awardXp(reason)` throws on any reason not in `RATES`, and throws with a *written explanation*
for the five reasons some future version of this file will be tempted to add:

| Refused | Because |
|---|---|
| `time` | Paying for time on task produces idling, not learning. |
| `watch` | Paying for watching an animation produces passivity. |
| `streak` | Streaks are retention, not learning; paying XP for them corrupts the XP signal. |
| `login` | Paying for showing up is a habit loop, not a learning loop. |
| `correctPredict` | Prediction pays the same whether right or wrong. Paying only for correct predictions teaches children to guess safe, which destroys the mechanism. |

Rates: retrieval hit 15 (the best-evidenced effect gets the best rate), lesson complete 12,
challenge 10, discovery 8, prediction 5 either way, retrieval **miss 4**. The miss pays
something because the testing effect works on failed retrieval provided corrective feedback
follows — and far too little to farm.

### D16 — Badges read the retrieval schedule, never the completion count
*Phase 5. Implements blueprint §7.4.*

Every badge criterion is a predicate over `progress.concepts`, and badges are **derived, never
stored** — so they cannot drift from the evidence that justified them, and changing a criterion
re-evaluates the whole history instead of needing a migration. `verify.mjs` asserts that
finishing an entire module earns nothing, and that remembering one thing a week later earns
"It stuck".

### D17 — The scheduler is SM-2-lite, and says so
*Phase 5. Implements blueprint §7.3.*

Fixed ladder 1 / 3 / 7 / 16 / 35 days with a per-concept ease multiplier clamped to 0.6–1.6.
Full SM-2 tunes ease from a six-point self-rated difficulty scale, which a seven-year-old
cannot supply honestly; three grades derived from observed performance is what we can actually
measure. A miss returns the concept to tomorrow and drops ease, but keeps `reps` and `lapses` —
history is not erased by one bad day.

The `SESSION_CAP` of 5 is surfaced, not hidden: the Atlas says "9 are due; 5 at a time is
deliberate" rather than silently showing five. Blueprint §15, no silent caps.

### D18 — Specimens are inventory, not stickers
*Phase 5. Implements blueprint §7.2.*

Each carries an `unlocks` line naming what it lets the child build later — collecting a
ribosome in World 1 is why you can build a protein in World 2 — and Me renders uncollected
slots too, because an empty slot you can see is what makes a collection feel like one.

### D19 — `node --check` was lying, so the build now parses modules as modules
*Phase 5. Extends D6.*

An unbalanced parenthesis in `screens.js` passed `node --check js/screens.js` and every other
local check, then failed in the browser as a blank page with one line of console output.
`node --check foo.js` parses as **CommonJS**, where the file is not valid anyway, and does not
report the error that matters. The build now copies each `.js` to a `.mjs` and checks it as a
module. Cheap, and it closes a whole class of "it looked fine locally".

---

### D20 — The pedagogy fork is stage-level filtering, and the build enforces it
*Phase 6. Implements blueprint §1.1, the finding that changed the whole design.*

A lesson carries both tracks. Each stage may declare `levels: [1,2]` or `[3,4]`; the runner
filters, so no child ever sees both. Cells lesson 1 ships a guided exploration ("How close are
we?", captions that name what the child is seeing as they see it — PhET's implicit scaffolding)
for L1/L2, and an open one ("Powers of ten", predict where a cell falls before the label
arrives) for L3/L4.

The obvious failure mode is a filter that strands a level — remove the only naming stage for
L1 and the lesson silently stops teaching. `tools/build.mjs` now walks every lesson for all
four levels and fails the build if any level loses its hook, its exploration, its naming stage
or its check.

### D21 — Review beats are generated from the lessons, not maintained beside them
*Phase 6.*

The review flow needs its questions without loading whole lessons. `content/reviews.json` is
generated by the build from the `check` stages, keyed by concept. A hand-maintained second copy
is a copy that drifts, and the drift would be invisible — the child would be tested on a
different question from the one they learned.

### D22 — Live routes own their DOM
*Phase 6. Fixes a real defect the moment lessons existed.*

`state.update()` dispatches `fp:change`, and the router repainted the current route on every
change. That is right for the Atlas and Me — they must reflect progress immediately. It is
catastrophic for a lesson: **awarding XP for a correct answer repainted the route, rebuilt the
runner, and threw the child back to stage one.** Their own right answer reset the lesson.

Routes now declare `{ live: true }`, and the subscriber skips repainting them. Stateless
screens still repaint on every change, which is what keeps them honest.

### D23 — The persistence debounce must never own a lesson completion
*Phase 6. Fixes a data-loss bug.*

`update()` debounced the localStorage write by 500ms. Finishing a lesson wrote the completion,
the specimen, the XP and the retrieval seeds — and if the tab closed inside that window, all of
it was gone. Ponytail is explicit that error handling which prevents data loss is never the
thing to simplify away.

Three changes: `flush()` writes immediately; `pagehide` and `visibilitychange`→hidden flush any
pending write (pagehide is the last reliable moment on desktop, visibilitychange covers mobile
where pagehide is not guaranteed); and the two transactions worth protecting flush explicitly.

`completeLesson()` now owns the entire transaction — mark done, pay, bank the specimen, seed the
schedule, flush. Seeding used to live at the call site, *after* the flush, so the retrieval
schedule was silently dropped every time. Putting the flush last inside one function is what
makes that ordering trap impossible to reintroduce.

### D24 — Lesson code is not in the shell
*Phase 6. Implements blueprint §13.*

`js/lesson/` joins `js/components/` and `js/sims/` in the lazily-imported bucket, imported only
when a lesson route is hit. A test asserts the Atlas never requests it. Shell JS 15.0 KB of 25;
lesson JS 11.2 KB of 20.

---

### D25 — One loop, fixed timestep, and a describe() the base class enforces
*Phase 7. Implements blueprint §8.2, §10, §13.*

`<fp-sim>` gives every simulation four things it must not get wrong on its own:

**One requestAnimationFrame for all sims**, not one each; the loop stops when the document is
hidden, and each sim leaves it when scrolled out of view. Ten simulations on a page cost one
frame's overhead.

**A fixed timestep.** `step()` always receives 1/60s regardless of frame rate, with a catch-up
cap. A dt that varies with the display makes a simulation teach different physics to a child on
a 120Hz tablet than to one on an old laptop.

**A describe() contract the base class refuses to run without.** It returns a sentence about
current state — "Holes set to 3. 14 of 20 food inside, 1 of 12 poison inside. Holes this size
block poison." — written into a live region *and* used as the canvas `aria-label`. The
description is visible text as well, because a child who is not reading the canvas closely
benefits from it too, not only one who cannot see it.

**Causal motion substituted, not removed.** Under `prefers-reduced-motion` the loop never drives
the sim; a step control advances it 40 ticks at a time. Every state of the mechanism stays
reachable, under the child's own control, with no involuntary motion. This is the promise
blueprint §11.3 made and the reason `animation: none !important` was never acceptable.

### D26 — The membrane simulation is real diffusion, and the tests prove it
*Phase 7. The project's technical bet, blueprint §15.1.*

There is no "flow" variable in `membrane.js`. Each molecule takes an unbiased random walk with
a fixed step length; nothing in the file knows which way is "in". Net movement from crowded to
empty falls out of that, which means the child really is watching Fick's first law emerge from
noise rather than an animation of it.

Three tests hold that honest: with the pores open, concentrations even out on their own and
then *hold* — measured as a time-average over 3,000 steps, because with ~50 particles a single
instant carries a standard deviation of about 0.07 and cannot tell equilibrium from noise (the
first version of this test failed on exactly that). With pores smaller than a molecule, that
species does not move a single one across, while smaller ones still cross freely. Frame cost
measured at 0.12ms against the 8ms budget.

Molecules are told apart by **shape** as well as colour — circle, square, triangle, diamond,
cross, hexagon — because roughly one boy in twelve cannot use the hue, and a canvas has no
markup to carry the redundancy for you. Pores are drawn at the size they actually admit, so the
rule is visible rather than stated.

L1 gets 2 molecule types, L2 3, L3 5, L4 6 — one implementation, level-indexed parameters, per
blueprint §8.6.

### D27 — The objective is not a toll gate
*Phase 7.*

A sim stage unlocks Next when the goal is met, and also offers "I have had enough of this one".
A child who cannot hit the target is not trapped in the lesson. The objective is worth trying
for; a lesson that cannot be left is a lesson a child learns to dread.

### D28 — Budgets split again, because sims load per stage
*Phase 7.*

`js/sims/` is imported by the stage that names it, so a child in lesson 1 never downloads the
membrane physics. Counting it against the lesson budget reported a cost nobody pays. Three
tiers now: shell 15.7 KB of 25, lesson 11.9 of 20, sims 6.2 of 20.

A related catch: `components.css` set `display: flex` on `.teach-steps`, overriding the
`display: none` in `base.css` and showing the reduced-motion step controls to everyone. The
later stylesheet won, silently. Display for that element now belongs to `base.css` alone.

---

### D29 — ATP is a flow, and the simulation is built to break the battery metaphor
*Phase 8.*

`<fp-energy>` is a stock-and-flow with a deliberately tiny stock, because that is the fact:
an adult turns over roughly their own body weight in ATP per day against a standing pool of
about 250 g. A cell that stops making it dies in seconds rather than running down.

The child sets glucose supply and mitochondrial number and finds the trade-off that carries the
lesson — power plants have their own upkeep, so the best answer is not the maximum of either
slider. At L3/L4 demand steps up partway through, so the setting that works now is not
necessarily the one that survives. That is why cells regulate mitochondrial number rather than
maximising it, and the simulation lets a child discover it rather than being told.

### D30 — `element.slot` is a native property, and it silently ate the placement back-reference
*Phase 8. Fixes a latent defect from phase 4.*

`fp-board` stored `item.slot = slotElement`. `HTMLElement.slot` is a native **string** property
(the shadow-DOM slot name), so the element was silently stringified and every read afterwards
returned `"[object HTMLElement]"`. Moving an already-placed piece to a different slot threw.

Phase 4's tests never moved a placed piece, so it passed everything for two phases. Renamed to
`item.placedIn`. The general lesson: on a custom element in light DOM, every property name is
sharing a namespace with the whole HTMLElement interface.

### D31 — A boss you cannot lose is a cutscene
*Phase 8. Fixes a design flaw caught by writing the test.*

The Build a Cell stress test grades what the child assembled. But every slot declared
`accepts`, which constrains what may be dropped — so a *complete* build was necessarily a
*correct* build and the trials could only ever pass. The test that was supposed to prove the
boss was diagnostic could not be written.

Slots now separate two things: `accepts` constrains placement (right for a guided build, where
the point is learning names) and `correct` records the right answer. The boss omits `accepts`,
so any part fits any job and misassignment is possible. A build with the mitochondrion in the
wrong job fails starvation and repair, and each failure names what was missing — then the child
swaps it back and the same stress becomes survivable, in place, without restarting.

`tools/build.mjs` now fails any stage that has `trials` while every slot constrains placement,
so this cannot be reintroduced by writing a lesson.

### D32 — `--w-line` cannot carry reversed text
*Phase 8.*

The Next button used `--w-line` as a fill with page-coloured text on it, measuring 3.43:1.
`--w-line` is solved as a **3:1 stroke** colour and was never gated for text on top of it. It
now uses `--w-deep`, and the palette generator gates `--w-deep` at 4.5:1 against the page in
both themes so the same mistake cannot drift back. Caught by the rendered-contrast audit, which
is now three phases old and has found a defect in every one.

---

### D33 — Sprout escalates only on struggle, and only the last rung states a fact
*Phase 9. Implements blueprint §9.*

Six rungs — notice, focus, compare, analogy, partial, consolidate — and the test asserts that
the first five contain no statement of the answer while the last one names the concept. Rungs
0–2 are the whole product for most children.

**Ladders are generic per stage TYPE, not authored per stage.** Authoring six rungs × four
levels × every stage of 125 lessons is a content project, not a feature; the generic ladders
make the tutor useful from lesson one and a lesson can override them where a generic hint
genuinely falls short. None has needed to yet.

**Struggle is detected, never self-reported** — one wrong answer, or 45 seconds of no input. A
child who has to press "I need help" to be noticed is a child who has already decided they are
bad at this. But Sprout **never opens itself**: the nudge draws attention to the button and
opening it stays the child's decision, because a panel that appears on its own is a thing that
happened *to* them.

It is silent on hooks, namings and applications. Offering help on a paragraph is noise, and
noise is how a companion becomes a nuisance.

### D34 — What the UI/UX resolver contributed, and what it did not
*Phase 9.*

Re-ran with `--motion 5 --density 3`. It confirmed claymorphism for children's education
(performance ⚠ moderate, accessibility ✓ AA with care), and its pre-delivery checklist produced
four real changes:

- **Pointer cursors on custom elements.** `fp-placeable` and `fp-slot` are custom elements and
  get no cursor from the user agent. Genuine gap, genuinely missed.
- **Chunkier radii.** Its claymorphism profile calls for 40–50px outer / 32 cards / 20 buttons.
  Ours were about half that. Raised, but kept in rem so they land near those numbers at L1–L2
  and stay sane at L4 rather than turning into a cartoon for a sixteen-year-old.
- **The press squish.** It asks for `scale(0.92)`; that is far too much on a 76px target, so
  0.97 alongside the existing sink — give, without the element appearing to jump.
- **Four breakpoints tested.** 375 / 768 / 1024 / 1440, plus a landscape phone. Nothing may
  overflow or fall below the level's touch minimum. Now in the suite.

**Declined:** its palette (unchanged reasoning from D2 — ours is solved against every surface,
its is picked); Comic Neue for body (D-phase 1); GSAP for the stagger (WAAPI does it); haptics
on every press — its own guidance says do not overuse, and a phone buzzing on each tap is
miserable, so it fires on achievement only and `prefers-reduced-motion` is the opt-out.

### D35 — Lighthouse, finally measured
*Phase 10. The brief asked for >95 on all four and it had never actually been run.*

**99 / 100 / 100 / 100.**

The one structural finding was four render-blocking stylesheets costing 680ms. They stay four
files to author and are concatenated into `css/app.css` to ship; the four sources leave the
precache and remain for `styleguide.html`. Render-blocking dropped to 450ms and first
contentful paint now passes outright.

**Minification declined.** Lighthouse offers ~31 KB across CSS and JS, which would mean a
minifier dependency and a build step, for a metric already passing at 99 against a target of 95.
The gzipped budgets are at 63–70%. If that number ever drops below 95, terser is the lever;
until then it is optimisation without a problem.

### D36 — Shipped with a CSP, so the style guide's inline script had to move
*Phase 10.*

`vercel.json` and `_headers` ship `script-src 'self'` with no `unsafe-inline`. `styleguide.html`
carried 8.8 KB of inline module script, which that policy blocks. Extracted to `styleguide.js`
rather than adding a hash or a nonce to keep in sync — a CSP with exceptions is a CSP that rots.

CI regenerates the palette and the build outputs and fails on any diff, so stale generated
colours that no longer clear their contrast gates cannot ship.
