import { test, expect, beforeAll, afterAll } from "bun:test";

let assertProductionSecrets: () => void;
const originalNodeEnv = process.env.NODE_ENV;

// process.env.NODE_ENV is typed readonly; mutate it through a narrow cast for the test.
function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeAll(async () => {
  // Import with the dev defaults in effect so config caches the in-repo default secret values.
  delete process.env.CAL_SECRET;
  delete process.env.CAL_PASS;
  delete process.env.DELTAT_PASSWORD;
  ({ assertProductionSecrets } = await import("./config"));
});

afterAll(() => {
  setNodeEnv(originalNodeEnv);
});

test("assertProductionSecrets is a no-op outside production", () => {
  setNodeEnv("development");
  expect(() => assertProductionSecrets()).not.toThrow();
});

test("assertProductionSecrets throws in production when a secret is left at its default", () => {
  setNodeEnv("production");
  expect(() => assertProductionSecrets()).toThrow(/CAL_SECRET/);
});
