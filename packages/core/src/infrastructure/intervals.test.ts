import { describe, expect, it } from 'bun:test';
import {
	getCompositeTimeline,
	type Interval,
	isIntervalAvailable,
	mergeIntervals,
	subtractInterval,
	subtractIntervals,
} from './intervals';

describe('intervals', () => {
	describe('mergeIntervals', () => {
		it('returns empty array for empty input', () => {
			expect(mergeIntervals([])).toEqual([]);
		});

		it('returns single interval unchanged', () => {
			const intervals: Interval[] = [{ start: 100, end: 200 }];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 200 }]);
		});

		it('merges overlapping intervals', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 150, end: 250 },
			];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 250 }]);
		});

		it('merges adjacent intervals (touching)', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 200, end: 300 },
			];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 300 }]);
		});

		it('keeps separate intervals apart', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 300, end: 400 },
			];
			const result = mergeIntervals(intervals);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ start: 100, end: 200 });
			expect(result[1]).toEqual({ start: 300, end: 400 });
		});

		it('handles unsorted input', () => {
			const intervals: Interval[] = [
				{ start: 300, end: 400 },
				{ start: 100, end: 200 },
				{ start: 150, end: 350 },
			];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 400 }]);
		});

		it('merges multiple overlapping intervals into one', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 150 },
				{ start: 140, end: 200 },
				{ start: 190, end: 250 },
				{ start: 240, end: 300 },
			];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 300 }]);
		});

		it('handles interval completely inside another', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 400 },
				{ start: 200, end: 300 },
			];
			expect(mergeIntervals(intervals)).toEqual([{ start: 100, end: 400 }]);
		});
	});

	describe('subtractInterval', () => {
		it('returns source unchanged when subtraction is completely before', () => {
			const source: Interval = { start: 200, end: 300 };
			const subtraction: Interval = { start: 50, end: 100 };
			expect(subtractInterval(source, subtraction)).toEqual([source]);
		});

		it('returns source unchanged when subtraction is completely after', () => {
			const source: Interval = { start: 100, end: 200 };
			const subtraction: Interval = { start: 300, end: 400 };
			expect(subtractInterval(source, subtraction)).toEqual([source]);
		});

		it('returns source unchanged when subtraction touches but does not overlap', () => {
			const source: Interval = { start: 100, end: 200 };
			const subtraction: Interval = { start: 200, end: 300 };
			expect(subtractInterval(source, subtraction)).toEqual([source]);
		});

		it('removes beginning of source', () => {
			const source: Interval = { start: 100, end: 300 };
			const subtraction: Interval = { start: 50, end: 200 };
			expect(subtractInterval(source, subtraction)).toEqual([
				{ start: 200, end: 300, value: undefined },
			]);
		});

		it('removes end of source', () => {
			const source: Interval = { start: 100, end: 300 };
			const subtraction: Interval = { start: 200, end: 400 };
			expect(subtractInterval(source, subtraction)).toEqual([
				{ start: 100, end: 200, value: undefined },
			]);
		});

		it('splits source into two when subtraction is in middle', () => {
			const source: Interval = { start: 100, end: 400 };
			const subtraction: Interval = { start: 200, end: 300 };
			const result = subtractInterval(source, subtraction);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ start: 100, end: 200, value: undefined });
			expect(result[1]).toEqual({ start: 300, end: 400, value: undefined });
		});

		it('returns empty when subtraction completely covers source', () => {
			const source: Interval = { start: 200, end: 300 };
			const subtraction: Interval = { start: 100, end: 400 };
			expect(subtractInterval(source, subtraction)).toEqual([]);
		});

		it('returns empty when subtraction exactly matches source', () => {
			const source: Interval = { start: 100, end: 200 };
			const subtraction: Interval = { start: 100, end: 200 };
			expect(subtractInterval(source, subtraction)).toEqual([]);
		});

		it('preserves value from source', () => {
			const source: Interval = { start: 100, end: 400, value: 5 };
			const subtraction: Interval = { start: 200, end: 300 };
			const result = subtractInterval(source, subtraction);
			expect(result[0]?.value).toBe(5);
			expect(result[1]?.value).toBe(5);
		});
	});

	describe('subtractIntervals', () => {
		it('returns sources unchanged with no exclusions', () => {
			const sources: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 300, end: 400 },
			];
			expect(subtractIntervals(sources, [])).toEqual(sources);
		});

		it('subtracts multiple exclusions', () => {
			const sources: Interval[] = [{ start: 100, end: 500 }];
			const exclusions: Interval[] = [
				{ start: 150, end: 200 },
				{ start: 300, end: 350 },
			];
			const result = subtractIntervals(sources, exclusions);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ start: 100, end: 150, value: undefined });
			expect(result[1]).toEqual({ start: 200, end: 300, value: undefined });
			expect(result[2]).toEqual({ start: 350, end: 500, value: undefined });
		});

		it('handles overlapping exclusions', () => {
			const sources: Interval[] = [{ start: 100, end: 500 }];
			const exclusions: Interval[] = [
				{ start: 150, end: 250 },
				{ start: 200, end: 300 },
			];
			const result = subtractIntervals(sources, exclusions);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ start: 100, end: 150, value: undefined });
			expect(result[1]).toEqual({ start: 300, end: 500, value: undefined });
		});

		it('can completely remove all sources', () => {
			const sources: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 300, end: 400 },
			];
			const exclusions: Interval[] = [{ start: 0, end: 1000 }];
			expect(subtractIntervals(sources, exclusions)).toEqual([]);
		});
	});

	describe('isIntervalAvailable', () => {
		it('returns true when target is fully contained', () => {
			const available: Interval[] = [{ start: 100, end: 300 }];
			const target: Interval = { start: 150, end: 250 };
			expect(isIntervalAvailable(available, target)).toBe(true);
		});

		it('returns true when target exactly matches available', () => {
			const available: Interval[] = [{ start: 100, end: 200 }];
			const target: Interval = { start: 100, end: 200 };
			expect(isIntervalAvailable(available, target)).toBe(true);
		});

		it('returns false when target extends before available', () => {
			const available: Interval[] = [{ start: 150, end: 300 }];
			const target: Interval = { start: 100, end: 200 };
			expect(isIntervalAvailable(available, target)).toBe(false);
		});

		it('returns false when target extends after available', () => {
			const available: Interval[] = [{ start: 100, end: 200 }];
			const target: Interval = { start: 150, end: 250 };
			expect(isIntervalAvailable(available, target)).toBe(false);
		});

		it('returns false when target is outside all available', () => {
			const available: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 400, end: 500 },
			];
			const target: Interval = { start: 250, end: 350 };
			expect(isIntervalAvailable(available, target)).toBe(false);
		});

		it('returns false for empty available intervals', () => {
			const target: Interval = { start: 100, end: 200 };
			expect(isIntervalAvailable([], target)).toBe(false);
		});

		it('checks against multiple available intervals', () => {
			const available: Interval[] = [
				{ start: 100, end: 200 },
				{ start: 300, end: 400 },
			];
			expect(isIntervalAvailable(available, { start: 150, end: 180 })).toBe(
				true,
			);
			expect(isIntervalAvailable(available, { start: 320, end: 380 })).toBe(
				true,
			);
			expect(isIntervalAvailable(available, { start: 180, end: 320 })).toBe(
				false,
			);
		});
	});

	describe('getCompositeTimeline', () => {
		it('returns empty for empty input', () => {
			expect(getCompositeTimeline([])).toEqual([]);
		});

		it('returns single interval with value', () => {
			const intervals: Interval[] = [{ start: 100, end: 200, value: 1 }];
			expect(getCompositeTimeline(intervals)).toEqual([
				{ start: 100, end: 200, value: 1 },
			]);
		});

		it('stacks overlapping intervals', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 300, value: 1 },
				{ start: 200, end: 400, value: 1 },
			];
			const result = getCompositeTimeline(intervals);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ start: 100, end: 200, value: 1 });
			expect(result[1]).toEqual({ start: 200, end: 300, value: 2 });
			expect(result[2]).toEqual({ start: 300, end: 400, value: 1 });
		});

		it('handles multiple overlapping intervals with different values', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 400, value: 2 },
				{ start: 200, end: 300, value: 3 },
			];
			const result = getCompositeTimeline(intervals);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ start: 100, end: 200, value: 2 });
			expect(result[1]).toEqual({ start: 200, end: 300, value: 5 });
			expect(result[2]).toEqual({ start: 300, end: 400, value: 2 });
		});

		it('defaults value to 1 when not specified', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 300 },
				{ start: 200, end: 400 },
			];
			const result = getCompositeTimeline(intervals);
			expect(result[1]?.value).toBe(2);
		});

		it('handles three overlapping intervals', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 400, value: 1 },
				{ start: 150, end: 350, value: 1 },
				{ start: 200, end: 300, value: 1 },
			];
			const result = getCompositeTimeline(intervals);
			expect(result).toHaveLength(5);
			expect(result[0]).toEqual({ start: 100, end: 150, value: 1 });
			expect(result[1]).toEqual({ start: 150, end: 200, value: 2 });
			expect(result[2]).toEqual({ start: 200, end: 300, value: 3 });
			expect(result[3]).toEqual({ start: 300, end: 350, value: 2 });
			expect(result[4]).toEqual({ start: 350, end: 400, value: 1 });
		});

		it('handles non-overlapping intervals', () => {
			const intervals: Interval[] = [
				{ start: 100, end: 200, value: 1 },
				{ start: 300, end: 400, value: 2 },
			];
			const result = getCompositeTimeline(intervals);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ start: 100, end: 200, value: 1 });
			expect(result[1]).toEqual({ start: 300, end: 400, value: 2 });
		});
	});
});
