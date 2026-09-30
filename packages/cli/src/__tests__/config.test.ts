import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { configPath, forgetConnection, resolveConnection, saveConnection, targetFromFlags } from "../config.js";

// This file holds a password. The tests pin who can read it, where it comes from, and that a broken
// file is reported instead of half-used.

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deltat-cli-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const env = (extra: Record<string, string> = {}) => ({ XDG_CONFIG_HOME: dir, ...extra });
const connection = { host: "localhost", port: 5433, database: "public", user: "user", password: "s3cret", tls: false, tlsCa: null };
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";

describe("resolveConnection", () => {
  test("uses the MCP server's defaults, and refuses to connect without a password", async () => {
    const r = await resolveConnection(env());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("DELTAT_PASSWORD");

    const withPassword = await resolveConnection(env({ DELTAT_PASSWORD: "pw" }));
    expect(withPassword).toMatchObject({
      ok: true,
      connection: { host: "localhost", port: 5433, database: "public", user: "user", password: "pw" },
      passwordFrom: "env",
    });
  });

  test("the environment wins over the saved file, field by field", async () => {
    await saveConnection(env(), { ...connection, host: "saved-host", database: "saved-db" });
    const r = await resolveConnection(env({ DELTAT_DATABASE: "env-db" }));
    expect(r).toMatchObject({ ok: true, connection: { host: "saved-host", database: "env-db", password: "s3cret" }, passwordFrom: "file" });
  });

  test("a blank variable counts as unset instead of overriding the file with nothing", async () => {
    await saveConnection(env(), connection);
    const r = await resolveConnection(env({ DELTAT_PASSWORD: "   ", DELTAT_HOST: "" }));
    expect(r).toMatchObject({ ok: true, connection: { host: "localhost", password: "s3cret" }, passwordFrom: "file" });
  });

  test("a port that is not a port is an error, not a silent default", async () => {
    for (const bad of ["abc", "0", "70000", "54.3"]) {
      const r = await resolveConnection(env({ DELTAT_PASSWORD: "pw", DELTAT_PORT: bad }));
      expect(r.ok).toBe(false);
    }
  });

  test("a corrupted file is reported, never half-used", async () => {
    const path = configPath(env());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json", { mode: 0o600 });
    const r = await resolveConnection(env({ DELTAT_PASSWORD: "pw" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("not valid JSON");
  });

  test("a saved port of the wrong type is reported", async () => {
    const path = configPath(env());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ port: { evil: true }, password: "pw" }), { mode: 0o600 });
    expect((await resolveConnection(env())).ok).toBe(false);
  });
});

describe("the saved file", () => {
  test("is created readable by its owner only, in a directory only its owner can enter", async () => {
    const path = await saveConnection(env(), connection);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
  });

  test("round-trips the connection", async () => {
    await saveConnection(env(), connection);
    const { tlsCa: _, ...expected } = connection;
    expect(await resolveConnection(env())).toMatchObject({ ok: true, connection: expected, passwordFrom: "file" });
  });

  test("keeps the CA's path, not the certificate, and reads it when connecting", async () => {
    const ca = join(dir, "ca.pem");
    await writeFile(ca, PEM);
    const path = await saveConnection(env(), { ...connection, tls: true, tlsCa: ca });
    expect(JSON.parse(await Bun.file(path).text())).toMatchObject({ tls: true, tlsCa: ca });
    expect(await Bun.file(path).text()).not.toContain("BEGIN CERTIFICATE");
    expect(await resolveConnection(env())).toMatchObject({ ok: true, connection: { tls: { ca: PEM } }, tlsCa: ca });
  });

  test("warns when others can read it, the way ssh does about a key", async () => {
    const path = await saveConnection(env(), connection);
    await chmod(path, 0o644);
    const r = await resolveConnection(env());
    expect(r.ok && r.warnings.join(" ")).toContain("chmod 600");
  });

  test("overwriting keeps it owner-only even if the old file had been loosened", async () => {
    const path = await saveConnection(env(), connection);
    await chmod(path, 0o644);
    await saveConnection(env(), { ...connection, password: "new" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("logout removes it and says whether there was anything to remove", async () => {
    await saveConnection(env(), connection);
    expect(await forgetConnection(env())).toBe(true);
    expect(await forgetConnection(env())).toBe(false);
    expect((await resolveConnection(env())).ok).toBe(false);
  });
});

describe("the saved password only goes where it was saved", () => {
  test("pointing DELTAT_HOST or DELTAT_PORT elsewhere does not carry the saved password along", async () => {
    await saveConnection(env(), { ...connection, host: "prod.example" });
    for (const other of [{ DELTAT_HOST: "staging.example" }, { DELTAT_HOST: "prod.example.evil.com" }, { DELTAT_PORT: "6000" }]) {
      const r = await resolveConnection(env(other));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("saved password is for prod.example:5433");
    }
  });

  test("the same host in another case, or an explicit DELTAT_PASSWORD, is fine", async () => {
    await saveConnection(env(), { ...connection, host: "prod.example" });
    expect((await resolveConnection(env({ DELTAT_HOST: "PROD.example" }))).ok).toBe(true);
    expect(await resolveConnection(env({ DELTAT_HOST: "staging.example", DELTAT_PASSWORD: "staging-pw" }))).toMatchObject({
      ok: true,
      connection: { host: "staging.example", password: "staging-pw" },
    });
  });

  test("a password saved with TLS is not sent without it", async () => {
    await saveConnection(env(), { ...connection, tls: true });
    const r = await resolveConnection(env({ DELTAT_TLS: "off" }));
    expect(r.ok === false && r.message).toContain("unencrypted");
  });

  test("a password is used exactly as given: surrounding spaces survive the round trip", async () => {
    await saveConnection(env(), { ...connection, password: " pass word " });
    expect(await resolveConnection(env())).toMatchObject({ ok: true, connection: { password: " pass word " } });
    expect(await resolveConnection(env({ DELTAT_PASSWORD: " env pw " }))).toMatchObject({ connection: { password: " env pw " } });
    // Only an empty or all-whitespace value counts as unset.
    expect(await resolveConnection(env({ DELTAT_PASSWORD: "   " }))).toMatchObject({ passwordFrom: "file" });
  });
});

describe("TLS settings", () => {
  test("off unless asked for", async () => {
    expect(await resolveConnection(env({ DELTAT_PASSWORD: "pw" }))).toMatchObject({ ok: true, connection: { tls: false } });
  });

  test("DELTAT_TLS turns it on; DELTAT_TLS_CA trusts a certificate and implies it", async () => {
    expect(await resolveConnection(env({ DELTAT_PASSWORD: "pw", DELTAT_TLS: "on" }))).toMatchObject({ connection: { tls: true } });
    const ca = join(dir, "ca.pem");
    await writeFile(ca, PEM);
    expect(await resolveConnection(env({ DELTAT_PASSWORD: "pw", DELTAT_TLS_CA: ca }))).toMatchObject({ connection: { tls: { ca: PEM } } });
  });

  test("the environment's TLS settings replace the saved ones as a pair, never merge with them", async () => {
    const ca = join(dir, "ca.pem");
    await writeFile(ca, PEM);
    // Logged in without TLS; a CA in the environment alone turns it on, not a refused "off + CA".
    await saveConnection(env(), connection);
    expect(await resolveConnection(env({ DELTAT_TLS_CA: ca }))).toMatchObject({ ok: true, connection: { tls: { ca: PEM } } });
    // Logged in with a CA; DELTAT_TLS=off in the environment drops the saved CA with it.
    await saveConnection(env(), { ...connection, tls: true, tlsCa: ca });
    expect(await resolveConnection(env({ DELTAT_TLS: "off", DELTAT_PASSWORD: "pw" }))).toMatchObject({
      ok: true,
      connection: { tls: false },
    });
  });

  test("a setting that is neither on nor off, or a CA that cannot be read, stops the command", async () => {
    expect((await resolveConnection(env({ DELTAT_PASSWORD: "pw", DELTAT_TLS: "maybe" }))).ok).toBe(false);
    expect((await resolveConnection(env({ DELTAT_PASSWORD: "pw", DELTAT_TLS_CA: join(dir, "missing.pem") }))).ok).toBe(false);
  });
});

describe("targetFromFlags", () => {
  test("flags win over the environment, which wins over defaults", async () => {
    expect(await targetFromFlags({ DELTAT_HOST: "env-host", DELTAT_USER: "env-user" }, { host: "flag-host" })).toEqual({
      ok: true,
      target: { host: "flag-host", port: 5433, database: "public", user: "env-user" },
      tls: false,
      save: { tls: false, tlsCa: null },
    });
  });

  test("--tls-ca turns TLS on and is saved as a path", async () => {
    const ca = join(dir, "ca.pem");
    await writeFile(ca, PEM);
    expect(await targetFromFlags({}, { tlsCa: ca })).toMatchObject({ ok: true, tls: { ca: PEM }, save: { tls: true, tlsCa: ca } });
  });

  test("a relative --tls-ca is saved absolute, so commands from other directories still find it", async () => {
    await writeFile(join(dir, "ca.pem"), PEM);
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const r = await targetFromFlags({}, { tlsCa: "./ca.pem" });
      expect(r.ok && r.save.tlsCa).toBe(join(realpathSync(dir), "ca.pem"));
    } finally {
      process.chdir(cwd);
    }
  });

  test("a bad --port is an error, not a connection", async () => {
    expect((await targetFromFlags({}, { port: "nope" })).ok).toBe(false);
  });
});
