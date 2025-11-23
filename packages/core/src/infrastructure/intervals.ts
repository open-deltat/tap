export type Interval = {
	start: number;
	end: number;
	// For weighted intervals (e.g. capacity usage)
	value?: number;
	// For metadata tracking (e.g. which booking caused this)
	meta?: Record<string, unknown>;
};

/**
 * Pure functional interval operations
 */

export function mergeIntervals(intervals: Interval[]): Interval[] {
	if (intervals.length === 0) return [];
	// Sort by start time
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const merged: Interval[] = [];
	let current = { ...sorted[0] };

	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i];
		if (!next || current.end === undefined) continue;

		if (next.start <= current.end) {
			// Overlap or adjacent, merge
			current.end = Math.max(current.end, next.end);
			// Value merging strategy depends on context, for simple boolean availability we ignore value
			// For capacity summing, we'd need a different algorithm (sweepline)
		} else {
			merged.push(current as Interval);
			current = { ...next };
		}
	}
	merged.push(current as Interval);
	return merged;
}

/**
 * Returns A - B (A excluding B)
 * Returns a list of intervals representing the parts of A that are NOT covered by B.
 */
export function subtractInterval(
	source: Interval,
	subtraction: Interval,
): Interval[] {
	// 1. No overlap
	if (subtraction.end <= source.start || subtraction.start >= source.end) {
		return [source];
	}

	const result: Interval[] = [];

	// 2. Left remnant
	if (subtraction.start > source.start) {
		result.push({
			start: source.start,
			end: subtraction.start,
			value: source.value,
		} as Interval);
	}

	// 3. Right remnant
	if (subtraction.end < source.end) {
		result.push({
			start: subtraction.end,
			end: source.end,
			value: source.value,
		} as Interval);
	}

	return result;
}

/**
 * Subtracts a list of exclusion intervals from a list of source intervals.
 */
export function subtractIntervals(
	sources: Interval[],
	exclusions: Interval[],
): Interval[] {
	let currentSources = [...sources];

	for (const exclusion of exclusions) {
		const nextSources: Interval[] = [];
		for (const source of currentSources) {
			nextSources.push(...subtractInterval(source, exclusion));
		}
		currentSources = nextSources;
	}

	return currentSources;
}

/**
 * Checks if an interval fits within any of the available intervals.
 * This is useful for checking if a slot [start, end] exists in the "Free Time" availability set.
 */
export function isIntervalAvailable(
	availableIntervals: Interval[],
	target: Interval,
): boolean {
	// We need to find ONE interval in `availableIntervals` that completely contains `target`.
	// Since `availableIntervals` are usually merged, this is a simple check.
	return availableIntervals.some(
		(available) =>
			available.start <= target.start && available.end >= target.end,
	);
}

/**
 * Timeline Sweepline Algorithm to calculate composite usage.
 * Converts a list of weighted intervals (e.g. Bookings with capacity cost)
 * into a flat list of time segments with total value.
 *
 * Input: [ {s:0, e:10, v:1}, {s:5, e:15, v:1} ]
 * Output: [ {s:0, e:5, v:1}, {s:5, e:10, v:2}, {s:10, e:15, v:1} ]
 */
export function getCompositeTimeline(intervals: Interval[]): Interval[] {
	if (intervals.length === 0) return [];

	const points: { time: number; type: 'start' | 'end'; value: number }[] = [];

	for (const interval of intervals) {
		points.push({
			time: interval.start,
			type: 'start',
			value: interval.value ?? 1,
		});
		points.push({
			time: interval.end,
			type: 'end',
			value: interval.value ?? 1,
		});
	}

	// Sort points: time asc, then 'end' before 'start' to handle abutting intervals correctly?
	// Actually for capacity 'end' usually releases, 'start' consumes.
	// If [0, 10) and [10, 20), at 10 we have -1 and +1. Net 0 change if capacity is consumed.
	// Logic: process all changes at a given timestamp before emitting segment.
	points.sort((a, b) => a.time - b.time);

	const result: Interval[] = [];
	let currentValue = 0;
	let lastTime = points[0]?.time ?? 0;

	for (let i = 0; i < points.length; i++) {
		const point = points[i];
		if (!point) continue;

		if (point.time > lastTime) {
			if (currentValue > 0) {
				result.push({
					start: lastTime,
					end: point.time,
					value: currentValue,
				} as Interval);
			}
		}

		if (point.type === 'start') {
			currentValue += point.value;
		} else {
			currentValue -= point.value;
		}

		lastTime = point.time;
	}

	return result;
}
