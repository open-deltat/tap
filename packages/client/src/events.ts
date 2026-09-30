import type { Sql } from "postgres";
import { Bookings } from "./bookings.js";
import { Holds } from "./holds.js";
import type { DeltaTEvent } from "./types.js";
import { ChangeTracker, type Change } from "./watch.js";

/**
 * How long a hold release waits for the booking that would show it was a commit. The kernel sends
 * the pair back to back, so this only has to cover them landing in separate reads off the socket;
 * it is also how late a plain release is reported.
 */
const SETTLE_MS = 100;

/**
 * postgres.js dispatches notifications synchronously inside its socket data handler and treats a
 * throw there as a connection error, destroying the single LISTEN connection for all subscribers.
 * Every subscriber callback runs through here so its errors are contained instead.
 */
function deliver(callback: () => void, onError?: (error: unknown) => void): void {
  try {
    callback();
  } catch (error) {
    try {
      if (onError) onError(error);
      else console.error("deltat: event subscriber threw", error);
    } catch {
      // A throwing onError hook would tear down the connection the same way. Drop it.
    }
  }
}

export class Events {
  constructor(private readonly sql: Sql) {}

  /**
   * Subscribe to a resource's changes as `Change`s: filtered to an optional window, with the time
   * on every end, and with a commit reported as one booking rather than a release and a booking.
   * See watch.ts for why each of those needs doing. Resolves to an unsubscribe function once
   * watching has started.
   */
  async watch(
    resourceId: string,
    onChange: (change: Change) => void,
    options?: { window?: { start: number; end: number }; onError?: (error: unknown) => void }
  ): Promise<() => Promise<void>> {
    const onError = options?.onError;
    const early: DeltaTEvent[] = [];
    let tracker: ChangeTracker | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const report = (changes: Change[]) => {
      for (const change of changes) deliver(() => onChange(change), onError);
    };
    const handle = (t: ChangeTracker, event: DeltaTEvent) => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
      report(t.apply(event));
      if (t.waiting) {
        settleTimer = setTimeout(() => {
          settleTimer = null;
          report(t.settle());
        }, SETTLE_MS);
      }
    };

    // Subscribe before taking the snapshot, so nothing that changes in between is missed. An event
    // the snapshot already reflects is harmless to replay: remembering a span twice changes nothing.
    const stop = await this.listen(
      resourceId,
      (event) => (tracker ? handle(tracker, event) : early.push(event)),
      onError ? { onError } : undefined
    );
    const seed = await Promise.all([new Holds(this.sql).get(resourceId), new Bookings(this.sql).get(resourceId)]).catch(
      async (error: unknown) => {
        await stop();
        throw error;
      }
    );
    const started = new ChangeTracker(options?.window ?? null, { holds: seed[0], bookings: seed[1] });
    tracker = started;
    for (const event of early.splice(0)) handle(started, event);

    return async () => {
      if (settleTimer) clearTimeout(settleTimer);
      await stop();
    };
  }

  /**
   * Subscribe to a resource's change stream over LISTEN/NOTIFY. Resolves to an unsubscribe function;
   * await it to stop listening. Malformed payloads are skipped rather than thrown to the callback.
   * A throwing callback is isolated: the error goes to `onError` (or `console.error` when no hook is
   * given) instead of tearing down the LISTEN connection shared by every subscription of this client.
   */
  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void,
    options?: { onError?: (error: unknown) => void }
  ): Promise<() => Promise<void>> {
    const channel = `resource_${resourceId}`;

    const meta = await this.sql.listen(
      channel,
      (payload: string) => {
        let event: DeltaTEvent;
        try {
          event = JSON.parse(payload) as DeltaTEvent;
        } catch {
          // Ignore malformed payloads.
          return;
        }
        deliver(() => callback(event), options?.onError);
      }
    );

    return async () => {
      await meta.unlisten();
    };
  }
}
