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

  test("a refused hold hands the model the times that would work", async () => {
    // The whole point of counter-offers: the model can offer an alternative in the same turn
    // instead of spending a round trip on find_slots. On a live call that round trip is silence.
    // Derived from the ISO strings rather than written as epoch literals, so the expectation
    // below cannot silently drift from the fixture.
    const wantedStart = Date.parse("2026-06-01T09:00:00Z");
    const altStart = Date.parse("2026-06-01T12:00:00Z");
    const refusal = Object.assign(new Error("span is already allocated"), {
      code: "40001",
      detail: JSON.stringify({
        deltat: 1,
        kind: "conflict",
        sqlstate: "40001",
        retry_same_span: true,
        reserved: false,
        as_of: wantedStart,
        requested: { start: wantedStart, end: wantedStart + 3_600_000 },
        schedule: "known",
        alternatives: [{ start: altStart, end: altStart + 3_600_000 }],
      }),
    });

    const dt = {
      holds: { place: () => Promise.reject(refusal), get: () => Promise.resolve([]) },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: {
        calendar_id: "cal_1",
        start: "2026-06-01T09:00:00Z",
        end: "2026-06-01T10:00:00Z",
        timezone: "Europe/Berlin",
      },
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result));
    expect(body.error).toBe("CONFLICT");
    expect(body.alternatives).toHaveLength(1);
    expect(body.alternatives[0].start).toBe("2026-06-01T12:00:00.000Z");
    // Rendered in the caller's zone, because this is the string the model reads out loud.
    expect(body.alternatives[0].start_local).toContain("2:00");
    // The triple that stops a model narrating "I moved you to 2pm".
    expect(body.booked).toBe(false);
    expect(body.held).toBe(false);
    expect(body.reserved).toBe(false);
    expect(body.next).toContain("NOT reserved");
  });

  test("a time outside opening hours is a CONFLICT, not an INTERNAL fault", async () => {
    // The regression this fixes: ClosedBySchedule matched none of the old message regexes, so a
    // request merely outside opening hours told the model "retrying will not help" and it
    // abandoned a booking it could have made by asking for a different time.
    // Message deliberately chosen to match NONE of the fallback regexes, so only the SQLSTATE
    // branch can classify it. With a realistic "outside open windows" message the fallback also
    // catches it, and the test would pass even with the 23514 case deleted; this version fails if
    // the SQLSTATE path regresses, which is the thing actually being fixed.
    const refusal = Object.assign(new Error("span [1000, 2000) rejected by schedule"), {
      code: "23514",
    });
    const dt = {
      holds: { place: () => Promise.reject(refusal), get: () => Promise.resolve([]) },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: { calendar_id: "cal_1", start: "2026-06-01T03:00:00Z", end: "2026-06-01T04:00:00Z" },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain("CONFLICT");
    expect(text).not.toContain("INTERNAL");
    expect(text).not.toContain("retrying the same call will not help");
  });

  test("a hold that lapsed reports EXPIRED, not NOT_FOUND", async () => {
    // A lapsed hold surfaces as 42704 (unknown id). Reporting that as NOT_FOUND would tell the
    // model it had the wrong calendar, when the truth is its hold expired and it should re-place.
    const refusal = Object.assign(new Error("not found: unknown hold 01ARZ"), { code: "42704" });
    const dt = {
      holds: { commit: () => Promise.reject(refusal) },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "commit_hold",
      arguments: { hold_id: "01ARZ" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("EXPIRED");
  });

  test("a refusal with no alternatives keeps the plain shape older kernels produce", async () => {
    // Counter-offers can be switched off server-side, and a refusal with nothing free carries no
    // DETAIL at all. Both must still produce a readable error rather than an empty JSON husk.
    const refusal = Object.assign(new Error("span is already allocated"), { code: "40001" });
    const dt = {
      holds: { place: () => Promise.reject(refusal), get: () => Promise.resolve([]) },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: { calendar_id: "cal_1", start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("CONFLICT: span is already allocated");
  });

  test("an unscheduled calendar is not reported as having no availability", async () => {
    const refusal = Object.assign(new Error("span is already allocated"), {
      code: "40001",
      detail: JSON.stringify({
        deltat: 1,
        kind: "conflict",
        sqlstate: "40001",
        retry_same_span: true,
        reserved: false,
        as_of: 1_700_000_000_000,
        requested: { start: 1_700_000_000_000, end: 1_700_003_600_000 },
        schedule: "unscheduled",
        alternatives: [],
      }),
    });
    const dt = {
      holds: { place: () => Promise.reject(refusal), get: () => Promise.resolve([]) },
    } as unknown as DeltaT;

    const client = await connect(dt);
    const result = await client.callTool({
      name: "hold_slot",
      arguments: { calendar_id: "cal_1", start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
    });

    const body = JSON.parse(textOf(result));
    expect(body.schedule).toBe("unscheduled");
    expect(body.next).toContain("still accepts bookings");
  });

  test("the server reports the package version in the handshake", async () => {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    // VERSION is stated in server.ts because rootDir rules out importing package.json. This is the
    // assertion that keeps the two from drifting.
    expect(VERSION).toBe(pkg.version);
  });
});
