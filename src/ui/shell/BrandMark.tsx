/** Product glyph: a house outline with three WiFi arcs inside it. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.5 10.2V20h13v-9.8" />
      <path d="M9.88 15.08A3 3 0 0 1 14.12 15.08" />
      <path d="M8.32 13.52A5.2 5.2 0 0 1 15.68 13.52" />
      <circle cx="12" cy="17.6" r="0.9" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
