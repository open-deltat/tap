/**
 * Live suite for what only a deltat this test controls can show: a subscription surviving deltat
 * being down, and TLS with certificate verification.
 *
 * Each test starts its own deltat on a free port with an empty data directory, so killing it or
 * giving it a certificate cannot disturb the shared server the other suites use. Gated on
 * DELTAT_INTEGRATION_PORT like the other live suites, and on a `deltat` binary (DELTAT_BIN or PATH);
 * the TLS test also needs `openssl`.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeltaT, type Change } from "../src/index.js";

const BIN = process.env.DELTAT_BIN ?? Bun.which("deltat");
const enabled = Boolean(process.env.DELTAT_INTEGRATION_PORT) && BIN !== null;
const liveTest = enabled ? test : test.skip;
const withOpenssl = enabled && Bun.which("openssl") !== null ? test : test.skip;

const PASSWORD = "resilience-suite-only";
const T0 = Date.UTC(2036, 0, 5, 9);
const HOUR = 3_600_000;
const dirs: string[] = [];
/** Every deltat this suite starts, so a failed assertion cannot leave one running. */
const servers: { kill: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.kill()));
});

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function freePort(): Promise<number> {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

async function waitForPort(port: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const up = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {} } }).then(
      (s) => (s.end(), true),
      () => false
    );
    if (up) return;
    await Bun.sleep(100);
  }
  throw new Error(`deltat never opened port ${port}`);
}

/** A deltat of this test's own. `start()` can be called again after `kill()` on the same data. */
async function ownDeltat(extraEnv: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "deltat-resilience-"));
  dirs.push(dir);
  const port = await freePort();
  const env = { ...process.env, DELTAT_PORT: String(port), DELTAT_BIND: "127.0.0.1", DELTAT_DATA_DIR: join(dir, "data"), DELTAT_PASSWORD: PASSWORD, ...extraEnv };
  const state: { proc: ReturnType<typeof Bun.spawn> | null } = { proc: null };
  const start = async () => {
    if (!BIN) throw new Error("no deltat binary");
    state.proc = Bun.spawn([BIN], { env, stdout: "ignore", stderr: "ignore" });
    await waitForPort(port);
  };
  const kill = async () => {
    state.proc?.kill();
    await state.proc?.exited;
    state.proc = null;
  };
  servers.push({ kill });
  await start();
  return { port, dir, start, kill };
}

const clientFor = (port: number, tls?: boolean | { ca: string }) =>
  new DeltaT({ host: "127.0.0.1", port, database: "resilience", password: PASSWORD, ...(tls !== undefined ? { tls } : {}) });

async function openCalendar(dt: DeltaT): Promise<string> {
  const r = await dt.resources.create({ name: "resilience", capacity: 5 });
  await dt.rules.create([{ resourceId: r.id, start: T0 - HOUR, end: T0 + 48 * HOUR }]);
  return r.id;
}

async function until(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline) await Bun.sleep(50);
  return check();
}

describe("a subscription outlives deltat going down", () => {
  liveTest(
    "listen and watch both hear the outage, come back on their own, and deliver changes again",
    async () => {
      const server = await ownDeltat();
      const watcher = clientFor(server.port);
      const actor = clientFor(server.port);
      const cal = await openCalendar(actor);
      await actor.close();

      const log: string[] = [];
      const changes: Change[] = [];
      const raw: string[] = [];
      const stopWatch = await watcher.events.watch(cal, (c) => changes.push(c), {
        onDisconnected: () => log.push("watch:disconnected"),
        onResubscribed: () => log.push("watch:resubscribed"),
      });
      const stopListen = await watcher.events.listen(cal, (e) => raw.push(Object.keys(e)[0] ?? "?"), {
        onResubscribed: () => log.push("listen:resubscribed"),
      });

      await server.kill();
      // Longer than postgres.js's single re-listen attempt survives: the old listen died silently here.
      await Bun.sleep(12_000);
      await server.start();
      expect(await until(() => log.includes("watch:resubscribed") && log.includes("listen:resubscribed"), 15_000)).toBe(true);
      expect(log.indexOf("watch:disconnected")).toBeLessThan(log.indexOf("watch:resubscribed"));

      const again = clientFor(server.port);
      await again.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + 300_000 });
      expect(await until(() => changes.length > 0 && raw.length > 0, 5_000)).toBe(true);
      expect(changes[0]).toMatchObject({ kind: "held", start: T0 });

      await stopWatch();
      await stopListen();
      await Promise.all([again.close(), watcher.close()]);
      await server.kill();
    },
    60_000
  );

  liveTest(
    "close() ends the retries, so a closed client does not linger reconnecting",
    async () => {
      const server = await ownDeltat();
      const dt = clientFor(server.port);
      const cal = await openCalendar(dt);
      await dt.events.listen(cal, () => undefined);
      await server.kill();
      await dt.close();
      // Nothing to assert beyond this resolving: a retry still pending would keep the test process's
      // event loop busy, and close() awaiting a never-ending reconnect would time the test out.
      expect(true).toBe(true);
    },
    15_000
  );
});

describe("TLS", () => {
  withOpenssl(
    "a self-signed deltat is reachable when its certificate is trusted, subscriptions included, and refused otherwise",
    async () => {
      const certDir = await mkdtemp(join(tmpdir(), "deltat-tls-"));
      dirs.push(certDir);
      const cert = join(certDir, "cert.pem");
      const key = join(certDir, "key.pem");
      const made = Bun.spawnSync([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-keyout", key, "-out", cert, "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ]);
      expect(made.exitCode).toBe(0);

      const server = await ownDeltat({ DELTAT_TLS_CERT: cert, DELTAT_TLS_KEY: key });
      const ca = await readFile(cert, "utf8");

      const trusted = clientFor(server.port, { ca });
      const cal = await openCalendar(trusted);
      const seen: string[] = [];
      await trusted.events.listen(cal, (e) => seen.push(Object.keys(e)[0] ?? "?"));
      await trusted.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + 300_000 });
      expect(await until(() => seen.length > 0, 3_000)).toBe(true);

      // Only the system's authorities: a self-signed certificate must not be accepted.
      const untrusting = clientFor(server.port, true);
      await expect(untrusting.resources.get()).rejects.toThrow();

      await Promise.all([trusted.close(), untrusting.close().catch(() => undefined)]);
      await server.kill();
    },
    30_000
  );
});
