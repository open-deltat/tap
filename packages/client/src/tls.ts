import type { DeltaTOptions } from "./client.js";

/**
 * DELTAT_TLS / DELTAT_TLS_CA, read one way for every adapter (the CLI, the MCP server), so the same
 * settings mean the same connection wherever they are set.
 *
 * A CA path turns TLS on by itself: nobody names a certificate to trust and wants plaintext. A value
 * that is neither on nor off is an error, not a guess, because guessing "off" would send the
 * password in the clear to someone who asked for it to be encrypted.
 *
 * The file is read through `readText`, so the SDK itself never touches a filesystem and stays usable
 * where there is none.
 */
export type TlsSetting = { ok: true; tls: NonNullable<DeltaTOptions["tls"]> } | { ok: false; message: string };

const ON = new Set(["1", "true", "on", "yes"]);
const OFF = new Set(["0", "false", "off", "no"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Whether a password sent to `host` would cross a network unencrypted. Compares the whole host
 * name, so a lookalike such as localhost.example.com is not mistaken for this machine.
 */
export const passwordInClear = (host: string, tls: DeltaTOptions["tls"]): boolean =>
  !tls && !LOOPBACK.has(host.toLowerCase());

function parseSwitch(raw: string | boolean | null | undefined): boolean | null | "invalid" {
  if (typeof raw === "boolean") return raw;
  const v = raw?.trim().toLowerCase() ?? "";
  if (v === "") return null;
  return ON.has(v) ? true : OFF.has(v) ? false : "invalid";
}

export async function tlsSetting(
  input: { tls?: string | boolean | null; caPath?: string | null },
  readText: (path: string) => Promise<string>
): Promise<TlsSetting> {
  const caPath = input.caPath?.trim() || null;
  const enabled = parseSwitch(input.tls);
  if (enabled === "invalid") return { ok: false, message: `DELTAT_TLS must be on or off, not: ${String(input.tls)}` };
  if (enabled === false && caPath) {
    return { ok: false, message: "DELTAT_TLS is off but DELTAT_TLS_CA names a certificate. Turn TLS on or drop the CA." };
  }
  if (!caPath) return { ok: true, tls: enabled === true };

  const ca = await readText(caPath).then(
    (text) => ({ ok: true as const, text }),
    (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) })
  );
  if (!ca.ok) return { ok: false, message: `Cannot read the CA certificate at ${caPath}: ${ca.reason}` };
  if (!ca.text.includes("-----BEGIN CERTIFICATE-----")) return { ok: false, message: `${caPath} is not a PEM certificate.` };
  return { ok: true, tls: { ca: ca.text } };
}
