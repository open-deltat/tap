/**
 * Let a timer run without keeping the process alive for it alone. Node and Bun timers have
 * `unref()`; a browser's are plain numbers and have nothing to keep alive, so this does nothing there.
 * The client is typed against the DOM's timers, which is why this is not simply `timer.unref()`.
 */
export function unref(timer: unknown): void {
  const t = timer as { unref?: unknown } | null;
  if (typeof t?.unref === "function") t.unref.call(timer);
}
