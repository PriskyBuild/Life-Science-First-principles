# Phase 1 — Research & Architecture Blueprint
### First Principles Life Sciences

**Status:** complete, awaiting review · **Date:** 2026-07-27 · **Author:** architecture pass 1
**Locked decisions from kickoff:** one flagship module end-to-end · rule-based offline tutor · all four age levels from day one · repo at `D:\Dopamine Rewire\life-sciences`

No implementation code is written in this phase. Everything below is a decision with a reason attached, so that Phase 2 onwards is execution rather than debate.

---

## 0. The one paragraph that governs everything

A child does not read about life on this platform. They run it. Every screen is a system the child can perturb, and every perturbation answers a question they were already asking thirty seconds earlier. The product's job is to keep the gap between *wondering* and *finding out* under ten seconds, forever. If a screen cannot be poked, it should not exist. If an animation does not encode a mechanism, it should be deleted. If a lesson can be understood by reading it, it has failed — it should have been a simulation.

---

## 1. Research findings that changed the plan

This section exists because three findings from the evidence base contradict parts of the original brief. They are reported first because everything downstream depends on them.

### 1.1 Explore-first pedagogy does *not* work for young children

The brief's central instruction is "never begin with definitions, always begin with curiosity, let the child discover the answer." That is the productive-failure / problem-solving-before-instruction (PS-I) model, and the evidence for it is strong — but age-dependent in a way that matters enormously here.

Sinha & Kapur's meta-analysis of 53 studies (166 comparisons) found PS-I beats instruction-first with **g = 0.36** for conceptual knowledge and transfer (g = 0.87 after correcting for publication bias). But the moderator analysis is unambiguous:

| Learner group | Effect of explore-before-instruction |
|---|---|
| Undergraduates | g = 0.28 — works |
| Grades 6–10 (≈ ages 11–16) | g = 0.50 — works well |
| **Grades 2–5 (≈ ages 7–11)** | **g = −0.09 — mildly harmful** |
| Procedural knowledge (any age) | g = −0.03 — no benefit |

Younger children lack the metacognitive strategies to profit from floundering, and tend to activate irrelevant prior knowledge while doing it. Building Levels 1 and 2 on pure discovery would be building on an effect that reverses sign at exactly those ages.

**Design response — the learning flow forks by level, and this is the single most important structural decision in the document.**

- **Levels 1–2 (ages 5–10): guided discovery.** Curiosity hook stays — it is doing *motivational* work, not epistemic work, and motivation is not age-limited. But the child explores inside a simulation that is heavily *implicitly scaffolded* (PhET's term: the interface itself constrains the child toward productive actions without ever saying "click here"), and the naming/explanation arrives fast — within the same screen, triggered by the child's own action. Discovery is real but rails are on.
- **Levels 3–4 (ages 11–16): true productive failure.** Predict → attempt → fail informatively → *then* consolidate. Free parameter space. The child is allowed to generate wrong models and then watch them break, which is where the g = 0.50 comes from.

The four highest-value design features from the same meta-analysis are all buildable by a single learner: instruction that visibly *builds on the child's own generated solution* (g = 0.56), dialogue-dominant delivery (g = 0.55), evidence of generating multiple solutions (g = 0.47). The tutor and the consolidation screens are specified in §7 and §9 to hit all three.

### 1.2 Drag-and-drop is the wrong default interaction for half the audience

The brief lists drag-and-drop in "every lesson should include." Nielsen Norman Group's developmental research is blunt: children aged 5–7 struggle with dragging, and "precise dragging of a target through a tunnel or to a specific spot was hard for kids" persists well past that. Fine motor control for reliable dragging arrives around 8–10 and is only adult-equivalent at 11–13.

**Design response.** Drag is never the *only* way to do anything. Every draggable in the system is built on a two-mode primitive: **tap-to-pick-up, tap-to-place** is the base interaction, and drag is a progressive enhancement layered on the same state machine. This is one component, not two — the drag handlers simply write to the same `selected → placed` state that taps do. It also gets keyboard operation and screen-reader operation for free, which is otherwise the single hardest accessibility problem in an educational app.

### 1.3 Touch targets for young children are far larger than the usual 44px

NN/g's guidance for children under 9 is **2cm × 2cm** — approximately 4× the area of the standard adult recommendation, and roughly **76 CSS px** at typical density. WCAG 2.2's 24px minimum is a legal floor, not a design target, and 44px (Apple) / 48dp (Material) are adult numbers.

**Design response.** Target size becomes a level-scaled design token rather than a constant (§6.4). This is one CSS variable, not a component fork.

### 1.4 What the evidence *confirms* about the brief

Retrieval practice and spacing are the two best-evidenced interventions in the learning sciences, they benefit children as young as infancy, and corrective feedback amplifies them. The brief's "Quick Assessment" step at the end of every lesson is well-founded — but a single end-of-lesson quiz is the weak form. §7 converts assessment into **spaced retrieval across sessions**, which is where the effect actually lives, and ties the XP economy to it so the game mechanic and the learning mechanic are the same mechanic.

PhET's simulation research also confirms two things that constrain the visual design directly: **minimal text** inside simulations, and **dynamic feedback on manipulation** as the thing that makes interactivity educational rather than decorative. Both are encoded as hard rules in §11.

---

## 2. Product vision

**For** curious children aged 5–16 and the adults who want to hand them something better than a video,
**First Principles Life Sciences** is a browser-based interactive biology world
**that** teaches every concept by letting the child operate the mechanism before naming it,
**unlike** video courses, worksheet apps, and quiz gamification wrappers,
**because** it treats each lesson as a simulation with a story wrapped around it rather than a story with a quiz stapled to the end.

**The three-year test of success:** a child can explain why a mutation matters, to an adult, using a mechanism they discovered themselves, without using a word they were told to memorise.

**Non-goals, stated explicitly so they stop coming up:** it is not a school LMS, it does not track classes or assign homework, it has no social feed, no leaderboards against other children, and no accounts in v1. Everything runs offline against local storage.

---

## 3. Information architecture

Three levels of depth, maximum. A child should never be more than two taps from a simulation and one tap from home.

```
Atlas  (the world map — 6 worlds, 25 modules)
 └─ Module  (e.g. Cells — 4-7 lessons, one boss challenge)
     └─ Lesson  (one continuous scroll-free flow of 6-11 stages)

Persistent, reachable from anywhere:
 · Tutor      (Sprout — slides in, never blocks, never a modal)
 · Me         (specimens collected, badges, streak, level switch)
 · Lab        (free-play sandbox: every simulation ever unlocked, no lesson wrapper)
```

**The Lab is not in the brief and is the one addition I am arguing for.** Every simulation built for a lesson gets a second life as a free-play toy with no objective. This costs approximately nothing (the simulation already exists; the Lab is a grid of links and a "no lesson chrome" flag) and it is where the platform stops being a course and starts being a thing children open on a Saturday. It is also the honest home for the brief's "hidden discoveries" — findable things that exist in the sandbox and are not on any lesson's critical path.

**Navigation model.** Atlas is a spatial map, not a list — worlds are places, and returning to a place you have been is how children build a mental model of a curriculum's shape. Module→Lesson→Atlas transitions are shared-element animations so the child always knows where they came from (§11, role: spatial).

---

## 4. Curriculum map

The 25 topics from the brief, organised into 6 worlds. Ordering within a world is a dependency chain; worlds themselves are mostly parallel after World 1.

| World | Modules | Unlocks after |
|---|---|---|
| **1 · Origins** | What is Life · Cells · Biomolecules | — (entry point) |
| **2 · The Code** | DNA · Genes · Proteins | Cells |
| **3 · Change** | Evolution · Natural Selection · Development | Genes |
| **4 · Bodies** | Human Body · Nutrition · Immunity · Neuroscience · Disease · Medicine | Cells |
| **5 · The Living World** | Plants · Animals · Microbiology · Ecology · Environmental Science | Cells |
| **6 · Frontier** | Biotechnology · CRISPR · Synthetic Biology · Space Biology · Future Biology | Proteins + any 3 modules |

*Checked programmatically against the brief's list: 25 topics in, 25 mapped, no omissions, no duplicates, no inventions.*

Two structural rules:

**Every module is reachable by more than one path.** A child who is gripped by animals should not have to grind through biomolecules to get there. Worlds 4 and 5 open on Cells alone. Only World 6 requires real accumulated machinery, which is correct — CRISPR is not comprehensible without proteins.

**Every module carries its "why care" payload as content, not decoration.** The brief lists eleven real-world domains; rather than bolting a "Real World" tab onto each lesson, the *medical example* and *engineering inspiration* stages (stages 8 and 9 of the flow) are authored as short interactive beats, not text panels. Immunity's medical beat is "you have a fever — decide whether to suppress it," not a paragraph about fevers.

### 4.1 Flagship module for v1: **Cells**

Chosen because it is the brief's own worked example, it is the gateway node that unlocks three of six worlds, and it supports the strongest hook in the entire curriculum ("what would happen if an entire city had to fit inside something smaller than a grain of sand?"). It also forces us to solve the two hardest technical problems on the first module rather than the tenth: a continuous-space simulation with real physics-ish behaviour (diffusion across a membrane) and a construction game with a scoring model (build a working cell).

Proposed lesson chain for Cells, mapped to the brief's 11-stage flow:

| # | Lesson | Core interaction | Boss mechanic |
|---|---|---|---|
| 1 | The City in a Speck | Zoom simulation: village → cell, scale slider | Guess the scale |
| 2 | The Wall That Chooses | Membrane diffusion sim — let things in, keep things out | Keep the cell alive 30s |
| 3 | The Power Plant | Mitochondria: glucose in, ATP out, budget game | Run the cell on a budget |
| 4 | The Instruction Room | Nucleus: send an instruction, watch it get built | Fix a garbled instruction |
| 5 | **Build a Cell** (boss) | Full construction from parts, must survive a stress test | Survive: heat, poison, starvation |

Lessons 2 and 3 are the technically hard ones and are therefore built **first**, in Phase 7, before the shell is pretty. If the simulation engine cannot carry the membrane lesson, no amount of design system will save the product.

---

## 5. User journeys

**J1 — Cold open, first 90 seconds (the only journey that matters).** No account, no onboarding carousel, no "choose your avatar." Land directly inside a running simulation of the hook, already animating. One question in large type. The child touches it, something changes, they touch again. Age is inferred *afterwards*, at the first natural pause, by a single non-verbal question ("which of these feels right?" — three cards with visibly different text density and complexity), not by asking a five-year-old to type their age. Level is adjustable forever from Me, and the system nudges a change if performance data disagrees with the chosen level for three consecutive lessons.

**J2 — Returning session.** Opens on Atlas with exactly one thing glowing: the next lesson, or a due retrieval review (§7.3), whichever is older. Never a wall of choices. The Lab and free navigation are always available but never the default.

**J3 — The stuck child.** Detected, not self-reported: three failed attempts, or 45 seconds of no input during an interactive stage, or a rapid-undo pattern. The tutor slides in with a question, never an answer (§9). If the child is still stuck after two tutor turns, the *simulation itself* degrades in difficulty — a parameter narrows, a distractor disappears. This is invisible and is never announced, because announcing it is the fastest way to teach a child they are bad at biology.

**J4 — The parent or teacher.** One screen in Me: what has been learned, what is shaky, what the child chose to explore in the Lab. No dashboards, no exports, no PDF reports in v1. This journey is deliberately thin.

**J5 — Offline.** Indistinguishable from online, because there is no online. Stated here so it is never quietly broken.

---

## 6. Design system

Generated with the UI/UX Pro Max design-system resolver, then corrected in three places. The corrections and their reasons are given because unexamined tool output is not a design decision.

### 6.1 Style: Claymorphism ✓ accepted

Soft 3D, chunky forms, 3–4px borders, 16–24px radii, paired inner and outer shadows. The resolver's rationale holds — it reads as tactile and toy-like, which is exactly the affordance signal a child needs to know a thing is pokeable. Performance is good (box-shadow and border-radius only, no filters, no backdrop blur), which matters at our Lighthouse target.

One discipline attached: **claymorphic depth is reserved for interactive elements.** Anything raised is touchable; anything flat is not. This turns the visual style into a functional affordance language rather than a texture, and it is worth more to a five-year-old than any onboarding tooltip.

### 6.2 Colour ◐ restructured

The resolver returned a single-hue sky/emerald system (`#0EA5E9` primary, `#059669` accent, `#F0F9FF` ground, `#0C4A6E` foreground) with the note "DNA blue + life green." Good bones, wrong shape for this product: a 25-module atlas across 6 worlds needs colour to carry *place*, and a monochrome system cannot.

Restructured into three tiers:

**Tier 1 — Chrome (constant everywhere).** Warm near-white ground, deep desaturated ink, hairline borders. Deliberately warm rather than the resolver's cool `#F0F9FF`, so that the six world hues sit on top of it without one of them appearing to be "the theme."

**Tier 2 — Six world hues,** one per world, each with a 5-step ramp. These are the only saturated colours in the system, and they appear on the Atlas, the module header, and progress fills. This is what makes World 3 feel like a different place from World 5.

**Tier 3 — Semantics,** which never overlap with world hues: correct, incorrect, warning, info, plus a dedicated **discovery** colour used only when the child finds something themselves. Every semantic colour ships with a mandatory paired icon and text label — colour is never the sole channel, which is not just WCAG compliance but a hard requirement in biology, where diagrams are colour-coded by convention and roughly 1 in 12 boys is colour-vision deficient.

All pairs to be validated at ≥ 4.5:1 body / ≥ 3:1 large and UI, in both themes, by the automated check in §13. I ran that check against the resolver's raw output already, and it is the reason the palette is being re-derived rather than copied:

| Pair | Ratio | Verdict |
|---|---|---|
| `#0F172A` on `#0EA5E9` (on-primary) | 6.44 | ✓ AA body |
| `#0C4A6E` on `#F0F9FF` (text on ground) | 8.87 | ✓ AA body |
| `#DC2626` on `#F0F9FF` (destructive) | 4.53 | ✓ AA body — but with no margin |
| `#059669` on `#F0F9FF` (accent) | 3.53 | ◐ large/UI only |
| `#0EA5E9` on `#F0F9FF` (primary) | **2.60** | ✗ fails even 3:1 |
| `#FFFFFF` on `#0EA5E9` | **2.77** | ✗ fails |
| `#BAE6FD` on `#F0F9FF` (border) | **1.24** | ✗ invisible border |

Read plainly: the resolver's primary can be a *fill* but never text, never a stroke, and never take white on top of it, and its border colour is effectively invisible on its own background. This is exactly the trap a "premium, colourful, not overwhelming" brief walks into — light, airy, and unreadable. The re-derived palette treats **contrast as the constraint and hue as the free variable**: each of the six world hues gets a ramp where a designated step is guaranteed to clear 4.5:1 on the chrome ground and another to clear 3:1 as a UI stroke, and only those steps are permitted in those roles. Exact hex values are Phase 3 output, not Phase 1 — locking them before the first simulation reveals what colours the *content* needs would be premature.

### 6.3 Typography ✗ rejected and replaced

The resolver returned **Baloo 2 / Comic Neue**. Baloo 2 is kept for display — it is a genuinely good chunky rounded face with real weight range, and it carries the claymorphic voice at large sizes.

**Comic Neue is rejected for body text.** It is a novelty face with a modest x-height, loose spacing and weak hinting at the 16–20px sizes we will actually set body copy at, and it is being asked to carry reading load for a child who may be five and may be dyslexic. Replaced with **Nunito** — rounded terminals so it pairs with Baloo 2 without a tonal seam, but a large x-height, tighter fitting, seven real weights, and it is one of the most-tested screen faces in existence. **Atkinson Hyperlegible** is loaded as an opt-in body face behind a "easier to read" toggle in Me, for children with low vision or reading difficulty; it costs one extra subset file and is the single highest-leverage accessibility feature available to a reading-heavy product.

**Both faces are self-hosted as subsetted `woff2`, not loaded from Google Fonts.** The brief requires offline capability and Lighthouse > 95; a third-party font origin breaks the first and costs a connection on the second. After Latin subsetting and static-instance extraction: **≈ 30KB preloaded** (Nunito 400/700 + Baloo 2 600), with Atkinson Hyperlegible fetched lazily only when the toggle is on, so the accessibility option costs nothing to the children who do not use it. `font-display: swap`, with metric-compatible fallbacks declared so the swap does not shift layout.

### 6.4 The level system: one attribute, no component forks

This is the mechanism that delivers "all four age bands from day one" without tripling the codebase. `<html data-level="1|2|3|4">` rescales the entire design system through CSS custom properties. **No JavaScript participates in presentational adaptation at all.**

| Token | L1 (5–7) | L2 (8–10) | L3 (11–13) | L4 (14–16) |
|---|---|---|---|---|
| Min touch target | **76px** | 60px | 48px | 44px |
| Min gap between targets | 16px | 12px | 8px | 8px |
| Body size | 22px | 19px | 17px | 16px |
| Line height | 1.7 | 1.6 | 1.55 | 1.5 |
| Max line length | 40ch | 50ch | 62ch | 68ch |
| Space scale (× 4px base) | 1.5 | 1.25 | 1.0 | 1.0 |
| Motion duration × | 1.25 | 1.1 | 1.0 | 0.9 |
| Simultaneous on-screen actions | 1 | 2 | 3 | 4 |
| Icon : label ratio | icon + label | icon + label | icon + label | label may stand alone |

L1's target is **76px, not a rounder 72px**, because 2cm at 96 CSS px/in is 75.6px and 72px would land at 1.91cm — under the guideline. A developmental threshold is not the place to round down for grid tidiness; the target minimum simply does not sit on the spacing scale, and that is fine.

The last two rows are the only ones that are not pure CSS. "Simultaneous actions" is a content-authoring constraint enforced by a lint rule over lesson JSON, not a runtime behaviour, and the icon/label rule is an authoring convention.

### 6.5 Motion tokens

Durations 150–400ms, scaled by level per the table above. Easing: `back.out`-equivalent cubic-bezier for anything that appears (the slight overshoot is what makes claymorphic elements feel physical), standard ease-out for anything that moves, linear only for continuous simulation animation. Stagger 60ms for grids. `prefers-reduced-motion` handling is in §11.3 and is more nuanced than "turn it off."

---

## 7. Gamification system

The design constraint here is the one most educational products get wrong: **if the reward loop and the learning loop are different loops, the child optimises the reward loop and stops learning.** Every mechanic below is chosen so that the fastest way to maximise it is also the strongest learning behaviour available.

### 7.1 XP — paid for the right behaviours

| Behaviour | XP | Why this is paid |
|---|---|---|
| Making a prediction before running a simulation | **yes, even when wrong** | Prediction is the mechanism by which simulations teach. Paying only for correct predictions teaches children to guess safe. |
| Successful retrieval on a spaced review | highest rate | Retrieval practice is the best-evidenced effect in the field. |
| Completing a build/challenge | moderate | Consolidation. |
| Finding a Lab discovery | moderate | Rewards curiosity that is off the critical path. |
| Time spent | **zero** | Paying for time produces idling. |
| Watching an animation | **zero** | Paying for passivity produces passivity. |
| Streak length | **zero XP** (see 7.4) | Streaks are a retention mechanic, not a learning one; conflating them corrupts the XP signal. |

### 7.2 Specimens — collectibles that are content

Each lesson yields one **Specimen**: a card of the thing the child just operated (a mitochondrion, a ribosome, a phage). A specimen is not a cosmetic token — it is a functional object. Collected specimens appear in the Lab as usable parts, and in later modules as available components. Collecting a ribosome in World 1 is why you can build a protein in World 2. This makes the collection *mechanically* motivating rather than decoratively motivating, and it makes the curriculum's dependency graph visible as an inventory.

### 7.3 Spaced retrieval — the engine, not a feature

A lightweight SM-2-style scheduler over "concept nodes," one or two per lesson. Reviews surface on the Atlas as a small number of quick retrieval beats (each ≤ 20 seconds, each *interactive* rather than multiple-choice where possible — reassembling a membrane is a better retrieval cue than picking option C). Corrective feedback is immediate and shows the mechanism, not just the answer, because feedback is what amplifies the retrieval effect.

Intervals: 1 day, 3 days, 7 days, 16 days, 35 days, adjusted by performance. Capped at 5 due reviews per session — a child who has been away for a month should meet a manageable pile, not a punishment.

### 7.4 Streaks and badges — deliberately gentle

Streaks are counted in **days a child learned something**, are never shown as a number that can be lost dramatically, and have a built-in two-day grace. There is no streak-freeze economy, no push notification urging return, and no shame state. The retention gain from aggressive streak mechanics is real, and it is being knowingly declined: this product will be used by seven-year-olds and building compulsion loops into it is not defensible.

Badges are **evidence of mastery**, awarded on retrieval performance over time rather than on completion. "Finished the Cells module" is not a badge. "Explained the membrane correctly three weeks after learning it" is.

### 7.5 Levels and progression

Ranks are per-world, not global, so a child deep in Bodies is not made to feel behind in Frontier. The Atlas visibly fills in — a world's colour saturates as its modules complete — which gives progress a spatial form rather than a bar.

---

## 8. Technical architecture

### 8.1 Stack decision, via the Ponytail ladder

Applied honestly, rung by rung:

- **Does the app need a framework?** No. There is one moderately complex state object (progress) and a set of largely independent simulations that own their own local state. Component-level reactivity solves a problem this app does not have. **Skipped: React/Vue/Svelte.**
- **Does it need a build step?** Almost not. ES modules load natively; CSS custom properties do the theming; `<template>` does the templating. A build step is required for exactly two things: font subsetting and generating the service-worker precache manifest. That is a ~40-line Node script run on release, not a bundler. **Skipped: Vite/Rollup in development.** Dev is a static file server and a hard refresh.
- **Does it need GSAP?** The brief permits it "only for educational animations." The Web Animations API plus CSS transitions covers everything in §11's four legitimate animation roles, including staggered reveals and shared-element transitions (via `ViewTransition` where supported, WAAPI fallback elsewhere). **Skipped: GSAP, ≈ 30KB gz saved.** Reopen only if a specific lesson's choreography demonstrably cannot be expressed in WAAPI — a real possibility for a timeline-scrubbed mechanism animation, and the decision is deferred to the lesson that needs it rather than made speculatively now.
- **Does it need Three.js?** Not for Cells. A cell interior reads *better* in stylised 2D SVG than in a dim 3D scene a child must orbit. **Deferred**; the first genuine candidate is protein folding in World 2, at which point it is lazy-loaded per-lesson and nowhere near the initial bundle.
- **Does it need Lottie?** No. Every animation in scope is either CSS, WAAPI on SVG, or canvas simulation. **Skipped, ≈ 250KB saved.**

**Resulting dependency count for v1: zero runtime dependencies.**

### 8.2 Rendering: SVG for anatomy, Canvas for populations

The dividing line is explicit so it stops being re-litigated per lesson: **SVG when the child must be able to touch, name, or inspect individual parts** (organelles, organs, DNA bases — these need to be DOM nodes with `aria-label`s and hit areas). **Canvas when there are more than ~150 moving things and none of them individually matter** (molecules diffusing, bacterial populations, particles). A lesson may use both, layered.

### 8.3 Components

Native custom elements in **light DOM** (no shadow DOM), so global design tokens and the level system apply without piercing anything. Roughly a dozen elements exist only where behaviour is genuinely needed; everything else is a CSS class on plain HTML.

| Element | Responsibility |
|---|---|
| `<fp-stage>` | One stage of the lesson flow; owns advance/back and completion signalling |
| `<fp-sim>` | Base class for simulations: lifecycle, reset, parameter binding, snapshot for reduced-motion |
| `<fp-slider>` | Labelled parameter control, large hit area, keyboard + live value readout |
| `<fp-placeable>` / `<fp-slot>` | The tap-tap / drag / keyboard placement primitive from §1.2 |
| `<fp-predict>` | Prediction capture before a sim runs; renders the child's prediction back beside the result |
| `<fp-reveal>` | Progressive disclosure of explanation, gated on an action |
| `<fp-quiz>` | Retrieval beat with immediate mechanism-showing feedback |
| `<fp-tutor>` | Sprout — non-modal, dismissible, focus-safe |
| `<fp-specimen>` | Collectible card, also the Lab inventory item |
| `<fp-progress>` | World/module fill state |

Everything else — buttons, cards, panels, headings, badges — is CSS. A `<fp-button>` that wraps `<button>` to add a class is the kind of abstraction that looks tidy and costs a decade.

### 8.4 Folder structure

```
life-sciences/
├─ index.html               # single entry; app shell only
├─ manifest.webmanifest
├─ sw.js                    # generated precache list, runtime cache-first
├─ docs/
│  ├─ PHASE-1-BLUEPRINT.md  # this file
│  └─ DECISIONS.md          # running ADR log, one entry per reversal
├─ css/
│  ├─ tokens.css            # tier 1-3 colour, type, space, motion, level scaling
│  ├─ base.css              # reset, typography, focus, reduced-motion
│  ├─ components.css        # the CSS-only components
│  └─ worlds.css            # the six world hue ramps
├─ js/
│  ├─ app.js                # router + boot, ~120 lines
│  ├─ state.js              # progress object, persistence, change events
│  ├─ scheduler.js          # spaced retrieval
│  ├─ tutor.js              # Socratic engine
│  ├─ level.js              # level inference + switching
│  ├─ components/           # the custom elements above
│  └─ sims/                 # one file per simulation, each default-exporting an fp-sim
├─ content/
│  ├─ curriculum.json       # worlds, modules, dependency graph
│  └─ cells/
│     ├─ 01-city-in-a-speck.json
│     └─ ...                # one file per lesson
├─ assets/
│  ├─ fonts/                # subsetted woff2
│  └─ sprite.svg            # single symbol sprite, inlined at build
└─ tools/
   └─ build.mjs             # font subset + sw manifest + content lint. ~40 lines.
```

### 8.5 State management

One module. No store library, no observable framework, no immutability discipline.

```
state.js exports:
  progress        — plain object: { level, xp, worlds{}, concepts{}, specimens[], streak }
  update(fn)      — mutate, persist (debounced 500ms), dispatch document event 'fp:change'
  subscribe(fn)   — thin wrapper over addEventListener
```

Persistence is `localStorage` with a schema `version` field and a migration function that runs on load — added now, when it costs four lines, rather than after the first child loses a month of progress. Simulation state is deliberately *not* in here; a simulation owns its own transient state and reports only outcomes. Putting sim state in global state is the mistake that turns a 200-line app into a 2000-line one.

### 8.6 Lesson content format — how four levels cost 1.4×, not 4×

The critical decision for the "all four levels" commitment. A lesson is **one** JSON file describing **one** sequence of stages. Divergence between levels happens at three narrow points only:

1. **Text nodes carry up to four variants.** `{"t": ["...L1...", "...L2...", "...L3...", "...L4..."]}`. Missing variants fall back to the nearest lower level, so a lesson can ship with two variants and refine later.
2. **Simulations take a level-indexed parameter set.** Same code, different starting complexity: L1's membrane has 2 molecule types, L4's has 6.
3. **Stages carry a `levels` filter.** A stage may be omitted for L1 and present for L3+ — this is how "Engineering Inspiration" appears for older children and is quietly skipped for five-year-olds without a second lesson file existing.

Simulation code, layout, assets and interaction logic are shared across all four levels with zero duplication. A content lint in `tools/build.mjs` fails the build on: a missing L1 variant, an L1 stage with more than one simultaneous action, or any text node whose L1 variant exceeds a word-count ceiling.

---

## 9. AI tutor — "Sprout"

Rule-based, offline, deterministic, zero cost, zero backend, no data leaves the device. Behind a single async interface (`ask(context) → Promise<TutorTurn>`) so that a live model can be substituted later without touching a call site.

**It never gives answers.** The engine is a hint ladder attached to each lesson stage, escalating only on repeated failure, and it is a *question generator* first:

| Rung | Form | Example (membrane lesson) |
|---|---|---|
| 0 | Notice | "Something changed when you did that. Did you see what?" |
| 1 | Focus | "Watch just the blue ones this time." |
| 2 | Compare | "The blue ones got through. The red ones didn't. What's different about them?" |
| 3 | Analogy | "A door that only lets some people through — where else have you seen that?" |
| 4 | Partial | "Size matters here. What else might?" |
| 5 | Consolidate | Names the concept, then immediately asks the child to apply it once. |

Rungs 0–2 are the whole product for most children. Rung 5 is reached only after genuine struggle and is the *only* rung that states a fact.

Three behaviours make it feel adaptive without any model:

- **It quotes the child back.** When a child makes a prediction via `<fp-predict>`, the consolidation stage renders their own words next to the result. This is the meta-analysis's highest-value feature (instruction building on student-generated solutions, g = 0.56) implemented as string interpolation.
- **It celebrates wrong predictions explicitly.** "Good — you thought X, and it did Y. That difference is the whole lesson." A tutor that only praises correctness teaches children to stop predicting.
- **Its register is level-scaled** from the same `data-level` source as everything else.

Total estimated size: **~200 lines plus authored hint ladders in the lesson JSON.**

---

## 10. Accessibility strategy

WCAG 2.2 AA is the floor, not the goal, because the standard was not written with five-year-olds in mind.

- **Targets** per §6.4, up to 72px at L1 — well beyond AA's 24px.
- **Every drag has a tap-tap and a keyboard path** through the same state machine (§1.2). This is the single most important accessibility decision in the document and it exists because of developmental evidence, not compliance.
- **Colour is never the only channel.** Every state carries icon + text. Non-negotiable in a subject where diagrams are colour-coded by convention.
- **Focus is visible and never removed**, with a 3px offset ring that survives the claymorphic shadows.
- **Simulations are described.** Every `<fp-sim>` must implement `describe()` returning a live-region sentence updated on meaningful state change ("3 of 5 molecules have crossed; the cell is stable"). A simulation that cannot describe itself is not finished. This is what makes the product usable non-visually and it is cheap if required from lesson one and ruinous if retrofitted at lesson forty.
- **Reading support**: level-scaled type and line length, the Atkinson Hyperlegible toggle, and optional read-aloud via the native `SpeechSynthesis` API — zero bytes, works offline on all target platforms, and it is what makes L1 usable by a pre-reader.
- **No time pressure by default.** Timers exist only in explicitly-labelled challenge modes and can be switched off globally.
- **Reduced motion is handled as substitution, not removal** (§11.3).

---

## 11. Animation strategy

The brief's rule — *every animation must teach something* — is operationalised as four permitted roles. An animation that cannot be assigned one of these four is deleted in review.

1. **Causal** — shows a mechanism unfolding in time. The only kind that teaches directly. Must be scrubbable or repeatable; a mechanism a child cannot replay is a mechanism they saw once.
2. **Spatial** — shows where the child went. Shared-element transitions between Atlas, module and lesson so the map stays coherent.
3. **State** — confirms an action registered, within 100ms. The claymorphic press.
4. **Attention** — directs the eye to the one thing that changed, once, briefly.

**Not permitted:** decorative loops, entrance animations on static content, parallax, anything that delays interactivity, and any animation over 400ms that the child did not initiate.

**11.3 Reduced motion.** `prefers-reduced-motion: reduce` removes roles 2, 3 and 4 entirely. Role 1 — causal animation — is *not* removed, because removing it removes the teaching. Instead it is **substituted**: continuous animation becomes a manually-advanced sequence of key states with a step control. The child still sees every stage of the mechanism, under their own control, with no involuntary motion. This is more work than `animation: none` and it is the difference between an accessible product and a compliant one.

---

## 12. Asset strategy

No raster images anywhere in v1. All illustration is SVG, authored as a single symbol sprite inlined into the shell at build time (one request, cacheable, styleable by CSS custom properties — which is how organelles inherit their world's hue for free). Icons from a Lucide/Heroicons subset, hand-picked, in the same sprite. **No emoji as icons, ever** — they render inconsistently across platforms, carry unpredictable cultural meaning, and are announced unhelpfully by screen readers.

Audio: none in v1 beyond the native speech synthesis. Sound design is a real delight lever and a real bandwidth and accessibility cost; it is deferred to a phase where it can be done properly rather than as three stock chimes.

---

## 13. Performance strategy

Targets are the brief's: Lighthouse ≥ 95 across all four categories. Budgets, enforced in CI as a build failure rather than a warning:

| Budget | Limit |
|---|---|
| Shell JS (parsed, gzipped) | ≤ 25KB |
| Shell CSS (gzipped) | ≤ 20KB |
| Fonts, preloaded (2 faces, 3 weights) | ≤ 35KB |
| Fonts, lazy (Atkinson, opt-in) | not counted against shell |
| Per-lesson JS (lazy) | ≤ 20KB |
| Runtime deps | 0 |
| Time to interactive, mid-tier mobile, cold | < 1.5s |
| CLS | < 0.05 |
| Sim frame budget | < 8ms (headroom to 16ms) |

Mechanisms: everything past the shell is a dynamic `import()` at route level; images do not exist to optimise; fonts are preloaded and subset; the service worker is cache-first with a versioned precache so a repeat visit is a zero-network start. Simulations use a single shared `requestAnimationFrame` loop rather than one per sim, and pause on `visibilitychange` and when scrolled out of view.

Automated checks in the release script: Lighthouse CI, a contrast validator over `tokens.css` (every foreground/background pair in both themes), the content lint from §8.6, and a bundle-size gate.

---

## 14. Deliberately not built

Stated so that each is a decision with an owner rather than an oversight, and so a future session does not "helpfully" add them back.

| Cut | Add when |
|---|---|
| React / Vue / Svelte | Never for this app's state shape; revisit only if lesson authoring becomes a multi-person concurrent workflow |
| Bundler in development | Module count exceeds ~80 or a real HTTP/1.1 deployment target appears |
| GSAP | A specific lesson's timeline provably exceeds WAAPI — decide at that lesson |
| Three.js | World 2 protein folding, lazy-loaded per-lesson |
| Lottie | Never; SVG + WAAPI covers it |
| Accounts, sync, backend | Multi-device continuity becomes a real user request |
| Leaderboards, social | Never (child safety) |
| Aggressive streak mechanics | Never (see §7.4) |
| Sound design | A phase where it gets a proper pass |
| Levels 1 and 4 *content* refinement for the flagship module | Cells ships at L2/L3 fidelity first, then L1 and L4 variants are added into the same files — the format already holds the slots |

That last row is the honest reading of "all four levels from day one": the *system* supports four levels from day one and every lesson file has four slots. The Cells module will be authored L2 and L3 first, then filled downward and upward, because writing for a five-year-old and a sixteen-year-old simultaneously before either has been tested against a real child is how you get four mediocre variants instead of two good ones and two informed ones.

---

## 15. Open risks

1. **The membrane simulation is the project's technical bet.** If diffusion cannot be made both scientifically honest and legible to an eight-year-old, the whole "operate the mechanism" thesis needs re-examining. This is why it is built second, not fortieth.
2. **Level inference from a single non-verbal question may be wrong often.** Mitigation is the three-lesson performance nudge, but this needs real-child testing early.
3. **Authoring load is the actual scaling constraint**, not code. 25 modules × ~5 lessons × 4 level variants is a content problem no architecture solves. The format in §8.6 reduces it; it does not eliminate it. A realistic v2 conversation is about an authoring tool, not more features.
4. **Zero-dependency is a commitment that erodes.** The ADR log in `docs/DECISIONS.md` exists to make each erosion visible.

---

## 16. Phase 1 close-out

**Completed.** Evidence review with three findings that materially changed the design; product vision and non-goals; information architecture; 25-module curriculum map with dependency graph and flagship module selection; five user journeys; design system with the three tool-output corrections argued; the level-scaling token mechanism; gamification economy aligned to learning behaviours; zero-dependency technical architecture with every rejection justified by the Ponytail ladder; component inventory; folder structure; state model; lesson content format that makes four age levels affordable; rule-based Socratic tutor design; accessibility, animation, asset and performance strategies with enforceable budgets; explicit cut list; open risks.

**Why it is designed this way, in one line each.** Pedagogy forks by age because the evidence says explore-first reverses sign at ages 7–11. Adaptation lives in CSS custom properties because a presentation problem solved in JavaScript becomes four codebases. Content carries level variants rather than level files because that is the difference between 1.4× and 4× authoring cost. The XP economy pays for prediction and retrieval because whatever you pay for is what you get. There are no runtime dependencies because every one of them was tested against the ladder and none of them held.

**Consistency checks actually run against this document,** rather than asserted: the curriculum map was diffed against the brief's 25 topics (exact match, no gaps or duplicates); every colour pair in the generated palette was put through a WCAG contrast calculation, and three failures were found and are documented in §6.2 rather than inherited; the L1 touch target was converted back to physical units against the NN/g guideline and corrected upward from 72px to 76px; the font budget in §13 was reconciled with the actual face list in §6.3 after the two disagreed. The remaining unverifiable claims are the performance budgets in §13, which are estimates until Phase 2 produces a real shell to measure — they are stated as gates so that reality corrects them loudly.

**Potential improvements not taken now.** An authoring tool for lesson JSON (deferred until the format has survived five real lessons). A teacher/parent mode with real reporting. Sound design. Multi-device sync. Live-model tutoring behind the existing interface.

**Next phase — Phase 2, Site Architecture.** The app shell, router, `state.js` with its migration path, `curriculum.json` encoding the dependency graph above, the Atlas screen as a real navigable surface, and the service worker — sized to prove the whole navigation model works end to end with zero lesson content in it. Roughly 400 lines total. It does not start until this document is reviewed.

---

### Sources

- Sinha, T. & Kapur, M. (2021). *When Problem Solving Followed by Instruction Works: Evidence for Productive Failure.* Review of Educational Research — [journals.sagepub.com](https://journals.sagepub.com/doi/10.3102/00346543211019105)
- PhET Interactive Simulations — Research and design principles — [phet.colorado.edu/en/research](https://phet.colorado.edu/en/research)
- Podolefsky, Moore & Perkins. *Guiding without Feeling Guided: Implicit Scaffolding Through Interactive Simulation Design* — [researchgate.net](https://www.researchgate.net/publication/259131102_Guiding_without_Feeling_Guided_Implicit_Scaffolding_Through_Interactive_Simulation_Design)
- Nielsen Norman Group. *Design for Kids Based on Their Stage of Physical Development* — [nngroup.com](https://www.nngroup.com/articles/children-ux-physical-development/)
- Nielsen Norman Group. *Touch Targets on Touchscreens* — [nngroup.com](https://www.nngroup.com/articles/touch-target-size/)
- Nature Reviews Psychology. *The science of effective learning with spacing and retrieval practice* — [nature.com](https://www.nature.com/articles/s44159-022-00089-1)
