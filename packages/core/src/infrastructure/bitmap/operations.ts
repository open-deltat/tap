import type { Minute } from '@tap/protocol';
import type { BitmapDay } from './types';

// 1440 minutes in a day.
export const createEmptyBitmap = (): Uint16Array => new Uint16Array(1440);

export const getUsage = (bitmap: Uint16Array, minute: Minute): number => {
	return bitmap[minute] || 0;
};

export const incrementRange = (
	bitmap: Uint16Array,
	start: Minute,
	end: Minute,
	amount: number = 1,
): void => {
	for (let m = start; m < end; m++) {
		if (m >= 0 && m < 1440) {
			bitmap[m] = (bitmap[m] || 0) + amount;
		}
	}
};

export const decrementRange = (
	bitmap: Uint16Array,
	start: Minute,
	end: Minute,
	amount: number = 1,
): void => {
	for (let m = start; m < end; m++) {
		if (m >= 0 && m < 1440) {
			const current = bitmap[m] || 0;
			bitmap[m] = Math.max(0, current - amount);
		}
	}
};

export const isRangeAvailable = (
	booked: Uint16Array,
	held: Uint16Array,
	start: Minute,
	end: Minute,
	capacity: number,
): boolean => {
	for (let m = start; m < end; m++) {
		if (m >= 0 && m < 1440) {
			const bookedCount = booked[m] || 0;
			const heldCount = held[m] || 0;
			const totalUsage = bookedCount + heldCount;

			if (totalUsage >= capacity) {
				return false;
			}
		}
	}
	return true;
};

export const createBitmapDay = (resolution: number = 15): BitmapDay => ({
	booked: createEmptyBitmap(),
	held: createEmptyBitmap(),
	resolution,
});

// Backward compatibility helpers if needed, but we're shifting to usage counts
export const getBit = (bitmap: Uint16Array, minute: Minute): boolean => {
	return (bitmap[minute] || 0) > 0;
};
