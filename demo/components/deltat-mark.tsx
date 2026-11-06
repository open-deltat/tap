import { useId } from "react";

// The Δt mark, drawn once as the organisation's logo is drawn: a dark tile with a thin emerald ring,
// a green glow rising from the foot, and the glyph in white. The nav, the footer and the landing
// hero all use this, so the brand cannot drift between them. Vector, so it is crisp at every size
// and weighs nothing; the raster original lives at github.com/open-deltat.
const SIZES = { sm: 24, md: 32, lg: 40 } as const;

export function DeltatMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const glow = useId();
  const px = SIZES[size];
  return (
    <svg viewBox="0 0 64 64" width={px} height={px} role="img" aria-label="Δt" className={`shrink-0 ${className}`}>
      <defs>
        <radialGradient id={glow} cx="50%" cy="105%" r="75%">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill="#0a0f0d" />
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#${glow})`} />
      <rect x="1" y="1" width="62" height="62" rx="16" fill="none" stroke="#34d399" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x="32" y="43" textAnchor="middle" fontSize="30" fontWeight="500" letterSpacing="-0.5" fill="#f5f5f7" fontFamily="inherit">
        Δt
      </text>
    </svg>
  );
}
