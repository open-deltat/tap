import type { DeltaTEvent } from "@open-deltat/client";

type Listen = (resourceId: string, onEvent: (event: DeltaTEvent) => void) => Promise<() => Promise<void>>;

/** The only frame a watcher ever gets for a kernel change. The client re-reads on it. */
export const CHANGED_FRAME = JSON.stringify({ type: "changed" });

/**
 * Bridge one calendar's kernel notifications to a browser socket as contentless ticks.
 *
 * The socket is open to anyone who can name a published calendar, and a notification carries the
 * hold id, which release and commit accept as authority. Forwarding it let any visitor release or
 * book a stranger's hold. So the payload never leaves the server: the tick says "something changed"
 * and the client reads again through its own gated path, which decides what that viewer may see.
 */
export function forwardChanges(
  listen: Listen,
  resourceId: string,
  send: (frame: string) => void
): Promise<() => Promise<void>> {
  return listen(resourceId, () => send(CHANGED_FRAME));
}
