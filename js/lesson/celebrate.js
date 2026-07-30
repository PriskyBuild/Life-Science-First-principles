/* One short pulse, on achievement only — never on every press. The resolver's
   own guidance says do not overuse it, and a phone buzzing on each tap is
   miserable. prefers-reduced-motion is the opt-out: it is the existing signal
   for "less stimulation, please", and adding a second toggle for one line of
   code would be a setting nobody asked for. */
export function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate?.(14);
}
