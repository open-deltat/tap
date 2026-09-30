import { parseArgs } from "node:util";
import { classifyRefusal, type DeltaT, type Refusal } from "@open-deltat/client";
import { BIN, COMMANDS, cleartextWarning, type Command, type Io, type Outcome, type Runner } from "./commands.js";
import { resolveConnection } from "./config.js";
import { InputError, type Args } from "./input.js";
import { EXIT, clean, isTimeZone, refusalJson, refusalText } from "./render.js";

/**
 * Reported by --version. `rootDir: "src"` rules out importing package.json without breaking the dist
 * layout, so it is stated here and a test asserts it matches package.json.
 */
export const VERSION = "0.1.0";

const GLOBAL_OPTIONS = {
  json: { type: "boolean" },
  tz: { type: "string" },
  help: { type: "boolean", short: "h" },
} as const;

export function helpText(systemTimeZone: string): string {
  const groups = ["Booking", "Calendars", "Setup"] as const;
  const width = Math.max(...[...COMMANDS.keys()].map((n) => n.length));
  const listing = groups.flatMap((group) => [
    group,
    ...[...COMMANDS]
      .filter(([, c]) => c.group === group)
      .flatMap(([name, c]) => [`  ${name.padEnd(width)}  ${c.args}`.trimEnd(), `  ${" ".repeat(width)}  ${c.summary}`]),
    "",
  ]);
  return [
    `${BIN} ${VERSION}: find, hold and book time on a deltat calendar, and watch it change live. Alias: dt`,
    "",
    `Usage: ${BIN} <command> [options]`,
    "",
    ...listing,
    "Options for every command",
    "  --json       Machine output: one JSON object per result; watch prints one per line",
    `  --tz <zone>  Show times in this IANA zone (default: ${systemTimeZone})`,
    `  -h, --help   Help for one command: ${BIN} <command> --help`,
    "",
    "Times are RFC 3339 with an offset, e.g. 2026-10-01T09:00:00+02:00.",
    "Booking is always two steps: hold a time, then commit the hold.",
    `Connection: \`${BIN} login\`, or DELTAT_HOST, DELTAT_PORT, DELTAT_DATABASE, DELTAT_USER, DELTAT_PASSWORD.`,
    "Exit codes: 0 ok, 1 server fault, 2 bad input, 3 conflict, 4 hold expired, 5 not found.",
    "",
  ].join("\n");
}

const commandHelp = (name: string, c: Command) =>
  [`Usage: ${BIN} ${name} ${c.args}`.trimEnd(), "", c.summary, "", c.details, ""].join("\n");

type Parsed = { ok: true; args: Args } | { ok: false; message: string };

function parse(argv: readonly string[], c: Command): Parsed {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: { ...c.options, ...GLOBAL_OPTIONS },
      allowPositionals: true,
      strict: true,
    });
    return { ok: true, args: { values, positionals } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not read the arguments." };
  }
}

type Prepared = { ok: true; run: Runner } | { ok: false; message: string };

function prepare(c: Command, args: Args, io: Io): Prepared {
  try {
    return { ok: true, run: c.prepare(args, io.env) };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Run one command line. Returns the exit code; the caller exits once, with it. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined) {
    io.stderr(helpText(io.systemTimeZone));
    return EXIT.INVALID;
  }
  if (name === "help" || name === "--help" || name === "-h") {
    io.stdout(helpText(io.systemTimeZone));
    return EXIT.OK;
  }
  if (name === "version" || name === "--version" || name === "-v") {
    io.stdout(`${BIN} ${VERSION}\n`);
    return EXIT.OK;
  }

  const command = COMMANDS.get(name);
  if (!command) {
    io.stderr(`Unknown command: ${clean(name)}\n\n${helpText(io.systemTimeZone)}`);
    return EXIT.INVALID;
  }

  const parsed = parse(rest, command);
  if (!parsed.ok) {
    io.stderr(`${clean(parsed.message)}\n\n${commandHelp(name, command)}`);
    return EXIT.INVALID;
  }
  const { values } = parsed.args;
  if (values.help === true) {
    io.stdout(commandHelp(name, command));
    return EXIT.OK;
  }

  const json = values.json === true;
  const tz = (typeof values.tz === "string" ? values.tz.trim() : "") || io.systemTimeZone;
  // A refusal about --tz itself still has to render its times somewhere.
  const renderTz = isTimeZone(tz) ? tz : "UTC";
  const report = (refusal: Refusal): number => {
    if (json) io.stdout(`${JSON.stringify(refusalJson(refusal, renderTz))}\n`);
    else io.stderr(`${refusalText(refusal, renderTz)}\n`);
    return EXIT[refusal.code];
  };
  const invalid = (message: string) => report({ code: "INVALID", message, offer: null });

  if (!isTimeZone(tz)) return invalid(`--tz: not an IANA time zone: ${tz}`);

  const prepared = prepare(command, parsed.args, io);
  if (!prepared.ok) return invalid(prepared.message);

  // At most one connection per run, opened on first use and always closed before returning, so a
  // command that fails validation never touches the network and none leaves a socket behind.
  const opened: DeltaT[] = [];
  const db = async (): Promise<DeltaT> => {
    const existing = opened[0];
    if (existing) return existing;
    const resolved = await resolveConnection(io.env);
    if (!resolved.ok) throw new InputError(resolved.message);
    for (const warning of resolved.warnings) io.stderr(`warning: ${warning}\n`);
    io.stderr(cleartextWarning(resolved.connection));
    const dt = io.connect(resolved.connection);
    opened.push(dt);
    return dt;
  };

  const outcome: Outcome = await prepared.run({ io, tz, json, db }).catch((e: unknown) =>
    e instanceof InputError
      ? { kind: "refused", refusal: { code: "INVALID", message: e.message, offer: null } }
      : { kind: "refused", refusal: classifyRefusal(e) }
  );
  await Promise.all(opened.map((dt) => dt.close().catch(() => undefined)));

  switch (outcome.kind) {
    case "result":
      io.stdout(json ? `${JSON.stringify(outcome.json)}\n` : `${outcome.text}\n`);
      return EXIT.OK;
    case "streamed":
      return EXIT.OK;
    case "refused":
      return report(outcome.refusal);
  }
}
