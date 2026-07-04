// The demo's accent is emerald, applied as Tailwind utility overrides rather than a theme token
// (globals.css is stock-neutral shadcn). Defining the recurring overrides ONCE here keeps the booker
// CTA and the pill selectors visually identical across every example instead of re-pasted per file.

/** The primary "commit the booking" button: the floating tray's action. Confident, not loud. */
export const ACCENT_CTA =
  "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 disabled:opacity-40";

/** A rounded-full selector pill (ribbon chips, duration/party toggles, slot chips). */
export const PILL_BASE =
  "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none";
export const PILL_ACTIVE = "border-emerald-400/40 bg-emerald-400/15 text-emerald-200";
export const PILL_IDLE = "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200";

/** A quiet, secondary emerald affordance (e.g. the "next opening" suggestion), never as loud as the CTA. */
export const ACCENT_GHOST =
  "border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 shadow-none hover:border-emerald-400/50 hover:bg-emerald-400/15 hover:text-emerald-100";
