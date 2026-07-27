# First Principles Life Sciences

Learn biology by operating the mechanism before naming it.

A child does not read about life here. They run it. Every screen is a system they can perturb,
and every perturbation answers a question they were already asking thirty seconds earlier. If a
screen cannot be poked, it should not exist; if an animation does not encode a mechanism, it is
deleted; if a lesson can be understood by reading it, it has failed — it should have been a
simulation.

Twenty-five modules across six worlds, for ages 5 to 16, adapting to four reading levels.
All 110 lessons are specified — title, concepts and specimen. Eleven are authored: Cells complete
with a boss you can lose, Natural Selection opened with a population simulation whose three
conditions are on switches, and the Evolution module written as attributed side-by-side readings
rather than a verdict.

**Zero runtime dependencies. No framework, no bundler, no build step to develop.**

---

## Running it

```bash
python3 -m http.server 8000      # or: npm run dev
```

Then `http://localhost:8000`. That is the whole development setup.

`http://localhost:8000/styleguide.html` is the living design system: every token read from the
live stylesheet, every contrast figure measured from the rendered result, switchable across all
four levels and both themes. If a token drifts, that page says so rather than looking fine.

## Before you commit

```bash
npm run build      # lints content, enforces budgets, regenerates sw.js + reviews.json + app.css
npm run verify     # drives Chromium through 186 checks (~5 min)
npm run lighthouse # performance / a11y / best practices / SEO, all gated at 95
```

`python3 tools/gen-palette.py` regenerates `css/worlds.css` after changing a hue. That file is
generated output — **never hand-edit it**. The generator exits non-zero if any colour fails its
contrast gate.

## Deploying

The repo is a static site. There is no build step to configure on the host — but you must run
`npm run build` locally and commit the result, because it writes the service-worker precache
list, the concatenated stylesheet and the review-beat index.

**Vercel** — import the repo, framework preset **Other**, build command **empty**, output
directory `.`. `vercel.json` is already here and sets the one header that matters: `sw.js` must
never be cached, or a child stays on an old build forever.

**Cloudflare Pages** — connect the repo, build command **empty**, output directory `/`.
`_headers` carries the same rules.

Both are free for this, and both serve it globally over HTTPS, which the service worker needs.

### Licence

There is deliberately no `LICENSE` file. Without one, a public repo is "all rights reserved",
which is the safe default — add MIT, Apache-2.0 or whatever you intend before inviting
contributions. The fonts are separate: Nunito and Baloo 2 are under the SIL Open Font License
and are redistributed here under it.

---

## How it is put together

| | |
|---|---|
| `index.html` | The whole app shell. One stylesheet, one module script. |
| `css/` | Four stylesheets to author, concatenated into `app.css` to ship. `worlds.css` is generated. |
| `js/` | Shell: router, state, curriculum graph, screens. |
| `js/components/` | Custom elements, imported lazily by the lesson that needs them. |
| `js/lesson/` | The lesson runner, the review flow and Sprout. Never loaded on the Atlas. |
| `js/sims/` | Simulations, imported per stage. A child in lesson 1 never downloads lesson 2's physics. |
| `content/` | The curriculum graph and the lessons. `reviews.json` is generated from the lessons. |
| `tools/` | Build, palette generator, browser test suite, Lighthouse runner. |
| `docs/` | The blueprint, `DECISIONS.md`, and **`AUTHORING.md` — read this to write a lesson.** |

**Read `docs/DECISIONS.md` before changing anything.** It is fifty entries of what contradicted
the plan and why — every one of them a bug that shipped, or nearly did. D44–D50 are the newest,
and they are the more dangerous kind: four of them were things the lesson format made
*impossible to express*, which fails silently. You simply write a worse lesson and never find
out why.

### Four load tiers, four budgets

Enforced by `tools/build.mjs`; the build fails if any is exceeded.

| Tier | Budget | Currently |
|---|---|---|
| Shell JS (gzipped) | 25 KB | 18.8 |
| Lesson JS (lazy) | 20 KB | 18.3 |
| Simulation JS (worst single stage) | 20 KB | 12.0 |
| Shell CSS (gzipped) | 20 KB | 14.9 |
| Preloaded fonts | 35 KB | 25.1 |

The simulation budget is base plus the **largest single** sim, not the sum of all of them — a
stage loads one. Summing measured a cost nobody pays and would have failed the build at about
five simulations on a number no child would ever download.

---

## The three rules that hold the design together

**Raised means touchable; flat means not.** Inside the content area, claymorphic depth is an
affordance language rather than a texture. Reviewing a screen is checking that rule holds, and
the test suite checks it in both directions on every screen.

**Colour is never the only channel.** Every state ships with an icon and a text label; molecules
in a simulation are told apart by shape as well as hue. Roughly one boy in twelve cannot use the
colour, and a canvas has no markup to carry that redundancy for you.

**Every animation has one of four jobs** — causal, spatial, state, attention. An animation that
cannot be assigned one of them is deleted in review, which is why there is no general-purpose
"animate this" utility to reach for. Under `prefers-reduced-motion`, three of those roles are
removed and the fourth — causal, the kind that *is* the teaching — is **substituted** with a
step-through control rather than deleted.

## Three findings that changed the product

**Explore-before-instruction reverses sign at age 7.** Sinha & Kapur's meta-analysis puts it at
g = 0.50 for ages 11–16 and **g = −0.09 for ages 7–11**. So the brief's "always begin with
curiosity, never with definitions" is right about motivation and wrong about epistemics for half
the audience. Lessons carry both tracks: levels 1–2 get guided discovery with the naming close
behind, levels 3–4 get true predict-fail-consolidate. The build fails if a stage filter strands
any level without a complete path.

**Drag is the wrong default interaction for a five-year-old.** So it is not the interaction:
tap-to-pick then tap-to-place is the base, Enter and Space run the identical code path, and drag
is a pointer layer calling the same two methods past an 8px threshold. One state machine, and
the keyboard and screen-reader paths are the primary path rather than a retrofit.

**Touch targets for young children are 2cm, not 44px.** 76px at level 1, and the only absolute
pixel value in the system — it measures a hand, not a typeface.

**Reading level and conceptual level are two dials, not one.** A dyslexic fourteen-year-old
needs level-1 sentences and level-4 science. `data-level` carries the reading register (type,
measure, motion); `data-age` carries the motor one (touch targets). They start linked and can
be separated in Me. As a side effect, authoring needs two prose variants rather than four.

## What the XP will not pay for

`awardXp()` throws, with a written explanation, on five reasons some future version of that file
will be tempted to add:

| Refused | Because |
|---|---|
| `time` | Paying for time on task produces idling, not learning. |
| `watch` | Paying for watching an animation produces passivity. |
| `streak` | Streaks are retention, not learning; paying XP for them corrupts the signal. |
| `login` | Paying for showing up is a habit loop, not a learning loop. |
| `correctPredict` | Prediction pays the same whether right or wrong. Paying only for correct predictions teaches children to guess safe, which destroys the mechanism. |

Badges are derived from the retrieval schedule and never stored. "Finished the module" is not a
badge. "Still had it three weeks later" is.

The streak and the on-screen XP number are **deleted**. Both were built carefully and read by
nothing — not a badge, not a screen, not a decision. The ledger stays because badges need it.
See `docs/DECISIONS.md` D42.

---

## Where this curriculum takes a position

Six of the 110 lessons sit where a mainstream scientific reading of the evidence and a
creationist reading of the same evidence diverge: the five lessons of `evolution`, and the
origin-of-life lesson in `what-is-life`. This repository is public, so it says plainly how they
are built.

They use a `weigh` stage, and the format enforces three things the author cannot forget:

- **Every reading names who holds it.** `who` is mandatory and the build fails without it. The
  page never speaks in its own voice on a weigh stage.
- **Every reading gives its actual reasoning.** `because` is mandatory too, because a view
  without it is a label, and labelling a position is how a strawman gets built by accident.
- **Both must be opened before the lesson advances**, and the two cards are styled identically
  with a test asserting it. Children read visual weight long before they read words.

The field that does the real work is `predicts`. A disagreement written as two beliefs is a
stand-off a child can only pick a side in; written as two sets of expectations it becomes
something a person can go and check. Each stage closes with an open question and deliberately
nowhere to type.

The contested stages are `levels: [3, 4]`. A six-year-old should be finding out what a fossil is,
not adjudicating assumptions in radiometric dating; levels 1–2 get the observations without the
dispute. That is the existing pedagogy fork doing its job, not a separate mechanism.

Nothing in the other 104 lessons is affected. Cells, DNA, proteins, immunity, neuroscience,
ecology and the rest are operational biology, run identically by everyone. Natural selection is
in that group too, which surprises people: variation, heredity and differential survival are
directly observed, and Answers in Genesis affirms all three — the dispute there is about the
ceiling, which is what lesson 5 of `evolution` is about.

## Still to do

The engine is complete and the spine is written; 99 lesson bodies are not. In rough order of
value:

1. **Put it in front of a real child.** The blueprint's open risks are now testable for the
   first time — whether the level picker misfires (the nudge is built, its thresholds are
   guesses), and whether the membrane simulation is legible to an eight-year-old rather than
   merely correct. No further code answers either.
2. **The remaining 99 lessons.** This is the actual constraint on scale, and it is a writing
   project rather than a build step. `docs/AUTHORING.md` is the spec and every remaining lesson
   already has its title, concepts and specimen in `curriculum.json` — so the next author is
   filling in a specification, not inventing one. An authoring tool would pay for itself
   somewhere around lesson thirty.
3. **The Lab** — free play with every simulation, no lesson wrapper. Costs almost nothing; it is
   where this stops being a course and starts being a thing children open on a Saturday.
4. **A live model behind Sprout.** The interface is already async for exactly this.
