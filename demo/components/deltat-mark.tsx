// The Δt mark, drawn once: a dark tile with a faint emerald ring, a quiet green glow rising from the
// foot, and the glyph in white. The nav, the footer, the landing hero and the site icon (rendered
// from the same recipe) all use this, so the brand cannot drift between them. Plain markup and
// Tailwind, no image: it scales with the type and weighs nothing.
const SIZES = {
  sm: "h-6 w-6 rounded-[7px] text-[11px]",
  md: "h-8 w-8 rounded-[10px] text-[14px]",
  lg: "h-10 w-10 rounded-[12px] text-[17px]",
} as const;

export function DeltatMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-label="Δt"
      className={`relative grid shrink-0 select-none place-items-center overflow-hidden bg-[#0b0e0d] font-semibold tracking-tight text-[#f5f5f7] ring-1 ring-inset ring-[#34d399]/35 ${SIZES[size]} ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_115%,rgba(52,211,153,0.28),transparent)]" aria-hidden />
      <span className="relative">Δt</span>
    </span>
  );
}
