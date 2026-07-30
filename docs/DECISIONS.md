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
