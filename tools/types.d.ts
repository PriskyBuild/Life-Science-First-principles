/* THE CONTENT SHAPE, AS TYPES.

   The same declaration as tools/schema.mjs, in the form an editor understands.
   schema.mjs is the enforcer — it runs in the build and rejects a lesson that
   does not match. This file is the describer: it makes the shape visible while
   you are writing, before the build has an opinion.

   They are two views of one thing and they must not drift, so the build asserts
   that every stage type declared here has a matching entry in the schema. A
   second source of truth that nothing compares is worse than no second source.

   Not shipped, and not shippable — a .d.ts emits nothing and lives in tools/,
   outside the tree the service worker precaches. TypeScript is a dev dependency
   used as a reader, never as a compiler. (D79) */

/** Text that varies by reading level, level 1 first. Shorter arrays fall back to
    the nearest lower level, so content can ship with two registers and gain the
    other two later without a schema change. */
type Variants = string[];

/** One correction per answer, pinned to options.length by the schema. A wrong
    answer is evidence about a specific misconception; this is where that gets
    used instead of everyone sharing one paragraph. */
type PerOption = (string | Variants)[];

interface StageBase {
  type: string;
  /** Restricts the stage to these content levels (1–4). */
  levels?: number[];
}

interface HookStage extends StageBase {
  type: "hook";
  /** The renderer sets the FIRST SENTENCE as the heading, so that is what is
      length-limited: 20 words at level 1, 25 above it. */
  t: Variants;
  sub: Variants;
}

interface PredictStage extends StageBase {
  type: "predict";
  concept: string;
  question: Variants;
  /** Never level-variant: every level chooses between the same things, or the
      concept id means nothing across levels. */
  options: string[];
  /** Must be one of `options`, by text rather than index. */
  outcome: string;
  note: Variants;
  /** Anticipatory, not corrective — a wrong prediction is the point of the stage. */
  fb?: PerOption;
}

interface SliderStage extends StageBase {
  type: "slider";
  guided: unknown; label: unknown; captions: unknown;
  min: number; max: number; value: number;
  t: Variants; after: Variants;
}

interface SimStage extends StageBase {
  type: "sim";
  /** Must name a module in js/sims/. */
  sim: string;
  guided: unknown; params: unknown; paramsByLevel?: unknown; goal: unknown;
  t: Variants;
}

interface BuildStage extends StageBase {
  type: "build";
  guided: unknown; parts: unknown; slots: unknown;
  trials?: unknown; trialsTitle?: unknown; win?: unknown; lose?: unknown;
  t: Variants;
}

interface NameStage extends StageBase {
  type: "name";
  t: Variants;
  sub: Variants;
}

interface CheckStage extends StageBase {
  type: "check";
  concept: string;
  q: Variants;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Explains the right answer. Everyone sees it. */
  why: Variants;
  /** Explains what was wrong with the answer this child actually gave. */
  fb?: PerOption;
}

interface ApplyStage extends StageBase {
  type: "apply";
  kicker: unknown;
  t: Variants;
}

/** One attributed reading of the evidence. `predicts` is the field that does the
    work: a disagreement stated as two beliefs is a stand-off in which a child can
    only pick a side, and stated as two sets of expectations it becomes something
    a person can go and check. */
interface WeighView {
  who: string;
  claim: Variants;
  because: Variants;
  predicts: Variants;
}

interface WeighStage extends StageBase {
  type: "weigh";
  concept: string;
  t: Variants;
  evidence: Variants;
  ask: Variants;
  /** At least two. One view is an assertion, not a weighing. */
  views: WeighView[];
}

type Stage =
  | HookStage | PredictStage | SliderStage | SimStage | BuildStage
  | NameStage | CheckStage | ApplyStage | WeighStage;

interface Lesson {
  /** "<module>/<NN>", and it must agree with `module` and `index`. */
  id: string;
  module: string;
  index: number;
  title: string;
  /** The one sentence the lesson exists to install. If you cannot write it, the
      lesson does not have a point yet. */
  principle: string;
  specimen?: string;
  stages: Stage[];
}

/** What is kept on the device, and the only thing there is to export. Versioned
    from the start, with a migration per step, so the shape can change without
    wiping a child's year. */
interface Progress {
  version: number;
  /** Reading register and conceptual depth, set independently. */
  prose: number | null;
  content: number | null;
  xp: number;
  modules: Record<string, { lessonsDone: number; completedAt?: string }>;
  /** Spaced retrieval, one entry per concept a check has seeded. */
  concepts: Record<string, { ease: number; due: number; reps: number; step?: number; lapses?: number }>;
  specimens: string[];
  ledger: unknown[];
  recent: unknown[];
  prefs: Record<string, string | null>;
}
