# Authoring a lesson

The lesson format is the product now. The engine is finished; twenty-four modules are not.
This is everything you need to write one, and nothing else.

A lesson is one JSON file at `content/<module>/<nn>-<slug>.json`. Run `node tools/build.mjs`
after writing one: it registers the lesson, extracts its review questions, and refuses the
build if anything below is wrong.

---

## The two dials, and what each one moves

Every child has **prose** and **content** set independently, 1 to 4.

| | Prose | Content |
|---|---|---|
| Means | how the words are written | how deep the science goes |
| Moves | which text variant, type size, line length | which stages appear, how complex a simulation starts |
| You author for it by | writing variants of a string | tagging a stage with `levels` |

They are separate because a dyslexic fourteen-year-old needs level-1 sentences and level-4
science. **Never write a stage that assumes both dials match.**

## Text variants: write two, not four

Every text field is an array. Index 0 is level 1, index 3 is level 4, and **missing variants
fall back downward** — so a two-element array serves all four levels, with 3 and 4 getting the
grown-up version.

```json
"t": [
  "A wall keeps everything out. But a cell has to eat.",
  "A barrier that excludes everything also excludes what you need."
]
```

Write two. Add the third and fourth only where the middle registers genuinely differ — a
fourteen-year-old and an eleven-year-old often want the same sentence. Four variants of
everything is roughly 2,000 sentences across the curriculum; two is 1,000, and the second
thousand can wait for evidence that anyone needs it.

**The level-1 variant is mandatory.** The build fails without it. A hook longer than 26 words
at level 1 also fails, because a sentence a five-year-old cannot finish is not a hook.

## The pedagogy fork

Sinha & Kapur's meta-analysis: explore-before-instruction is worth **g = 0.50 for ages 11–16**
and **g = −0.09 for ages 7–11**. It reverses sign in the middle of our audience. So a lesson
carries two tracks and each exploratory stage declares which content levels it is for:

```json
{ "type": "sim", "levels": [1, 2], "guided": true,  ... }
{ "type": "sim", "levels": [3, 4], "guided": false, ... }
```

**Guided (levels 1–2)** — the caption names what the child is seeing *as* they see it, and the
naming stage follows immediately. Rails on, discovery real.

**Open (levels 3–4)** — predict, attempt, fail informatively, then consolidate. Free parameter
space. Let them build a wrong model and watch it break.

A stage with no `levels` is for everyone. The build walks all four levels and **fails if any of
them loses its hook, its exploration, its naming stage or its check** — a filter that strands a
level is the easiest mistake to make here and the hardest to notice.

---

## Stage types

### `hook` — the question, never a definition
```json
{ "type": "hook", "t": [...], "sub": [...] }
```
Opens the lesson with something worth wondering about. `sub` is the small line under it.

### `predict` — commit before you look
```json
{ "type": "predict", "concept": "membrane-selectivity",
  "question": [...], "options": ["A", "B", "C"], "outcome": "B", "note": [...] }
```
Pays XP **whether the child is right or wrong**, and echoes their own words back beside the
result. That echo is the highest-value feature in the meta-analysis (g = 0.56): instruction
that visibly builds on the learner's own answer. `outcome` must be one of `options`.

### `slider` — a parameter with captions
```json
{ "type": "slider", "levels": [1,2], "guided": true, "label": "How close are we?",
  "min": 0, "max": 4, "value": 0, "captions": ["...", "..."], "t": [...], "after": [...] }
```
`captions[n]` shows at each value. `after` appears once they reach `max`. One caption per step,
no gaps.

### `sim` — a real simulation
```json
{ "type": "sim", "sim": "membrane", "levels": [1,2], "guided": true, "t": [...],
  "params": { "kinds": 3, "pore": 2 },
  "paramsByLevel": { "1": { "kinds": 2 } },
  "goal": [...] }
```
`sim` must name a file in `js/sims/`. `paramsByLevel` is keyed by **content** level and merges
over `params`. `goal` is what appears when the objective is met. Every sim stage also offers
"I have had enough of this one" — the objective is worth trying for, not a toll gate.

### `build` — placement, and the boss
```json
{ "type": "build", "t": [...],
  "parts": [{ "id": "membrane", "label": "Membrane" }],
  "slots": [{ "correct": "membrane", "label": [...] }],
  "trials": [{ "name": [...], "needs": ["membrane"], "pass": [...], "fail": [...] }],
  "win": [...], "lose": [...] }
```

Two different jobs, and the difference matters:

- **`accepts` on a slot constrains what may be dropped.** Right for a guided build, where the
  point is learning which name goes where. A wrong placement is simply refused.
- **`correct` records the right answer without constraining.** Any part fits any slot, so
  misassignment is possible and gradeable.

**If a stage has `trials`, its slots must NOT all use `accepts`** — the build enforces this.
A boss whose every slot constrains placement can only ever be won, which makes the stress test
a cutscene. `trials[].needs` lists the parts that must be *correctly placed* for that trial to
pass; each failure names what was missing, and the child can fix it in place and re-test.

### `weigh` — two attributed readings of the same evidence
```json
{ "type": "weigh", "levels": [3, 4], "concept": "fossil-order",
  "t": [...],
  "evidence": ["what nobody disputes"],
  "views": [
    { "who": "Most geologists", "claim": [...], "because": [...], "predicts": [...] },
    { "who": "Flood geologists (Answers in Genesis)", "claim": [...], "because": [...], "predicts": [...] }
  ],
  "ask": ["the question you leave them with"] }
```

For the places where the evidence is agreed and the reading of it is not. Six lessons in this
curriculum are like that; most are not, and this stage does not belong in them.

**`who` is mandatory and the build enforces it.** This stage type exists so that an
interpretation cannot be asserted without saying whose it is. The page never speaks in its own
voice here — every sentence belongs to somebody named.

**`because` is mandatory too.** A view without its reasoning is a label, and labelling a position
you disagree with is how a strawman gets built by accident.

**`predicts` is the field that does the work.** A disagreement written as two beliefs is a
stand-off and a child can only pick a side. Written as two sets of expectations it becomes
something a person can go and check. Give both sides a real one.

Both views must be opened before Next unlocks. The two cards are styled identically and there is
a test asserting it — a heavier card is an argument made in CSS, and children read visual weight
before they read words. `ask` closes the stage with an open question and deliberately nowhere to
type; not everything worth asking is a thing to be marked.

Put contested stages on `levels: [3, 4]`. A six-year-old should be finding out what a fossil is,
not adjudicating assumptions in radiometric dating. Levels 1–2 get the observation without the
dispute.

### `name` — the concept, finally
```json
{ "type": "name", "t": [...], "sub": [...] }
```
The only stage that hands over a term. On the guided track it follows the exploration
immediately; on the open track the child has usually got there first.

### `apply` — why anyone should care
```json
{ "type": "apply", "kicker": "Why this matters", "t": [...] }
```
Medicine, sport, agriculture, climate. One short beat, not a text panel.

### `check` — retrieval, with mechanism-showing feedback
```json
{ "type": "check", "concept": "diffusion-is-passive",
  "q": [...], "options": [...], "answer": 0, "why": [...] }
```
`concept` is required — it is the key the spaced-retrieval scheduler uses, and the build lifts
the first check for each concept into `content/reviews.json` as its review beat.

**`why` shows the mechanism and is shown for right answers too.** "Correct!" is applause, not
corrective feedback, and corrective feedback is what amplifies the testing effect. A child who
guessed right still needs to know why.

---

## Concepts

Name them in `kebab-case` and reuse them across lessons — `cell-is-a-system` is tested in
lessons 1, 4 and 5, and that is deliberate. Every concept in a finished lesson is seeded into
the retrieval schedule at 1, 3, 7, 16 and 35 days.

Two or three concepts per lesson. A lesson testing six concepts is two lessons.

**A concept must be declared in its module's `concepts` list in `curriculum.json`.** The build
fails otherwise. This is deliberate friction: a typo'd concept id used to create an orphan review
beat that no lesson ever seeded and no child ever saw again, and nothing anywhere reported it.
Adding a concept is one line; adding it on purpose is the point.

## Writing a new simulation

`docs/DECISIONS.md` D45–D48 is the reasoning. The contract in short:

| | |
|---|---|
| `once()` | Mount-lifetime state. `reset()` never touches it. Cross-run history and the child's own switch settings go here — otherwise "run it twice and compare" cannot be written. |
| `setup()` | Run-lifetime state. Rebuilt by every reset. |
| `describe()` | Mandatory. Pass an array to `say()` and it resolves for the reading level, exactly like `pick()` does in a lesson. |
| `succeed({ say })` | Means *the lesson may advance*. It does **not** end the simulation, and must not — the moment a child solves something is the moment they most want to keep poking. `say` is the sim's own account of what this child did, shown under the authored `goal`. |
| `get autoplay()` | Return `false` for an **episodic** sim — one whose state advances when the child asks (generations, heartbeats, outbreaks) rather than sixty times a second. Borrow the loop for the reveal with `resume()`, hand it back with `settle()`. |

An episodic sim needs **no reduced-motion substitution**, because the model advances on the click
and the animation only reveals what already happened. Both motion modes drive the identical
control — so put that control in `.sim-controls`, never in `.teach-play`, which reduced motion
hides. There is a test for that, because it was got wrong first time.

## Specimens

```json
"specimen": "membrane"
```
Banked when the lesson finishes. Define it in `curriculum.json` under the module, with an
`unlocks` line naming what it lets the child build later — that line is the whole difference
between an inventory and a sticker book.

## Sprout's hints

`content/hints.json` holds generic ladders per stage *type*, six rungs each, four variants.
They apply everywhere and you do not need to write any. Override per stage only where a generic
hint genuinely falls short:

```json
"hints": [["notice…"], ["focus…"], ["compare…"], ["analogy…"], ["partial…"], ["consolidate…"]]
```

**Rungs 0–4 must not contain the answer.** Only rung 5 states a fact, and only after real
struggle. There is a test that checks this.

---

## Before you commit

```bash
node tools/build.mjs   # lints the lesson, regenerates the indexes, enforces budgets
node tools/verify.mjs  # plays every lesson at all four levels in a real browser
```

The suite walks each lesson to completion at every level. If your lesson cannot be finished at
level 1, you will know in four minutes rather than from a seven-year-old.

## The three things reviewers will send back

1. **A hook that is a definition.** "A cell is the basic unit of life" is not a hook. "What if a
   whole city had to fit inside something smaller than a grain of sand?" is.
2. **A `why` that says the answer instead of the mechanism.** "Because it is too big" is the
   answer. "The holes were big enough for food and too small for poison — nothing pushed
   anything, the size did all the work" is the mechanism.
3. **Level-1 prose that is level-2 prose with shorter words.** Level 1 is not a translation. It
   is a different sentence about the same thing, and usually a shorter one about less.
