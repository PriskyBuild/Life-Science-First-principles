import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".webmanifest":"application/manifest+json", ".woff2":"font/woff2", ".svg":"image/svg+xml", ".png":"image/png" };
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream",
      "cache-control": p === "/sw.js" ? "no-cache" : "public, max-age=31536000, immutable" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => srv.listen(8093, r));

const chrome = await launch({ chromePath: process.env.CHROME_PATH,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"] });
const res = await lighthouse("http://localhost:8093/", {
  port: chrome.port, output: "json", logLevel: "error",
  onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
});
const c = res.lhr.categories;
for (const k of ["performance", "accessibility", "best-practices", "seo"]) {
  const score = Math.round(c[k].score * 100);
  console.log(`${k.padEnd(16)} ${String(score).padStart(3)}  ${score >= 95 ? "PASS" : "BELOW 95"}`);
}
console.log("\n--- anything not scoring 1.0 ---");
for (const a of Object.values(res.lhr.audits)) {
  if (a.score !== null && a.score < 1 && a.scoreDisplayMode !== "informative") {
    console.log(`  ${a.id}: ${String(a.title).slice(0, 70)}${a.displayValue ? " — " + a.displayValue : ""}`);
  }
}
await chrome.kill(); srv.close();

const below = ["performance", "accessibility", "best-practices", "seo"].filter((k) => c[k].score * 100 < 95);
if (below.length) { console.error(`\nFAILED: ${below.join(", ")} below 95`); process.exit(1); }
