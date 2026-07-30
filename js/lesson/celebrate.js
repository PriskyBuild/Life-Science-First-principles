/* One short pulse, on achievement only — never on every press. A phone buzzing
   on each tap is miserable, and prefers-reduced-motion is the opt-out because it
   is the existing signal for "less stimulation, please". */
export function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate?.(14);
}
