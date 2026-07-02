import { renderCalendar, formatUtc } from "../lib/ics";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const start = Date.UTC(2026, 5, 23, 9, 0, 0);
const end = Date.UTC(2026, 5, 23, 10, 30, 0);
const ics = renderCalendar({
  name: "Room A; B",
  events: [{ uid: "01ABC@deltat", start, end, summary: "Standup, daily" }],
  now: Date.UTC(2026, 5, 1, 0, 0, 0),
});

assert(ics.includes("BEGIN:VCALENDAR"), "opens VCALENDAR");
assert(ics.trimEnd().endsWith("END:VCALENDAR"), "closes VCALENDAR");
assert(ics.includes("\r\n"), "CRLF line endings (RFC 5545 §3.1)");
assert(formatUtc(end) === "20260623T103000Z", "UTC basic format");
assert(ics.includes(`DTSTART:${formatUtc(start)}`), "DTSTART present");
// half-open [start,end) → DTEND = end, no -1s fudge
assert(ics.includes(`DTEND:${formatUtc(end)}`), "DTEND maps from end directly");
assert(ics.includes("SUMMARY:Standup\\, daily"), "comma escaped in SUMMARY");
assert(ics.includes("X-WR-CALNAME:Room A\\; B"), "semicolon escaped in calendar name");
assert((ics.match(/BEGIN:VEVENT/g) ?? []).length === 1, "exactly one VEVENT");

const empty = renderCalendar({
  name: "x",
  events: [{ uid: "z@deltat", start: 1000, end: 1000, summary: "noop" }],
});
assert(!empty.includes("BEGIN:VEVENT"), "zero-duration span dropped (kernel-inadmissible)");

// Folding is measured in UTF-8 octets, not UTF-16 units: a non-ASCII summary must stay
// <=75 octets per line and survive unfolding without a multibyte char being split.
const encoder = new TextEncoder();
const longSummary = "Café ".repeat(30) + "🎉".repeat(10);
const foldedIcs = renderCalendar({
  name: "x",
  events: [{ uid: "f@deltat", start, end, summary: longSummary }],
});
for (const line of foldedIcs.split("\r\n")) {
  assert(encoder.encode(line).length <= 75, "each folded line stays within 75 octets");
}
const unfolded = foldedIcs.split("\r\n ").join("");
assert(unfolded.includes(`SUMMARY:${longSummary}`), "multibyte summary survives folding intact");

console.log("OK: ics serializer");
