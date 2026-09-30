import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { tlsSetting, type DeltaTOptions } from "@open-deltat/client";

// Where the CLI connects, and with what password. The environment wins over the saved file, field
// by field, and the variable names and defaults are the MCP server's (packages/mcp/server.json), so
// one set of variables configures both. Values are trimmed and a blank one counts as unset.
//
// The password never travels through argv: a command line is visible to every user in `ps` and is
// kept in shell history. It comes from DELTAT_PASSWORD or from the file `login` writes, which is
// created readable by its owner only.

export type Env = Readonly<Record<string, string | undefined>>;

type Target = { host: string; port: number; database: string; user: string };

/** What `login` saves. TLS is kept as the switch and the CA's path, never the certificate itself. */
export type Saved = Target & { password: string; tls: boolean; tlsCa: string | null };

/** Everything needed to open a connection, TLS resolved to what the client takes. */
export type Connection = Target & { password: string; tls: NonNullable<DeltaTOptions["tls"]> };

export type Resolved =
  | { ok: true; connection: Connection; passwordFrom: "env" | "file"; tlsCa: string | null; warnings: string[] }
  | { ok: false; message: string };

const DEFAULTS = { host: "localhost", port: 5433, database: "public", user: "user" } as const;

const blankToNull = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

const readText = (path: string) => readFile(path, "utf8");

export function configPath(env: Env): string {
  const base = blankToNull(env.XDG_CONFIG_HOME) ?? join(blankToNull(env.HOME) ?? homedir(), ".config");
  return join(base, "deltat", "cli.json");
}

function parsePort(raw: string | number, from: string): number | string {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65_535 ? n : `${from} is not a port number: ${raw}`;
}

/** The saved file, or {} when there is none. Anything malformed is an error, never a guess. */
async function readSaved(
  path: string
): Promise<{ ok: true; saved: Partial<Saved>; warnings: string[] } | { ok: false; message: string }> {
  const raw = await readFile(path, "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : e));
  if (raw === null) return { ok: true, saved: {}, warnings: [] };
  if (raw instanceof Error) return { ok: false, message: `Cannot read ${path}: ${raw.message}` };

  const parsed = ((): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  })();
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: `${path} is not valid JSON. Run \`deltat-cli logout\` and log in again.` };
  }

  const o: Record<string, unknown> = { ...parsed };
  const field = (k: string): string | null => {
    const v = o[k];
    return typeof v === "string" ? blankToNull(v) : null;
  };
  const rawPort = o.port;
  const port =
    rawPort === undefined
      ? undefined
      : typeof rawPort === "number" || typeof rawPort === "string"
        ? parsePort(rawPort, `port in ${path}`)
        : `port in ${path} is not a port number`;
  if (typeof port === "string") return { ok: false, message: port };
  if (o.tls !== undefined && typeof o.tls !== "boolean") return { ok: false, message: `tls in ${path} must be true or false` };

  // Like ssh with a private key: say so when others can read the password, rather than using it silently.
  const mode = (await stat(path)).mode;
  const warnings = mode & 0o077 ? [`${path} is readable by other users. Fix it with: chmod 600 ${path}`] : [];

  const host = field("host");
  const database = field("database");
  const user = field("user");
  const password = field("password");
  const tlsCa = field("tlsCa");
  const saved: Partial<Saved> = {
    ...(host ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(database ? { database } : {}),
    ...(user ? { user } : {}),
    ...(password ? { password } : {}),
    ...(typeof o.tls === "boolean" ? { tls: o.tls } : {}),
    ...(tlsCa ? { tlsCa } : {}),
  };
  return { ok: true, saved, warnings };
}

export async function resolveConnection(env: Env): Promise<Resolved> {
  const file = await readSaved(configPath(env));
  if (!file.ok) return file;
  const { saved } = file;

  const envPort = blankToNull(env.DELTAT_PORT);
  const port = envPort !== null ? parsePort(envPort, "DELTAT_PORT") : (saved.port ?? DEFAULTS.port);
  if (typeof port === "string") return { ok: false, message: port };

  const envPassword = blankToNull(env.DELTAT_PASSWORD);
  const password = envPassword ?? saved.password ?? null;
  if (password === null) {
    return { ok: false, message: "No password. Run `deltat-cli login`, or set DELTAT_PASSWORD." };
  }

  const tlsCa = blankToNull(env.DELTAT_TLS_CA) ?? saved.tlsCa ?? null;
  const tls = await tlsSetting({ tls: blankToNull(env.DELTAT_TLS) ?? saved.tls ?? null, caPath: tlsCa }, readText);
  if (!tls.ok) return tls;

  return {
    ok: true,
    connection: {
      host: blankToNull(env.DELTAT_HOST) ?? saved.host ?? DEFAULTS.host,
      port,
      database: blankToNull(env.DELTAT_DATABASE) ?? saved.database ?? DEFAULTS.database,
      user: blankToNull(env.DELTAT_USER) ?? saved.user ?? DEFAULTS.user,
      password,
      tls: tls.tls,
    },
    passwordFrom: envPassword !== null ? "env" : "file",
    tlsCa,
    warnings: file.warnings,
  };
}

/** Connection options `login` accepts, before the password is known. Flags win over the environment. */
export async function targetFromFlags(
  env: Env,
  flags: { host?: string | null; port?: string | null; database?: string | null; user?: string | null; tls?: boolean; tlsCa?: string | null }
): Promise<{ ok: true; target: Target; tls: Connection["tls"]; save: Pick<Saved, "tls" | "tlsCa"> } | { ok: false; message: string }> {
  const rawPort = flags.port ?? blankToNull(env.DELTAT_PORT);
  const port = rawPort === null ? DEFAULTS.port : parsePort(rawPort, "--port");
  if (typeof port === "string") return { ok: false, message: port };

  const tlsCa = flags.tlsCa ?? blankToNull(env.DELTAT_TLS_CA);
  const tls = await tlsSetting({ tls: flags.tls === true ? true : blankToNull(env.DELTAT_TLS), caPath: tlsCa }, readText);
  if (!tls.ok) return tls;

  return {
    ok: true,
    target: {
      host: flags.host ?? blankToNull(env.DELTAT_HOST) ?? DEFAULTS.host,
      port,
      database: flags.database ?? blankToNull(env.DELTAT_DATABASE) ?? DEFAULTS.database,
      user: flags.user ?? blankToNull(env.DELTAT_USER) ?? DEFAULTS.user,
    },
    tls: tls.tls,
    save: { tls: tls.tls !== false, tlsCa },
  };
}

/**
 * Write the file atomically and owner-only: a temp file created 0600 in a 0700 directory, then
 * renamed over the old one, so a crash mid-write never leaves a half-written or world-readable file.
 */
export async function saveConnection(env: Env, saved: Saved): Promise<string> {
  const path = configPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  // `wx` creates the file fresh, so the 0600 mode always applies; a stale temp file from a crashed
  // run could otherwise keep whatever mode it had.
  await rm(tmp, { force: true });
  await writeFile(tmp, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(tmp, path);
  return path;
}

/** True when there was a saved connection to forget. */
export async function forgetConnection(env: Env): Promise<boolean> {
  const path = configPath(env);
  const existed = await stat(path).then(
    () => true,
    () => false
  );
  await rm(path, { force: true });
  return existed;
}
