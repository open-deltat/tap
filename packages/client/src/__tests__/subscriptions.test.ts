import { describe, expect, test } from "bun:test";
import postgres, { type Sql } from "postgres";
import { Subscriptions, type HeartbeatOptions, type Subscriber } from "../subscriptions.js";

// The retry loop is what keeps a watcher from going silent when deltat restarts. Driven here with a
// fake connection that behaves like postgres.js where it matters: a connection-level failure
// (unreachable, wrong password) rejects the statement AND closes the connection, a channel-level
// one (unknown resource, limit reached) only rejects it, an error deltat sent carries a severity,
// and a connection can stop answering without closing. The live suite (integration/resilience) does
// the same against a real deltat that is killed.
//
// postgres.js 3.4.8 rejects the statement first and reports the close on a later tick (measured on
// Bun and Node). Every test runs in that order and in the reverse one, so neither is relied on.

type Hooks = { onnotify: (channel: string, payload: string) => void; onclose: () => void };
type CloseOrder = "reject, then close" | "close, then reject";

const QUIET: HeartbeatOptions = { everyMs: 60_000, timeoutMs: 60_000, connectMs: 0 };

/**
 * How deltat's own errors arrive: a PostgresError with the fields deltat's ErrorResponse carries,
 * which are S, C and M. No V, so no `severity`; a fake that set one hid a check that relied on it.
 * Constructed the way postgres.js does it (connection.js, from the parsed fields); its types only
 * declare Error's constructor, and this file is not type-checked.
 */
const serverError = (code: string) =>
  new postgres.PostgresError({ severity_local: "ERROR", code, message: `deltat said ${code}` });
/** How a failing connection arrives: Node's code, no severity. */
const socketError = (code: string) => Object.assign(new Error(`connect ${code}`), { code });

function fakeConnection(order: CloseOrder, heartbeat: HeartbeatOptions = QUIET) {
  const statements: string[] = [];
  const ended: unknown[] = [];
  const connections: Hooks[] = [];
  const state: {
    /** Statements left that fail with ECONNREFUSED. */
    refusals: number;
    /** While set, every statement fails with this error and closes the connection. */
    down: Error | null;
    /** Channels whose LISTEN fails with this SQLSTATE, connection left open. */
    broken: Map<string, string>;
    /** When set, the next statement waits for this before answering. */
    pause: Promise<void> | null;
    /** LISTENs on these channels wait for their gate before answering. */
    paused: Map<string, Promise<void>>;
    /** Connections, by index, that stopped answering without closing. */
    hung: Set<number>;
  } = { refusals: 0, down: null, broken: new Map(), pause: null, paused: new Map(), hung: new Set() };

  const subscriptions = new Subscriptions((hooks) => {
    const index = connections.push(hooks) - 1;
    const closeWith = (error: Error): never => {
      if (order === "close, then reject") hooks.onclose();
      else setTimeout(hooks.onclose, 0);
      throw error;
    };
    const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");
      statements.push(text);
      if (state.hung.has(index)) return new Promise<never>(() => undefined);
      const pause = state.pause;
      state.pause = null;
      if (pause) await pause;
      const gate = [...state.paused].find(([channel]) => text.startsWith("LISTEN") && text.includes(`"${channel}"`));
      if (gate) {
        state.paused.delete(gate[0]);
        await gate[1];
      }
      if (state.down) closeWith(state.down);
      if (state.refusals > 0) {
        state.refusals -= 1;
        closeWith(socketError("ECONNREFUSED"));
      }
      const broken = [...state.broken].find(([channel]) => text.includes(`"${channel}"`));
      if (broken) throw serverError(broken[1]);
      return [];
    };
    const conn = Object.assign(run, {
      unsafe: (s: string) => s,
      end: async (options?: unknown) => {
        ended.push(options);
      },
    });
    // Only the tagged-template call, unsafe() and end() are used; the cast stands in for the rest.
    return conn as unknown as Sql;
  }, heartbeat);

  const latest = () => connections.at(-1);
  return {
    subscriptions,
    statements,
    ended,
    connections,
    refuse: (n: number) => {
      state.refusals = n;
    },
    /** Every statement fails and closes the connection, with a socket error unless deltat's own is given. */
    goDown: (error: Error = socketError("ECONNREFUSED")) => {
      state.down = error;
    },
    comeBack: () => {
      state.down = null;
    },
    breakChannel: (channel: string, sqlstate: string) => state.broken.set(channel, sqlstate),
    pauseNext: () => {
      const gate = Promise.withResolvers<void>();
      state.pause = gate.promise;
      return () => gate.resolve();
    },
    /** The next LISTEN on `channel` waits until the returned function is called. */
    pauseChannel: (channel: string) => {
      const gate = Promise.withResolvers<void>();
      state.paused.set(channel, gate.promise);
      return () => gate.resolve();
    },
    /** The current connection stops answering and never closes, like a host that vanished. */
    hang: () => state.hung.add(connections.length - 1),
    notify: (channel: string, payload: string) => latest()?.onnotify(channel, payload),
    drop: () => latest()?.onclose(),
  };
}

function recorder() {
  const log: string[] = [];
  const subscriber: Subscriber = {
    onNotify: (p) => log.push(`notify:${p}`),
    onSubscribed: () => log.push("subscribed"),
    onLost: () => log.push("lost"),
    onGone: () => log.push("gone"),
    onRetryFailing: (e) => log.push(`failing:${(e as { code?: string }).code ?? "?"}`),
  };
  return { log, subscriber };
}

const listensOn = (statements: string[], channel: string) =>
  statements.filter((s) => s === `LISTEN "${channel}"`).length;

const listens = (statements: string[]) => statements.filter((s) => s.startsWith("LISTEN")).length;

for (const order of ["reject, then close", "close, then reject"] as const) {
describe(`Subscriptions (${order})`, () => {
  const fake = (heartbeat?: HeartbeatOptions) => fakeConnection(order, heartbeat);

  test("two subscribers on one channel share one LISTEN, and both hear it", async () => {
    const f = fake();
    const a = recorder();
    const b = recorder();
    await f.subscriptions.listen("resource_1", a.subscriber);
    await f.subscriptions.listen("resource_1", b.subscriber);
    f.notify("resource_1", "x");
    expect(listens(f.statements)).toBe(1);
    expect(a.log).toEqual(["subscribed", "notify:x"]);
    expect(b.log).toEqual(["subscribed", "notify:x"]);
  });

  test("the last unsubscribe UNLISTENs, earlier ones do not", async () => {
    const f = fake();
    const stopA = await f.subscriptions.listen("resource_1", recorder().subscriber);
    const stopB = await f.subscriptions.listen("resource_1", recorder().subscriber);
    await stopA();
    expect(f.statements.some((s) => s.startsWith("UNLISTEN"))).toBe(false);
    await stopB();
    expect(f.statements.at(-1)).toBe('UNLISTEN "resource_1"');
  });

  test("a first LISTEN that fails rejects and leaves nothing subscribed", async () => {
    const f = fake();
    f.refuse(1);
    const r = recorder();
    await expect(f.subscriptions.listen("resource_1", r.subscriber)).rejects.toThrow("ECONNREFUSED");
    f.notify("resource_1", "x");
    expect(r.log).toEqual([]);
  });

  test(
    "a dropped connection is re-subscribed through refused attempts, and unreachability alone is not reported as failing",
    async () => {
      const f = fake();
      const r = recorder();
      await f.subscriptions.listen("resource_1", r.subscriber);
      f.refuse(2);
      f.drop();
      // A failed attempt closes again; the loss must still be announced only once.
      f.drop();
      await Bun.sleep(2_200); // 250 + 500 + 1000 ms of backoff
      expect(listens(f.statements)).toBe(4);
      // "lost" already said deltat is unreachable. Saying it again on every refused attempt is what
      // printed reconnect_failing a quarter second into every ordinary restart.
      expect(r.log).toEqual(["subscribed", "lost", "subscribed"]);
      f.notify("resource_1", "after");
      expect(r.log.at(-1)).toBe("notify:after");
    },
    6_000
  );

  test(
    "close() stops retrying for good",
    async () => {
      const f = fake();
      await f.subscriptions.listen("resource_1", recorder().subscriber);
      f.goDown();
      f.drop();
      await f.subscriptions.close();
      await Bun.sleep(800);
      expect(listens(f.statements)).toBe(1);
      await expect(f.subscriptions.listen("resource_2", recorder().subscriber)).rejects.toThrow("closed");
    },
    3_000
  );

  test(
    "a channel that keeps failing does not strand the others: each is back the moment it is",
    async () => {
      const f = fake();
      const a = recorder();
      const b = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      await f.subscriptions.listen("resource_b", b.subscriber);
      f.breakChannel("resource_b", "54000");
      f.drop();
      await Bun.sleep(400);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(b.log).toEqual(["subscribed", "lost", "failing:54000"]);
      f.notify("resource_a", "x");
      expect(a.log.at(-1)).toBe("notify:x");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a channel whose resource was deleted during the outage is reported gone, not retried forever",
    async () => {
      const f = fake();
      const a = recorder();
      const b = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      await f.subscriptions.listen("resource_b", b.subscriber);
      f.breakChannel("resource_b", "42704");
      f.drop();
      await Bun.sleep(400);
      expect(b.log).toEqual(["subscribed", "lost", "gone"]);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      const listensAfter = listens(f.statements);
      await Bun.sleep(900);
      expect(listens(f.statements)).toBe(listensAfter);
    },
    3_000
  );

  test(
    "a LISTEN that succeeded on a connection that then closed does not count: listen() settles on the retry",
    async () => {
      const f = fake();
      const r = recorder();
      const resume = f.pauseNext();
      const subscribing = f.subscriptions.listen("resource_1", r.subscriber);
      await Bun.sleep(0);
      f.drop(); // the connection closes while the first LISTEN is in flight
      resume();
      await subscribing;
      expect(r.log).toEqual(["subscribed"]);
      expect(listens(f.statements)).toBe(2);
    },
    3_000
  );

  test(
    "a drop in the middle of a retry voids the LISTENs that had already returned, so none is stranded",
    async () => {
      const f = fake();
      const a = recorder();
      const b = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      await f.subscriptions.listen("resource_b", b.subscriber);
      const resumeB = f.pauseChannel("resource_b");
      f.drop();
      await Bun.sleep(300); // the retry ran: A's LISTEN returned, B's is still in flight
      f.drop(); // and now the connection those LISTENs used is gone
      resumeB();
      await Bun.sleep(700); // the next attempt (500 ms backoff) listens both again
      expect(listensOn(f.statements, "resource_a")).toBe(3);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(b.log).toEqual(["subscribed", "lost", "subscribed"]);
      f.notify("resource_a", "x");
      expect(a.log.at(-1)).toBe("notify:x");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a drop during an UNLISTEN voids the pass, so no channel is taken for live on the dead connection",
    async () => {
      const f = fake();
      const a = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      const stopU = await f.subscriptions.listen("resource_u", recorder().subscriber);
      const resume = f.pauseNext();
      await stopU(); // its UNLISTEN is now in flight
      f.drop();
      resume();
      await Bun.sleep(400);
      expect(listensOn(f.statements, "resource_a")).toBe(2);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      f.notify("resource_a", "x");
      expect(a.log.at(-1)).toBe("notify:x");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a channel given up while its retry is in flight is UNLISTENed, not marked live, and unsubscribing does not wait for it",
    async () => {
      const f = fake();
      const r = recorder();
      const stop = await f.subscriptions.listen("resource_1", r.subscriber);
      const resume = f.pauseChannel("resource_1");
      f.drop();
      await Bun.sleep(300);
      await stop();
      resume();
      await Bun.sleep(50);
      expect(f.statements.at(-1)).toBe('UNLISTEN "resource_1"');
      expect(r.log).toEqual(["subscribed", "lost"]);
    },
    3_000
  );

  test(
    "a subscriber that joins while a retry is in flight is told it subscribed exactly once, with the others",
    async () => {
      const f = fake();
      const first = recorder();
      await f.subscriptions.listen("resource_1", first.subscriber);
      const resume = f.pauseChannel("resource_1");
      f.drop();
      await Bun.sleep(300);
      const second = recorder();
      const joining = f.subscriptions.listen("resource_1", second.subscriber);
      resume();
      await joining;
      await Bun.sleep(50);
      expect(second.log).toEqual(["subscribed"]);
      expect(first.log).toEqual(["subscribed", "lost", "subscribed"]);
    },
    3_000
  );

  test(
    "a subscriber whose own LISTEN brings a lost channel back tells the earlier subscribers too",
    async () => {
      const f = fake();
      const first = recorder();
      await f.subscriptions.listen("resource_1", first.subscriber);
      f.drop();
      const second = recorder();
      await f.subscriptions.listen("resource_1", second.subscriber); // before the retry timer fires
      expect(first.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(second.log).toEqual(["subscribed"]);
      await Bun.sleep(400); // the retry finds nothing left to do
      expect(listens(f.statements)).toBe(2);
      expect(first.log).toEqual(["subscribed", "lost", "subscribed"]);
    },
    3_000
  );

  test(
    "a first listen() while deltat is down rejects instead of claiming to be subscribed",
    async () => {
      const f = fake();
      const a = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      f.goDown();
      f.drop();
      const b = recorder();
      await expect(f.subscriptions.listen("resource_b", b.subscriber)).rejects.toThrow("ECONNREFUSED");
      expect(b.log).toEqual([]);
      f.comeBack();
      await Bun.sleep(1_000);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(b.log).toEqual([]);
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "deltat refusing the reconnect is reported to every waiting subscriber, once per reason, and retrying continues",
    async () => {
      const f = fake();
      const a = recorder();
      const b = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      await f.subscriptions.listen("resource_b", b.subscriber);
      f.goDown(serverError("28P01")); // deltat came back with a different password
      f.drop();
      await Bun.sleep(900); // two failed attempts, each closing the connection
      expect(a.log).toEqual(["subscribed", "lost", "failing:28P01"]);
      expect(b.log).toEqual(["subscribed", "lost", "failing:28P01"]);
      f.comeBack();
      await Bun.sleep(1_100);
      expect(a.log).toEqual(["subscribed", "lost", "failing:28P01", "subscribed"]);
      expect(b.log).toEqual(["subscribed", "lost", "failing:28P01", "subscribed"]);
      await f.subscriptions.close();
    },
    4_000
  );

  test(
    "a first listen() behind a channel that keeps failing the connection still settles",
    async () => {
      const f = fake();
      await f.subscriptions.listen("resource_a", recorder().subscriber);
      f.goDown(serverError("28P01"));
      f.drop();
      await expect(f.subscriptions.listen("resource_b", recorder().subscriber)).rejects.toThrow("28P01");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a connection that stops answering without closing is replaced, and its late close is ignored",
    async () => {
      const f = fake({ everyMs: 50, timeoutMs: 50, connectMs: 100 });
      const r = recorder();
      await f.subscriptions.listen("resource_1", r.subscriber);
      await Bun.sleep(200); // healthy beats change nothing
      expect(r.log).toEqual(["subscribed"]);
      expect(f.connections.length).toBe(1);

      f.hang();
      await Bun.sleep(500); // a beat times out, then the 250 ms retry opens a new connection
      expect(r.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(f.connections.length).toBe(2);
      expect(f.ended).toContainEqual({ timeout: 0 });

      f.connections[0]?.onclose(); // the replaced connection finally notices
      f.connections[0]?.onnotify("resource_1", "stale");
      f.notify("resource_1", "fresh");
      expect(r.log).toEqual(["subscribed", "lost", "subscribed", "notify:fresh"]);
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a subscribe that meets a dead connection replaces it instead of waiting on it, so the others are not left deaf",
    async () => {
      // Only the statement timeout can catch this: the heartbeat stays out of the way of a pass.
      const f = fake({ everyMs: 60_000, timeoutMs: 50, connectMs: 100 });
      const a = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      f.hang();
      await expect(f.subscriptions.listen("resource_b", recorder().subscriber)).rejects.toThrow("did not answer");
      await Bun.sleep(400); // the 250 ms retry, on a new connection
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(f.connections.length).toBe(2);
      f.notify("resource_a", "x");
      expect(a.log.at(-1)).toBe("notify:x");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a connection that is slow to set up is given the connect time, not taken for dead",
    async () => {
      const f = fake({ everyMs: 60_000, timeoutMs: 50, connectMs: 200 });
      const resume = f.pauseNext(); // TLS, auth, deltat loading the tenant
      const subscribing = f.subscriptions.listen("resource_1", recorder().subscriber);
      await Bun.sleep(120); // past the statement timeout, inside timeout + connect
      resume();
      await subscribing;
      expect(f.connections.length).toBe(1);
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a new connection that never answers is still given up, after the statement and connect time",
    async () => {
      const f = fake({ everyMs: 60_000, timeoutMs: 50, connectMs: 100 });
      f.pauseNext(); // never resumed
      await expect(f.subscriptions.listen("resource_1", recorder().subscriber)).rejects.toThrow("within 150 ms");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a socket error whose code looks like a SQLSTATE (EPIPE) is not reported as deltat refusing",
    async () => {
      const f = fake();
      const r = recorder();
      await f.subscriptions.listen("resource_1", r.subscriber);
      f.goDown(socketError("EPIPE"));
      f.drop();
      await Bun.sleep(900);
      expect(r.log).toEqual(["subscribed", "lost"]);
      await f.subscriptions.close();
    },
    3_000
  );

  test("close() bounds how long it waits for the connection to end", async () => {
    const f = fake();
    await f.subscriptions.listen("resource_1", recorder().subscriber);
    await f.subscriptions.close();
    expect(f.ended).toEqual([{ timeout: 5 }]);
  });

  test("a channel name cannot break out of its quotes", async () => {
    const f = fake();
    await f.subscriptions.listen('resource_"; DROP', recorder().subscriber);
    expect(f.statements[0]).toBe('LISTEN "resource_""; DROP"');
  });
});
}
