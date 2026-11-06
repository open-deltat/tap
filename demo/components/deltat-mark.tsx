// The Δt mark, the one place it is drawn: the glyph in a rounded ink square. The nav, the footer and
// the landing hero all use this, so the brand cannot drift between them.
const SIZES = {
  sm: "h-6 w-6 rounded-[7px] text-[11px]",
  md: "h-8 w-8 rounded-[10px] text-[14px]",
} as const;

export function DeltatMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-label="Δt" className={`grid place-items-center bg-dt-ink font-semibold tracking-tight text-dt-on-ink ${SIZES[size]} ${className}`}>
      Δt
    </span>
  );
}
