import { describe, expect, test } from "bun:test";
import type { Sql } from "postgres";
import { Events } from "../events.js";
import type { Listener, Subscriber } from "../subscriptions.js";
import type { DeltaTEvent } from "../types.js";
import type { Change } from "../watch.js";
import { SETTLE_MS } from "../watch.js";

// Events.watch across the moments a live calendar is re-read. The snapshot queries go to a fake
// connection whose answers can be held back, so an event can be delivered while a read is in
// flight: the race a picture that is about to be replaced would otherwise swallow.

const CAL = "01CAL0000000000000000000000";

function fakeSql() {
  const gate = { open: Promise.resolve() as Promise<void> };
  const reads: string[] = [];
  const concurrency = { now: 0, most: 0 };
  const failing = { reads: 0, hanging: 0 };
  const answer = (kind: string) => {
    reads.push(kind);
    if (failing.hanging > 0) {
      failing.hanging -= 1;
      return new Promise<never>(() => undefined); // sent down a connection that died without closing
    }
    concurrency.now += 1;
    concurrency.most = Math.max(concurrency.most, concurrency.now);
    const fails = failing.reads > 0;
    if (fails) failing.reads -= 1;
    return gate.open.then(() => {
      concurrency.now -= 1;
      if (fails) throw new Error("read failed");
      return [];
    });
  };
  // Holds.get and Bookings.get use a tagged template without a window and unsafe() with one.
  const sql = Object.assign(() => answer("unwindowed"), { unsafe: () => answer("windowed") });
  const hold = () => {
    const released = Promise.withResolvers<void>();
    gate.open = released.promise;
    return () => released.resolve();
  };
  /** The next `n` reads fail. A snapshot is two reads (holds, bookings). */
  const failReads = (n: number) => {
    failing.reads = n;
  };
  /** The next `n` reads never answer. */
  const hangReads = (n: number) => {
    failing.hanging = n;
  };
  return { sql: sql as unknown as Sql, reads, hold, concurrency, failReads, hangReads };
}

function fakeListener() {
  const captured: { subscriber: Subscriber | null; stopped: boolean } = { subscriber: null, stopped: false };
  const listener: Listener = {
    listen: async (_channel, subscriber) => {
      captured.subscriber = subscriber;
      subscriber.onSubscribed();
      return async () => {
        captured.stopped = true;
      };
    },
    close: async () => undefined,
  };
  const send = (event: DeltaTEvent) => captured.subscriber?.onNotify(JSON.stringify(event));
  return { listener, captured, send };
}

const held = (id: string, start: number): DeltaTEvent => ({
  HoldPlaced: { id, resource_id: CAL, span: { start, end: start + 1000 }, expires_at: 9e15 },
});
const released = (id: string): DeltaTEvent => ({ HoldReleased: { id, resource_id: CAL } });

async function watching(opts: { window?: { start: number; end: number } } = {}, readTimeoutMs?: number) {
  const db = fakeSql();
  const sub = fakeListener();
  const log: string[] = [];
  const changes: Change[] = [];
  const events = new Events(db.sql, sub.listener, readTimeoutMs);
  const start = () =>
    events.watch(
      CAL,
      (c) => {
        changes.push(c);
        log.push(c.kind);
      },
      {
        ...opts,
        onReady: () => log.push("ready"),
        onDisconnected: () => log.push("disconnected"),
        onResubscribed: () => log.push("resubscribed"),
        onLagged: (n) => log.push(`lagged:${n}`),
        onGone: () => log.push("gone"),
        onError: (e) => log.push(`error:${e instanceof Error ? e.message : "?"}`),
      }
    );
  return { db, sub, log, changes, start };
}

const tick = () => Bun.sleep(0);

describe("Events.watch", () => {
  test("onReady comes before any change, even one that arrived during the first read", async () => {
    const w = await watching();
    const open = w.db.hold();
    const started = w.start();
    await tick();
    w.sub.send(held("h1", 1000));
    open();
    await started;
    expect(w.log).toEqual(["ready", "held"]);
  });

  test("events during a re-read are held and replayed on the fresh picture, so an ending keeps its time", async () => {
    const w = await watching();
    await w.start();
    const open = w.db.hold();
    w.sub.captured.subscriber?.onSubscribed(); // re-subscribed after an outage: the calendar is re-read
    await tick();
    // Placed and released while the re-read is in flight. Applied to the old picture and then
    // replaced, the release would reach the new one with no idea when the hold was.
    w.sub.send(held("h1", 1000));
    w.sub.send(released("h1"));
    open();
    await Bun.sleep(SETTLE_MS + 30);
    expect(w.log).toEqual(["ready", "held", "resubscribed", "hold_ended"]);
    expect(w.changes[1]).toMatchObject({ kind: "hold_ended", start: 1000, end: 2000 });
  });

  test(
    "a re-read that fails is retried, and 'resubscribed' waits until the calendar has really been read",
    async () => {
      const w = await watching();
      await w.start();
      w.db.failReads(4); // two failed snapshots
      w.sub.captured.subscriber?.onSubscribed();
      await Bun.sleep(10);
      // Arrives before the attempt that succeeds, so that read already shows it: not replayed, and
      // "resubscribed" is the line that says changes in between may be missing.
      w.sub.send(held("h1", 1000));
      expect(w.log).toEqual(["ready", "error:read failed"]);
      await Bun.sleep(850); // retries after 250 and 500 ms
      expect(w.log).toEqual(["ready", "error:read failed", "resubscribed"]);
    },
    3_000
  );

  test(
    "a re-read that never answers times out and is tried again, instead of holding the watch forever",
    async () => {
      const w = await watching({}, 50);
      await w.start();
      w.db.hangReads(2); // one snapshot, sent down a dead connection
      w.sub.captured.subscriber?.onSubscribed();
      await Bun.sleep(400); // 50 ms timeout, then the 250 ms retry
      expect(w.log).toEqual(["ready", "error:reading the calendar took longer than 50 ms", "resubscribed"]);
    },
    3_000
  );

  test("a re-read that a newer drop overtook does not announce the stream complete", async () => {
    const w = await watching();
    await w.start();
    w.sub.captured.subscriber?.onLost?.();
    const open = w.db.hold();
    w.sub.captured.subscriber?.onSubscribed(); // re-read in flight
    await tick();
    w.sub.captured.subscriber?.onLost?.(); // and the connection drops again
    open();
    await Bun.sleep(10);
    expect(w.log).toEqual(["ready", "disconnected", "disconnected"]);
    w.sub.captured.subscriber?.onSubscribed();
    await Bun.sleep(10);
    expect(w.log).toEqual(["ready", "disconnected", "disconnected", "resubscribed"]);
  });

  test("a Lagged notice re-reads the calendar and says how much was missed", async () => {
    const w = await watching();
    await w.start();
    const readsBefore = w.db.reads.length;
    w.sub.send({ Lagged: { missed: 7 } });
    await Bun.sleep(10);
    expect(w.log).toEqual(["ready", "lagged:7"]);
    expect(w.db.reads.length).toBeGreaterThan(readsBefore);
  });

  test("the watched calendar being deleted ends the watch and says so", async () => {
    const w = await watching();
    await w.start();
    w.sub.send({ ResourceDeleted: { id: CAL } });
    await tick();
    w.sub.send(held("h1", 1000));
    expect(w.log).toEqual(["ready", "gone"]);
    expect(w.sub.captured.stopped).toBe(true);
  });

  test("a child resource being deleted is not the calendar going away", async () => {
    const w = await watching();
    await w.start();
    w.sub.send({ ResourceDeleted: { id: "01CHILD" } });
    w.sub.send(held("h1", 1000));
    expect(w.log).toEqual(["ready", "held"]);
  });

  test("a subscription that comes back gone (deleted during an outage) ends the watch too", async () => {
    const w = await watching();
    await w.start();
    w.sub.captured.subscriber?.onGone?.();
    await tick();
    expect(w.log).toEqual(["ready", "gone"]);
    expect(w.sub.captured.stopped).toBe(true);
  });

  test("a connection blip during the first read is reported after ready, and the re-read waits its turn", async () => {
    const w = await watching();
    const open = w.db.hold();
    const started = w.start();
    await tick();
    w.sub.captured.subscriber?.onLost?.();
    w.sub.captured.subscriber?.onSubscribed(); // re-subscribed while the first read is in flight
    await tick();
    open();
    await started;
    await Bun.sleep(10);
    expect(w.log).toEqual(["ready", "disconnected", "resubscribed"]);
    expect(w.db.concurrency.most).toBe(2); // the two reads of one snapshot (holds, bookings), never two snapshots
  });

  test("the calendar deleted during the first read: no ready, only gone", async () => {
    const w = await watching();
    const open = w.db.hold();
    const started = w.start();
    await tick();
    w.sub.captured.subscriber?.onGone?.();
    open();
    await started;
    expect(w.log).toEqual(["gone"]);
  });

  test("stopping reports a release still waiting for its booking instead of dropping it", async () => {
    const w = await watching();
    const stop = await w.start();
    w.sub.send(held("h1", 1000));
    w.sub.send(released("h1")); // an older kernel: parked for SETTLE_MS
    await stop();
    expect(w.log).toEqual(["ready", "held", "hold_ended"]);
  });

  test("a malformed Lagged notice is skipped, not reported as 'missed undefined'", async () => {
    const w = await watching();
    await w.start();
    w.sub.captured.subscriber?.onNotify(JSON.stringify({ Lagged: {} }));
    w.sub.captured.subscriber?.onNotify("\"just a string\"");
    await Bun.sleep(10);
    expect(w.log).toEqual(["ready"]);
  });

  test("with a window, the calendar is read for that window only", async () => {
    const w = await watching({ window: { start: 0, end: 10_000 } });
    await w.start();
    expect(w.db.reads).toEqual(["windowed", "windowed"]);
    const unwindowed = await watching();
    await unwindowed.start();
    expect(unwindowed.db.reads).toEqual(["unwindowed", "unwindowed"]);
  });
});
