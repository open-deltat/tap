import { test, expect, spyOn } from "bun:test";
import type { Sql } from "postgres";
import { Events } from "../events.js";
import type { DeltaTEvent } from "../types.js";

// Events.listen only invokes `sql.listen(channel, handler)`. The stub captures the handler so a
// test can drive it the way postgres.js does: synchronously, inside the socket's data path, where
// a thrown error destroys the shared LISTEN connection for every subscriber of the client.
function stubListenSql() {
  const handlers = new Map<string, (payload: string) => void>();
  const sql = {
    listen: (channel: string, fn: (payload: string) => void) => {
      handlers.set(channel, fn);
      return Promise.resolve({ unlisten: () => Promise.resolve() });
    },
  } as unknown as Sql;
  return { sql, handlers };
}

function handlerFor(handlers: Map<string, (payload: string) => void>, resourceId: string) {
  const handler = handlers.get(`resource_${resourceId}`);
  if (!handler) throw new Error(`no handler registered for resource_${resourceId}`);
  return handler;
}

const deletedPayload = (id: string) => JSON.stringify({ ResourceDeleted: { id } });

test("a throwing subscriber does not propagate into the notification handler", async () => {
  const { sql, handlers } = stubListenSql();
  await new Events(sql).listen("r1", () => {
    throw new Error("subscriber bug");
  });

  // Before the fix this throw reached postgres.js's socket data handler, which tears down the
  // shared LISTEN connection for all subscriptions of this client.
  expect(() => handlerFor(handlers, "r1")(deletedPayload("r1"))).not.toThrow();
});

test("a throwing subscriber is reported to onError and later events still arrive", async () => {
  const { sql, handlers } = stubListenSql();
  const seen: DeltaTEvent[] = [];
  const errors: unknown[] = [];
  let first = true;

  await new Events(sql).listen(
    "r1",
    (event) => {
      if (first) {
        first = false;
        throw new Error("first delivery fails");
      }
      seen.push(event);
    },
    { onError: (error) => errors.push(error) }
  );

  const handler = handlerFor(handlers, "r1");
  handler(deletedPayload("r1"));
  handler(deletedPayload("r1"));

  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(Error);
  expect(seen).toHaveLength(1);
});

test("without onError a subscriber error is logged, not thrown", async () => {
  const { sql, handlers } = stubListenSql();
  const consoleError = spyOn(console, "error").mockImplementation(() => {});
  try {
    await new Events(sql).listen("r1", () => {
      throw new Error("subscriber bug");
    });

    expect(() => handlerFor(handlers, "r1")(deletedPayload("r1"))).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
  } finally {
    consoleError.mockRestore();
  }
});

test("a throwing onError hook is contained too", async () => {
  const { sql, handlers } = stubListenSql();
  await new Events(sql).listen(
    "r1",
    () => {
      throw new Error("subscriber bug");
    },
    {
      onError: () => {
        throw new Error("error hook bug");
      },
    }
  );

  expect(() => handlerFor(handlers, "r1")(deletedPayload("r1"))).not.toThrow();
});

test("malformed payloads are skipped without invoking the subscriber", async () => {
  const { sql, handlers } = stubListenSql();
  const seen: DeltaTEvent[] = [];
  await new Events(sql).listen("r1", (event) => seen.push(event));

  const handler = handlerFor(handlers, "r1");
  expect(() => handler("not json")).not.toThrow();
  expect(seen).toHaveLength(0);
});
