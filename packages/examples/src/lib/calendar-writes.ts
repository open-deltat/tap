/**
 * One writer at a time per calendar, for anything that rewrites its open hours.
 *
 * A calendar's open hours live twice: the weekly pattern in the registry and the expanded rules in
 * deltat. A save writes rules then the pattern; the daily roll-forward reads the pattern then writes
 * rules. Interleaved, the roll can write the old pattern's rules after a save wrote the new ones, so
 * hours the owner just closed would show as free while the registry says closed. Two saves
 * interleaved leave the union of both. Queuing per calendar id rules both out.
 *
 * Shared through globalThis for the same reason as public-registry.ts: the custom server (which runs
 * the roll) and the Next app (which runs saves) each evaluate this module, and a lock that exists
 * twice locks nothing. Single process by construction, like the registry it guards.
 */
export type CalendarWrites = <T>(calendarId: string, write: () => Promise<T>) => Promise<T>;

export function createCalendarWrites(): CalendarWrites {
  const tails = new Map<string, Promise<unknown>>();
  return (calendarId, write) => {
    const run = (tails.get(calendarId) ?? Promise.resolve()).then(write);
    const tail = run.catch(() => undefined);
    tails.set(calendarId, tail);
    // Forget an idle calendar so the map holds only writes still queued.
    void tail.then(() => {
      if (tails.get(calendarId) === tail) tails.delete(calendarId);
    });
    return run;
  };
}

const shared = globalThis as typeof globalThis & { __deltatCalendarWrites?: CalendarWrites };

export const calendarWrites: CalendarWrites = (shared.__deltatCalendarWrites ??= createCalendarWrites());
