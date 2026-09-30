import postgres, { type Sql } from "postgres";

/**
 * LISTEN subscriptions that survive deltat going away and coming back.
 *
 * postgres.js's own `sql.listen` re-subscribes exactly once when its connection closes, swallows a
 * failure, and forgets the channel (src/index.js, `listen` → `onclose`). A deltat that is down for
 * more than a moment is still down at that instant, so every subscription on the client died with no
 * error and no further events: measured at 10 s and 40 s of downtime. A watcher then reads silence as
 * "nothing is happening", which is the one failure a live view must never have.
 *
 * So the subscriptions live on a connection this class owns. When it closes, every channel is
 * listened to again, retrying with backoff until that succeeds, and each subscriber is told it was
 * re-subscribed so it can re-read whatever changed while it was not listening.
 */

export type Subscriber = {
  onNotify: (payload: string) => void;
  /** Called after the first LISTEN succeeds and again after every re-subscription. */
  onSubscribed: () => void;
  /** Called once when the connection drops; nothing arrives until the next onSubscribed. */
  onLost?: () => void;
};

/** What Events needs from a subscription source. Subscriptions is the real one; tests pass a fake. */
export interface Listener {
  listen(channel: string, subscriber: Subscriber): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** Delay before each retry, in ms; the last value repeats. */
const RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const;

type Connect = (hooks: { onnotify: (channel: string, payload: string) => void; onclose: () => void }) => Sql;

const quoted = (channel: string) => `"${channel.replace(/"/g, '""')}"`;

export class Subscriptions implements Listener {
  private readonly channels = new Map<string, Set<Subscriber>>();
  /** Channels LISTENed on the connection as it is now; emptied whenever it closes. */
  private readonly live = new Set<string>();
  private conn: Sql | null = null;
  private retrying = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly connect: Connect) {}

  /** A dedicated connection built from the same settings as `sql`, the way postgres.js builds its own. */
  static from(sql: Sql): Subscriptions {
    // postgres.js's own listen builds its connection by spreading these parsed options back into
    // Postgres() (src/index.js). Their type says `pass: null` and `host: string[]`, which the
    // constructor's type does not accept, though the runtime value carries the password and works.
    // This is the one place that crosses that gap.
    const parsed = sql.options as unknown as postgres.Options<{}>;
    return new Subscriptions(({ onnotify, onclose }) => {
      // `onnotify` is how postgres.js's own listen receives notifications, and the only way to
      // receive them on a connection we own; its types leave it out. The live resilience suite
      // fails if a postgres.js upgrade ever drops it.
      const options: postgres.Options<{}> & { onnotify: typeof onnotify } = {
        ...parsed,
        max: 1,
        // 0 disables both timers (postgres.js connection.js, timer()). The default max_lifetime
        // recycles a connection every 30 to 60 minutes, which here would drop and re-subscribe
        // every watcher, each time telling it that it may have missed changes.
        idle_timeout: 0,
        max_lifetime: 0,
        fetch_types: false,
        onnotify,
        onclose,
      };
      return postgres(options);
    });
  }

  /** Subscribe; rejects if the first LISTEN fails. Resolves to an unsubscribe function. */
  async listen(channel: string, subscriber: Subscriber): Promise<() => Promise<void>> {
    if (this.closed) throw new Error("deltat: subscriptions are closed");
    const subscribers = this.channels.get(channel) ?? new Set<Subscriber>();
    subscribers.add(subscriber);
    this.channels.set(channel, subscribers);

    try {
      if (!this.live.has(channel)) {
        await this.connection()`LISTEN ${this.connection().unsafe(quoted(channel))}`;
        this.live.add(channel);
      }
    } catch (error) {
      this.forget(channel, subscriber);
      throw error;
    }
    subscriber.onSubscribed();

    return async () => {
      this.forget(channel, subscriber);
      if (!this.channels.has(channel) && this.live.delete(channel) && this.conn) {
        await this.conn`UNLISTEN ${this.conn.unsafe(quoted(channel))}`.catch(() => undefined);
      }
    };
  }

  /** Stop listening for good: no more retries, and the connection is closed. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const conn = this.conn;
    this.conn = null;
    this.live.clear();
    await conn?.end().catch(() => undefined);
  }

  private connection(): Sql {
    this.conn ??= this.connect({
      onnotify: (channel, payload) => {
        for (const s of this.channels.get(channel) ?? []) s.onNotify(payload);
      },
      onclose: () => {
        if (this.closed) return;
        // Only channels that were live hear about the loss, so a failed reconnect attempt (which
        // closes again) does not announce it twice.
        const lost = [...this.live];
        this.live.clear();
        for (const channel of lost) for (const s of this.channels.get(channel) ?? []) s.onLost?.();
        if (this.channels.size > 0) this.resubscribe(0);
      },
    });
    return this.conn;
  }

  private forget(channel: string, subscriber: Subscriber): void {
    const subscribers = this.channels.get(channel);
    subscribers?.delete(subscriber);
    if (subscribers?.size === 0) this.channels.delete(channel);
  }

  /** Listen to every wanted channel again, retrying until it works or the client is closed. */
  private resubscribe(attempt: number): void {
    if (this.retrying || this.closed) return;
    this.retrying = true;
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      const wanted = [...this.channels.keys()].filter((c) => !this.live.has(c));
      const ok = await Promise.all(
        wanted.map(async (channel) => {
          await this.connection()`LISTEN ${this.connection().unsafe(quoted(channel))}`;
          this.live.add(channel);
        })
      ).then(
        () => true,
        () => false
      );
      this.retrying = false;
      if (this.closed) return;
      if (!ok) return this.resubscribe(attempt + 1);
      for (const channel of wanted) for (const s of this.channels.get(channel) ?? []) s.onSubscribed();
    }, delay);
    // Deliberately not unref()'d: while deltat is down this timer is the only thing keeping a
    // watcher's process alive, and a watcher must outlast an outage. close() clears it.
  }
}
