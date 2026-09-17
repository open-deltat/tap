import { describe, expect, test } from "bun:test";

// npm versions are immutable, so a manifest mistake is permanent for everyone who installs it.
// These assert the properties that only fail after publishing, when it is too late to fix.

const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
const serverJson = await Bun.file(new URL("../../server.json", import.meta.url)).json();

describe("the published manifest", () => {
  test("no dependency uses the workspace protocol", () => {
    // `bun pm pack` rewrites `workspace:*` to a real version; `npm pack` does not. A package
    // published with npm while carrying one fails to install for everyone with
    // EUNSUPPORTEDPROTOCOL, and cannot be unpublished after 72 hours. Plain semver ranges still
    // resolve to the local workspace under bun, so there is nothing to trade away by banning it.
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.peerDependencies };
    const offenders = Object.entries(deps)
      .filter(([, range]) => range.startsWith("workspace:"))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  test("it is not marked private, or publish silently refuses", () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig?.access).toBe("public");
  });

  test("npx resolves a bin named after the package", () => {
    // npm derives the npx command from the package name's last segment, so `@open-deltat/mcp`
    // looks for a bin called `mcp`. Without it, the documented `npx @open-deltat/mcp` is a
    // coin flip on the npm version in front of it.
    expect(Object.keys(pkg.bin ?? {})).toContain("mcp");
  });

  test("the registry manifest agrees with package.json", () => {
    // Three independent version fields with nothing linking them. They drift the first time
    // someone bumps one and not the others, and the registry listing then advertises a version
    // that does not exist on npm.
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages[0].version).toBe(pkg.version);
    expect(serverJson.packages[0].identifier).toBe(pkg.name);
    // The registry proves ownership by checking the npm package claims the same name back.
    expect(pkg.mcpName).toBe(serverJson.name);
  });

  test("DELTAT_PASSWORD is declared required and secret", () => {
    const password = serverJson.packages[0].environmentVariables.find(
      (v: { name: string }) => v.name === "DELTAT_PASSWORD"
    );
    expect(password?.isRequired).toBe(true);
    expect(password?.isSecret).toBe(true);
    // A default here would put a credential in every directory listing that renders this file.
    expect(password?.default).toBeUndefined();
  });
});
