import type { Sql } from "postgres";
import { Bookings } from "./bookings.js";
import { Holds } from "./holds.js";
import { Subscriptions, type Listener } from "./subscriptions.js";
import type { DeltaTEvent } from "./types.js";
import { ChangeTracker, type Change } from "./watch.js";

export type WatchOptions = {
  window?: { start: number; end: number };
  onError?: (error: unknown) => void;
  /**
   * Watching has started: subscribed and the calendar read. Runs before any change is delivered,
   * so it is the place for anything that must come first (a "watching" line, say).
   */
  onReady?: () => void;
  /** The connection to deltat dropped. No changes arrive until onResubscribed. */
  onDisconnected?: () => void;
  /**
   * The stream came back after the connection to deltat was lost. Changes made while it was down
   * were not seen. The watch has re-read the calendar, so what follows is complete again, but a
   * caller relying on "nothing happened" should look again.
   */
  onResubscribed?: () => void;
  /** deltat dropped `missed` notifications for this subscriber. Same meaning and same re-read as onResubscribed. */
  onLagged?: (missed: number) => void;
  /** The calendar was deleted. Nothing more will arrive and the watch has stopped. */
  onGone?: () => void;
};

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
   *
   * Whenever the calendar is (re-)read, at the start, after reconnecting, after a Lagged notice,
   * events arriving meanwhile are held back and replayed on the fresh picture, so none is applied to
   * a picture that is about to be replaced. Re-reads run one at a time.
   */
  async watch(
    resourceId: string,
    onChange: (change: Change) => void,
    options: WatchOptions = {}
  ): Promise<() => Promise<void>> {
    const { onError } = options;
    const window = options.window ?? null;
    const state: {
      tracker: ChangeTracker | null;
      held: DeltaTEvent[];
      timer: ReturnType<typeof setTimeout> | null;
      stopped: boolean;
    } = { tracker: null, held: [], timer: null, stopped: false };
    let rereads = Promise.resolve();

    const snapshot = async () => {
      const filter = window ?? undefined;
      const [holds, bookings] = await Promise.all([
        new Holds(this.sql).get(resourceId, filter),
        new Bookings(this.sql).get(resourceId, filter),
      ]);
      return new ChangeTracker(window, { holds, bookings });
    };
    const report = (changes: Change[]) => {
      for (const change of changes) deliver(() => onChange(change), onError);
    };
    const notify = (hook: (() => void) | undefined) => {
      if (hook) deliver(hook, onError);
    };
    const clearTimer = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    };
    const arm = () => {
      clearTimer();
      const due = state.tracker?.nextDeadline() ?? null;
      if (due === null || state.stopped) return;
      state.timer = setTimeout(() => {
        state.timer = null;
        if (state.tracker) report(state.tracker.settle(Date.now()));
        arm();
      }, Math.max(0, due - Date.now()));
    };

    const stopRef: { stop: (() => Promise<void>) | null } = { stop: null };
    const end = async () => {
      state.stopped = true;
      clearTimer();
      await stopRef.stop?.();
    };
    const gone = () => {
      if (state.stopped) return;
      void end();
      notify(options.onGone);
    };

    const handle = (event: DeltaTEvent) => {
      if (state.stopped) return;
      const tracker = state.tracker;
      if (tracker === null) {
        state.held.push(event);
      } else if ("Lagged" in event) {
        const { missed } = event.Lagged;
        reread(() => options.onLagged?.(missed));
      } else if ("ResourceDeleted" in event && event.ResourceDeleted.id === resourceId) {
        gone();
      } else {
        report(tracker.apply(event, Date.now()));
        arm();
      }
    };
    const replayHeld = () => {
      for (const event of state.held.splice(0)) handle(event);
    };

    // After an outage or a lag the remembered spans may be stale and a parked release's booking may
    // never come, so report what is parked, re-read the calendar, replay what arrived meanwhile,
    // then say there was a gap.
    const reread = (after: () => void) => {
      rereads = rereads.then(async () => {
        if (state.stopped) return;
        const previous = state.tracker;
        clearTimer();
        if (previous) report(previous.flush());
        state.tracker = null;
        const fresh = await snapshot().catch((error: unknown) => {
          reportError(error, onError);
          return previous ?? new ChangeTracker(window, { holds: [], bookings: [] });
        });
        if (state.stopped) return;
        state.tracker = fresh;
        replayHeld();
        arm();
        deliver(after, onError);
      });
    };

    // Subscribe before taking the snapshot, so nothing that changes in between is missed. An event
    // the snapshot already reflects is harmless to replay: remembering a span twice changes nothing.
    stopRef.stop = await this.listen(resourceId, handle, {
      ...(onError ? { onError } : {}),
      ...(options.onDisconnected ? { onDisconnected: options.onDisconnected } : {}),
      onResubscribed: () => reread(() => options.onResubscribed?.()),
      onGone: gone,
    });
    const started = await snapshot().catch(async (error: unknown) => {
      await end();
      throw error;
    });
    notify(options.onReady);
    state.tracker = started;
    replayHeld();
    arm();

    return end;
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
    options?: {
      onError?: (error: unknown) => void;
      onDisconnected?: () => void;
      onResubscribed?: () => void;
      /** The resource was deleted while the connection was down; this subscription has ended. */
      onGone?: () => void;
    }
  ): Promise<() => Promise<void>> {
    const onError = options?.onError;
    const hook = (fn: (() => void) | undefined) => {
      if (fn) deliver(fn, onError);
    };
    let subscribedBefore = false;
    return this.subscriptions.listen(`resource_${resourceId}`, {
      onNotify: (payload) => {
        const event = parseEvent(payload);
        if (event) deliver(() => callback(event), onError);
      },
      onSubscribed: () => {
        const again = subscribedBefore;
        subscribedBefore = true;
        if (again) hook(options?.onResubscribed);
      },
      onLost: () => hook(options?.onDisconnected),
      onGone: () => hook(options?.onGone),
    });
  }
}
