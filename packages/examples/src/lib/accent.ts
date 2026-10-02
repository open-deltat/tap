import type { CSSProperties } from "react";

// The demo language is an instrument, not a card: flat surfaces, 1px rules, one sharp radius, and
// colour only where it means something. `signal` is emerald and means "free" or "chosen"; `hold` is
// amber and means "held" or "just taken". The values live in demo/app/globals.css as tokens, and a
// light theme would start from swapping those variables (the other demos still hard-code dark classes).
//
// Contrast: signal fill carries signal-ink text (about 9:1). White on emerald-500 was 2.5:1.

/** The primary "commit the booking" button: the tray's action. Flat, no glow. */
export const ACCENT_CTA =
  "rounded-[3px] bg-signal text-signal-ink hover:brightness-110 disabled:opacity-40";

/** A square selector chip (ribbon chips, duration/party toggles). */
export const PILL_BASE =
  "rounded-[3px] border px-3 py-1 text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none";
export const PILL_ACTIVE = "border-signal/60 bg-signal/10 text-signal";
export const PILL_IDLE = "border-line text-ink-2 hover:border-line-strong hover:text-ink";

/** A quiet, secondary signal affordance, never as loud as the CTA. */
export const ACCENT_GHOST =
  "rounded-[3px] border border-signal/40 bg-signal/10 text-signal shadow-none hover:border-signal/60 hover:bg-signal/15";

/**
 * Re-scopes the shadcn theme tokens for the dark canvas the demos live on, whatever the site theme is,
 * and makes signal the primary. Anything built on `bg-primary` / `text-muted-foreground` inside a
 * Stage (calendar, default buttons, inputs) then inherits it and passes contrast without a
 * per-component override.
 *
 * The overrides are inline styles, not utilities: globals.css declares `.dark { --primary }` outside any
 * cascade layer, and unlayered rules beat Tailwind's utilities layer, so a `[--primary:...]` class loses.
 */
export const STAGE_CLASS = "dark";
export const STAGE_VARS = {
  "--primary": "var(--signal)",
  "--primary-foreground": "var(--signal-ink)",
  "--ring": "var(--signal)",
  "--muted-foreground": "var(--ink-2)",
} as CSSProperties;
