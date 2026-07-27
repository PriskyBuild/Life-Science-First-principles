/* Reads content/curriculum.json and answers the two questions the Atlas asks:
   is this unlocked, and how far through it are we. Unlock rules live in the
   data, not here — this file only evaluates them. */

export let worlds = [];
const byId = new Map();       // moduleId -> { module, world }

export async function loadCurriculum() {
  const res = await fetch("content/curriculum.json");
  if (!res.ok) throw new Error(`curriculum ${res.status}`);
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
