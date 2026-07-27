# First Principles Life Sciences

Learn biology by operating the mechanism before naming it.

A child does not read about life here. They run it. Every screen is a system they can perturb,
and every perturbation answers a question they were already asking thirty seconds earlier. If a
screen cannot be poked, it should not exist; if an animation does not encode a mechanism, it is
deleted; if a lesson can be understood by reading it, it has failed — it should have been a
simulation.

Twenty-five modules across six worlds, for ages 5 to 16, adapting to four reading levels.
The Cells module is complete: five lessons, two simulations, and a boss you can lose.

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
npm run verify     # drives Chromium through 151 checks (~4 min)
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
| `docs/` | The Phase 1 blueprint, and `DECISIONS.md`. |

**Read `docs/DECISIONS.md` before changing anything.** It is thirty-odd entries of what
contradicted the plan and why — every one of them a bug that shipped, or nearly did.

### Four load tiers, four budgets

Enforced by `tools/build.mjs`; the build fails if any is exceeded.

| Tier | Budget | Currently |
|---|---|---|
| Shell JS (gzipped) | 25 KB | 15.8 |
| Lesson JS (lazy) | 20 KB | 18.6 |
| Simulation JS (per stage) | 20 KB | 8.9 |
| Shell CSS (gzipped) | 20 KB | 14.0 |
| Preloaded fonts | 35 KB | 25.1 |

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

**Touch targets for young children are 2cm, not 44px.** 76px at level 1, and it is one of only
two values in the system that is an absolute pixel measurement — it measures a hand, not a
typeface, so it deliberately does not scale with the type.

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

---

## Still to do

The engine is complete; the content is one module of twenty-five. In rough order of value:

1. **Put it in front of a real child.** Two of the blueprint's open risks are now testable for
   the first time — whether level inference from one non-verbal question is right often enough,
   and whether the membrane simulation is legible to an eight-year-old rather than merely
   correct. No further code answers either.
2. **An authoring tool.** Twenty-four modules of hand-written JSON is the actual constraint on
   scale. The format has survived five real lessons, so this is now a well-posed problem.
3. **The Lab** — free play with every simulation, no lesson wrapper. Costs almost nothing; it is
   where this stops being a course and starts being a thing children open on a Saturday.
4. **A live model behind Sprout.** The interface is already async for exactly this.
