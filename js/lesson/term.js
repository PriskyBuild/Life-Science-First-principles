/* WHERE THE NAME SITS INSIDE THE SENTENCE. One rule, two consumers: the build
   refuses a term it cannot find, the renderer wraps the one it does. Two copies
   of that rule would be two rules, and the gate would pass while the marker
   quietly highlighted nothing.

   Whole words, hyphens included, so "cell" misses inside "cells" and inside
   "cell-scale". No lookbehind — Safari only shipped it in 16.4 and this is an
   offline app for a household iPad. This module imports nothing, which is what
   lets a Node build read the same function a browser runs. (D87) */

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

const rx = (term, flags) =>
  new RegExp(`(^|[^\\p{L}\\p{N}-])(${term.replace(ESCAPE, "\\$&")})(?![\\p{L}\\p{N}-])`, flags);

/** [before, term, after], or null when the level withholds the name and the
    caller should render plain text. */
export function termSpan(text, term) {
  if (!text || !term) return null;
  const m = rx(term, "u").exec(String(text));
  if (!m) return null;
  const at = m.index + m[1].length;
  return [String(text).slice(0, at), m[2], String(text).slice(at + m[2].length)];
}
