import { expect, test } from "bun:test";
import { tmpPath } from "./meeting-fixtures";

// The demo's custom server (Bun) and the Next app it hosts each evaluate these modules, so a plain
// module-level instance existed twice per process: each copy loaded the files once at boot, and the
// /ws bridge answered "Unknown bookable" for every calendar created after a deploy. A query suffix
// makes Bun evaluate the module a second time, which is that second graph in miniature.

process.env.PUBLIC_BOOKABLES_PATH = tmpPath(`one-registry-${crypto.randomUUID()}`);
process.env.MEETING_REQUESTS_PATH = tmpPath(`one-meetings-${crypto.randomUUID()}`);

test("a second evaluation of the registry module shares the one registry, so it sees what the first wrote", async () => {
  const first = await import("../public-registry");
  const second = await import("../public-registry.ts?second-module-graph");
  expect(second.publicRegistry).toBe(first.publicRegistry);

  first.publicRegistry.register({ id: "made-after-boot", name: "After boot", slotMinutes: 30, timezone: "UTC" });
  expect(second.publicRegistry.get("made-after-boot")?.name).toBe("After boot");
});

test("the meeting service is one per process too, so two graphs never overwrite each other's requests", async () => {
  const first = await import("../meetings");
  const second = await import("../meetings.ts?second-module-graph");
  expect(second.meetings).toBe(first.meetings);
});
