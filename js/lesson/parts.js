/* Which custom element each stage type needs.

   The lesson tier had the defect the sim tier already had fixed: view.js
   imported all four components statically, so a child playing a lesson with no
   build stage still downloaded the whole placement primitive — the largest of
   the four — and the budget summed a total no single lesson has ever cost. (D69)

   One map, in one file, because two consumers need it and they must not drift:
   the runner loads from it at run time, and the build measures the worst real
   lesson with it. A component missing from here fails the build rather than
   quietly escaping the budget. */

/* A stage type maps to the part that RENDERS it, and each part imports whatever
   custom element it needs. So the renderer and the element travel together and a
   lesson pays for neither unless it has that kind of stage. The stage types that
   nearly every lesson has live in view.js instead, because a separate module for
   something 110 lessons of 110 need is a second gzip stream for no benefit. */
export const PART_OF = Object.freeze({
  build: "build",      // 52 lessons of 110, and the largest part by far
  slider: "slider",    // 33
  sim: "sim",          // 30
  weigh: "weigh",      // 10
});

/** The renderers this child's path needs, fetched once before the first stage
    draws. Per-lesson rather than per-stage: another round trip mid-lesson would
    cost the child more than the few hundred bytes it saves. */
export async function loadParts(types) {
  const need = [...new Set([...types].map((t) => PART_OF[t]).filter(Boolean))];
  const mods = await Promise.all(need.map((name) => import(`./parts/${name}.js`)));
  return Object.assign({}, ...mods.map((m) => m.RENDER));
}

