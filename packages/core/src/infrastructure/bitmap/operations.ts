import type { Minute } from '@tap/protocol';
import type { BitmapDay } from './types';

const MINUTES_PER_DAY = 1440;

export const createEmptyBitmap = (): Uint16Array =>
	new Uint16Array(MINUTES_PER_DAY);

export const getUsage = (bitmap: Uint16Array, minute: Minute): number =>
	bitmap[minute] || 0;

export const incrementRange = (
	bitmap: Uint16Array,
	start: Minute,
	end: Minute,
	amount = 1,
): void => {
	for (let m = start; m < end; m++) {
		if (m >= 0 && m < MINUTES_PER_DAY) {
			bitmap[m] = (bitmap[m] || 0) + amount;
		}
	}
};

export const decrementRange = (
	bitmap: Uint16Array,
	start: Minute,
	end: Minute,
	amount = 1,
): void => {
	for (let m = start; m < end; m++) {
		if (m >= 0 && m < MINUTES_PER_DAY) {
			bitmap[m] = Math.max(0, (bitmap[m] || 0) - amount);
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
		if (m >= 0 && m < MINUTES_PER_DAY) {
			const totalUsage = (booked[m] || 0) + (held[m] || 0);
			if (totalUsage >= capacity) return false;
		}
	}
	return true;
};

export const createBitmapDay = (resolution = 15): BitmapDay => ({
	booked: createEmptyBitmap(),
	held: createEmptyBitmap(),
	resolution,
});

export const getBit = (bitmap: Uint16Array, minute: Minute): boolean =>
	(bitmap[minute] || 0) > 0;
