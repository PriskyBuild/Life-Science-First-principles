/* Boot + router. Hash routing because it needs no server rewrite rules and
   works identically from a file server, a static host and the service worker. */

import { progress, subscribe } from "./state.js";
import { applyRoot, needsPicker } from "./level.js";
import { loadCurriculum } from "./curriculum.js";
import { atlas, module as moduleScreen, me, levelPicker } from "./screens.js";
import { mount } from "./el.js";

const host = document.getElementById("main");
const live = document.getElementById("live");

/* Lesson code is imported only when a lesson route is hit, so a child on the
   Atlas never downloads the runner, the quiz component or the review flow. */
const lazyLesson = (...args) => import("./lesson/view.js").then((m) => m.lessonView(...args));
const lazyReview = () => import("./lesson/view.js").then((m) => m.reviewView());

/* `live: true` marks a route that owns its own DOM across state changes.
   Without it, awarding XP mid-lesson dispatched fp:change, the subscriber
   repainted the route, and the child was thrown back to stage one by their own
   correct answer. Stateless screens (Atlas, module, Me) still repaint on every
   change, which is what keeps them honest. */
const routes = [
  [/^\/?$/, atlas],
  [/^\/m\/([\w-]+)$/, moduleScreen],
  [/^\/l\/([\w-]+)\/(\d+)$/, lazyLesson, { live: true }],
  [/^\/review$/, lazyReview, { live: true }],
  [/^\/me$/, me],
];

let liveRoute = false;

function resolve() {
  const path = location.hash.replace(/^#/, "") || "/";
  for (const [re, view, opts] of routes) {
    const m = path.match(re);
    if (m) {
      liveRoute = !!opts?.live;
      return () => view(...m.slice(1));
    }
  }
  liveRoute = false;
  return atlas;
}

let current = "";
let painted = false;

async function paint() {
  // A state change repaints the screen, which would otherwise throw a keyboard
  // user back to the heading every time they touched a radio. Elements that
  // must survive a repaint carry data-fk.
  const keep = document.activeElement?.closest?.("[data-fk]")?.dataset.fk;

  const view = needsPicker() ? levelPicker : resolve();
  // A view may be async (lazily-imported lesson code). Awaiting it here keeps
  // every caller synchronous-looking and means there is exactly one paint path.
  mount(host, await view());

  const restored = keep && host.querySelector(`[data-fk="${CSS.escape(keep)}"]`);
  if (restored) { restored.focus({ preventScroll: true }); return; }

  const heading = host.querySelector("h1");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");

  // Focus is moved on route changes so keyboard and screen-reader users are not
  // left wherever the last click was — but NOT on the very first paint, because
  // grabbing focus on load puts the skip link behind the user and makes it
  // unreachable by forward tabbing.
  if (painted) {
    heading.focus({ preventScroll: true });
    live.textContent = heading.textContent;
  }
  painted = true;
  window.scrollTo(0, 0);
}

function render() {
  const next = location.hash;
  const changed = next !== current;
  current = next;
  // Role 2 (spatial): shared-element transition so the child knows where they
  // came from. Progressive enhancement — unsupported browsers just repaint.
  if (changed && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(() => paint());
  } else {
    paint();
  }
}

addEventListener("hashchange", render);
subscribe(() => {
  applyRoot();
  // A live route re-renders itself; repainting it here would destroy the
  // position the child is standing in.
  if (!liveRoute) paint();
});

(async function boot() {
  applyRoot();
  try {
    await loadCurriculum();
    render();
  } catch (err) {
    host.textContent = "Could not load the curriculum. Check your connection and reload.";
    console.error(err);
  } finally {
    // Must run on the failure path too, or the error message above is hidden by
    // the very rule that stops the empty shell flashing.
    document.body.dataset.ready = "";
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline is a bonus, not a requirement */ });
  }
})();

export { progress };
