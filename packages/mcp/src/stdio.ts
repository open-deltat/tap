#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DeltaT, passwordInClear, tlsSetting } from "@open-deltat/client";
import { createDeltatMcpServer } from "./server.js";

// The stdio entry point: connect to a deltat over its Postgres wire, expose the tools over stdio.
// Configure it in Claude Code / Claude Desktop with env vars; no OAuth on this transport, the
// deltat password is the credential (single-operator, self-host model). stdout is the MCP channel,
// so every diagnostic goes to stderr.

// The password has no default. It previously fell back to "secret", which meant a misconfigured
// client silently tried a guessable credential instead of saying what was wrong; deltat itself
// refuses to run on a known default for the same reason. Everything else defaults to a local
// server, because that is what someone trying this out for the first time has in front of them.
const password = process.env.DELTAT_PASSWORD;
if (!password) {
  console.error(
    [
      "deltat MCP server: DELTAT_PASSWORD is not set, so there is nothing to authenticate with.",
      "",
      "Set it in the env block of your MCP client config, alongside DELTAT_HOST, DELTAT_PORT and",
      "DELTAT_DATABASE. If you are running deltat locally and did not choose a password, it printed",
      "a generated one once at startup; restart it with DELTAT_PASSWORD set to a value you control.",
    ].join("\n")
  );
  process.exit(1);
}

const config = {
  host: process.env.DELTAT_HOST ?? "localhost",
  port: Number(process.env.DELTAT_PORT ?? 5433),
  database: process.env.DELTAT_DATABASE ?? "public",
  username: process.env.DELTAT_USER ?? "user",
} as const;

async function main() {
  // Read the same way as the CLI's, so one set of variables means one connection everywhere. A value
  // that is neither on nor off stops the server rather than quietly connecting without TLS.
  const tls = await tlsSetting({ tls: process.env.DELTAT_TLS, caPath: process.env.DELTAT_TLS_CA }, (p) => readFile(p, "utf8"));
  if (!tls.ok) throw new Error(tls.message);
  if (passwordInClear(config.host, tls.tls)) {
    console.error(`deltat MCP server: warning: the password goes to ${config.host} unencrypted. Set DELTAT_TLS=on.`);
  }

  const server = createDeltatMcpServer(new DeltaT({ ...config, password, tls: tls.tls }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel, so this and every other diagnostic goes to stderr. The password is
  // never echoed.
  console.error(`deltat MCP server ready (${config.host}:${config.port}/${config.database}, TLS ${tls.tls ? "on" : "off"})`);
}

main().catch((err) => {
  console.error("deltat MCP server failed to start:", err);
  process.exit(1);
});
