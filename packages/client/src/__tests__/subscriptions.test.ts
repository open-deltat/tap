import { describe, expect, test } from "bun:test";
import type { Sql } from "postgres";
import { Subscriptions, type Subscriber } from "../subscriptions.js";

// The retry loop is what keeps a watcher from going silent when deltat restarts. Driven here with a
// fake connection that can refuse LISTEN a given number of times and be "dropped" on demand; the
// live suite (integration/resilience) does the same against a real deltat that is killed.

function fakeConnection() {
  const statements: string[] = [];
  const state = { refusals: 0 };
  const hooks: { onnotify?: (channel: string, payload: string) => void; onclose?: () => void } = {};
  const run = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");
    statements.push(text);
    if (state.refusals > 0) {
      state.refusals -= 1;
      return Promise.reject(new Error("connect ECONNREFUSED"));
    }
    return Promise.resolve([]);
  };
  const conn = Object.assign(run, { unsafe: (s: string) => s, end: async () => undefined });
  const subscriptions = new Subscriptions((h) => {
    hooks.onnotify = h.onnotify;
    hooks.onclose = h.onclose;
    // Only the tagged-template call, unsafe() and end() are used; the cast stands in for the rest.
    return conn as unknown as Sql;
  });
  return {
    subscriptions,
    statements,
    refuse: (n: number) => {
      state.refusals = n;
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

  test("a channel name cannot break out of its quotes", async () => {
    const f = fakeConnection();
    await f.subscriptions.listen('resource_"; DROP', recorder().subscriber);
    expect(f.statements[0]).toBe('LISTEN "resource_""; DROP"');
  });
});
