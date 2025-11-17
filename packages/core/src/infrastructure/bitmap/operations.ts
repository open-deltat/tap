import type { Minute } from '../../domain/ids';
import type { BitmapDay } from './types';

export const createEmptyBitmap = (): Uint8Array => new Uint8Array(180);

export const getBit = (bitmap: Uint8Array, minute: Minute): boolean => {
	const byte = minute >> 3;
	const bit = minute & 7;
	const byteValue = bitmap[byte];
	if (byteValue === undefined) {
		return false;
	}
	return (byteValue & (1 << bit)) !== 0;
};

export const setBitRange = (
	bitmap: Uint8Array,
	start: Minute,
	end: Minute,
	value: boolean,
): void => {
	for (let m = start; m < end; m++) {
		const byte = m >> 3;
		const bit = m & 7;
		const byteValue = bitmap[byte];
		if (byteValue === undefined) {
			continue;
		}
		if (value) {
			bitmap[byte] = byteValue | (1 << bit);
		} else {
			bitmap[byte] = byteValue & ~(1 << bit);
		}
	}
};

export const isRangeFree = (
	booked: Uint8Array,
	held: Uint8Array,
	start: Minute,
	end: Minute,
): boolean => {
	for (let m = start; m < end; m++) {
		if (getBit(booked, m) || getBit(held, m)) {
			return false;
		}
	}
	return true;
};

export const createBitmapDay = (resolution: number = 15): BitmapDay => ({
	booked: createEmptyBitmap(),
	held: createEmptyBitmap(),
	resolution,
});
