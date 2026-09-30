import type { Sql } from "postgres";
import { Bookings } from "./bookings.js";
import { asDeltaTEvent } from "./event-shape.js";
import { Holds } from "./holds.js";
import { Subscriptions, type Listener } from "./subscriptions.js";
import { unref } from "./timers.js";
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
  /**
   * deltat answers the reconnect with an error (a changed password, say), once per distinct error.
   * Mere unreachability is not reported here; onDisconnected already said it. The watch keeps retrying.
   */
  onRetryFailing?: (error: unknown) => void;
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

/** Delay before each retry of a failed re-read, in ms; the last value repeats. */
const REREAD_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const;

/** The payload as a checked event, or null when it is not valid JSON or not an event this client knows. */
const parseEvent = (payload: string): DeltaTEvent | null => {
  try {
    return asDeltaTEvent(JSON.parse(payload));
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
   * a picture that is about to be replaced. Reads run one at a time, the first one included, and
   * status callbacks that fire during the first read wait until onReady has run.
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
      ready: boolean;
      /** Status callbacks that fired before onReady, delivered right after it. */
      later: (() => void)[];
    } = { tracker: null, held: [], timer: null, stopped: false, ready: false, later: [] };
    // Every read of the calendar, the first one included, is a link in this chain, so no two run
    // at once and a re-read requested during the first read waits for it.
    const firstRead: { done: () => void } = { done: () => undefined };
    let reads = new Promise<void>((resolve) => {
      firstRead.done = resolve;
    });

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

    const whenReady = (fn: () => void) => {
      if (state.ready) fn();
      else state.later.push(fn);
    };

    const stopRef: { stop: (() => Promise<void>) | null } = { stop: null };
    const end = async () => {
      if (state.stopped) return;
      state.stopped = true;
      clearTimer();
      // A release still waiting to see whether a booking claims it is reported, not dropped.
      if (state.tracker) report(state.tracker.flush());
      await stopRef.stop?.();
    };
    const gone = () => {
      if (state.stopped) return;
      void end();
      whenReady(() => notify(options.onGone));
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

    // A re-read that fails is tried again rather than papered over: onResubscribed and onLagged say
    // "what follows is complete again", which is only true once the calendar has actually been read.
    // Events keep being held meanwhile. The first failure is reported; the retries are quiet.
    const readUntilFresh = async (): Promise<ChangeTracker | null> => {
      for (let attempt = 0; !state.stopped; attempt++) {
        const fresh = await snapshot().catch((error: unknown) => {
          if (attempt === 0) reportError(error, onError);
          return null;
        });
        if (fresh) return fresh;
        const delay = REREAD_DELAYS_MS[Math.min(attempt, REREAD_DELAYS_MS.length - 1)];
        // Unref'd: a watch that was stopped meanwhile must not keep its process alive for the delay.
        await new Promise<void>((resolve) => unref(setTimeout(resolve, delay)));
      }
      return null;
    };

    // After an outage or a lag the remembered spans may be stale and a parked release's booking may
    // never come, so report what is parked, re-read the calendar, replay what arrived meanwhile,
    // then say there was a gap.
    const reread = (after: () => void) => {
      reads = reads.then(async () => {
        if (state.stopped) return;
        clearTimer();
        if (state.tracker) report(state.tracker.flush());
        state.tracker = null;
        const fresh = await readUntilFresh();
        if (fresh === null || state.stopped) return;
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
      onDisconnected: () => whenReady(() => notify(options.onDisconnected)),
      onRetryFailing: (error) => whenReady(() => deliver(() => options.onRetryFailing?.(error), onError)),
      onResubscribed: () => reread(() => options.onResubscribed?.()),
      onGone: gone,
    });
    const started = await snapshot().catch(async (error: unknown) => {
      firstRead.done();
      await end();
      throw error;
    });
    // Stopped already means the calendar went away during the first read: there is nothing to be
    // ready for, and the onGone waiting in `later` is what the caller hears.
    if (!state.stopped) {
      notify(options.onReady);
      state.tracker = started;
      replayHeld();
      arm();
    }
    state.ready = true;
    for (const fn of state.later.splice(0)) fn();
    firstRead.done();

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
      /** deltat answers the reconnect with an error, once per distinct error. Retrying continues. */
      onRetryFailing?: (error: unknown) => void;
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
      onRetryFailing: (error) => hook(options?.onRetryFailing && (() => options.onRetryFailing?.(error))),
    });
  }
}
