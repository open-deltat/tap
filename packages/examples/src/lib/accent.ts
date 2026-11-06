// The examples' shared control vocabulary, written once so every booker looks and behaves the same.
// Colours come from the site's dt-* tokens (demo/app/globals.css): ink is the action and the
// selection, emerald means free or live, amber means someone else holds it.

/** The primary "commit the booking" button: the island's one action. */
export const ACCENT_CTA =
  "rounded-full bg-dt-ink text-dt-on-ink shadow-none hover:bg-dt-ink/85 active:scale-[0.97] transition-[transform,background-color,opacity] duration-150 disabled:opacity-40";

/** A rounded-full selector pill (ribbon chips, duration/party toggles, slot chips). */
export const PILL_BASE =
  "inline-flex h-10 items-center justify-center rounded-full border px-4 text-[13px] font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] sm:h-9 disabled:opacity-40 disabled:pointer-events-none";
export const PILL_ACTIVE = "border-transparent bg-dt-ink text-dt-on-ink";
export const PILL_IDLE = "border-dt-line bg-dt-surface text-dt-ink-2 hover:border-dt-line-strong hover:text-dt-ink";

/** A quiet, secondary affordance (e.g. the "next opening" suggestion), never as loud as the CTA. */
export const ACCENT_GHOST =
  "border border-dt-line-strong bg-dt-surface text-dt-ink shadow-none hover:bg-dt-sunken";
