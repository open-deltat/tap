"use server";

import { dt } from "../../lib/deltat";
import { createVenue, findRootByName, baseMs, coveredThrough } from "../../actions/seed-helpers";
import { setWeeklyAvailability } from "../../actions/rules";
import { weekToRanges, builderDateRange } from "./schedule";
import { BUFFER_MINUTES, DEFAULT_WEEK, NAME, SLOT_MINUTES } from "./structure";

// One calendar the builder edits. Starts with the default weekday 9-to-5 schedule so the page has
// something real to show on first load; saving in the UI replaces it with whatever you set.
export async function ensureBuilderCalendar(): Promise<string> {
  const existing = await findRootByName(NAME);
  const id = existing ?? (await createVenue(NAME, { slotMinutes: SLOT_MINUTES, bufferMinutes: BUFFER_MINUTES })).id;

  // These hours are the one thing on the site a visitor is invited to overwrite, so topping them
  // up would clobber whatever they just saved. Step in only once the window has lapsed entirely,
  // where there is no edit left to preserve and the page would otherwise render nothing.
  if (existing && coveredThrough(await dt.rules.get(id)) > baseMs()) return id;

  const { fromDate, toDate } = builderDateRange();
  await setWeeklyAvailability({ resourceId: id, ranges: weekToRanges(DEFAULT_WEEK), fromDate, toDate });
  return id;
}
