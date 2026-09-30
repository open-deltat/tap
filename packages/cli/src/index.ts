#!/usr/bin/env node
import { EventEmitter, once } from "node:events";
import { DeltaT } from "@open-deltat/client";
import { main } from "./cli.js";
import { readSecret } from "./prompt.js";

// The only file that touches the process: real streams, signals and connections. Everything is
// handed to main() as an Io, which is what the tests replace.

const stop = new EventEmitter();

// The reader went away (`deltat-cli watch ... | head -1`): there is nothing left to write to, so
// stop the way Ctrl-C would instead of crashing on the unhandled write error.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code !== "EPIPE") throw e;
  stop.emit("stop");
});

process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  env: process.env,
  now: () => Date.now(),
  readSecret,
  connect: (c) => new DeltaT({ host: c.host, port: c.port, database: c.database, username: c.user, password: c.password }),
  // Signals are only caught while a command waits on them. Catching them globally would make every
  // other command impossible to interrupt.
  interrupted: async () => {
    const onSignal = () => stop.emit("stop");
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    await once(stop, "stop");
  },
  systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
