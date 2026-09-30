import { describe, expect, test } from "bun:test";
import { passwordInClear, tlsSetting } from "../tls.js";

// Whether the password is encrypted on the way to deltat is decided here, for the CLI and the MCP
// server alike. The rule the tests pin: never quietly fall back to plaintext.

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";
const files = (map: Record<string, string>) => async (path: string) => {
  const text = map[path];
  if (text === undefined) throw new Error("ENOENT: no such file");
  return text;
};
const none = files({});

describe("tlsSetting", () => {
  test("off when nothing is set, which is the only way to get plaintext", async () => {
    expect(await tlsSetting({}, none)).toEqual({ ok: true, tls: false });
    expect(await tlsSetting({ tls: "  " }, none)).toEqual({ ok: true, tls: false });
  });

  test("reads the usual spellings of on and off", async () => {
    for (const on of ["1", "true", "ON", " yes ", true]) expect(await tlsSetting({ tls: on }, none)).toEqual({ ok: true, tls: true });
    for (const off of ["0", "false", "Off", "no", false]) expect(await tlsSetting({ tls: off }, none)).toEqual({ ok: true, tls: false });
  });

  test("anything else is an error, never a guess", async () => {
    const r = await tlsSetting({ tls: "maybe" }, none);
    expect(r.ok).toBe(false);
  });

  test("naming a CA turns TLS on by itself and trusts that certificate", async () => {
    expect(await tlsSetting({ caPath: "/ca.pem" }, files({ "/ca.pem": PEM }))).toEqual({ ok: true, tls: { ca: PEM } });
  });

  test("a CA with TLS explicitly off is a contradiction, reported", async () => {
    expect((await tlsSetting({ tls: "off", caPath: "/ca.pem" }, files({ "/ca.pem": PEM }))).ok).toBe(false);
  });

  test("the password is only in the clear to another machine with TLS off, and a lookalike host is another machine", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "LOCALHOST"]) expect(passwordInClear(host, false)).toBe(false);
    for (const host of ["db.example.com", "localhost.example.com", "127.0.0.1.nip.io"]) expect(passwordInClear(host, false)).toBe(true);
    expect(passwordInClear("db.example.com", true)).toBe(false);
    expect(passwordInClear("db.example.com", { ca: PEM })).toBe(false);
  });

  test("an unreadable or non-PEM CA file is reported instead of connecting without it", async () => {
    const missing = await tlsSetting({ tls: "on", caPath: "/nope.pem" }, none);
    expect(missing.ok === false && missing.message).toContain("/nope.pem");
    expect((await tlsSetting({ caPath: "/key.txt" }, files({ "/key.txt": "hello" }))).ok).toBe(false);
  });
});
