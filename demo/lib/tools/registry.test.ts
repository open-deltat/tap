import { describe, expect, test } from "bun:test";
import { TOOLS, TOOLS_HUB } from "./registry";

describe("tools registry", () => {
  test("hrefs and Umami event names are unique", () => {
    expect(new Set(TOOLS.map((t) => t.href)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.event)).size).toBe(TOOLS.length);
  });

  // lib/seo keeps descriptions in the range a search result shows without cutting.
  test("every description is 140 to 160 characters", () => {
    for (const d of [TOOLS_HUB.description, ...TOOLS.map((t) => t.description)]) {
      expect(d.length).toBeGreaterThanOrEqual(140);
      expect(d.length).toBeLessThanOrEqual(160);
    }
  });
});
