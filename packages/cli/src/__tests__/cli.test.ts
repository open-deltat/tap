import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Change, DeltaT } from "@open-deltat/client";
import { VERSION, main } from "../cli.js";
import type { Io } from "../commands.js";
import { configPath } from "../config.js";

// Driven through main() with a fake server, because what matters is what a person or a model sees:
// the output, the exit code, and whether anything touched the network. The live suite in
// ../../integration runs the same commands against a real deltat.

const CAL = "01CALENDAR0000000000000000";
const PASSWORD = "correct-horse-battery-staple";
const T = "2026-10-01T09:00:00+02:00";
const T2 = "2026-10-01T12:00:00+02:00";

type WatchHooks = { onDisconnected?: () => void; onResubscribed?: () => void };

type Fake = {
  dt: DeltaT;
  calls: string[];
  closed: () => number;
  emit: (c: Change) => void;
  /** The connection to deltat drops, then comes back, as events.watch reports it. */
  outage: () => void;
};

/** The subset of DeltaT the CLI calls, recording each call. Behaviour is overridable per test. */
function fakeServer(overrides: Record<string, (...args: unknown[]) => Promise<unknown>> = {}): Fake {
  const calls: string[] = [];
  const closes: number[] = [];
  const watchers: ((c: Change) => void)[] = [];
  const hooks: WatchHooks[] = [];
  const call =
    (name: string, fallback: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) => {
      calls.push(name);
      return (overrides[name] ?? fallback)(...args);
    };
  const dt = {
    resources: {
      find: call("resources.find", async (id) => (id === CAL ? { id: CAL, name: "Room" } : null)),
      get: call("resources.get", async () => [{ id: CAL, parentId: null, name: "Room\u001b[2J", capacity: 1, bufferAfter: null }]),
    },
    availability: { get: call("availability.get", async () => [{ start: Date.parse(T), end: Date.parse(T2) }]) },
    holds: {
      place: call("holds.place", async () => ({ id: "01HOLD" })),
      get: call("holds.get", async () => [{ id: "01HOLD", expiresAt: Date.parse(T) + 300_000 }]),
      commit: call("holds.commit", async () => ({ bookingId: "01BOOKING" })),
      release: call("holds.release", async () => undefined),
    },
    bookings: {
      get: call("bookings.get", async () => [
        { id: "01B", resourceId: CAL, start: Date.parse(T), end: Date.parse(T2), label: "Alex\u001b]0;pwned\u0007" },
      ]),
      cancel: call("bookings.cancel", async () => undefined),
    },
    events: {
      watch: call("events.watch", async (_id, onChange, options) => {
        watchers.push(onChange as (c: Change) => void);
        hooks.push(options as WatchHooks);
        return async () => {
          calls.push("watch.stop");
        };
      }),
    },
    close: async () => {
      closes.push(1);
    },
  };
  return {
    // The same cast the MCP server's tests use for their spy: only the methods the CLI calls exist.
    dt: dt as unknown as DeltaT,
    calls,
    closed: () => closes.length,
    emit: (c) => watchers.forEach((w) => w(c)),
    outage: () =>
      hooks.forEach((h) => {
        h.onDisconnected?.();
        h.onResubscribed?.();
      }),
  };
}

let configDir = "";
beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "deltat-cli-test-"));
});
afterEach(async () => {
  await rm(configDir, { recursive: true, force: true });
});

function run(argv: string[], opts: { server?: Fake; env?: Record<string, string>; secret?: string | null; stopWatch?: Promise<void> } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const server = opts.server ?? fakeServer();
  const connectedTo: string[] = [];
  const io: Io = {
    stdout: (t) => {
      out.push(t);
    },
    stderr: (t) => {
      err.push(t);
    },
    env: { XDG_CONFIG_HOME: configDir, DELTAT_PASSWORD: PASSWORD, ...opts.env },
    now: () => Date.parse(T),
    readSecret: async () => opts.secret ?? null,
    connect: (c) => {
      connectedTo.push(c.host);
      return server.dt;
    },
    interrupted: () => opts.stopWatch ?? Promise.resolve(),
    systemTimeZone: "Europe/Berlin",
  };
  return main(argv, io).then((code) => ({ code, out: out.join(""), err: err.join(""), server, connectedTo }));
}

describe("help and version", () => {
  test("no command prints help to stderr and exits 2", async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("Usage: deltat-cli <command>");
  });

  test("help lists every command, because it is generated from the command table", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    for (const name of ["find", "hold", "commit", "release", "bookings", "cancel", "watch", "calendars", "login", "logout", "status"]) {
      expect(r.out).toContain(`  ${name}`);
    }
  });

  test("--version matches package.json", async () => {
    const pkg = JSON.parse(await readFile(join(import.meta.dir, "../../package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect((await run(["--version"])).out).toBe(`deltat-cli ${pkg.version}\n`);
  });

  test("names that exist on every object are not commands", async () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect((await run([name])).code).toBe(2);
    }
  });
});

describe("bad input never reaches the server", () => {
  const cases: [string, string[]][] = [
    ["a time without an offset", ["find", CAL, "--from", "2026-10-01T09:00:00", "--to", T2]],
    ["an end before the start", ["find", CAL, "--from", T2, "--to", T]],
    ["half a window", ["bookings", CAL, "--from", T]],
    ["an unknown flag", ["find", CAL, "--from", T, "--to", T2, "--frm", T]],
    ["a missing id", ["commit"]],
    ["an extra argument", ["release", "01HOLD", "extra"]],
    ["an id with whitespace", ["cancel", "01 B"]],
    ["a hold too long", ["hold", CAL, "--start", T, "--end", T2, "--ttl", "600"]],
    ["a fractional minute", ["find", CAL, "--from", T, "--to", T2, "--min", "1.5"]],
    ["an unknown time zone", ["find", CAL, "--from", T, "--to", T2, "--tz", "Mars/Olympus"]],
    ["a password on the command line", ["login", "--password", "hunter2"]],
    ["a label that is too long", ["commit", "01HOLD", "--label", "x".repeat(201)]],
  ];
  for (const [what, argv] of cases) {
    test(what, async () => {
      const r = await run(argv);
      expect(r.code).toBe(2);
      expect(r.connectedTo).toEqual([]);
    });
  }

  test("a refused input explains itself in --json on stdout, with the INVALID code", async () => {
    const r = await run(["find", CAL, "--from", "tomorrow", "--to", T2, "--json"]);
    expect(JSON.parse(r.out)).toMatchObject({ error: "INVALID", booked: false });
  });
});

describe("talking to the server", () => {
  test("find prints one parseable JSON object with --json, and closes the connection", async () => {
    const r = await run(["find", CAL, "--from", T, "--to", T2, "--json"]);
    expect(r.code).toBe(0);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toMatchObject({ calendar_id: CAL, slots: [{ minutes: 180, start: "2026-10-01T07:00:00.000Z" }] });
    expect(r.server.closed()).toBe(1);
  });

  test("an unknown calendar is NOT_FOUND (exit 5), not an empty calendar", async () => {
    const r = await run(["find", "01TYPO", "--from", T, "--to", T2]);
    expect(r.code).toBe(5);
    expect(r.server.calls).not.toContain("availability.get");
    expect(r.err).toContain("No calendar with id 01TYPO");
  });

  test("a hold that lost the race exits 3 and hands over the times that would work", async () => {
    const taken = Object.assign(new Error("conflict"), {
      code: "40001",
      detail: JSON.stringify({
        deltat: 1,
        kind: "conflict",
        retry_same_span: true,
        requested: { start: Date.parse(T), end: Date.parse(T2) },
        alternatives: [{ start: Date.parse(T2), end: Date.parse(T2) + 3_600_000 }],
      }),
    });
    const server = fakeServer({
      "holds.place": async () => {
        throw taken;
      },
    });
    const human = await run(["hold", CAL, "--start", T, "--end", T2], { server });
    expect(human.code).toBe(3);
    expect(human.err).toContain("Free a moment ago, not reserved");
    expect(human.err).toContain("12:00 to 13:00");

    const json = await run(["hold", CAL, "--start", T, "--end", T2, "--json"], { server });
    expect(JSON.parse(json.out)).toMatchObject({ error: "CONFLICT", reserved: false, alternatives: [{ start: "2026-10-01T10:00:00.000Z" }] });
  });

  test("a server fault exits 1, says a retry will not help, and still closes the connection", async () => {
    const server = fakeServer({
      "holds.commit": async () => {
        throw new Error("storage on fire");
      },
    });
    const r = await run(["commit", "01HOLD"], { server });
    expect(r.code).toBe(1);
    expect(r.err).toContain("retrying the same call will not help");
    expect(server.closed()).toBe(1);
  });

  test("hold reports the expiry the server kept and the next step", async () => {
    const r = await run(["hold", CAL, "--start", T, "--end", T2, "--json"]);
    expect(JSON.parse(r.out)).toMatchObject({ hold_id: "01HOLD", booked: false, expires_at: "2026-10-01T07:05:00.000Z" });
    expect(JSON.parse(r.out).next).toContain("deltat-cli commit 01HOLD");
  });

  test("a hold that was placed is reported as held even if reading its expiry back fails", async () => {
    const server = fakeServer({
      "holds.get": async () => {
        throw new Error("read failed");
      },
    });
    const r = await run(["hold", CAL, "--start", T, "--end", T2, "--json"], { server });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ hold_id: "01HOLD", expires_at: "2026-10-01T07:05:00.000Z" });
  });

  test("terminal control characters in a label are stripped for humans and escaped in JSON", async () => {
    const human = await run(["bookings", CAL]);
    expect(human.out).toContain("Alex]0;pwned");
    expect(human.out).not.toContain("\u001b");
    const json = await run(["bookings", CAL, "--json"]);
    expect(json.out).not.toContain("\u001b");
    expect(JSON.parse(json.out).bookings[0].label).toBe("Alex\u001b]0;pwned\u0007");
  });

  test("a non-local host gets a warning that the password travels unencrypted, unless TLS is on", async () => {
    const r = await run(["calendars"], { env: { DELTAT_HOST: "db.example.com" } });
    expect(r.err).toContain("unencrypted");
    expect((await run(["calendars"])).err).not.toContain("unencrypted");
    const tls = await run(["calendars"], { env: { DELTAT_HOST: "db.example.com", DELTAT_TLS: "on" } });
    expect(tls.err).not.toContain("unencrypted");
  });

  test("a TLS setting that is neither on nor off stops the command before it connects", async () => {
    const r = await run(["calendars"], { env: { DELTAT_TLS: "sometimes" } });
    expect(r.code).toBe(2);
    expect(r.connectedTo).toEqual([]);
  });

  test("no password configured is bad input (exit 2), and nothing connects", async () => {
    const r = await run(["calendars"], { env: { DELTAT_PASSWORD: "" } });
    expect(r.code).toBe(2);
    expect(r.connectedTo).toEqual([]);
  });
});

describe("the password", () => {
  test("status never prints it, in either output format", async () => {
    for (const argv of [["status"], ["status", "--json"]]) {
      const r = await run(argv);
      expect(r.code).toBe(0);
      expect(r.out + r.err).not.toContain(PASSWORD);
      expect(r.out).toContain("DELTAT_PASSWORD");
    }
  });

  test("login tests the connection before saving, then saves it owner-only", async () => {
    const r = await run(["login", "--host", "localhost"], { env: { DELTAT_PASSWORD: "" }, secret: "typed-pw" });
    expect(r.code).toBe(0);
    expect(r.server.calls).toContain("resources.get");
    const path = configPath({ XDG_CONFIG_HOME: configDir });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8")).password).toBe("typed-pw");
    expect(r.out + r.err).not.toContain("typed-pw");
  });

  test("login saves nothing when the server refuses the password", async () => {
    const server = fakeServer({
      "resources.get": async () => {
        throw new Error('password authentication failed for user "user"');
      },
    });
    const r = await run(["login"], { server, env: { DELTAT_PASSWORD: "" }, secret: "wrong" });
    expect(r.code).not.toBe(0);
    expect(await stat(configPath({ XDG_CONFIG_HOME: configDir })).catch(() => null)).toBeNull();
  });

  test("login with nothing typed is refused without connecting", async () => {
    const r = await run(["login"], { env: { DELTAT_PASSWORD: "" }, secret: null });
    expect(r.code).toBe(2);
    expect(r.connectedTo).toEqual([]);
  });
});

describe("watch", () => {
  test("streams one JSON line per change after a status line, then stops and closes on interrupt", async () => {
    const server = fakeServer();
    const stopped = Promise.withResolvers<void>();
    const running = run(["watch", CAL, "--json"], { server, stopWatch: stopped.promise });
    await Bun.sleep(10);
    server.emit({ kind: "held", resourceId: CAL, holdId: "h1", start: Date.parse(T), end: Date.parse(T2), expiresAt: Date.parse(T2) });
    server.emit({ kind: "booked", resourceId: CAL, bookingId: "b1", start: Date.parse(T), end: Date.parse(T2) });
    stopped.resolve();
    const r = await running;

    expect(r.code).toBe(0);
    const lines = r.out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.status ?? l.change)).toEqual(["watching", "held", "booked"]);
    expect(server.calls).toContain("watch.stop");
    expect(server.closed()).toBe(1);
  });

  test("says so on stdout when the connection drops and when it is back, so silence keeps meaning nothing changed", async () => {
    const server = fakeServer();
    const stopped = Promise.withResolvers<void>();
    const running = run(["watch", CAL, "--json"], { server, stopWatch: stopped.promise });
    await Bun.sleep(10);
    server.outage();
    stopped.resolve();
    const lines = (await running).out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.status)).toEqual(["watching", "disconnected", "reconnected"]);
    expect(lines[2]).toMatchObject({ may_have_missed_changes: true });
  });

  test("refuses an unknown calendar instead of watching silence forever", async () => {
    const r = await run(["watch", "01TYPO"]);
    expect(r.code).toBe(5);
    expect(r.server.calls).not.toContain("events.watch");
  });
});
