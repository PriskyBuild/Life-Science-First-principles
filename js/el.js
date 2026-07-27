/* Twelve lines instead of a template library. Strings become text nodes, so
   everything is XSS-safe by default rather than by remembering to escape. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.flat().filter((c) => c != null).map((c) => (typeof c === "object" ? c : String(c))));
  return node;
}

/** Swap a container's contents in one paint. Nulls are dropped rather than
    stringified — replaceChildren(null) renders the literal text "null", which
    is the kind of bug that ships because it looks like content. */
export function mount(host, ...nodes) {
  host.replaceChildren(...nodes.flat().filter((n) => n != null));
}
