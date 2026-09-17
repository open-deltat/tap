import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { DeltaT } from "@open-deltat/client";

import { VERSION, createDeltatMcpServer } from "../server.js";

// Driven through a real MCP client over an in-memory transport rather than by calling the handlers
// directly, because the thing under test is what a model sees: the tool list, the descriptions it
// routes on, and the text that comes back. A unit test on the callback would not catch a tool that
// failed to register or a description that never shipped.

/** Records every call so a test can assert that nothing reached the database. */
function spyDeltaT(): { dt: DeltaT; calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(name);
      return Promise.resolve(args.length ? {} : {});
    };
  const dt = {
    resources: { create: record("resources.create") },
    holds: {
      place: record("holds.place"),
      commit: record("holds.commit"),
      release: record("holds.release"),
      get: () => {
        calls.push("holds.get");
        return Promise.resolve([]);
      },
    },
    bookings: {
      get: () => {
        calls.push("bookings.get");
        return Promise.resolve([]);
      },
      cancel: record("bookings.cancel"),
    },
    availability: {
      get: () => {
        calls.push("availability.get");
        return Promise.resolve([]);
      },
    },
    rules: { replaceOpenHours: record("rules.replaceOpenHours") },
  };
  return { dt: dt as unknown as DeltaT, calls };
}

async function connect(dt: DeltaT): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    createDeltatMcpServer(dt).connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

const textOf = (result: { content?: unknown }): string => {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (typeof c === "object" && c !== null && "text" in c ? String(c.text) : ""))
    .join("");
};

describe("the booking verb a model reaches for", () => {
  test("book_slot is registered, so the model finds a tool instead of a dead end", async () => {
    const { dt } = spyDeltaT();
    const { tools } = await (await connect(dt)).listTools();
    expect(tools.map((t) => t.name)).toContain("book_slot");
  });

  test("book_slot refuses, names both real steps, and books nothing", async () => {
    const { dt, calls } = spyDeltaT();
    const client = await connect(dt);

    const result = await client.callTool({
      name: "book_slot",
      arguments: { calendar_id: "cal_1", start: "2026-06-01T09:00:00Z", end: "2026-06-01T09:30:00Z" },
    });

    // It must fail, or a model may read a soft "ok" as a confirmed booking.
    expect(result.isError).toBe(true);

    const text = textOf(result);
    expect(text).toContain("hold_slot");
    expect(text).toContain("commit_hold");
    // The refusal has to say plainly that nothing happened; "booked: false" is the field a model
    // is most likely to key on.
    expect(text).toContain('"booked":false');

    // The whole point: no write, and no read either. A stub that quietly placed a hold would be a
    // worse bug than the missing verb it replaces.
    expect(calls).toEqual([]);
  });

  test("every tool description tells the model when to reach for it", async () => {
    const { dt } = spyDeltaT();
    const { tools } = await (await connect(dt)).listTools();

    // The registry listing and the model's routing decision both read this text. A tool that ships
    // with a bare restatement of its own name is the reason agents pick the wrong one.
    for (const tool of tools) {
      expect(tool.description ?? "").toContain("Use this");
      expect((tool.description ?? "").length).toBeGreaterThan(80);
    }
  });

  test("a fault unrelated to the arguments does not invite a retry", async () => {
    // The regression: classify() defaulted to INVALID, which tells a model its arguments were
    // wrong. For a fault that has nothing to do with the arguments (a missing client method, a
    // dead connection) that is an invitation to loop forever, and on hold_slot every pass leaves
    // a live hold blocking the slot until the reaper expires it. This is exactly how a published
    // @open-deltat/client missing Holds.commit would have presented to an agent.
    const calls: string[] = [];
    const dt = {
      resources: { create: () => Promise.resolve({}) },
      holds: {
        place: () => {
          calls.push("place");
          return Promise.reject(new TypeError("dt.holds.commit is not a function"));
        },
        get: () => Promise.resolve([]),
      },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: {
        calendar_id: "cal_1",
        start: "2026-06-01T09:00:00Z",
        end: "2026-06-01T09:30:00Z",
      },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toStartWith("INTERNAL:");
    expect(text).not.toContain("INVALID");
    expect(text).toContain("retrying the same call will not help");
  });

  test("an argument problem is still reported as INVALID, so a retry is worth making", async () => {
    // The other half: narrowing the default must not swallow genuine argument errors, or a model
    // loses the signal that fixing its input would work. A zoneless timestamp is the common case.
    const { dt } = spyDeltaT();
    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: { calendar_id: "cal_1", start: "2026-06-01T09:00", end: "2026-06-01T09:30" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toStartWith("INVALID:");
  });

  test("the server reports the package version in the handshake", async () => {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    // VERSION is stated in server.ts because rootDir rules out importing package.json. This is the
    // assertion that keeps the two from drifting.
    expect(VERSION).toBe(pkg.version);
  });
});
