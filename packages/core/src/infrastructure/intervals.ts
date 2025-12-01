export type Interval = {
	start: number;
	end: number;
	value?: number;
	meta?: Record<string, unknown>;
};

export const mergeIntervals = (intervals: Interval[]): Interval[] => {
	if (intervals.length === 0) return [];

	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const merged: Interval[] = [];
	let current = { ...sorted[0] };

	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i];
		if (!next || current.end === undefined) continue;

		if (next.start <= current.end) {
			current.end = Math.max(current.end, next.end);
		} else {
			merged.push(current as Interval);
			current = { ...next };
		}
	}
	merged.push(current as Interval);
	return merged;
};

export const subtractInterval = (
	source: Interval,
	subtraction: Interval,
): Interval[] => {
	if (subtraction.end <= source.start || subtraction.start >= source.end) {
		return [source];
	}

	const result: Interval[] = [];

	if (subtraction.start > source.start) {
		result.push({
			start: source.start,
			end: subtraction.start,
			value: source.value,
		} as Interval);
	}

	if (subtraction.end < source.end) {
		result.push({
			start: subtraction.end,
			end: source.end,
			value: source.value,
		} as Interval);
	}

	return result;
};

export const subtractIntervals = (
	sources: Interval[],
	exclusions: Interval[],
): Interval[] => {
	let currentSources = [...sources];

	for (const exclusion of exclusions) {
		const nextSources: Interval[] = [];
		for (const source of currentSources) {
			nextSources.push(...subtractInterval(source, exclusion));
		}
		currentSources = nextSources;
	}

	return currentSources;
};

export const isIntervalAvailable = (
	availableIntervals: Interval[],
	target: Interval,
): boolean =>
	availableIntervals.some(
		(available) =>
			available.start <= target.start && available.end >= target.end,
	);

export const getCompositeTimeline = (intervals: Interval[]): Interval[] => {
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

	points.sort((a, b) => a.time - b.time);

	const result: Interval[] = [];
	let currentValue = 0;
	let lastTime = points[0]?.time ?? 0;

	for (const point of points) {
		if (!point) continue;

		if (point.time > lastTime && currentValue > 0) {
			result.push({
				start: lastTime,
				end: point.time,
				value: currentValue,
			} as Interval);
		}

		currentValue += point.type === 'start' ? point.value : -point.value;
		lastTime = point.time;
	}

	return result;
};
