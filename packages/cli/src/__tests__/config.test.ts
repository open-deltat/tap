import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { configPath, connectionFromFlags, forgetConnection, isLoopback, resolveConnection, saveConnection } from "../config.js";

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
const connection = { host: "localhost", port: 5433, database: "public", user: "user", password: "s3cret" };

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
    expect(await resolveConnection(env())).toMatchObject({ ok: true, connection, passwordFrom: "file" });
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

describe("isLoopback", () => {
  test("compares the whole host, so a lookalike domain is not trusted", () => {
    expect(isLoopback("localhost")).toBe(true);
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("localhost.example.com")).toBe(false);
    expect(isLoopback("127.0.0.1.nip.io")).toBe(false);
  });
});

describe("connectionFromFlags", () => {
  test("flags win over the environment, which wins over defaults", () => {
    expect(connectionFromFlags({ DELTAT_HOST: "env-host", DELTAT_USER: "env-user" }, { host: "flag-host" })).toEqual({
      host: "flag-host",
      port: 5433,
      database: "public",
      user: "env-user",
    });
  });

  test("a bad --port is an error message, not a connection", () => {
    expect(typeof connectionFromFlags({}, { port: "nope" })).toBe("string");
  });
});
