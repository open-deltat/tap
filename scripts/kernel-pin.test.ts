import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The deploy ran whatever deltat `main` was at build time, so an unreleased kernel (a WAL format
// change is one-way) could reach production on any redeploy of this repo. It must run a released
// image, and the same release the integration suite proves this repo against.

const ROOT = join(import.meta.dir, "..");
const yaml = (file: string): unknown => Bun.YAML.parse(readFileSync(join(ROOT, file), "utf8"));

const record = (value: unknown, what: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${what} is not a mapping`);
  return Object.fromEntries(Object.entries(value));
};

const IMAGE = "ghcr.io/open-deltat/deltat";

test("the deployed kernel is the released image the integration suite tests against", () => {
  const deltat = record(record(record(yaml("docker-compose.yaml"), "compose").services, "services").deltat, "services.deltat");
  const ciVersion = record(record(record(record(yaml(".github/workflows/ci.yml"), "ci").jobs, "jobs").integration, "integration").env, "integration.env")
    .DELTAT_CRATE_VERSION;

  expect(deltat.build).toBeUndefined(); // building from Git runs whatever the branch is today
  const image = String(deltat.image);
  const [nameAndTag = "", digest] = image.split("@");
  const [name, tag] = nameAndTag.split(":");
  expect({ name, tag }).toEqual({ name: IMAGE, tag: String(ciVersion) });
  expect(digest?.startsWith("sha256:")).toBe(true); // a tag can be pushed again; a digest cannot
});
