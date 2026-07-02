import { test, expect } from "bun:test";
import { renderCalendar } from "./ics";

const encoder = new TextEncoder();
const FIXED_NOW = 1_751_000_000_000; // fixed so output is deterministic (no Date.now())

function render(summary: string): string[] {
  const ics = renderCalendar({
    name: "Test",
    events: [{ uid: "u1", start: FIXED_NOW, end: FIXED_NOW + 3_600_000, summary }],
    now: FIXED_NOW,
  });
  return ics.split("\r\n");
}

// Unfold per RFC 5545: a line continuation is a CRLF followed by a single leading space.
function unfold(lines: string[], prefix: string): string {
  const idx = lines.findIndex((l) => l.startsWith(prefix));
  if (idx === -1) return "";
  let value = lines[idx];
  for (let i = idx + 1; i < lines.length && lines[i].startsWith(" "); i++) {
    value += lines[i].slice(1);
  }
  return value;
}

test("folded lines never exceed 75 octets, even with multibyte summaries", () => {
  // A run of 4-byte code points (surrogate pairs) is the worst case for a UTF-16 slice, which
  // would both overshoot 75 octets and split a code point. Folding by UTF-8 bytes must not.
  const summary = "\u{1F600}".repeat(40); // 40 emoji = 160 octets, forces several folds
  for (const line of render(summary)) {
    expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  }
});

test("a folded multibyte summary unfolds back to the original", () => {
  const summary = "café ".repeat(30).trim(); // mixed 1- and 2-byte code points, no escapable chars
  expect(unfold(render(summary), "SUMMARY:")).toBe(`SUMMARY:${summary}`);
});
