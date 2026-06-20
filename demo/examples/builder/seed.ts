"use server";

import { createVenue, findRootByName } from "@/app/actions/seed-helpers";
import { setWeeklyAvailability } from "@/app/actions/rules";
import { DEFAULT_WEEK, weekToRanges, builderDateRange } from "./schedule";

// One calendar the builder edits. Starts with the default weekday 9-to-5 schedule so the page has
// something real to show on first load; saving in the UI replaces it with whatever you set.
export async function ensureBuilderCalendar(): Promise<string> {
  const existing = await findRootByName("builder-bob");
  if (existing) return existing;

  const cal = await createVenue("builder-bob", { slotMinutes: 30, bufferMinutes: 0 });
  const { fromDate, toDate } = builderDateRange();
  await setWeeklyAvailability({ resourceId: cal.id, ranges: weekToRanges(DEFAULT_WEEK), fromDate, toDate });
  return cal.id;
}
