/* Style-guide behaviour. Extracted from an inline <script> so the shipped
   Content-Security-Policy can stay `script-src 'self'` with no hashes or
   nonces to keep in sync. */
import { ICONS, icon } from "./js/icons.js";
import "./js/components/board.js";
import "./js/components/slider.js";
import "./js/components/predict.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const cs = (prop, el = root) => getComputedStyle(el).getPropertyValue(prop).trim();

/* ---- contrast, measured from what actually rendered ---- */
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const probe = document.createElement("span");
probe.style.display = "none";
document.body.append(probe);
function rgb(value) {
  probe.style.color = "";
  probe.style.color = value;
  return (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
}
function ratio(a, b) {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const verdict = (r, gate) =>
  `<span class="${r >= gate ? "sg-pass" : "sg-fail"}">${r.toFixed(2)}:1 ${r >= gate ? "pass" : "FAIL"}</span>`;

/* ---- segmented controls ---- */
function seg(host, items, current, onPick) {
  host.replaceChildren(...items.map(([value, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(value === current()));
    b.onclick = () => { onPick(value); render(); };
    return b;
  }));
}

const WORLDS = ["origins", "code", "change", "bodies", "living", "frontier"];
const SEM = ["correct", "wrong", "discovery"];
const STEPS = ["tint", "fill", "line", "text", "deep"];
const GATE = { line: 3, text: 4.5 };

function rampTable(keys) {
  const surfaces = [["--paper", "page"], ["--surface", "card"], ["--sunk", "sunken"]];
  const rows = keys.map((k) => {
    const swatches = STEPS.map((step) => {
      const v = cs(`--w-${k}-${step}`);
      let note = "";
      if (GATE[step]) {
        const worst = Math.min(
          ...surfaces.map(([s]) => ratio(v, cs(s))),
          ratio(v, cs(`--w-${k}-tint`))
        );
        note = `<div class="sg-meta">worst surface ${verdict(worst, GATE[step])}</div>`;
      }
      if (step === "fill") {
        note = `<div class="sg-meta">ink on fill ${verdict(ratio(cs("--ink"), v), 4.5)}</div>`;
      }
      return `<div class="sg-card"><div class="sg-swatch" style="background:${v}"></div>
        <div class="sg-name">${step}</div><div class="sg-meta">${v}</div>${note}</div>`;
    }).join("");
    return `<h3 style="margin:var(--s-5) 0 var(--s-2);color:var(--w-${k}-text);text-transform:capitalize">${k}</h3>
            <div class="sg-grid">${swatches}</div>`;
  }).join("");
  return rows;
}

function render() {
  seg($("sg-level"), [[1, "L1"], [2, "L2"], [3, "L3"], [4, "L4"]],
    () => Number(root.dataset.level), (v) => (root.dataset.level = String(v)));
  seg($("sg-theme"), [["", "Auto"], ["light", "Light"], ["dark", "Dark"]],
    () => root.dataset.theme ?? "",
    (v) => { if (v) root.dataset.theme = v; else delete root.dataset.theme; });

  /* chrome */
  $("out-chrome").innerHTML = [
    ["--paper", "page"], ["--surface", "cards"], ["--sunk", "sunken panels"],
    ["--ink", "body text"], ["--ink-2", "secondary"], ["--ink-3", "captions"],
    ["--line", "visible strokes"], ["--hairline", "dividers"],
  ].map(([token, role]) => {
    const v = cs(token);
    const isInk = token.startsWith("--ink");
    const note = isInk
      ? `<div class="sg-meta">worst surface ${verdict(Math.min(ratio(v, cs("--paper")), ratio(v, cs("--surface")), ratio(v, cs("--sunk"))), 4.5)}</div>`
      : token === "--line"
        ? `<div class="sg-meta">on page ${verdict(ratio(v, cs("--paper")), 3)}</div>` : "";
    return `<div class="sg-card"><div class="sg-swatch" style="background:${v}"></div>
      <div class="sg-name">${token}</div><div class="sg-meta">${role} · ${v}</div>${note}</div>`;
  }).join("");

  $("out-worlds").innerHTML = rampTable(WORLDS);
  $("out-sem").innerHTML = rampTable(SEM);

  /* type */
  const body = document.querySelector("main > p");
  $("out-type").querySelector("tbody").innerHTML = [
    ["--fs-2xl", "h1 / display"], ["--fs-xl", "h2 / section"], ["--fs-lg", "h3 / lead-in"],
    ["--fs-md", "body"], ["--fs-sm", "captions, status"], ["--fs-xs", "meta"],
  ].map(([t, role]) => {
    const el = document.createElement("span");
    el.style.fontSize = `var(${t})`;
    document.body.append(el);
    const px = getComputedStyle(el).fontSize;
    el.remove();
    return `<tr><td><code>${t}</code></td><td>${role}</td>
      <td style="font-size:var(${t});font-family:var(--font-display)">${px} — Aa</td></tr>`;
  }).join("") + `<tr><td><code>--type-scale</code></td><td>multiplier on the user's root size</td>
      <td>${cs("--type-scale")} · 1rem = ${getComputedStyle(root).fontSize}</td></tr>
      <tr><td><code>--measure</code></td><td>max line length</td>
      <td>${cs("--measure")} ≈ ${Math.round(body.getBoundingClientRect().width)}px</td></tr>`;

  /* space */
  $("out-space").innerHTML = [1, 2, 3, 4, 6, 8, 12, 16].map((n) => {
    const el = document.createElement("div");
    el.style.width = `var(--s-${n})`;
    document.body.append(el);
    const px = getComputedStyle(el).width;
    el.remove();
    return `<div style="display:flex;align-items:center;gap:var(--s-3)">
      <span class="sg-meta" style="width:4rem">--s-${n}</span>
      <span class="sg-bar-space" style="width:var(--s-${n})"></span>
      <span class="sg-meta">${px}</span></div>`;
  }).join("");

  /* elevation */
  $("out-elev").innerHTML = [
    ["--e0", "flat", "not touchable"], ["--e1", "resting", "touchable"],
    ["--e2", "lifted", "hovered or featured"], ["--e3", "floating", "tutor, sheets"],
    ["--e-press", "pressed", "held right now"],
  ].map(([t, name, meaning]) =>
    `<div class="sg-box ${t === "--e0" ? "" : "pressable"}" style="box-shadow:var(${t})">
      <strong>${name}</strong><span class="sg-meta">${t}</span>
      <span class="sg-meta">${meaning}</span></div>`).join("");

  /* touch targets */
  $("out-targets").innerHTML = [[1, 76], [2, 60], [3, 48], [4, 44]].map(([lv, px]) =>
    `<div style="text-align:center">
       <div class="sg-box pressable" style="width:${px}px;height:${px}px;min-width:0;padding:0;box-shadow:var(--e1)">
         <span class="sg-meta">${px}</span></div>
       <div class="sg-meta" style="margin-top:var(--s-2)">L${lv} · ${(px / 96 * 2.54).toFixed(2)}cm</div>
     </div>`).join("");

  /* icons */
  $("out-icons").replaceChildren(...Object.keys(ICONS).map((name) => {
    const card = document.createElement("div");
    card.className = "sg-card";
    card.style.cssText = "display:flex;align-items:center;gap:var(--s-3)";
    card.append(icon(name, "icon icon--lg"));
    const label = document.createElement("div");
    label.innerHTML = `<div class="sg-name">${name}</div><div class="sg-meta">always with a label</div>`;
    card.append(label);
    return card;
  }));

  /* states */
  $("out-states").innerHTML = `
    <a class="back pressable" href="#s-states">Link</a>
    <button class="danger pressable">Destructive</button>
    <div class="sg-box" style="box-shadow:var(--e0);background:var(--sunk);color:var(--ink-3)">
      <strong>Disabled</strong><span class="sg-meta">flat, so it never invites a tap</span></div>`;

  /* demo tiles for the motion buttons */
  $("demo-stage").innerHTML = Array.from({ length: 6 }, (_, i) =>
    `<div class="sg-card" style="--i:${i}"><div class="sg-name">tile ${i + 1}</div>
     <div class="sg-meta">stagger ${i}×</div></div>`).join("");

  $("out-motion-state").textContent =
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "prefers-reduced-motion: reduce — the step control above is the visible one."
      : "prefers-reduced-motion: no-preference — the autoplay control above is the visible one.";
}

$("play-enter").onclick = () => {
  const stage = $("demo-stage");
  [...stage.children].forEach((c) => { c.classList.remove("m-enter"); void c.offsetWidth; c.classList.add("m-enter"); });
};
$("play-attend").onclick = () => {
  const stage = $("demo-stage");
  [...stage.children].forEach((c, i) => setTimeout(() => {
    c.classList.remove("m-attend"); void c.offsetWidth; c.classList.add("m-attend");
  }, i * 80));
};

/* live wiring for the lesson-part demos */
document.querySelector("fp-board").addEventListener("fp:place", (e) => {
  const filled = Object.entries(e.detail.state).filter(([, v]) => v);
  $("out-board").textContent = filled.length
    ? filled.map(([slot, item]) => `${slot}: ${item}`).join(" · ")
    : "Nothing placed yet.";
});
$("run-right").onclick = () => $("demo-predict").echo("They speed up");
$("run-wrong").onclick = () => $("demo-predict").echo("They slow down");

render();
addEventListener("resize", () => render());
