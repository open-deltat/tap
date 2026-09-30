import { describe, expect, test } from "bun:test";
import type { Sql } from "postgres";
import { Subscriptions, type Subscriber } from "../subscriptions.js";

// The retry loop is what keeps a watcher from going silent when deltat restarts. Driven here with a
// fake connection that can refuse LISTEN a given number of times and be "dropped" on demand; the
// live suite (integration/resilience) does the same against a real deltat that is killed.

function fakeConnection() {
  const statements: string[] = [];
  const ended: unknown[] = [];
  const state: {
    refusals: number;
    /** Channels whose LISTEN always fails, with the SQLSTATE deltat would send. */
    broken: Map<string, string | undefined>;
    /** When set, the next LISTEN waits for this before answering. */
    pause: Promise<void> | null;
  } = { refusals: 0, broken: new Map(), pause: null };
  const hooks: { onnotify?: (channel: string, payload: string) => void; onclose?: () => void } = {};
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");
    statements.push(text);
    const pause = state.pause;
    state.pause = null;
    if (pause) await pause;
    const broken = [...state.broken].find(([channel]) => text.includes(`"${channel}"`));
    if (broken) throw Object.assign(new Error("listen refused"), broken[1] ? { code: broken[1] } : {});
    if (state.refusals > 0) {
      state.refusals -= 1;
      throw new Error("connect ECONNREFUSED");
    }
    return [];
  };
  const conn = Object.assign(run, {
    unsafe: (s: string) => s,
    end: async (options?: unknown) => {
      ended.push(options);
    },
  });
  const subscriptions = new Subscriptions((h) => {
    hooks.onnotify = h.onnotify;
    hooks.onclose = h.onclose;
    // Only the tagged-template call, unsafe() and end() are used; the cast stands in for the rest.
    return conn as unknown as Sql;
  });
  return {
    subscriptions,
    statements,
    ended,
    refuse: (n: number) => {
      state.refusals = n;
    },
    breakChannel: (channel: string, sqlstate?: string) => state.broken.set(channel, sqlstate),
    pauseNext: () => {
      const gate = Promise.withResolvers<void>();
      state.pause = gate.promise;
      return () => gate.resolve();
    },
    notify: (channel: string, payload: string) => hooks.onnotify?.(channel, payload),
    drop: () => hooks.onclose?.(),
  };
}

function recorder() {
  const log: string[] = [];
  const subscriber: Subscriber = {
    onNotify: (p) => log.push(`notify:${p}`),
    onSubscribed: () => log.push("subscribed"),
    onLost: () => log.push("lost"),
    onGone: () => log.push("gone"),
  };
  return { log, subscriber };
}

const listens = (statements: string[]) => statements.filter((s) => s.startsWith("LISTEN")).length;

describe("Subscriptions", () => {
  test("two subscribers on one channel share one LISTEN, and both hear it", async () => {
    const f = fakeConnection();
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
    const f = fakeConnection();
    const stopA = await f.subscriptions.listen("resource_1", recorder().subscriber);
    const stopB = await f.subscriptions.listen("resource_1", recorder().subscriber);
    await stopA();
    expect(f.statements.some((s) => s.startsWith("UNLISTEN"))).toBe(false);
    await stopB();
    expect(f.statements.at(-1)).toBe('UNLISTEN "resource_1"');
  });

  test("a first LISTEN that fails rejects and leaves nothing subscribed", async () => {
    const f = fakeConnection();
    f.refuse(1);
    const r = recorder();
    await expect(f.subscriptions.listen("resource_1", r.subscriber)).rejects.toThrow("ECONNREFUSED");
    f.notify("resource_1", "x");
    expect(r.log).toEqual([]);
  });

  test(
    "a dropped connection is re-subscribed through refused attempts, and the subscriber hears lost then subscribed",
    async () => {
      const f = fakeConnection();
      const r = recorder();
      await f.subscriptions.listen("resource_1", r.subscriber);
      f.refuse(2);
      f.drop();
      // A failed attempt closes again; the loss must still be announced only once.
      f.drop();
      await Bun.sleep(2_200); // 250 + 500 + 1000 ms of backoff
      expect(listens(f.statements)).toBe(4);
      expect(r.log).toEqual(["subscribed", "lost", "subscribed"]);
      f.notify("resource_1", "after");
      expect(r.log.at(-1)).toBe("notify:after");
    },
    6_000
  );

  test(
    "close() stops retrying for good",
    async () => {
      const f = fakeConnection();
      await f.subscriptions.listen("resource_1", recorder().subscriber);
      f.refuse(1_000);
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
      const f = fakeConnection();
      const a = recorder();
      const b = recorder();
      await f.subscriptions.listen("resource_a", a.subscriber);
      await f.subscriptions.listen("resource_b", b.subscriber);
      f.breakChannel("resource_b"); // connection-level failures on B only, forever
      f.drop();
      await Bun.sleep(400);
      expect(a.log).toEqual(["subscribed", "lost", "subscribed"]);
      expect(b.log).toEqual(["subscribed", "lost"]);
      f.notify("resource_a", "x");
      expect(a.log.at(-1)).toBe("notify:x");
      await f.subscriptions.close();
    },
    3_000
  );

  test(
    "a channel whose resource was deleted during the outage is reported gone, not retried forever",
    async () => {
      const f = fakeConnection();
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
    "a LISTEN that succeeded on a connection that then closed does not count as live",
    async () => {
      const f = fakeConnection();
      const r = recorder();
      const resume = f.pauseNext();
      const subscribing = f.subscriptions.listen("resource_1", r.subscriber);
      await Bun.sleep(0);
      f.drop(); // the connection closes while the first LISTEN is in flight
      resume();
      await subscribing;
      await Bun.sleep(400);
      // Subscribed once for the (stale) first LISTEN and again when the retry really re-listened,
      // which a watch treats as "re-read, you may have missed something". Never stranded.
      expect(r.log).toEqual(["subscribed", "subscribed"]);
      expect(listens(f.statements)).toBe(2);
    },
    3_000
  );

  test("close() bounds how long it waits for the connection to end", async () => {
    const f = fakeConnection();
    await f.subscriptions.listen("resource_1", recorder().subscriber);
    await f.subscriptions.close();
    expect(f.ended).toEqual([{ timeout: 5 }]);
  });

  test("a channel name cannot break out of its quotes", async () => {
    const f = fakeConnection();
    await f.subscriptions.listen('resource_"; DROP', recorder().subscriber);
    expect(f.statements[0]).toBe('LISTEN "resource_""; DROP"');
  });
});
