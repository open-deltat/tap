/**
 * Live-server suite for the CLI: the commands against a real deltat, and `watch` as a real process.
 *
 * The unit tests fake the server. These pin what only the real thing can: the counter-offer on a
 * lost race, that each command's output parses, and that `watch` run as a child process delivers
 * lines through a pipe as they happen, stops on SIGINT and survives its reader going away.
 *
 * Gated on DELTAT_INTEGRATION_PORT like the other live suites. The process tests need the CLI built
 * (`cd packages/cli && bun run build`), because they run dist/ with node, as a user would.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeltaT } from "@open-deltat/client";
import { main } from "../src/cli.js";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";
const liveTest = enabled ? test : test.skip;

const HOST = process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1";
const PASSWORD = process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat";
// database = tenant in deltat, so a fresh name isolates the whole run.
const TENANT = `it_cli_${crypto.randomUUID().replaceAll("-", "")}`;
const BIN = join(import.meta.dir, "../dist/index.js");

const HOUR = 3_600_000;
const T0 = Date.UTC(2036, 0, 5, 9); // far future: wall-clock now never intersects
const iso = (ms: number) => new Date(ms).toISOString();

const sdk = enabled ? new DeltaT({ host: HOST, port: Number(PORT_ENV), database: TENANT, password: PASSWORD }) : null;
let configDir = "";
let calendar = "";

const env = () => ({
  XDG_CONFIG_HOME: configDir,
  DELTAT_HOST: HOST,
  DELTAT_PORT: String(PORT_ENV),
  DELTAT_DATABASE: TENANT,
  DELTAT_PASSWORD: PASSWORD,
});

beforeAll(async () => {
  if (!sdk) return;
  configDir = await mkdtemp(join(tmpdir(), "deltat-cli-it-"));
  const r = await sdk.resources.create({ name: "cli-it", capacity: 1 });
  await sdk.rules.create([{ resourceId: r.id, start: T0 - 24 * HOUR, end: T0 + 48 * HOUR }]);
  calendar = r.id;
});

afterAll(async () => {
  await sdk?.close();
  if (configDir) await rm(configDir, { recursive: true, force: true });
});

/** The CLI in-process, with the real server behind it. */
async function cli(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    stdout: (t) => {
      out.push(t);
    },
    stderr: (t) => {
      err.push(t);
    },
    env: env(),
    now: () => Date.now(),
    readSecret: async () => null,
    connect: (c) => new DeltaT({ host: c.host, port: c.port, database: c.database, username: c.user, password: c.password }),
    interrupted: () => Promise.resolve(),
    systemTimeZone: "UTC",
  });
  const text = out.join("");
  return { code, err: err.join(""), json: () => JSON.parse(text) };
}

describe("the booking loop against a live deltat", () => {
  liveTest("find, hold, lose a race, commit, list, cancel", async () => {
    const found = await cli("find", calendar, "--from", iso(T0), "--to", iso(T0 + 3 * HOUR), "--json");
    expect(found.code).toBe(0);
    expect(found.json().slots).toEqual([expect.objectContaining({ start: iso(T0), end: iso(T0 + 3 * HOUR), minutes: 180 })]);

    const held = await cli("hold", calendar, "--start", iso(T0), "--end", iso(T0 + HOUR), "--json");
    expect(held.code).toBe(0);
    const holdId: string = held.json().hold_id;

    const lost = await cli("hold", calendar, "--start", iso(T0), "--end", iso(T0 + HOUR), "--json");
    expect(lost.code).toBe(3);
    expect(lost.json()).toMatchObject({ error: "CONFLICT", held: false, reserved: false });

    const committed = await cli("commit", holdId, "--label", "cli-it", "--json");
    expect(committed.code).toBe(0);
    const bookingId: string = committed.json().booking_id;

    const listed = await cli("bookings", calendar, "--json");
    expect(listed.json().bookings).toEqual([expect.objectContaining({ booking_id: bookingId, label: "cli-it" })]);

    expect((await cli("cancel", bookingId)).code).toBe(0);
    expect((await cli("bookings", calendar, "--json")).json().bookings).toEqual([]);
  });

  liveTest("release frees a hold, and releasing it twice is NOT_FOUND", async () => {
    const held = await cli("hold", calendar, "--start", iso(T0 + 2 * HOUR), "--end", iso(T0 + 3 * HOUR), "--json");
    const holdId: string = held.json().hold_id;
    expect((await cli("release", holdId)).code).toBe(0);
    expect((await cli("release", holdId)).code).toBe(5);
  });

  liveTest("an unknown calendar is NOT_FOUND rather than an empty one", async () => {
    const r = await cli("find", "01ZZZZZZZZZZZZZZZZZZZZZZZZ", "--from", iso(T0), "--to", iso(T0 + HOUR));
    expect(r.code).toBe(5);
  });

  liveTest("status reaches the server and does not print the password", async () => {
    const r = await cli("status", "--json");
    expect(r.json()).toMatchObject({ reachable: true, password: "set", password_from: "DELTAT_PASSWORD" });
    expect(JSON.stringify(r.json()) + r.err).not.toContain(PASSWORD);
  });
});

/** Spawn `node dist/index.js watch ... --json` and read its stdout line by line as it arrives. */
function spawnWatch() {
  const proc = Bun.spawn(["node", BIN, "watch", calendar, "--json"], { env: { ...process.env, ...env() }, stdout: "pipe", stderr: "pipe" });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) if (line.trim()) lines.push(JSON.parse(line));
    }
  })();
  const waitFor = async (count: number, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (lines.length < count && Date.now() < deadline) await Bun.sleep(25);
    return lines;
  };
  return { proc, reader, lines, pump, waitFor };
}

describe("watch as a real process", () => {
  liveTest(
    "delivers each change through a pipe as it happens, and exits 0 on SIGINT",
    async () => {
      const client = sdk;
      if (!client) throw new Error("live suite without a client");
      const w = spawnWatch();
      expect((await w.waitFor(1))[0]).toMatchObject({ status: "watching", calendar_id: calendar });

      const hold = await client.holds.place({ resourceId: calendar, start: T0 + 5 * HOUR, end: T0 + 6 * HOUR, expiresAt: Date.now() + 300_000 });
      // Each line must arrive before the next change is made: a buffered stream would deliver
      // nothing here until the process exits, which is exactly how a watcher misses the moment.
      expect((await w.waitFor(2)).map((l) => l.change ?? l.status)).toEqual(["watching", "held"]);
      const { bookingId } = await client.holds.commit(hold.id);
      expect((await w.waitFor(3)).map((l) => l.change ?? l.status)).toEqual(["watching", "held", "booked"]);
      expect(w.lines[2]).toMatchObject({ booking_id: bookingId, start: iso(T0 + 5 * HOUR) });
      expect(w.lines[2]).not.toHaveProperty("label");

      w.proc.kill("SIGINT");
      expect(await w.proc.exited).toBe(0);
      await client.bookings.cancel(bookingId);
    },
    20_000
  );

  liveTest(
    "ends with exit 5 when the calendar it watches is deleted, instead of going silent",
    async () => {
      const client = sdk;
      if (!client) throw new Error("live suite without a client");
      const doomed = await client.resources.create({ name: "cli-it-doomed", capacity: 1 });
      const proc = Bun.spawn(["node", BIN, "watch", doomed.id, "--json"], {
        env: { ...process.env, ...env() },
        stdout: "pipe",
        stderr: "pipe",
      });
      await Bun.sleep(1_500);
      await client.resources.delete(doomed.id);
      const code = await Promise.race([proc.exited, Bun.sleep(5_000).then(() => "still running")]);
      expect(code).toBe(5);
    },
    20_000
  );

  liveTest(
    "exits cleanly when its reader goes away, instead of crashing",
    async () => {
      const client = sdk;
      if (!client) throw new Error("live suite without a client");
      const w = spawnWatch();
      await w.waitFor(1);
      await w.reader.cancel();
      const hold = await client.holds.place({ resourceId: calendar, start: T0 + 7 * HOUR, end: T0 + 8 * HOUR, expiresAt: Date.now() + 300_000 });
      const code = await Promise.race([w.proc.exited, Bun.sleep(5_000).then(() => "still running")]);
      expect(code).toBe(0);
      await client.holds.release(hold.id);
    },
    20_000
  );
});
