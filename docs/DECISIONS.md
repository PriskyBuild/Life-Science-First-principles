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

---

## The optimisation patch

Six changes from a self-review, three of them defects that had shipped.

### D37 — Reading level and conceptual level were the same dial
*Corrects blueprint §6.4 and every phase built on it.*

`data-level` drove both the prose register and which stages a child saw. So a dyslexic
fourteen-year-old who chose level 1 to get readable sentences was also handed a five-year-old's
biology **and** 76px buttons they have adult motor control for. That is the child the
Atkinson Hyperlegible toggle exists to serve, and the level system was quietly excluding them.

Reading ability and conceptual maturity are independent axes. `progress.level` becomes
`progress.prose` and `progress.content` (migration v1→v2), and two root attributes fall out,
each with a reason:

| Attribute | From | Drives | Because |
|---|---|---|---|
| `data-level` | prose | type scale, measure, motion | reading concerns |
| `data-age` | content | touch targets, gaps | motor concerns — it measures a hand |

`pick()` reads prose; `forLevel()` and simulation parameters read content. Me exposes both and
explains why they are separate. The picker still asks one question and sets both; they only
diverge if someone deliberately separates them.

**Side effect worth as much as the fix:** authoring drops from four prose variants to two.
The downward fallback already covered the gaps — roughly 1,000 sentences of writing removed
from the remaining 24 modules.

### D38 — One throwing simulation ran the error loop forever
*Fixes a defect shipped in phase 7.*

`tick()` scheduled the next frame at the top and then stepped every sim with no try/catch. A
simulation throwing did not stop the loop — the next frame was already booked, so it threw
sixty times a second, indefinitely, rendering nothing. Worse than dying.

Each sim's step and render are now wrapped; a throwing sim is evicted from the set, the others
carry on, and `fail()` puts a recoverable message where the description was rather than leaving
a blank rectangle. Tested with a deliberately broken sim alongside a healthy one.

### D39 — The climax of the module was silent
*Fixes an accessibility defect shipped in phase 8.*

The boss's stress-test verdict rendered into a plain `<div>`. A child using a screen reader
assembled the cell, faced three stresses, and heard nothing. A concise spoken summary now
leads — "1 of 3 stresses survived. Starvation and Damage requiring repair failed." — with the
readable detail after it, and it updates when they fix the build. Announcing the full list
verbatim would be a paragraph of speech nobody asked for.

### D40 — The level nudge, specified in phase 1 and never built
*Completes blueprint J1.*

Self-selected difficulty skews upward: children pick the clever-sounding sentence and grown-ups
pick for them. The blueprint's corrective — nudge if performance disagrees for three lessons —
was specced and never implemented, which left the inference a one-shot guess.

Three lessons of retrieval accuracy plus whether the tutor was reached for. Under 45%, or
leaning on Sprout every time, offers a gentler **content** level; above 95% with no help offered
a harder one. **Offered, never applied.** Moving a child's level without asking is a thing that
happens *to* them, and the prose level is never touched — the offer says so explicitly.

### D41 — The Atlas promised 25 modules and delivered 1
*New.*

Finishing Cells opened eight modules that all said "not yet written". That reads as abandoned
rather than early. The Atlas now draws only worlds with playable content, plus one signpost card
naming what is coming. A small map that feels finished beats a large one that feels broken.

**The dependency graph is untouched** — only the display is gated, and a test asserts all 25
modules still exist behind it and still unlock in the right order.

`content/authored.json` is generated by the build from what is actually on disk, replacing a
hardcoded `AUTHORED` set in two files. A hand-maintained list drifts the moment somebody adds a
lesson, and the drift shows up as a link to a file that is not there.

### D42 — Deleted: the streak, and the XP number
*Removes working, tested, unread code.*

The streak was built carefully in phase 5 — two-day grace, no loss drama, no freeze economy —
and read by **nothing**. Not a badge, not a screen, not a decision. Deleted entirely.

The XP counter is gone from Me. The ledger stays, because badges are derived from it, and the
rate table stays because its refusals are the valuable part. What went is the number on screen:
a score with no evidence that a child wants it teaches score-watching.

Both were my own work from three phases ago. If a real child asks where their streak went, that
is evidence to build it back on — which is more than it ever had.

### D43 — Sprout's ladders moved from code to content
*Refines D33.*

`tutor.js` was 13.3 KB, the largest file in the lesson bundle, almost entirely strings. That is
why the tier sat at 93% of budget, one component from failing. The ladders are now
`content/hints.json`, fetched with the lesson and cached. Tier is at 82%, and Sprout's voice can
be edited by someone who does not write JavaScript.

Related: the lesson linter matched "any JSON under `content/`", so once the build started
writing `authored.json` and `hints.json` there, **it tried to lint its own output**. Lessons live
in `content/<module>/`; the pattern now says so.

---

## Phase 12 — the format meets a lesson that is not about Cells

Five lessons in one module had proved that the format worked. They had not proved what it
*could not say*, because everything written against it so far was a continuous molecular
simulation with a setting to find. Authoring Natural Selection lesson 1 before Cells lesson 6
was the whole point: find the walls by walking into them.

Four of the five entries below are things that were **impossible to express**, not things that
were wrong. That is the more dangerous category, because nothing fails — you simply write a
worse lesson and never learn why.

### D44 — The curriculum spine is a contract, not documentation
*New.*

Every module now carries `lessonTitles`, `specimens` and a `concepts` vocabulary: 110 lessons
across 25 modules, all named. Titles and specimens make the Atlas honest about what is coming.
The concept list is the part that does work — it is the vocabulary a lesson in that module may
test, and it exists so that a typo'd concept id fails the build instead of silently creating an
orphan review beat that no lesson ever seeds and no child ever sees again.

Writing the spine also caught the module the whole project was quietly deferring: an `evolution`
module whose first lesson I had drafted as *"Nobody Designed the Eye."* That title asserts a
conclusion. The brief says begin with curiosity, never with a definition — and a hook that hands
over the answer before the question is a worse hook by the platform's own standard, whatever one
thinks of the answer. It is now *"What Would Change Your Mind?"*, which is a question.

### D45 — `once()`: state that survives a reset
*New contract on `Sim`.*

`reset()` called `setup()`, which rebuilt everything. So a stage whose task is **run it, change
one thing, run it again and compare** could not be written: pressing "start again" erased both
the previous run's trace and the child's own switch settings — that is, it erased the experiment
and the hypothesis at the same time.

`once()` now runs on connect and `reset()` never touches it. Two lines in the base class, and it
names a real distinction: mount-lifetime state versus run-lifetime state. Cross-run comparison is
going to be wanted by every population sim in Change, Ecology and Immunity, so this was worth
generalising rather than patching in one file.

### D46 — Meeting the goal no longer ends the simulation
*Reverses part of phase 7.*

`succeed()` set `finished`, and `finished` blocked `play()`. Two different claims — *the lesson
may advance* and *there is nothing left to try here* — were the same flag.

The cost was invisible until a lesson needed it. A child who found the working membrane could not
then widen the pore and watch it break, which is the best thing they could possibly do next; and
a stage that has to compare a working run against a broken one was unwritable. Worse, freezing
lands at the exact moment a child most wants to keep poking.

`succeed()` now fires the event and sets `met`. It does not pause. Membrane and Energy both read
better for it.

### D47 — `detail.say`, and the register gap in `describe()`
*New, plus a debt recorded honestly.*

The goal banner could only show an authored string, so it could say what the objective was and
never what the child actually did — which switch they threw, how many generations it took. Sims
now pass `detail.say` and the banner renders it under the authored line. Two sentences, two
authors, and the sim's one is the only one that can know.

The debt: `describe()` has been writing at a single register for all four reading levels since
lesson 2. That is the accessible text — the thing a child using a screen reader hears — and a
five-year-old and a sixteen-year-old have been getting the same sentence. `say()` is now in the
base class and Selection uses it throughout; Membrane and Energy have **not** been retrofitted.
Recorded here rather than quietly left, because a known gap in the accessible path is exactly the
kind of thing that becomes invisible.

### D48 — Episodic simulations, and why they need no reduced-motion substitute
*Extends contract 3.*

The shared loop assumed every sim genuinely ticks. Generations do not: they happen when a child
asks. Driving one at 60Hz between clicks is wrong in a way that is not merely wasteful — it makes
the animation look like the mechanism.

`autoplay` is now false for such a sim, which borrows the loop for a half-second reveal and hands
it back. The consequence is the interesting part: **an episodic sim is reduced-motion-native.**
The model advances on the click; the animation only reveals what already happened. So there is
nothing to substitute, both motion modes drive the identical control, and the branch disappears
instead of doubling. The one trap is that the control must not live in `.teach-play`, which
reduced motion hides — there is a test for that now, because I made exactly that mistake.

### D49 — `weigh`: the format may not assert an interpretation unattributed
*New stage type.*

Six lessons in this curriculum sit where a scientific reading of evidence and a creationist
reading of the same evidence diverge. The product's owner asked for them Socratic and
side-by-side, and it deploys publicly.

A stage type is the right place to put that discipline, because a rule the author has to remember
is a rule that erodes. `weigh` carries two or more readings; **every one must name `who` holds it
and give its actual `because`**, and the build fails otherwise. The field that does the real work
is `predicts` — a disagreement stated as two beliefs is a stand-off a child can only pick a side
in, while the same disagreement stated as two sets of expectations becomes something a person can
go and check.

Three supporting decisions:

- **Both readings must be opened before the lesson advances.** Reading one side and moving on is
  the exact failure this exists to prevent.
- **The two cards are styled identically**, and there is a test asserting it. A child reads visual
  weight long before they read words, so a heavier card is an argument made behind the author's
  back.
- **The contested stages are `levels: [3, 4]`.** A six-year-old should be learning what a fossil
  is, not adjudicating assumptions in radiometric dating. Levels 1–2 get the observations without
  the dispute — which is the existing pedagogy fork doing its job, not a separate mechanism.

The `ask` field closes each one with an open question and deliberately nowhere to type. Not
everything worth asking a child is a thing to be marked.

### D50 — A world with content but no route to it is not drawn
*Found by authoring out of order.*

Authoring Change before Code produced a world with six real lessons behind a gate that no amount
of play could open, because the modules it waits on have nothing written in them at all. The
Atlas drew it as a locked island naming a prerequisite that does not exist — a door with no key,
and no way for a child to know that.

`playableWorlds()` now computes reachability **against what is authored**, not against the graph:
a module counts as completable only if every one of its lessons exists. The world appears on its
own the moment the path to it is written. The signpost copy went the same way — it used to say
"the one you are in is finished", which was true for exactly as long as Cells was the only module
with anything in it. Copy that states a fact about the content has to be computed from the
content, or it becomes a lie quietly.

### D51 — The folding model's targets are set by measurement, not by taste
*New, and it caught two false claims of mine.*

`js/sims/folding.js` is the HP lattice model (Dill, 1985) — a real model that real papers use,
not a cartoon. Two things went wrong writing lessons against it, and both are the same mistake:
asserting a property of a model instead of measuring it.

**The optima were computed, not guessed.** Before authoring a single goal I ran an exhaustive
self-avoiding walk over each sequence: `PHHPPHHP` maxes at 2 contacts, `PHHPPHHPPHHP` at 4,
`HHPPHPPHPPHH` at 5. Then I measured how often *random* play reaches each: 63%, 20% and 4%
respectively over 250 moves. A goal that random play hits 4% of the time is one a twelve-year-old
on a phone will probably not reach, so the authored targets sit below the true optima — and the
success message was rewritten to stop claiming the fold is optimal, because it often is not. A
child who found a better fold after being told it was the best possible would have caught the app
lying to them, which is a worse outcome than a slightly weaker celebration.

**Two claims in my own header comment were false, and a test found them.** I had written that
four pivots return the chain to where it started and that every arrangement is reachable. Neither
holds: self-avoidance refuses some pivots, which breaks the first, and pivot moves are not
provably ergodic on a lattice, which breaks the second. The comment now says so explicitly rather
than being quietly corrected, because the interesting part is that a plausible-sounding sentence
about a model survived being written and only died on contact with an assertion.

What replaced it is the property that actually matters and is actually true: **a refused move
changes nothing at all.** The chain is never left half-folded, and the refusal is shown, because
"that one is blocked" is a fact about the shape rather than an error.

### D52 — A flaky test of a true claim is worth more rewritten than deleted
*Fixes the selection checks; third instance of the same class of bug.*

`removing survival stops adaptation` failed once, on a run where the mean drifted from 0.428 to
0.131. Nothing was broken. That is genetic drift — with the predator picking at random the mean
still wanders, and about one run in twenty wanders far enough to look like the real thing. I had
measured that rate when the simulation was built and chosen to narrate it rather than suppress
it, then written a single-run assertion that could not survive it.

The claim was never "it can never close". It was "it does not reliably close". So the test now
runs each condition 24 times and measures the rate: all three conditions on must close ≥90% of
runs, any one removed must close ≤25%. That is a stronger check than the original — it asserts
the actual shape of the biology rather than one sample of it — and it cannot flake.

**The general point, which this file keeps relearning.** Three separate tests broke this session
by asserting a literal that described the content on the day it was written: `=== 1 island`,
`=== 5 signposts`, and `#/m/biomolecules` as the example of an unwritten module. Every one passed
for the wrong reason for a while and then failed for the wrong reason. A test should encode the
rule — *the Atlas draws worlds with content and a reachable path* — and derive the numbers from
whatever the content currently is. If a test needs editing because a lesson was authored, it was
testing the lesson rather than the engine.

### D53 — Test the plumbing with a deterministic setup, not a likely one
*Second instance of D52, found by the fix for the first.*

`the goal fires once and carries the simulation's own account of it` failed intermittently, and
passed every time I reproduced it by hand. The cause was the same drift as D52 wearing different
clothes: the test broke the simulation by removing *differential survival*, then gave it four
generations to register as broken. Drift occasionally closes the gap enough during those four
generations that the condition never trips.

The fix is not more samples. **That test is not about the biology at all** — it asks whether the
goal event fires exactly once and carries the sentence the simulation composed. So it now breaks
the model by removing *variation* instead, where every organism is identical forever and the gap
is pinned at its starting value with certainty.

The rule worth extracting: when a test exercises plumbing, construct the input so the outcome is
forced. Reserve sampling for the tests that are genuinely making a claim about behaviour — where
the distribution IS the thing being asserted, as in D52. Mixing the two gives you a flaky test
that is also a weak one.

Both runs of the full suite after this change: 190/190.

### D54 — A machine path from my own container shipped in the test suite
*Found by CI, which is the only place it could have been found.*

`tools/verify.mjs` took one screenshot to a hardcoded `/home/claude/shots/...`. Everything else in
that file derives paths from `import.meta.url`, and the file's own header comment says it is
"repo-relative so this runs from a clone, in CI, on anyone's machine". It passed locally every
single time, because locally that path exists. The first GitHub Actions run failed on it.

The one-line fix is uninteresting. What matters is that **no local test could ever have caught
it** — the property being violated is portability, and a machine that has the path cannot detect
a dependency on having the path.

So the build now scans every source file, including `tools/`, for absolute paths rooted in a home
directory or a Windows drive, and fails on them. It is placed before the browser suite in CI, so
the cheap check runs first. I verified it fires by reintroducing the bug and watching the build
reject it — a guard that has never been seen to fail is not known to be a guard at all.

### D55 — Measure the model before authoring goals against it, and say what it gets wrong
*The spike simulation, and a metric that was quietly measuring the wrong thing.*

`js/sims/spike.js` is FitzHugh–Nagumo, a real reduced model rather than a cartoon. Before writing
a single lesson goal I measured what it actually does, and the measurement changed the lesson.

**What it gets right** — a sharp threshold, and near-constant spike amplitude: peak 1.69 at
stimulus 6 against 1.81 at stimulus 12. Double the poke, 7% taller spike. That is the
all-or-nothing law, demonstrated rather than asserted, and the suite now checks it.

**What it gets wrong** — firing rate spans only 0.31 Hz to 0.41 Hz across its whole range, where
a real neuron spans two orders of magnitude. FHN badly compresses rate coding. So the open-track
lesson does **not** teach a rate curve from it. It teaches the *window* instead: silence below
threshold, firing in the middle, and silence again above about I = 1.4 — which is not an artefact
but depolarisation block, the reason severe hyperkalaemia stops a heart. Choosing the lesson to
fit what the model does honestly, rather than the model to fit the lesson I wanted, is the whole
of this entry.

**And a metric that was silently wrong.** The block test failed, and the model was fine — my
measure was not. I had been accumulating "time spent below threshold" and calling it silence. In
depolarisation block the membrane is stuck *high*, so that counter never advances and a cell
silent for fifteen seconds reported as busy. It now measures time since the last spike, which is
what I actually meant. Worth recording because the wrong metric was not wrong-looking: it agreed
with the right one everywhere except the one state the simulation exists to show.

### D56 — The fix for D52 made the same mistake D52 was about
*Worth recording precisely because it is embarrassing.*

D52 and D53 are entries about tests that asserted a snapshot of the content instead of a rule.
The fix I wrote for the Atlas check asserted `unlockedButEmpty.length > 0` — that is, it required
an unlocked-but-empty world to *exist* — because I wanted to stop the check passing vacuously.

It passed for five modules and then failed the moment every unlocked world had content. It failed
for the best possible reason, and it was still the identical error: a claim about what the
curriculum happened to look like the day I wrote it.

The resolution is to separate the two clauses by whether they can go vacuous. **No drawn world is
empty** is the rule, and it is never vacuous because there are always drawn worlds. **An unlocked
but empty world is refused** is a strengthening that only applies while such a world exists, so it
is conditional — and the detail line now says out loud when it has gone quiet, so nobody later
mistakes a dormant clause for a passing one.

Three entries on one theme in one session suggests the lesson is not "be careful" but structural:
before writing an assertion, ask what would make it stop meaning anything, and whether that thing
is progress. If it is progress, the assertion is wrong.

### D57 — The leaf trade-off, with the numbers taken first
*`js/sims/stomata.js`.*

Same discipline as D51 and D55: measure, then author. On a steady day sugar climbs with aperture
to about 7 and then stops, because past that light rather than carbon dioxide is limiting —
opening further costs water and buys nothing, which is why real stomatal conductance saturates.
At full aperture the leaf dies at 50 seconds having made **less** sugar than one held at 5.

The suite asserts that ordering directly — `0:-30 2:78 5:240 7:330 10:273†` — because the lesson
tells a child that the maximum loses, and a lesson is only as true as the model under it.

The open track adds a midday heat spike, and the discovery is that no fixed aperture works. That
is not a puzzle invented for the lesson; it is why guard cells regulate continuously, and why CAM
plants moved gas exchange to the night entirely.

### D58 — A lesson claimed the engine could express something it cannot
*Caught while authoring, not by a test.*

Animals lesson 1 is about trade-offs, so I wrote a fourth trial called "all of it at once" and
told the child it was unwinnable — the point being that no animal can be fast, armoured, strong
and cheap.

The engine does not work that way. `trials[].needs` grades **placement correctness**, so a child
who put all four parts in their correct slots would have passed the trial I had just described as
impossible. The lesson would have contradicted itself on screen, and the build linter had no way
to know: every rule it enforces was satisfied.

I removed the trial. The point lands in the hook, the naming stage and the check, all of which can
carry it honestly.

The tempting alternative was to give the build more parts than slots, so something must be left
out — which would express a real constraint in the mechanic rather than in prose. It does not work
either, because each slot carries exactly one `correct` value, so there is only one right
assignment and the child never chooses what to sacrifice. Expressing a genuine either/or would
need a new stage type, and inventing one to rescue a single lesson is the wrong trade.

The general rule: when a lesson needs the engine to mean something it does not mean, the lesson is
wrong until the engine changes. Writing prose that describes behaviour the code does not have is
the most invisible defect available — nothing fails, and only a child notices.

### D59 — Four simulations in, the rule has a name: use the model for what it shows
*`js/sims/web.js`, and the fourth instance of D51/D55/D57.*

The food web is the standard tri-trophic Lotka–Volterra system with logistic growth at the
bottom — real, and taught in every ecology course. Measured before any lesson was written:

| | plants | herbivores | carnivores |
|---|---|---|---|
| plants alone | 100 (= K) | — | — |
| full web | 66.7 | 15.0 | 14.3 |
| top predator removed | **25.7** | 33.4 | 0 |

Removing the carnivore more than doubles the herbivores and crashes the plants to 39% of where
they were, through a level nobody touched. That is a trophic cascade falling out of three
equations, and the suite asserts it.

**And what it is not used for.** Those are counts of individuals, not biomass, and a carnivore
does not weigh what a herbivore weighs — so the equilibrium above is *not* a biomass pyramid and
the lessons never present it as one. The ten-percent rule is taught in a separate stage from real
ecological figures, with the caveat that 10% is an average spanning roughly 1% to 40%.

That is now four sims where the honest move was to narrow the lesson to the model's actual
demonstrated range: folding (targets below the true optimum), spike (window, not rate curve),
stomata (the maximum losing), and this one. It is worth stating as a rule rather than rediscovering
it each time: **decide what the model demonstrates, write that lesson, and put the gap in the file
header.** The failure mode it prevents is subtle — a lesson that is true, running on a model that
does not show it, which no test catches because both halves are individually fine.

### D60 — Where the `weigh` stage belongs outside origins
*Environmental Science lesson 4.*

`weigh` was built for the six origins lessons, and this is the first use outside them. Deciding
where it applies turned out to be the interesting part.

**Not on the physics.** Carbon dioxide's infrared absorption was measured by Tyndall in 1859, is
used to design instruments, and shows up in satellite spectra exactly where predicted. Presenting
that as two-sided would be false balance, which is its own dishonesty — a `weigh` stage on a
settled measurement teaches a child that everything is a matter of opinion.

**Yes on the response.** How fast to cut emissions, and at what cost to whom, is a question about
values, discount rates and competing harms. There are serious people on both sides who agree
entirely about the physics, and the stage says so explicitly in its `evidence` field: *both sides
here accept the measurements.* Rapid reduction argues from lag and irreversibility;
adaptation-first argues that wealth is what determines who survives bad weather, and that
climate-disaster deaths have fallen sharply across a century of warming. Both get their real
argument and their real prediction.

The rule this establishes: **`weigh` goes where the disagreement actually is.** Applying it to
settled measurement manufactures controversy; withholding it from a genuine values dispute
smuggles one answer in as though it were a finding. Lesson 2 states the physics plainly and is
precise about which parts are measured, which inferred and which projected — that precision is
what makes it legitimate for lesson 4 to say the argument is elsewhere.

### D61 — A field name with Cyrillic characters in it, and nothing noticed
*Caught by reading, not by any tool.*

I typed a stray key — `"ию": []` — into a CRISPR lesson while writing it. The build passed. The
renderer would have ignored it silently, because `RENDER` reads the fields it knows about and
never looks at the rest.

That is the most invisible defect class this format has: **a typo'd field name is not an error,
it is an absence.** Misspell `why` and the check stage renders with no explanation, the build is
satisfied, the browser suite is satisfied, and the only signal is a child reaching a question
whose feedback is blank.

The build now requires every stage field name to be a plain ASCII identifier, which catches the
whole class rather than the one instance. Verified by reintroducing the bad key and watching the
build reject it.

A stricter version — an allow-list of known field names per stage type — would catch misspellings
of real fields too, which this does not. That is the better check and it is deliberately not built
yet: the allow-list has to be maintained alongside every new stage type, and getting it out of
step would produce false failures on valid lessons. Worth doing when the format stops moving.

### D62 — `weigh` used for a values dispute inside a technical module
*CRISPR lesson 4, following D60.*

Second use outside origins, and it confirms the D60 rule from the other direction. The technical
facts about germline editing are not disputed by anyone: the edit is heritable, off-target effects
are real, and accuracy will improve. What is disputed is whether improving accuracy ever makes it
acceptable — and that turns on consent across generations, which no measurement settles.

The two views make genuinely different empirical predictions, which is what keeps the stage from
being a survey of opinions: one expects accuracy to improve until risk falls below the disease,
the other expects permitted indications to expand once any are allowed. Both are checkable, slowly.

The lesson's closing line is the transferable part, and it is why this stage is here rather than a
paragraph asserting a conclusion: improving accuracy changes how large the risk is and changes
nothing about who consented. A great many disputes that present as technical resolve, once the
disagreement is actually located, into questions about who decides and who bears the cost.

### D63 — The last twelve lessons added no new simulation, deliberately
*Frontier: synthetic biology, space biology, future biology.*

Twelve lessons closed the curriculum at 110, and not one of them shipped a new sim. Space biology
lesson 4 reuses the tri-trophic web from Ecology as a closed life-support system; everything else
is `build`, `slider`, `predict` and `weigh`.

The temptation was real — a microgravity rig and a habitability scorer both sound like simulations.
Neither survived the question the sim base contract forces: *what does the child change, and what
moves that they could not have predicted?* A habitability scorer has one input and one output per
criterion; that is a checklist with animation on it, and it would have cost 4 KB of the sim budget
to teach nothing the `build` stage does not.

The rule this settles: **a sim earns its place when the model's behaviour surprises the author.**
Folding, spike, stomata and web all did — each one changed the lesson written against it (D51, D55,
D57, D59). A model whose output you can state in a sentence before you build it should be a build
stage, and the budget it does not spend is a page that loads.

### D64 — Where the boss ladder is the lesson
*`future-biology/03` and `/04`.*

Both closing lessons use the same shape: five parts, and five trials each needing one more part
than the last. In every previous use that ladder tested a system — air, then water, then food. Here
it tests an argument: possible, then worth doing, then fair, then reversible, then authorised.

It works for the same reason it worked on the spaceship garden. `needs` computes the verdict from
what the child actually assembled, so a design missing its off-switch fails the reversibility trial
by construction rather than by being told. The child discovers that capability is the *first* rung
and not a contribution to any of the others, by watching four trials fail underneath a correct one.

The risk was moralising, and the format is what prevents it: a trial states what breaks, not what
the child ought to feel. `future-biology/04`'s win text is explicit that nothing in the boss checked
whether the organism would work — which is the honest description of what the five questions do and
do not cover.

### D65 — `weigh` on a disagreement that was resolved, and saying so
*`space-biology/02`, ALH84001.*

D60 put `weigh` where the disagreement actually is. This is the first use where the disagreement has
largely *closed* since it started, and the format had to hold that without either pretending the
argument is still balanced or retro-fitting a verdict onto a stage designed not to deliver one.

What made it work is that both views stated a test. The 1996 team predicted the magnetite could not
be made abiotically; the critics predicted it could; laboratory work through the 2000s produced it.
The `ask` reports that plainly, including that most researchers now regard the biological reading as
unsupported — and then distinguishes unsupported from refuted, which is the actual state.

So the rule extends: `weigh` is not only for open questions. It is for questions where the *reasoning
on each side is worth operating*, and a dispute that was settled by a prediction coming true is the
best possible demonstration of why stating one matters. A child who watches that happen has seen the
mechanism, not been told about it.

### D66 — A piece dropped in the wrong slot could not be taken out again
*Reported by a user. It had been shipping since phase 4.*

Tapping a placed piece did visibly nothing. No error, no console warning, and every existing
placement test passed — because all of them placed a piece into an empty slot on a fresh page and
stopped there. Nobody had tested the second gesture.

Three defects, and the first is the one worth remembering.

**`connectedCallback` fires on every insertion.** This component works by *moving* elements between
the tray and the slots, so it fired again on every single placement, and the listener wiring ran
again with it. After one move a placeable had two click handlers, and they cancelled out: handler
one took the piece out of its slot, handler two picked it straight back up, and then the slot's own
handler — a placed piece is a *child* of its slot, so both are on one tap's bubble path — put it
back where it started. Three correct-looking pieces of code composing into a no-op.

The fix is a `wired` flag, one line, applied at the top of every `connectedCallback`. But note the
trap immediately below it: `Placeable.connectedCallback` called `super` and then added its own
`pointerdown` listener *unconditionally*, so the guard protected the tap path while the drag path
kept doubling. `Part.connectedCallback` now returns whether it wired, and the subclass gates on it.
A guard that a subclass can walk around is not a guard.

**Second: bubbling.** Each part now stops propagation on its own activation. A nested part owns its
gesture; an ancestor that also handles it is handling the same gesture twice.

**Third, found while in there:** the slot's `aria-label` was written once at connect, so every slot
announced itself as "empty" for ever. A sighted child could see their answer and a screen-reader
user could not. It is now rewritten in `refresh()`, alongside every other derived attribute — which
is where it always belonged, and the reason it was wrong is that it was set in the one place that
runs once.

**The test is a call count, not an end state.** An even number of duplicate handlers cancels out and
looks like a no-op; an odd number looks correct. Asserting "the piece ends up in the new slot" only
catches half the cases. Asserting "one tap causes exactly one `pickUp` and no `place`" catches the
class. Verified by reintroducing both defects and watching all four new checks fail.

**And the general lesson, which is about the test suite rather than the component.** 198 checks, and
this survived all of them because they tested the *first* interaction with everything. The state a
component is in after one use is not the state a child meets — they meet the second tap, and the
tenth. Wherever a component's behaviour depends on its own history, the test has to have a history
too. I have gone looking for the same shape elsewhere: `fp-slider` and `fp-predict` do not move
elements between parents, so neither re-enters `connectedCallback`; the sims mount once per stage.
This was the only instance, and it was the one a child touches most.

**Postscript on budget.** The first version of this fix pushed the lesson JS tier from 18.4 to 19.1
KB against a 20 KB budget — entirely in comments, since nothing here is minified and comments are
bytes a child downloads. The narrative above is the right length; in the file it was not. Comments
in the source now carry the *invariant* and a D-number, and the incident lives here, where nothing
ships it. That is the general rule for this codebase from now on: the reason goes in the file, the
story goes in DECISIONS.

### D67 — Sound and voice, both weighing nothing
*Asked for as a settings feature. One of the two turned out not to be a feature.*

**The voice is not polish, it is a defect being closed.** Level 1 is ages five to seven, and the
entire L1 track was gated behind reading fluency most five-year-olds do not have. I had written 110
lessons whose youngest audience largely could not read them alone. That is the finding; everything
else here is trim.

**Why synthesis rather than recordings.** Recording the corpus is roughly 2,700 clips — 110 lessons
× ~25 utterances × up to four level variants — tens of megabytes, and it breaks offline precaching.
The disqualifying objection is not size though: **a recording freezes the content.** I have been
editing lesson prose continuously, and every edit silently invalidates a clip, so the voice starts
saying things the page does not, with nothing anywhere reporting it. `speechSynthesis` reads whatever
the text says today, costs zero bytes, and works offline from OS voices.

It also produced the best structural property of this work: `readStage()` walks the *rendered DOM*
via a list of prose selectors, so **no stage renderer knows audio exists**. Adding a stage type does
not add a narration task. The honest cost is that a specific voice cannot be guaranteed — the
chooser expresses a preference over whatever the platform installed, and quality varies.

**Defaults are derived, not fixed.** Auto-read is on at prose level 1 and off above it, because
Mayer's redundancy principle cuts both ways: narration plus the same words on screen is *worse* than
either alone for a reader, and irrelevant for a child who is not reading them. One dial, two correct
behaviours. WCAG 1.4.2 then makes the stop control mandatory rather than optional, since auto-read
starts by itself.

**Effects are synthesised too** — an oscillator and a gain envelope, about 40 lines against 60-100 KB
of files, six precache entries, a decode step and six assets to version. Two rules in the table
itself: the envelope *is* the sound (a gain that jumps rather than ramps clicks audibly), and the
wrong-answer tone is two soft descending notes at the lowest gain, not a buzzer. A punishing error
sound teaches a five-year-old to stop guessing, which is precisely what predict-first exists to make
them do.

**No background music, on purpose.** Continuous music competes for the same phonological working
memory the child is using to read and reason, it is the first setting people switch off, and for
autistic and ADHD children it is frequently aversive. There is no control for it because there is
nothing to control.

**Two things the build and a screenshot caught, both worth recording.** First, I put the read control
in the nav row beside Back and Next; on a 390 px phone three buttons wrapped onto three lines, and
the stop control landed below the fold. A stop control you have to scroll to find does not satisfy
1.4.2 in substance whatever it does on paper — it now sits at the top of the stage card, with the
content it reads. Second, I edited `css/app.css` and the styling silently did nothing, because
`app.css` is a *generated* concatenation. The generated-artefact list in this file exists precisely
so that does not happen, and I did it anyway; the source is `css/components.css`.

Eleven checks. The one that matters most asserts narration is assembled from the rendered stage and
*excludes* control labels and live regions — a live region read aloud is the same sentence twice.

### D68 — Two scratch files shipped to a child's device, then broke the app offline
*Found by the offline test, three commits after I caused it.*

I wrote two throwaway diagnostic scripts into the repo root, ran the build, and then deleted them.
The build had precached both. `cache.addAll()` then requested two files that 404'd, the promise
rejected, the service worker install failed, and **the app stopped working offline entirely** —
silently, because a failed install leaves the previous worker in place until it doesn't.

The bug is the shape of the filter. It was a DENY list: ship everything in the tree except these
named exceptions. A deny list can only exclude what somebody thought of, so every scratch file, log,
bundle and note is shipped by default and the only thing standing between a child's device and my
working directory is my memory.

It is now an ALLOW list on extension: `.html .js .css .json .webmanifest .woff2 .png .svg .ico`, and
nothing else can reach a device by being forgotten about. Verified by dropping a stray `.mjs` in the
root and confirming it stays out of the precache.

Two things generalise. First, **a precache entry that 404s does not degrade the offline story, it
deletes it** — one bad path takes every other file with it, which is an unusually high blast radius
for an unusually easy mistake. Second, the test that caught this is the only one in the suite that
cuts the network, and it caught the problem three commits late because I had been reading a green
summary line rather than the failures. There were none to read; the run before this simply predated
the mistake.

I have also stopped writing scratch scripts into the repo root. They go in /tmp, where the build
cannot see them.

### D69 — The lesson budget was a sum, so it measured a cost no child ever paid
*The stated next phase. It found two live bugs, not just a bad number.*

The lesson tier was `sum(js/lesson/** + js/components/**)`. That is the exact defect the sim tier
had already fixed and documented one screen further down the same file — and it sat there for eight
phases because the sum stayed under the limit, so nothing ever asked what the number meant.

It was not only mis-measured, it was mis-loaded. `view.js` imported all four custom elements
statically, so **every lesson downloaded the placement primitive whether it had a build stage or
not** — the largest of the four, unused by half the lessons. And `reviewView()` lived in `view.js`,
so every lesson shipped the whole spaced-retrieval screen while every review shipped nine stage
renderers it would never draw.

**A tier is now the static import closure of its entry point, computed rather than listed.**
Following static `import` and deliberately *not* following `import()` is the whole trick: `import()`
is where one tier ends and the next begins, so the graph draws the boundary a person kept drawing
wrong. Applied to the shell it reproduced the old hand-written number exactly, which is the check
that the walker is right.

**Two real bugs fell out of it.**

The first is the one the byte count could never have found: seven of nine simulations render an
`<fp-slider>` and **not one of them imported it.** They were free-riding on `view.js` loading it for
every lesson, so the sim budget under-reported by 1.2 KB and — once the components became lazy — a
lesson with no slider stage shipped a simulation whose control did not exist. A browser test caught
it, not a number. A module must import what it renders, and seven modules now do.

The second is that `js/components/predict.js` briefly became reachable from nothing at all. There is
now a check in both directions: every part must be claimed by `PART_OF`, and every component must be
reachable from some route's closure. Either gap is silent.

**The split had to be measured, not assumed, and my first two attempts made things worse.**
Six part modules came out *heavier* than one big file (19.8 KB against 19.5), because each file is a
separate gzip stream and small files compress badly. So I counted what the content actually needs:
`check` appears in 110 lessons of 110 and `predict` in 101, while `build` is in 52, `slider` 33, `sim`
30 and `weigh` 10. Giving `check` its own module charges a hundred lessons a second stream to save
nine a few hundred bytes. The four that vary travel with their part; the two that do not stay in the
core. **Granularity is an empirical question about the content, not a matter of taste.**

**The result, and the honest reading of it.** Routes now span 7.1 to 19.4 KB with a **median of
14.3 KB**, against a flat 19.5 KB before — so the median lesson downloads 27% less. The worst route
is `dna/02`, which has a build stage *and* a slider *and* a check, and it barely moved: it genuinely
needs nearly all of it. A single headline number would have reported this phase as a failure, which
is why the build now prints the spread.

I did **not** raise the 20 KB limit to buy headroom. The metric got stricter and it still passes; the
pressure that puts on the next always-loaded byte is the point of having a budget. What I added
instead is the number that was missing: **`one lesson, all in`** — shell ∪ worst route ∪ worst sim
stage, as a set union rather than a sum, because a lesson with a slider stage and a sim that renders
one downloads that element once. It is 53.7 KB of 64 KB, and it is the first figure in this project
that corresponds to something a child actually experiences. The three tier lines are now diagnostics
that say *where* a regression landed; this one says whether it matters.

Also gone: the `fp-stage` custom element. It existed to set `role="group"` on mount — a class and a
registration for one attribute, which the call site can set itself. Eliminate before you move.

### D70 — "Finish doesn't do anything" was Finish paying you 12 XP a click
*Reported by a user, who was being generous about it.*

On the lesson-complete screen there was a link on the left saying "Back to the module" and a button on
the right saying "Finish" that appeared to do nothing. `finish()` sets `nextBtn.hidden = true`, so it
was supposed to be gone.

**`hidden` was being ignored across the entire app.** The HTML attribute is only a UA-stylesheet rule,
`[hidden] { display: none }`, and *any* author rule that sets `display` beats it. Every pill and
button in this stylesheet sets `display: inline-flex`. So `el.hidden = true` set the attribute,
changed nothing visually, and left the element clickable — while every test that asked `.hidden`
returned `true` and agreed it was hidden.

`[hidden] { display: none !important; }` now sits in base.css, the only `!important` in it. That is
deliberate: it is not overriding a design decision, it is restoring the meaning of an HTML attribute
that author styles silence by accident. There was already a `.tutor[hidden] { display: none }` rule
further down — somebody hit this exact bug once, patched the instance, and left the class alone. That
line is gone now.

**The consequence was worse than a dead button.** Each press called `completeLesson()` again, which
called `awardXp("lessonComplete")` again: 12 XP per click, unbounded. `NEVER_PAID` in reward.js exists
to stop precisely this — paying for something other than learning — and it was bypassed not by a bad
call site but by a CSS specificity rule two files away. **A guard at the call site does not protect an
economy if the UI can call the same site repeatedly.** `completeLesson` now reads whether the lesson
was already done *before* the write that marks it done, and pays the bonus once ever. The guard is
deliberately conservative: `lessonsDone` is a high-water mark, so finishing an earlier lesson after a
later one pays no bonus. Under-paying in a rare case is a far smaller wrong than being farmable.

**And the fix the user actually asked for, which was the right one.** Two exits doing the same thing
is what made this feel broken — a working link on the left, a dead button on the right. The button now
*is* the exit: it reads "Back to Cells", it is where the child's thumb has been all lesson, and the
duplicate link inside the card is gone. One handler, whose behaviour comes from state — a second
listener assigned over the first would not have removed it, since `el()` attaches with
`addEventListener`.

Five checks. The one worth keeping longest is the general one: **nothing marked hidden may still be on
screen**, asserted from computed style rather than from the attribute. Every test that trusted
`.hidden` was confirming the app's own mistaken belief back to it.

**D70 postscript, and it is the more interesting half.** The user sent a screenshot of the *old*
build, which sent me to look at the fixed screen — where I found Sprout's "I'm stuck" button still
offering help on a finished lesson. It had been there all along; it only became visible to me once
`hidden` started working.

Then I wrote the check to catch it and **made the exact mistake D70 is about, inside the test written
to catch that mistake.** The filter was `getComputedStyle(el).display !== "none"`, and a child of a
hidden parent still reports its own display as `inline-flex` — so the test told me Sprout was visible
after I had already hidden it. Both checks now use `getClientRects().length`, because an element that
renders no boxes is not on screen whatever it believes about itself.

The rule, stated so I stop rediscovering it: **do not ask an element what it thinks it is doing. Ask
whether it is on screen.** The attribute, the computed style and the element's own opinion can all
three agree and all three be wrong.

**One flaky check found and made deterministic on the way past.** The offline test severs the network
and reloads. It failed once with an unhandled "Failed to fetch", because a *new* service worker can
still be installing when the network is cut — its precache would then fail against a dead network. It
had waited for `serviceWorker.controller != null`, which only means *some* worker controls the page.
It now waits until nothing is installing or waiting, and fetch failures are ignored only inside the
window the test deliberately created, and only that message class. Papering over the symptom would
have hidden the next real error in that window.

### D71 — Drawings for the specimens, and why not a science icon library
*Asked for as "SVG of science that doesn't look AI generated".*

The observation behind the request is correct and worth writing down: **what gives a generated site
away is not that the icons are SVG, it is that they do not come from one hand.** Mixed stroke weights,
a gradient on one and flat colour on the next, a flask beside a helix beside a rounded-corner arrow,
each decorating a heading that needed no decoration. Nothing relating to anything.

So the first answer was **no** to the thing that was asked for. This app has six UI icons, all tiny,
all paired with a word, with a rule in `icons.js` that nothing is ever an icon alone. Adding a science
icon library moves *towards* the look being avoided.

The real hole was elsewhere: **110 specimens, every one of them text on a card.** They are the reward
and the inventory — collect a ribosome in world 1, that is why you can build a protein in world 2 —
and they had no picture. That is where art earns its place.

**BioRender was checked rather than assumed, and ruled out.** Its free tier is academic-only,
watermarked, and explicitly excludes apps and websites. A paid tier permits commercial use but
requires a permanent "Created with BioRender.com" credit, and its terms cover using *your figures* —
not lifting its assets out to ship as a product's interface. **NIH BioArt Source** is the clean
alternative when a specimen needs real scientific illustration: drawn by NIH medical illustrators,
public domain, no attribution, vector. Kept in reserve rather than used here, because mixing two hands
is the failure being avoided.

**The system, which is the whole product here rather than any one drawing.** 48-unit grid, safe area
4..44. Stroke only — no fills, no gradients, no shadows. One weight, set in CSS not in the file. Round
caps and joins. One object per specimen, centred, flat side-on, no perspective. Colour is the world's
own `--w-line`, so **one set of paths serves six worlds and both themes with no second decision**, and
a drawing that needs a second colour to read is a drawing that is too complicated.

**The rules are checked by the build, not remembered by the author.** Consistency across 110 drawings
is not something to leave to memory. Absolute path commands only — relative commands take deltas, not
coordinates, which would make the grid check meaningless. Every number must be on the grid. 700
characters of path data maximum, because more than that is a traced photograph that will not read at
40 pixels beside twelve others. No styling in path data. Verified by breaking all three.

**Thirteen drawn, and four of them were wrong the first time.** This is why the plan was one world
before ninety-seven more. The mitochondrion and the nucleus came out nearly identical — two specimens
that look the same is the worst failure a set can have. The flame in the flame jar read as a leaf,
which is actively misleading in a lesson about fire *not* being alive. And the ribosome took four
attempts: two stacked lobes read as a snowman, then adding the mRNA thread made it read
unmistakably as a **duck**. It is now drawn as what it *does* — a machine straddling a tape with a
chain coming out of it — which matches its own blurb, "the machine that follows instructions", and
cannot be mistaken for an animal.

**The art loads after the shelf and never before it.** One cached fetch, and a failure is silence. A
picture is the reward for collecting something; it is not allowed to be a prerequisite for reading
about it. There is a check that blocks the file and asserts the shelf is still complete.

**One thing this surfaced that is not about art at all.** With thirteen collected, the shelf renders
thirteen filled cards followed by **ninety-seven identical grey "Not collected" cards** — an enormous
scroll of nothing, and the new drawings make the emptiness more conspicuous rather than less. That is
a real design fault that predates this work, and it needs its own pass: group by world, collapse what
is not yet reachable, or show a count instead of a card.

### D72 — "No intro, and the sentences don't register"
*First real user feedback. Both halves were right, and neither was about dyslexia.*

The report also asked whether the sentence style was a dyslexia accommodation. It was not — and saying
so mattered, because the actual causes were findable and none of them were about reading ability.

**No intro.** The first screen a homeschooling parent met was "Which one feels right?", offering four
sentences *about cells* — a reading-level picker, before anything had said what the thing was. Then a
screen titled "Atlas" reading "Twenty-five modules across six worlds", which is an inventory, not an
invitation. There is now a front door, written for the adult, because the adult is who decides. It
leads with the method — a child runs the experiment first, the name for it comes after — and it says
plainly what happens where biology touches origins, because this audience will want to know before
handing it over and finding out later would be a betrayal.

**The sentences.** Three causes, measured rather than guessed.

1. **The lesson's title was `sr-only`.** A blind child heard the name of the lesson; everybody else
   got a page with no name on it. That alone was most of "no context when the page opens".
2. **The headline was too long for the size it was set at.** Hooks averaged **29 words above level 1**,
   longest 44, all rendered as a 32px display heading — eight lines of bold with nowhere to rest. The
   renderer now takes the **first sentence** as the headline and drops the rest to body size, which
   moves the median headline from **29 words to 14 with no content edited**. It fixed 100 of 110; the
   remaining 10 are single long sentences the renderer cannot split, and the build now warns about
   them by name.
3. **My own word-count guard covered one variant of four.** It tested `v[0]` only, so the youngest
   reader was protected and the level most people actually use had no limit at all. The same shape as
   D69: a rule that silently covered a fraction of what it claimed to. It now checks every level, and
   measures the first sentence, because that is what becomes the heading.

**A warning tier exists now**, kept separate from `fail()` rather than folded into it. The day a
warning becomes ignorable is the day it stops being read, so they print last, counted, and the build
says "ok, with warnings".

**Four self-inflicted faults on the way, all worth recording.**

- **The front door's only button was invisible.** `.next-btn` paints itself from `--w-deep`, which only
  exists inside `[data-world]`, so outside one it rendered cream text on a cream page: present, sized,
  shadowed, unreadable. Every audit in the suite **names its screens by hand**, so a brand-new screen
  is covered by nothing until somebody adds it. That is how it got through, and the welcome screen now
  has its own contrast, affordance and readable-CTA checks.
- **My new test cleared storage and left it cleared**, sending every later test to the front door —
  nine failures from one tidy-up I did not do. A test restores what it disturbs.
- **The suite's own first assertion was "cold start shows the level picker"** — a description of the
  behaviour being changed. Tests that encode the current screen order break when the order improves;
  that is not a fault, but it means the first test in the file needed rewriting to the new claim.
- **A level test measured the wrong element.** "The same stage is shorter for a five-year-old than a
  sixteen-year-old" read `.stage-hook`, which is now deliberately one sentence, so it failed the moment
  the split landed. It had bound itself to an element rather than to the claim. The browser now
  measures the whole hook, and the real claim — that hook length tracks the level dial across the
  corpus — is asserted on the **median across all 110 lessons** in the build, where the content is.
  Medians: L1 17, L2 29, L3 28, L4 29.

**Ownership.** A publisher mark now sits on the front door with a copyright line, both from one
constant so a correction is a one-line edit. The mark is raster and gradient-heavy — it reads at 176px
and turns to coloured mush at 64 — so it belongs on the front door and the About surface, not in the
28px header, and the flat vector mark stays there. Quantised to 96 colours: **13.5 KB against 92 KB,
visually identical at every size used.** And the honest note: a logo does not claim ownership. A
LICENSE file does, and there still isn't one.

### D73 — The shelf was a wall of grey, and three faults found under it
*The design fault I reported in D71 and then fixed. It uncovered more than it cost.*

Thirteen filled cards followed by **ninety-seven identical grey "Not collected" cards** — and the new
drawings made the emptiness more conspicuous, not less. It is now grouped by world using native
`<details>`: a world you have collected from opens by default, and a world you have not reached is a
single coloured line saying `0 of 14`. Thirteen cards on screen instead of a hundred and ten. What you
have found should never need a click; what you have not yet reached should never need a scroll.

**Three faults surfaced while doing it, and each is worth more than the fix.**

**1. A broken screen rendered nothing at all.** Moving the Me screen out of the shell left one import
behind, and the result was a blank page — no console error, no clue, nothing. The router awaited the
view and mounted whatever came back, including `undefined`. It took calling the function by hand in a
browser to find a plain `ReferenceError`. A screen that cannot render must *say* so; silence is the one
response that helps nobody. The router now catches, logs, and renders an apology with a way out — and
there is a check that blocks the module and asserts the app says something.

**2. The affordance rule did not know `<summary>` is a control.** It tested
`a[href], button, label, [tabindex]`, so a raised `<summary>` read as "raised but not touchable". The
shelf is the first raised summary the audit has ever walked, so the rule had never been wrong out
loud. **An affordance rule that does not know the platform's own controls will eventually call a real
button a decoration.**

**3. `getClientRects()` was not a sharp enough question.** D70's rule was "do not ask an element what
it thinks it is doing, ask whether it is on screen", and client rects were how I asked. Chrome hides a
closed `<details>` with `content-visibility`, and its descendants **still report boxes** — so the test
counted all 110 cards as visible when only 13 were. `checkVisibility()` accounts for it and
`getClientRects()` does not. The rule stands; the way of asking had to get sharper, and there is now
one definition of "on screen" injected into every page in the suite rather than three spellings of it.

**And a budget boundary moved, honestly.** Taking the Me screen out of the shell dropped boot from
**24.7 KB to 16.0** and pushed the worst lesson route from 19.8 to 25.5, because `reward.js` and
`audio.js` are no longer downloaded merely to look at the Atlas. Same bytes, correctly charged. The
composite went **down**, 56.0 to 53.8 KB. So the per-tier limits were re-derived rather than treated as
sacred: **they are diagnostics, the composite is the ceiling.** Refusing to re-derive after a boundary
moves means the build fails an improvement. Shell is now capped at 20 KB rather than 25, which locks
the gain in.

The front-door copy also moved out of the shell into `content/welcome.json` — 1.5 KB of prose that
every child was downloading to boot, and which will be revised by someone who should not have to open
a JavaScript file to do it. Only the headline and the button stay inline, so a failed fetch still
leaves a screen that says something and a control that works.

**A LICENSE exists at last, and it is a placeholder that says so.** The absence of one was never
neutral: an original work is protected automatically, so "no licence" already meant nobody could use
anything. The file now states that out loud, forecloses nothing, and sets out the three replacements
put to the owner — locked, free-for-families-not-companies, or fully open — along with the note that
code and content are usually licensed separately. The choice and the exact legal name are the owner's,
and both are read from one constant so changing them is a one-line edit.

### D74 — Three lines of text printed on top of each other, on the Atlas, at every width
*Reported by the owner: "the reminder to relearn and the topic headings overlap." He was right, and
nothing in a 249-check suite could see it.*

The review reminder — the card a returning child meets first, saying which ideas are due — drew its
kicker, its title and its hook **in the same grid cell**. Not at one awkward width. At 320, 390, 768 and
1280, on every save with something due.

**The cause is a habit, not a typo.** `.continue-kicker`, `.continue-title` and `.continue-hook` each
carried *both* appearance (size, weight, colour) and *placement* (`grid-area: kicker` and friends). The
review call reused those classes because it wanted the appearance — and inherited placement that only
resolves inside `.continue`'s `grid-template-areas`. `.review-call` declared a grid of its own with no
named areas, so all three `grid-area` names resolved to nothing and every line landed at 1/1. **A class
that bundles what a thing looks like with where it sits cannot be reused for the first without silently
taking the second.** The fix is not a third set of classes: the two cards now share one grid rule, which
is what they always meant, and the bespoke `.review-call` block is gone. Nine lines of CSS deleted.

**Why no test caught it is the part worth keeping.** Contrast, affordance, visibility and touch-target
audits all passed this card happily — every element *was* on screen, correctly coloured, correctly
sized, correctly touchable. They were simply all in the same place, and **no check in the suite had ever
asked whether two pieces of text occupy the same rectangle.** There is one now: `overlapAudit()` walks
the leaf text nodes in `main` and fails on any pair overlapping by more than four pixels in both axes —
four, because a descender or a rounded corner is not a fault. It runs on seven screens.

It also needed a state no test had ever rendered: **an Atlas with reviews actually due.** Every existing
Atlas check used a save with an empty schedule, so the card under discussion had never been drawn by the
suite at all. A screen that only exists in one state of the data is a screen that is only tested in the
other one.

### D75 — Two flaky tests, and neither was flaky for a mysterious reason
*Cleaning up after D74, because a suite that fails one run in three teaches you to ignore it.*

**1. The harness aborted a fetch and then blamed the app for noticing.** `openWith()` navigated with
`waitUntil: "domcontentloaded"`, wrote the save, and navigated again — while `content/curriculum.json`
was still in flight. The second navigation cancelled it, `loadCurriculum()` threw, and `boot()` did
exactly the right thing: caught it, told the child the curriculum could not be loaded, and logged the
error. The console-error audit then counted the harness's own doing as a defect, and only sometimes,
because it depended on whether the old document was torn down before the log landed.

The app already publishes the signal that was needed. `boot()` sets `[data-ready]` on the body in its
`finally` block, success path and failure path alike — that is its only honest "I have finished".
Three navigations now wait for it. Reproduced first with `curriculum.json` held for 200 ms: **8 loads
out of 8 errored on the old sequence, 0 of 8 with the wait, and no aborted requests at all.** Removing
the race beats filtering its symptom; a suppression rule would have hidden the next real one.

The diagnostic that made this findable is worth more than the fix. `TypeError: Failed to fetch` names
no resource, so the harness now records every `requestfailed` with its path and reports them alongside
the error. **A failure message that does not name what failed is a riddle, not a report.**

**2. A test about event plumbing was riding on a dice roll.** The goal test ran twelve generations of
natural selection to "establish it works", then asserted the goal fired exactly once. But the test
directly above it *measures* that selection closes the gap in about nine runs out of ten — so twelve
generations was a weighted coin, and it came up tails. The claim has nothing to do with how many
generations adaptation takes; it is that the goal fires once. It now runs *until* the goal is met, with
a cap as a runaway guard rather than a deadline. The same lesson as D52, in a different costume:
**assert the rule, never the outcome of a random process.**

### D79 — Rebuilding the foundations, taking only what was actually better
*After putting the bare one-sentence prompt to a fresh model and reading the plan
it produced. The stack it chose — React, Vite, Tailwind, eighteen dependencies,
85 KB — would have been a straight regression here. Four things in it were not.*

**The shape is declared now, not asserted.** Thirty-odd `if` statements inside
build.mjs became `tools/schema.mjs`, a table. Every one of those conditionals was
there for a reason and none were wrong, but a pile of conditionals has three
faults a declaration does not: nobody can read it, it only ever says no, and a new
stage type means new code rather than a new row. **The consequence that matters is
that the shape now ENUMERATES the fields**, so a field it does not list is an
error instead of silence — which is how a Cyrillic key once survived in a CRISPR
lesson. Rules that genuinely are not about shape stayed as code next to their
stage type; pretending everything is declarative would be a lie told for tidiness.

Turning it on found two things in the first thirty seconds. `views[].predicts` was
undeclared — the field the weigh renderer's own comment calls "the field that does
the work", because a disagreement stated as two beliefs is a stand-off in which a
child can only pick a side, and stated as two sets of expectations it becomes
something a person can go and check. It is required now. And a lesson's `id` is
`<module>/<NN>`, a derived value that was being typed by hand: a lesson could
claim index 3, call itself `.../02`, and nothing anywhere would say so.

**`principle` is a real field.** The one sentence a lesson exists to install was
already being written — it is the first variant of the naming stage — but it was
buried inside a render target, so nothing could read it. Backfilled across all 110
and capped at 34 words. **If you cannot write this sentence, the lesson does not
have a point yet**, and now the build is the thing that asks.

**Types, with no build step and no shipped bytes.** TypeScript is a dev
dependency used as a reader: `tsc --noEmit` over JSDoc in plain `.js` files, and
the browser goes on loading the same untouched modules. `npm run dev` is still a
static file server. This is the half of the other plan worth taking.

It found 260 things, of which 173 were in the browser test harness — whose
`page.evaluate()` bodies run in the page's realm, not Node's, so a checker with
the DOM lib on is wrong in both directions there. Excluded, with the reason
written down. **Seventy-nine remained in shipped code, and the response to that
number is the interesting part.** Fixing all seventy-nine in an afternoon means
seventy-nine unreviewed changes to code that works. Leaving the check out of
`npm run check` means it never runs and the number quietly becomes a hundred and
fifty. So the number is recorded and **the only rule is that it may not go up** —
a new module arrives clean or it does not arrive, and old ones get typed when
someone is already in there for another reason. There is no ignore list, and a
`@ts-ignore` in shipped code fails the run outright: **a suppression is a finding
you have agreed to stop seeing.**

It has already paid for itself once. `Placeable.connectedCallback` returned
nothing while the base it overrides returns a boolean — so a third class
extending it would have called `super`, received `undefined`, and silently
declined to wire itself up. That is exactly the D66 fault, a guard a subclass can
walk around, sitting latent and waiting for the next component. Nothing else in
the project could see it.

**A child's year now survives a cleared browser.** Everything is stored on the
device and nowhere else, which is what keeps it private and is also precisely why
clearing browsing data erased it with no way back — a real event for a family that
switches laptops, uses a private window, or tidies up. No account, no server, no
sync: a file the parent saves where they save everything else. It is parsed and
migrated in full before anything is written, so a truncated or foreign file leaves
the child exactly as they were, and **a save from a newer version is refused rather
than half-read**, because migrating backwards would silently drop whatever the
newer version knew. The test saves the file, genuinely wipes localStorage, and
hands it back.

**What was rejected, and why.** Per-lesson `prerequisites` was on the list and is
not in the schema. Modules already gate, and lessons within a module are ordered
by index — so the field would be either always empty or a second copy of the
ordering, and a second source of truth that nothing compares is worse than one.
Eliminate before you add. Also rejected: the analytics. Two cookieless numbers is
a reasonable thing to want and it contradicts the sentence on our own front door
that says nothing about your child leaves the device. The front door wins.

**And one more flake, found by growing a screen by one section.** The harness
wrote localStorage underneath a live document while the app had a 500 ms debounced
write pending, and lost the race — intermittently, and only once the Me screen got
big enough that the screenshot before it took forty milliseconds longer.
`openWith()` has landed on a fresh document before writing since D72, because
navigating fires `pagehide` and flushes; two direct writes had never learned it.
**A test that races the code it is testing will pass until the day the code gets
slightly slower.**

261 of 261 pass.

### D80 — The fix shipped on Monday and the person who reported it saw the bug on Wednesday
*Reported by the owner: "I can't see any changes on Vercel even though it's deployed." He was right, and
he was right about where to look — "some problem in the linking codes." It was the update path.*

The overlap fix from D74 was in the pushed CSS, the deployment was live, the headers on `sw.js` and
`index.html` were already `no-cache`, and the rendering was clean locally at every width in both colour
schemes. And the owner still saw the broken card, because **none of that is the thing that decides what
a returning visitor gets.** The service worker does.

**So the upgrade was measured, and it took three page loads.** Old build in the cache, new build on the
server: load one served the old app while the new worker installed; load two ran with the new cache but
had already fetched the old shell; only load three showed the fix. Nothing on screen said anything was
happening. **A fix that takes three visits to appear is indistinguishable from a fix that was never
deployed** — and the person most likely to hit it is the person who reported the bug, because they are
the one who goes and looks straight away.

**Nothing in the project had ever tested this.** Every offline and caching test installs the worker
once, on one build, and asks whether the app works. That is a fresh install. A returning visitor is a
different event, and it is the one that happens ten thousand times more often. `tools/upgrade.mjs`
builds the tree twice, serves the first, lets the worker take hold, swaps the directory underneath it
and asserts the new build arrives on the **first** return — and that having arrived it settles rather
than reloading in a loop.

The fix is four lines: listen for `controllerchange` and reload once. `skipWaiting()` and
`clients.claim()` were already there and were never enough on their own, because they hand control to
the new worker without telling the page already on screen, which goes on displaying assets it fetched
before any of that happened.

**Two guards, both about not making the reader pay for a mistake.** `refreshing` stops the reload loop.
And the reload only happens if there was a controller to begin with: on a first visit `clients.claim()`
fires the same event, and reloading a child who has just arrived would be a flicker for nothing.

**The honest limitation, stated because it matters right now.** This cannot fix the deploy that carries
it. The old `app.js` is what runs on the visit that installs the new one, and the old `app.js` has never
heard of `controllerchange`. So the *current* correction still costs the owner one hard reload, and
every deploy after it lands on the first visit. A fix to an update mechanism is always one release late,
which is a good reason to get update mechanisms right early.

**Two things found underneath it.**

**`addAll()` is all-or-nothing, and that makes precaching able to hold a correction hostage.** One 404
rejects the whole batch, install fails, `skipWaiting` never runs, and the previous worker serves the
previous build forever — retrying and failing on every visit. D68 was exactly that, and the fix then
was to stop putting missing files in the list. That addressed the cause and left the blast radius
untouched: the next mistake of any kind still freezes the app at whatever version last succeeded, which
is the hardest failure to diagnose because the app looks perfectly fine, just old. Files are cached one
at a time now, tolerating individual failures. The build is still what makes sure the list is right.
**An optimisation must never be able to hold a correction hostage.**

**`jsconfig.json` was being downloaded by every child.** It is a `.json` file in the root, and the
precache allow-list works by extension, so it went straight through — the same shape of hole as the
DENY-list in D68, arriving from the opposite direction. Nothing under `tools/`, and no dev config, is
app content, and the rule says so now rather than relying on the extension list to have an opinion.

261 of 261 in the browser suite, 4 of 4 in the new upgrade gate.

### D81 — The child's first thirty seconds
*Asked for: "an introduction page with some beautiful CSS, effect that helps children lock on." What
was actually missing was smaller and worse than a missing page.*

The front door is written for the parent — it has to be, because the parent is who decides. They read
it and press *Hand it to your child*. And the very first thing that child met was **"Which one feels
right?"**: four sentences to measure yourself against. Of every screen in this product it is the only
one that asks before it gives, and it was the one a five-year-old saw first.

**So the opening is the thesis performed, not stated.** One cell, breathing. Poke it and it splits in
two. Poke again and both split. Five pokes and there are thirty-two, every one descended from the one
they started with, each smaller than its parent — which is what a cleaving embryo actually does, where
the cells divide without the whole growing. **The count doubling in front of them is the lesson**: 1,
2, 4, 8, 16, 32. Only then does the word arrive: *Dividing.* And underneath it, the only thing the
screen says about itself — *you did it before you knew the word, and that is the order everything here
happens in.*

**It is not a splash screen, and the difference is not decoration.** A splash is a wait, and nothing
here may make a child wait in order to be shown a logo. A splash is also skippable, which teaches a
child to skip. This is operable in the first second and finishable in the first second — the way onward
sits there from the start, because a child who does not want to play must never be trapped, and a
parent showing three children in a row should not have to divide cells three times.

**Every effect is CSS.** Cells are elements; they move because a transform transition moves them and
breathe because of one keyframe. No canvas, no render loop, no frame budget — and reduced motion then
becomes a media query rather than a branch in a script. Under it the cells still divide, still shrink,
still count up; they simply arrive where they are going instead of travelling. **The lesson is
untouched and only the motion is**, which is the whole of what that setting asks for.

**One control, not two hundred and fifty-six.** Every cell being a button would mean tabbing through
every cell on screen and a screen reader reading each one. The field is the control and the cells are
what it looks like; the count sits in a live region, so a child who cannot see it is told it doubled.

**The one screen that cannot use the two dials.** It runs before either has been set, so there is no
prose level to write to. Everything on it is a single register — short enough for a five-year-old, not
so soft that a fifteen-year-old feels handled. That constraint is why the copy is this plain, and it is
worth saying out loud because the instinct on a first-run screen is to write it warmly for the
youngest, which would patronise three quarters of the audience on their first contact.

**No random numbers.** Cells push apart at the golden angle, 137.5° — what a sunflower does with its
seeds. It fills the space evenly, and the same taps always give the same picture, so a test can assert
against it rather than around it.

It is a lazy route, played once, and reachable again from Me — because children re-watch the thing they
liked, and taking it away is a small loss for no gain.

275 of 275.

### D82 — A drawing in every module card, and a red build I did not see
*Asked for: the module boxes have a lot of empty space, fill it with hand-drawn coloured pictures like
the notebook references. Two things came out of doing it, and the second one is mine.*

**One drawing per module, in the module's own colours.** Same hand and same 48-unit grid as the specimen
art, with one thing added: flat colour. A path is either a bare string (stroke only) or a `[d, role]`
pair, and **no role names a colour** — `fill`, `deep` and `tint` resolve against the module's world
palette, so a drawing inherits its hue and dark mode for nothing and cannot introduce a colour the
palette generator never gated. `hatch` is a lighter stroke, which is what makes a drawn diagram read as
drawn rather than filled in.

**The first version rendered and could not be seen.** The largest shape in most drawings was filled with
`--w-tint` — and a module card's background *is* the world tint, so the fill vanished into it exactly.
Everything worked and nothing showed. Paper reads against every card state and the mid tone reads
against all of them, so the rule is now: **the biggest shape carries the world's mid tone, the point of
the drawing carries the deep tone, and paper white is only ever a hole or a highlight.** The line weight
went from 2 to 2.6 in the same pass, because at the size these are used the thinner one read as an icon
set, which is the opposite of the reference.

A locked module's drawing greys out with the rest of its card. A preview is not a prize, and a colourful
picture on a closed door draws the eye to the one thing a child cannot do.

The drawings are a late fetch and a failure is silence — the same contract as the specimen art in D71,
for the same reason. Every card's title, hook and status already say what it is; **a picture is worth
having and is not allowed to be a prerequisite for reading.**

The set is build-checked like the specimens: on the grid, absolute commands only, at most fourteen
paths, fills before line work, and at least one colour. Proved by breaking each rule in turn.

**And the part worth writing down properly.** The build had been FAILING since the opening landed in
D81, on four custom properties the intro sets inline — and I did not see it, because I had been running
`node tools/build.mjs | grep -E "shell JS|shell CSS"` to read the budget numbers and the grep threw the
`FAILED:` line away. The browser suite was green, so nothing contradicted me. **I shipped D81 with a red
build and pushed it.**

The lesson is not "look at the output". It is that a filtered view of a gate is not the gate, and I had
been reading a filter for several turns without noticing it had stopped containing the answer. The fix
in the code is trivial — a `var()` with no fallback is an undefined property by the build's own rule,
and these four now have fallbacks, which is also more robust because a value the script forgets to set
no longer silently becomes zero. The fix in the habit is to run the gate and read what it says.

275 of 275, and the build is green.

### D83 — Twenty-five drawings, redrawn, and why not generated ones
*Asked: can we not use biology vectors, Higgsfield is attached. The honest answer needed numbers, and
one of them settled it.*

**Everything a child downloads for offline use is 1,477 KB. The twenty-five drawings inside that are
3 KB gzipped.** Twenty-five generated PNGs at a realistic 40 KB each would be 1,000 KB — a **68%
increase in the entire app to replace three kilobytes**. Vectorised they would land near 375 KB, and
vectorised generation arrives as hundreds of paths with colours baked in: no world palette, no dark
mode, and nothing solved against the 4.6:1 gate the whole palette is generated against. There is also
the provenance question, in a product that carries a LICENSE and an owner's name.

But the complaint was fair. The drawings were crude, and the reason was mine: **the fourteen-path cap
was a guess I made, not a constraint the system had.** The reference notebook diagrams are thirty to
forty strokes. So the cap went to forty and all twenty-five were redrawn.

**What made them work was visible the moment there was a contact sheet.** Rendering all twenty-five at
the size they are actually used, side by side, took ten minutes and answered a question that no amount
of looking at one drawing at a time could: the three that already worked — the leaf, the shield, the
beetle — shared a property none of the others had. **An organic filled silhouette with structure inside
it.** Everything else was a geometric abstraction, and geometric abstraction at 54px is an icon.

So every drawing now has, in order: two or three filled shapes with the largest carrying the world's
mid tone; the same shapes again as outline so the line work sits on the colour; six to twelve strokes
of internal structure; and three to six hatch strokes, always on the lower right, so **one light
direction runs through all twenty-five**. Twelve to twenty paths, median seventeen.

The cost of the whole set is **4.7 KB gzipped**, against 3.0 before. One and a half kilobytes bought
twenty-five drawings that read as drawings.

**The contact sheet is the lesson worth keeping.** Judging a drawing means looking at it, and judging a
SET means looking at all of it at once, at the size it is used, in its real colours. Everything else in
this project is checked by a rule; this is the one thing where the check is a pair of eyes, and building
the surface that makes that possible was worth more than any individual fix it produced.

**Where the generator would still earn its place.** Not as a source of shipped art — as a source of
*reference*. Generate an image, draw the vector from it, discard the raster. That improves the drawing
without putting a single generated byte on a child's device, and it is the offer that stands if the
credits are ever topped up.

Two I would still revisit with a child watching: `crispr` and `synthetic-biology` are the most abstract
of the twenty-five, and abstraction is exactly what the contact sheet showed does not survive at 54px.

275 of 275.

### D84 — The drawings are gone
*"Didn't like the drawings? Remove them." Removed, and removed properly.*

Not hidden behind a flag and not left in the tree for later. The twenty-five drawings, the card slots
that held them, the loader that fetched them, the fill roles added to `svgOf`, the CSS, and the build
guard that policed them are all out. The Atlas is byte-for-byte the design it was before D82, and the
shell CSS went back from 18.0 KB to 17.2.

**Unused capability is the first thing the ladder says to eliminate.** The role support in `svgOf` was
three lines and harmless and nothing used it, and "we might want it again" is exactly the argument that
turns a codebase into a museum. If drawings come back they will come back as one commit, built for
whatever actually makes them — which is not necessarily what this system assumed.

D82 and D83 stay in this log. They were wrong about the output and right about two things that outlived
it: a filtered view of a gate is not the gate, and a set of drawings can only be judged by looking at
all of it at once, at the size it is used. The contact-sheet tool that produced that second lesson cost
ten minutes and is the part I would rebuild first.

275 of 275, and the empty space in the module cards is empty again.

### D85 — An importer, so the drawing tool stops being the question
*Asked to look at Graphite, Lorien and macSVG. All three are useful and none of them is the answer,
because none of them is a library — they are tools for a person to draw with.*

**Graphite** (Apache 2.0, Rust/WASM, alpha) is a browser app with a node-based procedural engine, which
is genuinely the interesting one: a node graph enforces consistency across twenty-five drawings *by
construction*, which is precisely what I failed at by hand. **Lorien** (MIT, Godot, desktop) is the
closest to what was actually wanted — pressure-sensitive freehand, and it already stores strokes as
point lists rather than pixels. **macSVG** (MIT, macOS, last release July 2022) I would skip; Inkscape
does the same job with support behind it. None has a CLI, a headless mode or an embeddable core, so
none of them can ever be part of the build.

**Which means the missing piece was never a drawing app.** Every one of these — and Figma, and
Illustrator, and a photograph of a pencil sketch — emits concrete hex colours, whatever coordinate space
the artboard happened to have, transforms, groups and metadata. What this format needs is roles that
resolve against a world palette, a 48-unit grid, flat absolute path data and a path budget. That gap is
one tool, written once, and then it does not matter which app anybody drew in.

**The browser is the parser.** Playwright is already a dev dependency and Chromium has had a complete
SVG implementation for twenty years, so `getPointAtLength()` walks a circle, a rect, a polyline and a
path identically, and `getCTM()` flattens every transform without me implementing matrix composition.
Writing an SVG parser to avoid a dependency I already have would have been the expensive kind of purity.

**Two bugs, and the second one is the point.**

Sending the simplification algorithm across the boundary as a string broke its recursion: an arrow
function assigned to a const has no name to call itself by once it has been through `new Function()`.
The browser samples points now and defines nothing.

And Ramer–Douglas–Peucker measures every point against the line from the first to the last — which on a
**closed ring is the same point.** Zero-length baseline, every distance reads as nothing, and a perfect
circle simplifies to two points. The first run turned four circles into four straight lines and reported
`4 filled, 8 paths` — which is a true statement about what it did and says nothing about what it
produced. **A converter that reports its actions rather than its output will tell you it worked right up
until you look at the picture.** The ring is cut at its furthest point from the start now, and there is a
check that a round thing is still round.

The proof feeds a deliberately awkward drawing through — a scaled group, a rect, a polyline, an ellipse,
an unfilled stroke, and a 200×140 artboard — and checks the output rather than the log: on the grid, in
the safe area, absolute only, fills first, no hex anywhere, under the limit, uniformly scaled, and three
luminances mapping to three different roles.

Nothing here ships. It is a desk tool, and the display side stays out of the app until there are
drawings worth displaying.
