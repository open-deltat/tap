import { fromZonedTime } from 'date-fns-tz';
import type { Offer } from '../../domain/models';
import type { Interval } from '../../infrastructure/intervals';

export function generateOfferIntervals(
	offers: Offer[],
	from: Date,
	to: Date,
): Interval[] {
	const intervals: Interval[] = [];

	for (const offer of offers) {
		if (offer.type === 'range') {
			const start = new Date(offer.start).getTime();
			const end = new Date(offer.end).getTime();

			// Filter out if out of bounds
			if (end < from.getTime()) continue;
			if (start > to.getTime()) continue;

			intervals.push({
				start,
				end,
				value: offer.capacity,
			});
		} else if (offer.type === 'weekly') {
			// Weekly recurrence logic
			// Need to iterate days in the query window and match daysOfWeek.
			// Requires timezone awareness if offer specifies it, or defaults to UTC/resource.
			// For this example, we assume offer.timezone is available or fallback to UTC.
			// Ideally, we should pass the resource timezone if offer doesn't have one.
			const timezone = offer.timezone || 'UTC';

			// We iterate using the target timezone to ensure correct "Day of Week" matching.
			// 1. Find start of iteration in target timezone.
			// We want to cover [from, to].
			// Converting `from` to Zoned Time might land us on "Previous Day" in that zone.
			// So we should buffer slightly.

			// Iterating by UTC days is simple but might miss offsets.
			// Robust way: Iterate day-by-day in the specific timezone.
			// Construct "Midnight" in that timezone for every day in range.

			// Start from 'from' date, move day by day.
			const current = new Date(from);
			// Back up to start of day to ensure we catch partial first day if needed?
			// Actually, simpler to just construct the ISO string YYYY-MM-DD.

			const endTs = to.getTime();

			// Loop constraint: We need to prevent infinite loops. Max 365 days or something?
			// Or just while loop.
			// Let's iterate using UTC days but construct local times? No, that breaks across DST.

			// Correct approach:
			// 1. Get start day in timezone.
			// 2. Add 1 day (calendar day) in timezone.
			// 3. Repeat until > to.

			// Simplified for standard libraries without full calendar math (using date-fns-tz helps):
			// We can iterate UTC timestamps by 24h chunks, convert to Zone, check Day, construct Start/End in Zone.
			// This handles DST shifts correctly if we use `fromZonedTime` to get back to Unix.

			const dayMs = 24 * 60 * 60 * 1000;
			const buffer = dayMs; // 1 day buffer
			const startIter = from.getTime() - buffer;
			const endIter = to.getTime() + buffer;

			for (let t = startIter; t <= endIter; t += dayMs) {
				const dateInZone = new Date(t);
				// To get "Day of Week in Zone", we can format it.
				// date-fns-tz doesn't give `getDay` in zone directly without conversion.
				// `Intl.DateTimeFormat` is slow but accurate.
				// Or use `toZonedTime` (if using date-fns-tz 2.x or compatible helpers).
				// We previously imported `toZonedTime` in other files. Let's assume we can use it.
				// But `date-fns-tz` 3.x changed API.
				// `fromZonedTime(isoString, timeZone)` -> Date (UTC)
				// We can construct the ISO string for the target day.

				// Let's use the ISO string approach which is robust with `fromZonedTime`.
				// We format the current iteration time to YYYY-MM-DD in the target zone.
				const isoDate = dateInZone.toLocaleDateString('en-CA', {
					timeZone: timezone,
				}); // YYYY-MM-DD
				// Get day of week.
				// We can just create a Date from this ISO (which is UTC by default in JS if simple, but wait).
				// Better: `new Date(isoDate).getUTCDay()` gives the day of that date.
				const ymd = new Date(isoDate);
				// Check if valid
				if (Number.isNaN(ymd.getTime())) continue;

				// Note: `new Date("2023-01-01")` is UTC.
				const dayOfWeek = ymd.getUTCDay(); // 0-6

				if (offer.daysOfWeek.includes(dayOfWeek)) {
					// Construct start/end in Zone
					const startStr = `${isoDate}T${offer.startTime}:00`; // ISO-like
					const endStr = `${isoDate}T${offer.endTime}:00`;

					// Convert to Unix
					const startUnix = fromZonedTime(startStr, timezone).getTime();
					const endUnix = fromZonedTime(endStr, timezone).getTime();

					// Check if this specific interval overlaps with query window
					if (endUnix < from.getTime()) continue;
					if (startUnix > to.getTime()) continue;

					intervals.push({
						start: startUnix,
						end: endUnix,
						value: offer.capacity,
					});
				}
			}
		}
	}

	return intervals;
}
