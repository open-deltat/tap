import postgres, { type Sql } from "postgres";
import { sqlstateOf } from "./errors.js";
import { unref } from "./timers.js";

/**
 * LISTEN subscriptions that survive deltat going away and coming back.
 *
 * postgres.js's own `sql.listen` re-subscribes exactly once when its connection closes, swallows a
 * failure, and forgets the channel (src/index.js, `listen` → `onclose`). A deltat that is down for
 * more than a moment is still down at that instant, so every subscription on the client died with no
 * error and no further events: measured at 10 s and 40 s of downtime. A watcher then reads silence as
 * "nothing is happening", which is the one failure a live view must never have.
 *
 * So the subscriptions live on a connection this class owns, managed as desired state:
 *
 *  - Which channels someone wants is the set of subscribers. Which channels are LISTENed is `live`,
 *    and it only ever describes the connection of the current `generation`; a drop empties it.
 *  - One reconcile pass at a time makes live match wanted, and re-checks the generation after every
 *    await: whatever it learned on a connection that has since dropped does not count.
 *  - Whether a subscriber has been told it is subscribed on the current connection is a flag on the
 *    subscriber itself, cleared on a drop. Any subscriber whose channel is live and who has not been
 *    told is told. Nothing depends on which batch or which caller happened to do the LISTEN.
 *
 * A heartbeat catches a connection that died without closing (a host that vanished, a dropped NAT
 * flow), which TCP keepalive alone notices only after minutes.
 */

export type Subscriber = {
  onNotify: (payload: string) => void;
  /** Called when subscribed, and again after every re-subscription following a drop. */
  onSubscribed: () => void;
  /** Called once when the connection drops; nothing arrives until the next onSubscribed. */
  onLost?: () => void;
  /** The resource no longer exists (deleted while the connection was down); nothing more will arrive. */
  onGone?: () => void;
  /**
   * Re-subscribing keeps failing because deltat answered with an error (a wrong password after it
   * restarted, say). Once per distinct error, not per attempt, and not for plain unreachability,
   * which onLost already said. Retrying continues, since the cause may be fixed.
   */
  onRetryFailing?: (error: unknown) => void;
};

/** What Events needs from a subscription source. Subscriptions is the real one; tests pass a fake. */
export interface Listener {
  listen(channel: string, subscriber: Subscriber): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** Delay before each retry, in ms; the last value repeats. */
const RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const;

/**
 * How long close() gives the connection to end gracefully before forcing it. postgres.js's end()
 * waits on a connection that is mid-connect to a host dropping packets, so without a bound a closed
 * client could hang its process.
 */
const CLOSE_TIMEOUT_S = 5;

/** SQLSTATE deltat returns for a LISTEN on a resource that does not exist. */
const UNDEFINED_OBJECT = "42704";

/**
 * `everyMs`: how often an idle connection is proven alive. `timeoutMs`: how long any statement on
 * the subscription connection, heartbeat or not, may go unanswered before the connection counts as
 * dead and is replaced. `connectMs`: added for the first statement after (re)connecting, which also
 * waits for the connection to be set up; postgres.js's own connect timeout, 30 s unless configured.
 */
export type HeartbeatOptions = { everyMs: number; timeoutMs: number; connectMs: number };
const HEARTBEAT: HeartbeatOptions = { everyMs: 30_000, timeoutMs: 10_000, connectMs: 30_000 };

type Hooks = { onnotify: (channel: string, payload: string) => void; onclose: () => void };
type Connect = (hooks: Hooks) => Sql;
type Outcome = { ok: true } | { ok: false; error: unknown };

const quoted = (channel: string) => `"${channel.replace(/"/g, '""')}"`;

/**
 * An error deltat itself sent: postgres.js turns every ErrorResponse into a PostgresError. A failing
 * connection (ECONNREFUSED, EPIPE, a timeout) is a plain Error; it means deltat is unreachable, which
 * onLost already told the subscriber. Not a field check: deltat's ErrorResponse carries `S` only, so
 * postgres.js's `severity` (from `V`) is never set, and checking it silenced every refusal.
 */
const isServerError = (e: unknown): boolean => e instanceof postgres.PostgresError;

type Entry = {
  channel: string;
  subscriber: Subscriber;
  /** Told onSubscribed on the connection as it is now. False from the start and after every drop. */
  told: boolean;
  /** Settles listen() on the first outcome; null once settled. */
  first: { resolve: () => void; reject: (error: unknown) => void } | null;
  /** The last failure reported to this subscriber, so each distinct one is reported once. */
  reported: string | null;
};

export class Subscriptions implements Listener {
  private readonly entries = new Set<Entry>();
  /** Channels LISTENed on the connection of the current generation. */
  private readonly live = new Set<string>();
  private conn: Sql | null = null;
  /** Bumped on every drop; anything learned under an older value is about a connection that is gone. */
  private generation = 0;
  private closed = false;
  private pass: Promise<void> | null = null;
  private again = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** The current connection has answered since it was (re)connected, so it is set up. */
  private proven = false;

  constructor(
    private readonly connect: Connect,
    private readonly heartbeat: HeartbeatOptions = HEARTBEAT
  ) {}

  /** A dedicated connection built from the same settings as `sql`, the way postgres.js builds its own. */
  static from(sql: Sql): Subscriptions {
    // postgres.js's own listen builds its connection by spreading these parsed options back into
    // Postgres() (src/index.js). Their type says `pass: null` and `host: string[]`, which the
    // constructor's type does not accept, though the runtime value carries the password and works.
    // This is the one place that crosses that gap.
    const parsed = sql.options as unknown as postgres.Options<{}>;
    const connectMs = (parsed.connect_timeout ?? HEARTBEAT.connectMs / 1000) * 1000;
    return new Subscriptions(({ onnotify, onclose }) => {
      // `onnotify` is how postgres.js's own listen receives notifications, and the only way to
      // receive them on a connection we own; its types leave it out. The live resilience suite
      // fails if a postgres.js upgrade ever drops it.
      const options: postgres.Options<{}> & {
        onnotify: typeof onnotify;
        shared: { retries: number; typeArrayMap: Record<string, unknown> };
      } = {
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
        // Parsed options carry the main pool's `shared` state, including its reconnect counter
        // (connection.js), and postgres.js uses options that have `shared` as they are. Sharing it
        // would let this connection's failed reconnects back the main pool off too, and the other
        // way round. Its own fresh state keeps the two apart.
        shared: { retries: 0, typeArrayMap: {} },
      };
      return postgres(options);
    }, { ...HEARTBEAT, connectMs });
  }

  /**
   * Subscribe. Resolves once subscribed, to an unsubscribe function; rejects if the first attempt
   * fails. A drop after that is recovered from, and reported through the subscriber's callbacks.
   */
  async listen(channel: string, subscriber: Subscriber): Promise<() => Promise<void>> {
    if (this.closed) throw new Error("deltat: subscriptions are closed");
    return new Promise((resolve, reject) => {
      const entry: Entry = {
        channel,
        subscriber,
        told: false,
        reported: null,
        first: {
          // Unsubscribing takes effect at once (nothing more reaches this subscriber) and does not
          // wait for the UNLISTEN: a pass in flight against a host that is not answering would
          // otherwise hold up a watcher's Ctrl-C until the connect timed out.
          resolve: () =>
            resolve(async () => {
              this.entries.delete(entry);
              void this.reconcile();
            }),
          reject,
        },
      };
      this.entries.add(entry);
      void this.reconcile();
    });
  }

  /** Stop listening for good: no more retries, and the connection is closed within CLOSE_TIMEOUT_S. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    const conn = this.conn;
    this.conn = null;
    this.live.clear();
    for (const entry of this.entries) entry.first?.reject(new Error("deltat: subscriptions are closed"));
    this.entries.clear();
    await conn?.end({ timeout: CLOSE_TIMEOUT_S }).catch(() => undefined);
  }

  private connection(): Sql {
    if (this.conn) return this.conn;
    const self: { sql: Sql | null } = { sql: null };
    const sql = this.connect({
      // Only the current connection counts. One replaced after a missed heartbeat may still report
      // its own close later, and that must not tear down its successor.
      onnotify: (channel, payload) => {
        if (this.conn !== self.sql) return;
        for (const entry of this.entries) if (entry.channel === channel) entry.subscriber.onNotify(payload);
      },
      onclose: () => {
        if (this.conn === self.sql) this.dropped();
      },
    });
    self.sql = sql;
    this.conn = sql;
    return sql;
  }

  /** The connection is gone: nothing is live, everyone told is told it is lost, and a retry is due. */
  private dropped(): void {
    if (this.closed) return;
    this.generation += 1;
    this.proven = false;
    this.live.clear();
    for (const entry of this.entries) {
      if (!entry.told) continue;
      entry.told = false;
      entry.subscriber.onLost?.();
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconcile();
    }, delay);
    // Deliberately not unref()'d: while deltat is down this timer is the only thing keeping a
    // watcher's process alive, and a watcher must outlast an outage. close() clears it.
  }

  /** Run reconcile passes, one at a time, until nothing changed during the last one. */
  private reconcile(): Promise<void> {
    if (this.pass) {
      this.again = true;
      return this.pass;
    }
    this.pass = (async () => {
      try {
        do {
          this.again = false;
          await this.reconcileOnce();
        } while (this.again && !this.closed);
      } finally {
        this.pass = null;
      }
    })();
    return this.pass;
  }

  private async reconcileOnce(): Promise<void> {
    if (this.closed) return;
    const generation = this.generation;
    const conn = this.connection();
    const wanted = () => new Set([...this.entries].map((entry) => entry.channel));
    // After any await: a drop (or close) meanwhile means this pass speaks for a connection that is gone.
    const stale = () => this.closed || generation !== this.generation;

    for (const channel of [...wanted()].filter((c) => !this.live.has(c))) {
      const outcome = await this.statement(conn, "LISTEN", channel);
      // Settled before giving up on this pass: a first attempt fails, a gone resource is gone, and
      // deltat's own "no" is worth reporting, whatever the connection did afterwards.
      if (!outcome.ok) this.failed(channel, outcome.error, generation !== this.generation);
      if (stale()) return; // dropped() scheduled the retry
      if (outcome.ok) this.live.add(channel);
    }

    for (const channel of [...this.live].filter((c) => !wanted().has(c))) {
      await this.statement(conn, "UNLISTEN", channel);
      if (stale()) return;
      this.live.delete(channel);
    }

    for (const entry of this.entries) {
      if (entry.told || !this.live.has(entry.channel)) continue;
      entry.told = true;
      entry.reported = null;
      const first = entry.first;
      entry.first = null;
      entry.subscriber.onSubscribed();
      first?.resolve();
    }

    const waiting = [...this.entries].some((entry) => !entry.told);
    if (waiting) this.scheduleRetry();
    else this.attempt = 0;
    this.keepHeartbeat();
  }

  /**
   * What a failed LISTEN means for the subscribers of `channel` and, when it took the connection
   * with it, for every subscriber still waiting. A pass stops at a drop, so a channel later in the
   * order never gets its own attempt: without this, a first listen() behind a channel whose LISTEN
   * keeps dropping the connection (deltat restarted with another password) would never settle.
   */
  private failed(channel: string, error: unknown, connectionLost: boolean): void {
    const code = sqlstateOf(error);
    for (const entry of [...this.entries]) {
      const own = entry.channel === channel;
      if (!own && !(connectionLost && !entry.told)) continue;
      if (entry.first) {
        this.entries.delete(entry);
        entry.first.reject(error);
      } else if (own && code === UNDEFINED_OBJECT) {
        this.entries.delete(entry);
        entry.subscriber.onGone?.();
      } else if (isServerError(error) && entry.reported !== code) {
        entry.reported = code;
        entry.subscriber.onRetryFailing?.(error);
      }
    }
  }

  /**
   * One statement on `conn`. No answer within the timeout means the connection is dead without having
   * closed (a host that vanished, a dropped NAT flow), so it is replaced and everyone re-subscribes.
   * Every statement goes through here: a pass waiting on a dead socket would otherwise hold off the
   * heartbeat, and with it the only thing that notices, for as long as TCP takes to give up.
   */
  private async statement(conn: Sql, verb: "LISTEN" | "UNLISTEN", channel: string): Promise<Outcome> {
    const query =
      verb === "LISTEN" ? conn`LISTEN ${conn.unsafe(quoted(channel))}` : conn`UNLISTEN ${conn.unsafe(quoted(channel))}`;
    // A connection still being set up (TCP, TLS, auth, deltat loading the tenant) is slow, not dead.
    const limit = this.proven ? this.heartbeat.timeoutMs : this.heartbeat.timeoutMs + this.heartbeat.connectMs;
    const answer = await Promise.race([
      query.then(
        (): Outcome => ({ ok: true }),
        (e: unknown): Outcome => ({ ok: false, error: e ?? new Error(`${verb} failed`) })
      ),
      new Promise<null>((resolve) => unref(setTimeout(() => resolve(null), limit))),
    ]);
    if (answer?.ok && conn === this.conn) this.proven = true;
    if (answer) return answer;
    this.replace(conn);
    return { ok: false, error: new Error(`deltat did not answer ${verb} within ${limit} ms`) };
  }

  /** Give up on `conn` if it is still the current one. Its late close is ignored; the retry builds another. */
  private replace(conn: Sql): void {
    if (this.conn !== conn || this.closed) return;
    this.conn = null;
    this.dropped();
    void conn.end({ timeout: 0 }).catch(() => undefined);
  }

  /**
   * While anything is live, prove the connection is still there: re-LISTEN one live channel, which
   * deltat treats as a no-op. A pass in progress is its own proof, since its statements are timed too.
   */
  private keepHeartbeat(): void {
    if (this.live.size === 0 || this.closed) {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      return;
    }
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => void this.beat(), this.heartbeat.everyMs);
    // A heartbeat alone must not keep a process alive; the subscriptions' socket does that.
    unref(this.heartbeatTimer);
  }

  private async beat(): Promise<void> {
    const conn = this.conn;
    const [channel] = this.live;
    if (!conn || channel === undefined || this.pass) return;
    // Any answer, even an error, proves the connection; statement() replaces it when there is none.
    await this.statement(conn, "LISTEN", channel);
  }
}
