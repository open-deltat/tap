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
	const first = sorted[0];
	if (!first) return [];

	let current: Interval = { ...first };

	for (let i = 1; i < sorted.length; i++) {
		const next = sorted[i];
		if (!next) continue;

		if (next.start <= current.end) {
			current.end = Math.max(current.end, next.end);
		} else {
			merged.push(current);
			current = { ...next };
		}
	}
	merged.push(current);
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
		const beforeInterval: Interval = {
			start: source.start,
			end: subtraction.start,
			...(source.value !== undefined && { value: source.value }),
		};
		result.push(beforeInterval);
	}

	if (subtraction.end < source.end) {
		const afterInterval: Interval = {
			start: subtraction.end,
			end: source.end,
			...(source.value !== undefined && { value: source.value }),
		};
		result.push(afterInterval);
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
	const firstPoint = points[0];
	let lastTime = firstPoint?.time ?? 0;

	for (const point of points) {
		if (!point) continue;

		if (point.time > lastTime && currentValue > 0) {
			const segment: Interval = {
				start: lastTime,
				end: point.time,
				value: currentValue,
			};
			result.push(segment);
		}

		currentValue += point.type === 'start' ? point.value : -point.value;
		lastTime = point.time;
	}

	return result;
};
