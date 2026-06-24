/** RFC 5545 (iCalendar) serializer for publishing deltat spans as a subscribable feed.
 *  deltat Spans are half-open [start, end) in Unix ms, and RFC 5545 §3.8.2.2 defines DTEND as
 *  non-inclusive — so `end` maps to DTEND directly, with no ±1s adjustment (a classic importer bug). */

export interface IcsEvent {
  uid: string;
  start: number;
  end: number;
  summary: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to ≤75 octets per RFC 5545 §3.1; continuation lines begin with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export function renderCalendar(opts: {
  name: string;
  description?: string;
  events: IcsEvent[];
  now?: number;
}): string {
  const stamp = formatUtc(opts.now ?? Date.now());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//open-tap//deltat//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  if (opts.description) lines.push(`X-WR-CALDESC:${escapeText(opts.description)}`);

  for (const e of opts.events) {
    if (e.end <= e.start) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(e.start)}`,
      `DTEND:${formatUtc(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:OPAQUE",
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}
