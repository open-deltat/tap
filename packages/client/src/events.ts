import type { Sql } from "postgres";
import { Bookings } from "./bookings.js";
import { Holds } from "./holds.js";
import { Subscriptions, type Listener } from "./subscriptions.js";
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
    reportError(error, onError);
  }
}

function reportError(error: unknown, onError?: (error: unknown) => void): void {
  try {
    if (onError) onError(error);
    else console.error("deltat: event subscriber threw", error);
  } catch {
    // A throwing onError hook would tear down the connection the same way. Drop it.
  }
}

const parseEvent = (payload: string): DeltaTEvent | null => {
  try {
    return JSON.parse(payload) as DeltaTEvent;
  } catch {
    return null;
  }
};

export class Events {
  constructor(
    private readonly sql: Sql,
    private readonly subscriptions: Listener = Subscriptions.from(sql)
  ) {}

  /** Stop every subscription and retry of this client. DeltaT.close() calls it. */
  async close(): Promise<void> {
    await this.subscriptions.close();
  }

  /**
   * Subscribe to a resource's changes as `Change`s: filtered to an optional window, with the time
   * on every end, and with a commit reported as one booking rather than a release and a booking.
   * See watch.ts for why each of those needs doing. Resolves to an unsubscribe function once
   * watching has started.
   */
  async watch(
    resourceId: string,
    onChange: (change: Change) => void,
    options?: {
      window?: { start: number; end: number };
      onError?: (error: unknown) => void;
      /** The connection to deltat dropped. No changes arrive until onResubscribed. */
      onDisconnected?: () => void;
      /**
       * The stream came back after the connection to deltat was lost. Changes made while it was down
       * were not seen. The watch has re-read the calendar, so what follows is complete again, but a
       * caller relying on "nothing happened" should look again.
       */
      onResubscribed?: () => void;
    }
  ): Promise<() => Promise<void>> {
    const onError = options?.onError;
    const window = options?.window ?? null;
    const early: DeltaTEvent[] = [];
    let tracker: ChangeTracker | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const snapshot = async () => {
      const [holds, bookings] = await Promise.all([
        new Holds(this.sql).get(resourceId),
        new Bookings(this.sql).get(resourceId),
      ]);
      return new ChangeTracker(window, { holds, bookings });
    };

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

    // After an outage the remembered spans may be stale and a parked release's booking may never
    // come, so report what is parked, re-read the calendar, then say there was a gap.
    const resync = async () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
      if (tracker) report(tracker.settle());
      tracker = await snapshot().catch((error: unknown) => {
        reportError(error, onError);
        return tracker;
      });
      const onResubscribed = options?.onResubscribed;
      if (onResubscribed) deliver(onResubscribed, onError);
    };

    // Subscribe before taking the snapshot, so nothing that changes in between is missed. An event
    // the snapshot already reflects is harmless to replay: remembering a span twice changes nothing.
    const stop = await this.listen(resourceId, (event) => (tracker ? handle(tracker, event) : early.push(event)), {
      ...(onError ? { onError } : {}),
      ...(options?.onDisconnected ? { onDisconnected: options.onDisconnected } : {}),
      onResubscribed: () => void resync(),
    });
    const started = await snapshot().catch(async (error: unknown) => {
      await stop();
      throw error;
    });
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
   *
   * The subscription outlives deltat restarting or being unreachable for a while (see
   * subscriptions.ts). `onDisconnected` runs when the connection drops and `onResubscribed` when the
   * subscription is back; events sent in between are lost, so that is the moment to re-read
   * whatever the caller shows.
   */
  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void,
    options?: { onError?: (error: unknown) => void; onDisconnected?: () => void; onResubscribed?: () => void }
  ): Promise<() => Promise<void>> {
    const onError = options?.onError;
    let subscribedBefore = false;
    return this.subscriptions.listen(`resource_${resourceId}`, {
      onNotify: (payload) => {
        const event = parseEvent(payload);
        if (event) deliver(() => callback(event), onError);
      },
      onSubscribed: () => {
        const again = subscribedBefore;
        subscribedBefore = true;
        const onResubscribed = options?.onResubscribed;
        if (again && onResubscribed) deliver(onResubscribed, onError);
      },
      onLost: () => {
        const onDisconnected = options?.onDisconnected;
        if (onDisconnected) deliver(onDisconnected, onError);
      },
    });
  }
}
