"use server";

import { dt } from "@/lib/deltat";
import { createVenue, addSchedule, daily, findRootByName, baseMs } from "@/app/actions/seed-helpers";

const H = 3_600_000;

async function ensurePerson(
  name: string,
  bookings: { startH: number; durH: number; label: string }[],
  blocks: { startH: number; durH: number }[] = []
): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const cal = await createVenue(name, { slotMinutes: 60, bufferMinutes: 0 });
  // Open hours 09:00–17:00, daily for two weeks — recurrence expanded into non-blocking Rules.
  await addSchedule(cal.id, baseMs(), 14, daily([{ h: 9, m: 0, dur: 480 }]));

  const today = baseMs();
  // Blocked time (a lunch, a holiday) is a blocking Rule — it punches a hole in the open hours.
  if (blocks.length > 0) {
    await dt.rules.create(
      blocks.map((b) => {
        const start = today + b.startH * H;
        return { resourceId: cal.id, start, end: start + b.durH * H, blocking: true };
      })
    );
  }
  for (const b of bookings) {
    const start = today + b.startH * H;
    await dt.bookings.create([
      { resourceId: cal.id, start, end: start + b.durH * H, label: b.label },
    ]);
  }
  return cal.id;
}

/**
 * The fixed teaching scenario:
 *   Bob:  open 09–17, booking 09:00–10:00, lunch block 13:00–14:00 → net [10:00,13:00) ∪ [14:00,17:00)
 *   Jane: open 09–17, three 1h bookings 09:00–12:00                → net [12:00, 17:00)
 *   Both free (min_available = 2)                                  → [12:00,13:00) ∪ [14:00,17:00)
 *
 * Bob's lunch is a blocking rule, so the "take out blocked time" step is real, not a no-op.
 * It carves a gap into the shared afternoon, showing that blocked time matters as much as bookings.
 * Jane's three discrete 1h bookings (not one 3h block) render as three adjacent
 * punch-out bars, making "three appointments stack to noon" literal.
 */
export async function ensureExplainerCalendars(): Promise<{ bobId: string; janeId: string }> {
  // Distinct root names so we never collide with the Meet demo's own "Bob" calendar (the page
  // labels the lanes "Bob"/"Jane" itself, so these internal names are never shown).
  const bobId = await ensurePerson(
    "explainer-bob",
    [{ startH: 9, durH: 1, label: "1:1" }],
    [{ startH: 13, durH: 1 }] // lunch, 1–2pm
  );
  const janeId = await ensurePerson("explainer-jane", [
    { startH: 9, durH: 1, label: "Standup" },
    { startH: 10, durH: 1, label: "Review" },
    { startH: 11, durH: 1, label: "Sync" },
  ]);
  return { bobId, janeId };
}
