/** True when the user asked the OS for reduced motion: pulses and camera easing switch off. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
