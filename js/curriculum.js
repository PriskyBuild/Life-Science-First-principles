/* Reads content/curriculum.json and answers the two questions the Atlas asks:
   is this unlocked, and how far through it are we. Unlock rules live in the
   data, not here — this file only evaluates them. */

export let worlds = [];
export let authored = {};      // moduleId -> { lessonIndex: file }
const byId = new Map();       // moduleId -> { module, world }

export async function loadCurriculum() {
  const [res, auth] = await Promise.all([
    fetch("content/curriculum.json"),
    fetch("content/authored.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  if (!res.ok) throw new Error(`curriculum ${res.status}`);
  authored = auth;
  const data = await res.json();
  worlds = data.worlds;
  byId.clear();
  for (const world of worlds) for (const m of world.modules) byId.set(m.id, { module: m, world });
  return worlds;
}

export const getModule = (id) => byId.get(id)?.module ?? null;
export const getWorldOf = (id) => byId.get(id)?.world ?? null;
export const getWorld = (id) => worlds.find((w) => w.id === id) ?? null;

export const isComplete = (id, p) => {
  const m = getModule(id);
  return !!m && (p.modules[id]?.lessonsDone ?? 0) >= m.lessons;
};

export const completedCount = (p) => [...byId.keys()].filter((id) => isComplete(id, p)).length;

/** A world opens when its own prerequisites are complete. Worlds 4 and 5 open
    on Cells alone so a child gripped by animals is not made to grind through
    biomolecules first — see blueprint 4. */
export function isWorldUnlocked(world, p) {
  if (!world.requires.every((id) => isComplete(id, p))) return false;
  if (world.requiresAnyCompleted && completedCount(p) < world.requiresAnyCompleted) return false;
  return true;
}

export function isModuleUnlocked(id, p) {
  const entry = byId.get(id);
  if (!entry) return false;
  if (!isWorldUnlocked(entry.world, p)) return false;
  return entry.module.requires.every((r) => isComplete(r, p));
}

/** 0..1 — drives the world's colour saturating on the Atlas. */
export function worldProgress(world, p) {
  const total = world.modules.reduce((n, m) => n + m.lessons, 0);
  const done = world.modules.reduce((n, m) => n + Math.min(p.modules[m.id]?.lessonsDone ?? 0, m.lessons), 0);
  return total ? done / total : 0;
}

/** Explains a lock in the child's terms. Returning the blocking titles rather
    than "locked" is the difference between a wall and a signpost. */
export function lockReason(id, p) {
  const entry = byId.get(id);
  if (!entry) return "";
  const { module, world } = entry;
  const missing = [...world.requires, ...module.requires]
    .filter((r) => !isComplete(r, p))
    .map((r) => getModule(r)?.title)
    .filter(Boolean);
  if (missing.length) return `Finish ${missing.join(" and ")} first`;
  if (world.requiresAnyCompleted) {
    const need = world.requiresAnyCompleted - completedCount(p);
    if (need > 0) return `Finish ${need} more module${need > 1 ? "s" : ""} anywhere first`;
  }
  return "";
}

export const writtenCount = (moduleId) => Object.keys(authored[moduleId] ?? {}).length;
export const isWritten = (moduleId, index) => authored[moduleId]?.[index] != null;
export const lessonFile = (moduleId, index) => authored[moduleId]?.[index] ?? null;

/** A world is only shown once something in it can actually be played. The
    Atlas used to promise twenty-five modules and deliver one, which reads as
    abandoned rather than early. */
export const worldHasContent = (world) => world.modules.some((m) => writtenCount(m.id) > 0);

/** Having content is not enough — the child has to be able to GET there.

    Authoring the Change world before the Code world produced a world with five
    real lessons in it sitting behind a gate that no amount of play could open,
    because the modules it waits on have nothing written in them yet. A locked
    island naming a prerequisite that does not exist is worse than no island: it
    is a door with no key, and the child has no way to know that.

    So reachability is computed against what is AUTHORED, not against the graph:
    play the unlock rules forward, treating a module as completable only if
    every one of its lessons exists. A world appears when playing could actually
    arrive at it, and it appears on its own the moment the path is written. */
const reachableWorlds = () => {
  const completable = new Set();
  const fully = (m) => writtenCount(m.id) >= m.lessons;
  for (let moved = true; moved; ) {
    moved = false;
    for (const w of worlds) {
      for (const m of w.modules) {
        if (completable.has(m.id) || !fully(m)) continue;
        const gate = w.requires.every((r) => completable.has(r)) &&
          (!w.requiresAnyCompleted || completable.size >= w.requiresAnyCompleted) &&
          m.requires.every((r) => completable.has(r));
        if (gate) { completable.add(m.id); moved = true; }
      }
    }
  }
  return new Set(worlds.filter((w) =>
    w.requires.every((r) => completable.has(r)) &&
    (!w.requiresAnyCompleted || completable.size >= w.requiresAnyCompleted)).map((w) => w.id));
};

export const playableWorlds = () => {
  const open = reachableWorlds();
  return worlds.filter((w) => worldHasContent(w) && open.has(w.id));
};
export const comingWorlds = () => {
  const drawn = new Set(playableWorlds().map((w) => w.id));
  return worlds.filter((w) => !drawn.has(w.id));
};

/** Every specimen in the curriculum, with the module it comes from. Flat so
    the Me screen can render the whole collection, collected or not — an empty
    slot you can see is what makes a collection feel like one. */
export function allSpecimens() {
  const out = [];
  for (const world of worlds) {
    for (const m of world.modules) {
      for (const specimen of m.specimens ?? []) {
        out.push({ specimen, module: { ...m, worldId: world.id } });
      }
    }
  }
  return out;
}

/** The single thing the Atlas should glow: the next unlocked, unfinished module. */
export function nextUp(p) {
  for (const world of worlds) {
    for (const m of world.modules) {
      if (!isComplete(m.id, p) && isModuleUnlocked(m.id, p)) return m.id;
    }
  }
  return null;
}
