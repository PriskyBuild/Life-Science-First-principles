/* The icon set. Path data in a module rather than an SVG sprite:
   a sprite needs either a build step that inlines it into index.html (breaking
   zero-build development) or an external <use href> (which Safari does not
   support), and buys nothing at this size. Phase 8 lesson modules import only
   the icons they use, so lazily-loaded lessons do not drag the whole set in.

   Deviates from blueprint 12 deliberately — see docs/DECISIONS.md D9.

   Rule: every icon here is decorative and paired with a text label. Nothing in
   this product is an icon-only control, because an icon-only control is a
   guessing game for a five-year-old. */

export const ICONS = {
  done: "M5 13l4 4L19 7",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z",
  next: "M5 12h13M13 6l6 6-6 6",
  back: "M19 12H6M11 6l-6 6 6 6",
  // speaker with two arcs / speaker with a bar: read-aloud on, and stop
  read: "M4 9v6h3l5 4V5L7 9H4zM16 9a4 4 0 010 6M19 6a8 8 0 010 12",
  stop: "M4 9v6h3l5 4V5L7 9H4zM17 10l4 4M21 10l-4 4",
};

const NS = "http://www.w3.org/2000/svg";

/** Decorative by contract: aria-hidden, not focusable, inherits currentColor
    and em-based sizing from .icon in base.css. */
/** One place that builds an SVG, so the specimen drawings and the UI icons cannot
    drift apart on the attributes that make them decorative and inheritable. */
/* A path may be a bare string — stroke only, which is every specimen drawing —
   or a [d, role] pair, where the role picks a flat fill from the module's own
   world palette. Nothing carries a colour of its own: `fill`, `tint` and `deep`
   are class names, the CSS resolves them against --w-*, and a drawing therefore
   inherits dark mode and its world's hue for free. `hatch` is a thinner stroke,
   for the shading in the reference notebooks. (D82) */
export function svgOf(ds, { cls = "icon", box = 24 } = {}) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${box} ${box}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", cls);
  for (const entry of ds) {
    const [d, role] = Array.isArray(entry) ? entry : [entry, null];
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    if (role) path.setAttribute("class", `art-${role}`);
    svg.append(path);
  }
  return svg;
}

export function icon(name, cls = "icon") {
  const d = ICONS[name];
  if (!d) throw new Error(`unknown icon "${name}"`);
  return svgOf([d], { cls });
}

export const svgEl = (tag) => document.createElementNS(NS, tag);
