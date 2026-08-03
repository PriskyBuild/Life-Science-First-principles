/* WHERE THE NAME SITS INSIDE THE SENTENCE.

   The marker sweeps the phrase at the moment the word is given, so something has
   to know which run of characters is the phrase. That question has exactly one
   right answer per sentence, and two consumers need it: the build, which refuses
   a term it cannot find, and the renderer, which wraps it.

   Two copies of a matching rule is two rules. The build gate would go on passing
   while the marker quietly highlighted nothing, and nothing would say so —
   which is the shape of every fault in this file's neighbourhood. So the rule
   lives here, the renderer imports it, and tools/schema.mjs imports it too. This
   module deliberately imports nothing, which is what lets a Node build read the
   same function a browser runs. (D87)

   WHOLE WORDS, HYPHENS INCLUDED. "cell" must not match inside "cells" or inside
   "cell-scale", or the marker lands on half a word and the sentence looks
   broken. A hyphen counts as part of a word here for that reason, which also
   means "trade-off" is findable as itself and not inside "trade-offs".

   NO LOOKBEHIND. It would read better, and Safari only shipped it in 16.4 —
   this is an offline app for a household iPad that may be older than that. The
   preceding character is captured and put back instead. */

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const EDGE = "[\\p{L}\\p{N}-]";

const rx = (term, flags) =>
  new RegExp(`(^|${EDGE.replace("[", "[^")})(${term.replace(ESCAPE, "\\$&")})(?!${EDGE})`, flags);

/** How many times the term appears as a whole word. The build wants exactly one:
    two occurrences and there is no answer to which one is the naming. */
export function termHits(text, term) {
  if (!text || !term) return 0;
  return String(text).match(rx(term, "gu"))?.length ?? 0;
}

/** The sentence cut into [before, term, after], or null if it is not in there.
    Null is a legitimate answer — the youngest register often withholds the name
    entirely — and the caller renders plain text. */
export function termSpan(text, term) {
  if (!text || !term) return null;
  const m = rx(term, "u").exec(String(text));
  if (!m) return null;
  const start = m.index + m[1].length;
  return [String(text).slice(0, start), m[2], String(text).slice(start + m[2].length)];
}
