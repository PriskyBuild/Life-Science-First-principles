/* A RATCHET, NOT A CLIFF.

   Turning a type checker on over thirty-five modules written without one produced
   79 findings in the shipped code. Two ways to respond to that number, and both
   of the obvious ones are wrong. Fixing all 79 in an afternoon means seventy-nine
   changes nobody reviewed properly, to code that currently works. Leaving the
   check out of `npm run check` means it never runs and the number quietly becomes
   a hundred and fifty.

   So the number is recorded, and the only rule is that it may not go up. A new
   module arrives clean or it does not arrive. An old one gets typed when someone
   is already in there for another reason. The baseline moves down and never up,
   and the day it reaches zero this file becomes `tsc --noEmit` and nothing else.

   The one thing this must never do is let a finding be silenced rather than
   fixed: there is no ignore list, and `@ts-ignore` in shipped code fails the run
   outright. A suppression is a finding you have agreed to stop seeing. (D79) */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* THE BASELINE. Lower it when you fix things. Never raise it. */
const BASELINE = 78;

let out = "";
try {
  execFileSync("npx", ["tsc", "-p", "jsconfig.json", "--noEmit", "--pretty", "false"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  out = String(e.stdout ?? "") + String(e.stderr ?? "");
}

const findings = out.split("\n").filter((l) => /error TS\d+/.test(l));
const byFile = {};
for (const f of findings) {
  const file = f.split("(")[0];
  byFile[file] = (byFile[file] ?? 0) + 1;
}

/* A finding you have agreed to stop seeing is not a finding you have fixed. */
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => {
  const rel = `${dir}/${n}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});
const suppressed = walk("js")
  .filter((f) => f.endsWith(".js"))
  .filter((f) => /@ts-(ignore|nocheck|expect-error)/.test(readFileSync(join(ROOT, f), "utf8")));

console.log(`type findings: ${findings.length} (baseline ${BASELINE})`);
for (const [file, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${file}`);
}

let bad = false;
if (suppressed.length) {
  console.log(`\nFAILED: type findings suppressed rather than fixed in ${suppressed.join(", ")}`);
  bad = true;
}
if (findings.length > BASELINE) {
  console.log(`\nFAILED: ${findings.length - BASELINE} new type finding(s). The baseline only goes down.`);
  for (const f of findings.slice(0, 8)) console.log(`  ${f}`);
  bad = true;
} else if (findings.length < BASELINE) {
  console.log(`\n${BASELINE - findings.length} fewer than the baseline — lower BASELINE in tools/typecheck.mjs to ${findings.length}.`);
  bad = true;
} else {
  console.log("\nok — no new type findings");
}
process.exit(bad ? 1 : 0);
