/* THE SHAPE OF A LESSON, DECLARED ONCE.

   Until now the content rules lived as thirty-odd `if` statements inside
   build.mjs. Every one of them was there for a reason, and several were written
   the day something silently broke — but a pile of conditionals has three faults
   that a declared shape does not:

     1. NOBODY CAN READ IT. An author who wants to know what fields a check stage
        may carry had to read a validator. The answer should be a table.
     2. IT ONLY SAYS NO. Imperative checks reject what they happen to test for.
        They cannot say "this field does not exist", because they never enumerate
        the fields — which is how a Cyrillic key survived in a CRISPR lesson.
     3. A NEW STAGE TYPE MEANS NEW CODE. It should mean a new entry.

   So this file is data, and build.mjs walks it. Two consequences worth stating:
   unknown fields are now an error rather than silence, and the same declaration
   is the source for the JSDoc types in types.js — one shape, checked at build
   time and understood by the editor.

   WHAT IS NOT HERE. Rules that genuinely are not about shape live in `extra`
   next to their stage type: a build stage whose slots all constrain placement
   can only ever be won, and no table expresses that. Pretending everything is
   declarative would be a lie told for tidiness. (D79)

   ------------------------------------------------------------------ field kinds

   text        a plain string
   slug        a lowercase-hyphen identifier, the form every id in this project takes
   lessonId    "<module>/<NN>", and it must AGREE with this lesson's own module and
               index. It is a derived value that was being typed by hand, so a
               lesson could claim index 3 and call itself .../02 and nothing said so.
   int         a number, with optional min/max
   variants    an array of level variants, L1 first. [0] is required; shorter
               arrays fall back to the nearest lower level, which is how content
               can ship with two registers and gain the other two later.
   options     an array of answer strings, never level-variant — a child at level
               4 and a child at level 1 must be choosing between the same things
               or the concept id means nothing across levels.
   perOption   an array pinned to options.length, each entry a string or a
               variants array. This is how a wrong answer gets its own correction
               instead of everyone sharing one.
   list        an array of objects, each matching a declared sub-shape.
   any         checked by `extra`, not here.                                     */

/* The one thing this file imports, and it imports it from the app rather than
   redefining it: the build must refuse a naming term by exactly the rule the
   browser will use to find it. js/lesson/term.js imports nothing itself, which
   is what makes it readable from Node. */
import { termSpan } from "../js/lesson/term.js";

/* Counting is a build-only question, so it is asked here rather than shipped:
   a helper no browser calls has no business on a child's device. */
const termHits = (text, word) => {
  let n = 0;
  for (let cut, rest = text; (cut = termSpan(rest, word)); rest = cut[2]) n++;
  return n;
};

export const KINDS = new Set(["text", "slug", "lessonId", "int", "variants", "options",
  "perOption", "list", "any"]);

/* ------------------------------------------------------------------- lesson */

export const LESSON = {
  id:        { kind: "lessonId", required: true },
  module:    { kind: "slug", required: true },
  index:     { kind: "int", required: true, min: 0 },
  title:     { kind: "text", required: true },

  /* THE ONE SENTENCE THE LESSON EXISTS TO INSTALL. It was already being written
     — it is the first variant of the naming stage — but it was buried inside a
     render target, so nothing could read it. Declared, it becomes the thing the
     review beat quotes, the thing a parent scans the syllabus by, and the thing
     an author has to be able to state before writing seven stages around it.
     If you cannot write this sentence, the lesson does not have a point yet. */
  principle: { kind: "text", required: true, maxWords: 34 },

  specimen:  { kind: "slug" },
  stages:    { kind: "any", required: true },
};

/* -------------------------------------------------------------------- stages

   `levels` is legal on every stage: it restricts the stage to certain content
   levels. Declared once here rather than repeated nine times. */

const COMMON = { levels: { kind: "any" } };

export const STAGES = {

  hook: {
    ...COMMON,
    /* The renderer splits the hook at its first full stop and sets that as the
       heading, so the FIRST SENTENCE is what has to read — a long hook made of
       short sentences is fine. The limit is per level because the guard that
       tested only L1 left the other three unguarded for months. (D72) */
    t:   { kind: "variants", required: true, firstSentenceWords: [20, 25, 25, 25] },
    sub: { kind: "variants", required: true },
  },

  predict: {
    ...COMMON,
    concept:  { kind: "slug", required: true },
    question: { kind: "variants", required: true },
    options:  { kind: "options", required: true, min: 2 },
    outcome:  { kind: "text", required: true, oneOf: "options" },
    note:     { kind: "variants", required: true },
    /* Anticipatory, not corrective. A prediction is not a test and a wrong one is
       the point of the stage, so these say what to watch for rather than what was
       wrong: "You said the outside. Keep your eye on it." */
    fb:       { kind: "perOption" },
  },

  slider: {
    ...COMMON,
    guided:   { kind: "any", required: true },
    label:    { kind: "any", required: true },
    min:      { kind: "int", required: true },
    max:      { kind: "int", required: true },
    value:    { kind: "int", required: true },
    captions: { kind: "any", required: true },
    t:        { kind: "variants", required: true },
    after:    { kind: "variants", required: true },
  },

  sim: {
    ...COMMON,
    sim:           { kind: "slug", required: true, registered: "sims" },
    guided:        { kind: "any", required: true },
    t:             { kind: "variants", required: true },
    params:        { kind: "any", required: true },
    paramsByLevel: { kind: "any" },
    goal:          { kind: "any", required: true },
  },

  build: {
    ...COMMON,
    guided:      { kind: "any", required: true },
    t:           { kind: "variants", required: true },
    parts:       { kind: "any", required: true },
    slots:       { kind: "any", required: true },
    trials:      { kind: "any" },
    trialsTitle: { kind: "any" },
    win:         { kind: "any" },
    lose:        { kind: "any" },
  },

  /* THE ONE STAGE WHOSE JOB IS NAMING WAS THE ONE STAGE THAT DID NOT RECORD
     WHAT IT NAMED. Every check, weigh and predict carried a concept id; the
     naming carried a paragraph and nothing else. So nothing downstream could
     mark the moment a word was given, and the boxed keyword in the margin had
     no id to be.

     `term` is per level and it is not a decoration. The reading register does
     not merely reword the same name — it often withholds it. "Blood goes round
     in a loop" at L1 becomes "a closed circulation" at L2, because you do not
     begin with definitions. Measured across all 110 naming stages, only 28% use
     a word that survives all four levels, and reading the failures showed the
     pedagogy working rather than the authoring slipping. So an empty entry is
     legal and means "no name is given at this level yet", and the marker simply
     has nothing to sweep. (D87) */
  name: {
    ...COMMON,
    concept: { kind: "slug", required: true },
    t:       { kind: "variants", required: true },
    term:    { kind: "variants", required: true, mayBeEmpty: true },
    sub:     { kind: "variants", required: true },
  },

  check: {
    ...COMMON,
    concept: { kind: "slug", required: true },
    q:       { kind: "variants", required: true },
    options: { kind: "options", required: true, min: 2 },
    answer:  { kind: "int", required: true, indexInto: "options" },
    why:     { kind: "variants", required: true },
    /* ONE CORRECTION PER WRONG ANSWER. `why` explains the right answer and every
       child sees the same paragraph — so a child who answered "mice are greedy"
       and a child who answered "bigger stomachs for their size" are told the same
       thing, and neither is told what was wrong with what they actually thought.
       A wrong answer is evidence about a specific misconception and it is the
       most useful thing a child hands you all lesson. (D79) */
    fb:      { kind: "perOption" },
  },

  apply: {
    ...COMMON,
    kicker: { kind: "any", required: true },
    t:      { kind: "variants", required: true },
  },

  weigh: {
    ...COMMON,
    concept:  { kind: "slug", required: true },
    t:        { kind: "variants", required: true },
    evidence: { kind: "variants", required: true },
    ask:      { kind: "variants", required: true },
    /* At least two views, each attributed and each carrying its reasoning.
       "Labelled, not smuggled" is a property of the format, not a habit of the
       author, so the build is what enforces it. */
    views:    { kind: "list", required: true, min: 2, of: {
      who:      { kind: "text", required: true },
      claim:    { kind: "variants", required: true },
      because:  { kind: "variants", required: true },
      /* REQUIRED, and this is the whole design. A disagreement stated as two
         beliefs is a stand-off in which a child can only pick a side. Stated as
         two sets of EXPECTATIONS it becomes something a person can go and check.
         The renderer has always said `predicts` is the field that does the work;
         nothing made sure it was there. Now something does. */
      predicts: { kind: "variants", required: true },
    } },
  },
};

/* ------------------------------------------- rules that are not about shape */

export const EXTRA = {
  build(st, say) {
    const ids = new Set((st.parts ?? []).map((x) => x.id));
    if (!st.parts?.length || !st.slots?.length) return say("a build stage needs parts and slots");
    for (const slot of st.slots) {
      for (const a of String(slot.accepts ?? "").split(/\s+/).filter(Boolean)) {
        if (!ids.has(a)) say(`slot accepts "${a}", which is not one of the parts`);
      }
      // Every slot needs a right answer, whether or not placement is constrained.
      const correct = slot.correct ?? slot.accepts;
      if (!correct) say(`a slot needs "correct" (or "accepts") so the build can be marked`);
      else if (!ids.has(correct)) say(`slot's correct part "${correct}" is not one of the parts`);
    }
    // A boss whose slots all constrain placement can only ever be won.
    if (st.trials && st.slots.every((sl) => sl.accepts)) {
      say("every slot constrains what may be dropped, so a complete build is always "
        + "correct and the trials cannot fail");
    }
    // A trial that needs a part the child was never given is unwinnable.
    for (const t of st.trials ?? []) {
      for (const n of t.needs ?? []) if (!ids.has(n)) say(`trial "${t.name?.[0]}" needs "${n}", which is not a part`);
    }
  },

  sim(st, say, ctx) {
    if (st.sim && !ctx.sims.has(st.sim)) say(`no simulation named "${st.sim}" in js/sims/`);
  },

  /* THE GATE THAT MAKES THE MARKER A FACT RATHER THAN A HOPE. A term the
     renderer cannot find in the sentence is a highlight that silently does not
     happen — visible to nobody, reported by nothing, and exactly the failure
     this project keeps meeting. The same function the renderer uses is the one
     that answers here, so the build cannot pass on a match the browser will
     miss. Exactly one occurrence, because two is a question with no answer. */
  name(st, say) {
    const t = st.t ?? [], term = st.term ?? [];
    if (term.length > t.length) {
      say(`"term" has ${term.length} entries for ${t.length} levels of "t"`);
    }
    for (const [lv, word] of term.entries()) {
      if (!word.trim()) continue;                       // no name at this level yet
      const hits = termHits(t[lv], word);
      if (hits === 0) {
        say(`L${lv + 1} term "${word}" is not in that level's sentence, so the marker `
          + `would sweep nothing — it must appear there as a whole word`);
      } else if (hits > 1) {
        say(`L${lv + 1} term "${word}" appears ${hits} times, so there is no answer to `
          + `which one is the naming`);
      }
    }
  },
};

/* --------------------------------------------------------------- the walker

   One function, used by build.mjs. `say` reports a fault against the current
   location; `ctx` carries the things a lesson cannot know about itself — which
   simulations exist, which concepts its module declares. */

const words = (s) => String(s).trim().split(/\s+/).length;
const isSlug = (s) => typeof s === "string" && /^[a-z][a-z0-9-]*$/.test(s);

function field(name, spec, value, say, ctx, stage) {
  if (value === undefined || value === null) {
    if (spec.required) say(`"${name}" is required`);
    return;
  }
  switch (spec.kind) {
    case "text":
      if (typeof value !== "string" || !value.trim()) return say(`"${name}" must be a non-empty string`);
      if (spec.maxWords && words(value) > spec.maxWords) {
        say(`"${name}" is ${words(value)} words, which is over ${spec.maxWords} — it is meant to be one sentence`);
      }
      if (spec.oneOf && !(stage?.[spec.oneOf] ?? []).includes(value)) {
        say(`"${name}" is not one of the ${spec.oneOf}`);
      }
      break;

    case "lessonId": {
      const want = `${stage?.module}/${String((stage?.index ?? 0) + 1).padStart(2, "0")}`;
      if (value !== want) say(`"${name}" is "${value}" but module and index say it should be "${want}"`);
      break;
    }

    case "slug":
      if (!isSlug(value)) say(`"${name}" must be a lowercase-hyphen id, got ${JSON.stringify(value)}`);
      break;

    case "int":
      if (!Number.isInteger(value)) return say(`"${name}" must be a whole number`);
      if (spec.min !== undefined && value < spec.min) say(`"${name}" is below ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) say(`"${name}" is above ${spec.max}`);
      if (spec.indexInto && value >= (stage?.[spec.indexInto]?.length ?? 0)) {
        say(`"${name}" is not a valid index into ${spec.indexInto}`);
      }
      break;

    case "variants":
      if (!Array.isArray(value)) return say(`"${name}" must be an array of level variants`);
      if (value.some((v) => typeof v !== "string")) return say(`"${name}" must contain only strings`);
      /* `mayBeEmpty` exists for one field: a naming term the youngest register
         deliberately withholds. It still has to say something somewhere, or the
         field is a stage claiming to name nothing. */
      if (spec.mayBeEmpty) {
        if (!value.some((v) => v.trim())) say(`"${name}" is empty at every level`);
      } else if (!value[0]) {
        return say(`"${name}" has no L1 variant`);
      }
      if (spec.firstSentenceWords) {
        for (const [lv, variant] of value.entries()) {
          const first = String(variant).split(/(?<=[.!?])\s+/)[0];
          const max = spec.firstSentenceWords[lv] ?? spec.firstSentenceWords.at(-1);
          if (words(first) > max) {
            say(`L${lv + 1} opens with a ${words(first)}-word sentence (max ${max}) — the `
              + `renderer can only split at a full stop, so this one needs a hand`, "warn");
          }
        }
      }
      break;

    case "options":
      if (!Array.isArray(value)) return say(`"${name}" must be an array`);
      if (value.length < (spec.min ?? 2)) say(`"${name}" needs at least ${spec.min ?? 2} entries`);
      if (value.some((v) => typeof v !== "string" || !v.trim())) {
        say(`"${name}" must be plain strings — options are the same at every level, `
          + `or a concept id means nothing across levels`);
      }
      if (new Set(value).size !== value.length) say(`"${name}" repeats an option`);
      break;

    case "perOption": {
      const n = stage?.options?.length ?? 0;
      if (!Array.isArray(value)) return say(`"${name}" must be an array, one entry per option`);
      if (value.length !== n) {
        return say(`"${name}" has ${value.length} entries for ${n} options — every answer needs its own`);
      }
      for (const [i, v] of value.entries()) {
        const ok = typeof v === "string" ? v.trim() : Array.isArray(v) && typeof v[0] === "string" && v[0].trim();
        if (!ok) say(`"${name}"[${i}] is empty — a wrong answer with no correction teaches nothing`);
      }
      break;
    }

    case "list":
      if (!Array.isArray(value)) return say(`"${name}" must be an array`);
      if (spec.min && value.length < spec.min) {
        say(`"${name}" needs at least ${spec.min} entries, got ${value.length}`);
      }
      for (const [i, item] of value.entries()) {
        for (const [k, sub] of Object.entries(spec.of)) {
          field(`${name}[${i}].${k}`, sub, item?.[k], say, ctx, item);
        }
        for (const k of Object.keys(item ?? {})) {
          if (!spec.of[k]) say(`"${name}[${i}].${k}" is not a field this shape has`);
        }
      }
      break;

    case "any":
      break;

    default:
      say(`internal: unknown field kind "${spec.kind}" for "${name}"`);
  }
}

/** Walk one lesson against the declared shape. `report(message, level)` is
    called for every fault; level is "fail" unless stated. */
export function checkLesson(lesson, report, ctx) {
  const at = (where) => (msg, level = "fail") => report(`${where}: ${msg}`, level);

  for (const [k, spec] of Object.entries(LESSON)) {
    field(k, spec, lesson?.[k], at("lesson"), ctx, lesson);
  }
  for (const k of Object.keys(lesson ?? {})) {
    if (!LESSON[k]) report(`lesson: "${k}" is not a field a lesson has`, "fail");
  }

  if (!Array.isArray(lesson?.stages) || !lesson.stages.length) {
    return report("lesson: no stages", "fail");
  }

  for (const [i, st] of lesson.stages.entries()) {
    const say = at(`stage ${i}`);
    const shape = STAGES[st?.type];
    if (!shape) { say(`unknown stage type "${st?.type}"`); continue; }

    for (const [k, spec] of Object.entries(shape)) field(k, spec, st[k], say, ctx, st);

    for (const k of Object.keys(st)) {
      if (k === "type") continue;
      /* A stray key used to be silent: the renderer ignores what it does not
         know, so a typo'd field simply never appeared and nothing reported it.
         Now the shape enumerates the fields, so this is answerable. */
      if (!shape[k]) say(`"${k}" is not a field a ${st.type} stage has`);
      else if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)) say(`field name "${k}" is not a plain identifier`);
    }

    EXTRA[st.type]?.(st, say, ctx);
  }
}
