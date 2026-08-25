"Open weekdays, 9 to 5" is a pattern. A timeline is concrete: this Tuesday from 9:00 to 17:00, then that Wednesday, each a plain span with two ends. Every scheduling system has to bridge the two, and there are only two honest ways to do it.

You can store the pattern and evaluate it on every query, which is the RRULE tradition from the calendar world. Or you can expand the pattern into concrete spans once, store those, and let the pattern stay in your application. Δt is built entirely on the second way, and this page is about why, and how the expansion works in practice.

## Why the database stores no recurrence

Storing "every Tuesday" sounds compact until you ask the database a question. Now every availability check has to evaluate the rule first: what is a Tuesday, in which timezone, on which side of a daylight-saving jump, against which exceptions list? The calendar has moved into the hot path, and calendar logic is where scheduling systems go to accumulate edge cases.

Δt refuses the whole category. The engine stores [rules](/docs/data-model) as flat `[start, end)` spans in Unix milliseconds, and it has never heard of a Tuesday. Expansion happens at the edge, in your code, where the timezone is known and the pattern lives next to the business logic that owns it. The engine stays integer arithmetic; the human calendar stays human.

The cost is honest too: recurring availability is many rows instead of one, written for a bounded window rather than forever. That trade is the point.

## `expandRecurrence`: pattern in, spans out

The SDK ships the expansion helper. You describe the weekly pattern, and it returns concrete rule segments:

```ts
import { DeltaT, expandRecurrence } from "@open-deltat/client";

const segments = expandRecurrence({
  daysOfWeek: [1, 2, 3, 4, 5], // 0 = Sunday .. 6 = Saturday
  startTime: "09:00",
  endTime: "17:00",
  fromDate: "2025-01-01",
  toDate: "2025-03-31",
  excludeDates: ["2025-01-20"], // skip specific dates
});

await db.rules.create(
  segments.map((s) => ({ resourceId: room.id, ...s }))
);
```

That is one quarter of weekday hours, about 65 segments, created in one round-trip. The pieces:

- `daysOfWeek` uses JavaScript's day numbering, Sunday as 0.
- `startTime` and `endTime` are `"HH:MM"` within each matched day.
- `fromDate` and `toDate` bound the expansion window as `"YYYY-MM-DD"` dates, inclusive.
- `excludeDates` skips listed dates entirely: holidays, closures, one-off exceptions.
- `blocking: true` expands a recurring *blackout* instead (a maintenance window every Sunday night), the same shape painting time closed instead of open.

One thing to know and place deliberately: expansion runs in the local timezone of the process that calls it, since a pattern like "9:00 on Tuesdays" only means something in a zone. Run the expansion where the resource's zone is the process zone, or set it explicitly, and daylight-saving transitions come out the way a local clock would read them. Once expanded, the spans are plain UTC instants and the question never comes up again.

## Rolling the window forward

Because expansion is bounded, a recurring schedule is not a set-and-forget row; it is a window you keep topped up. Expand a quarter or two ahead, and when the horizon nears, expand the next window and append. How far ahead is a product decision (how far out do you take bookings?), and note that a single availability query is rejected past a 90-day window anyway, so nobody reads further than that in one request.

Editing a schedule is where the second SDK verb earns its place. When someone changes their weekly hours, you re-expand the new pattern and swap it in with `rules.replaceOpenHours`:

```ts
const next = expandRecurrence({ daysOfWeek: [1, 3, 5], startTime: "10:00", endTime: "16:00", fromDate, toDate });
await db.rules.replaceOpenHours(room.id, next);
```

`replaceOpenHours` writes the new open-hours rules first and deletes the old ones after, so a failure partway through can never leave the resource with an empty schedule. Blackouts and existing bookings are untouched: changing your hours does not cancel anyone.

## What this buys you

Every downstream question gets simpler because the engine only ever sees spans. [Availability](/docs/holds-and-availability) is subtraction over concrete intervals, with no rule evaluation in the read path. [Conflict checks](/docs/guides/prevent-double-booking) compare integers. And an irregular schedule (this Saturday open as a one-off, next Monday closed) is not an exception to encode in a pattern language: it is just more spans, written the same way.

The [weekly hours demo](/demos/builder) is this whole page as a UI: set your hours once, watch them expand into concrete open time, book against it. For the layer underneath, see the [Data model](/docs/data-model); for the verb surface, the [SDK reference](/docs/sdk/reference).
