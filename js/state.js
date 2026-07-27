/* The only mutable global. One plain object, persisted to localStorage.
   No store library: this app has one state shape and no need for fine-grained
   reactivity. Simulations own their own transient state and report only
   outcomes here — putting sim state in this object is what turns a 200-line
   app into a 2000-line one. */

const KEY = "fp.progress";
export const VERSION = 2;

const fresh = () => ({
  version: VERSION,
  /* TWO dials, not one. Reading ability and conceptual maturity are
     independent: a dyslexic fourteen-year-old needs level-1 prose and level-4
     science, and one dial gave them a five-year-old's biology. */
  prose: null,            // reading register: type size, measure, wording
  content: null,          // conceptual depth: which stages, which parameters
  xp: 0,
  modules: {},            // id -> { lessonsDone: n, completedAt: iso }
  concepts: {},           // id -> { ease, due, reps } — spaced retrieval, phase 6
  specimens: [],          // collected specimen ids
  ledger: [],             // last 50 XP awards, so badges can read real history
  recent: [],             // last few lessons' retrieval accuracy, for the level nudge
  prefs: {},              // theme, face, motion overrides
});

/* Migrations run oldest-first on load. Written now, while it costs four lines,
   rather than after the first child loses a month of progress. Each entry
   upgrades FROM its key TO key+1. */
const migrations = {
  /* v1 -> v2: one `level` became `prose` + `content`, and `streak` went away
     with the counter nobody was shown. */
  1: (d) => {
    d.prose ??= d.level ?? null;
    d.content ??= d.level ?? null;
    delete d.level;
    delete d.streak;
    d.recent ??= [];
    return d;
  },
};

function migrate(data) {
  let v = data.version ?? 0;
  while (v < VERSION) {
    const step = migrations[v];
    if (!step) return fresh();          // no path forward: start clean, don't crash
    data = step(data);
    v = data.version = v + 1;
  }
  return data;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return migrate(JSON.parse(raw));
  } catch {
    return fresh();                     // corrupt or storage blocked: keep going
  }
}

export const progress = load();

let pending = 0;

/** Write now. Debouncing is an optimisation for chatty writes; it must never be
    the reason a child loses a finished lesson. */
export function flush() {
  clearTimeout(pending);
  pending = 0;
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* quota or private mode */ }
}

function persist() {
  clearTimeout(pending);
  pending = setTimeout(flush, 500);
}

/* The tab can go away between a write and the debounce firing — closing it,
   switching apps on a phone, the OS reclaiming a background tab. pagehide is
   the last reliable moment on every platform; visibilitychange covers mobile,
   where pagehide is not guaranteed to run. */
if (typeof addEventListener === "function") {
  addEventListener("pagehide", () => { if (pending) flush(); });
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pending) flush(); });
}

/** Mutate, persist, announce. `fn` receives the live object. */
export function update(fn) {
  fn(progress);
  persist();
  document.dispatchEvent(new CustomEvent("fp:change"));
}

/** Thin wrapper so call sites never touch the event name. */
export function subscribe(fn) {
  document.addEventListener("fp:change", fn);
  return () => document.removeEventListener("fp:change", fn);
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  Object.assign(progress, fresh());
  update(() => {});
}

/* The streak is gone. It was built carefully, shown to nobody's benefit, and
   read by nothing — not one badge, not one screen. A retention mechanic in a
   product with no retention data is a guess wearing a number. If a real child
   ever asks where their streak went, that is the evidence to build it back on.
*/

/* XP is awarded only through reward.js, which owns the rate table and refuses
   to pay for anything not in it. There is deliberately no generic
   "add N points" function here — that is the hole an economy leaks through. */
