import { expect, test } from 'bun:test';
import {
	createBitmapDay,
	createEmptyBitmap,
	getBit,
	isRangeFree,
	setBitRange,
} from './operations';

test('createEmptyBitmap creates 180-byte array', () => {
	const bitmap = createEmptyBitmap();
	expect(bitmap.length).toBe(180);
	expect(bitmap.every((b) => b === 0)).toBeTrue();
});

test('setBitRange and getBit work correctly', () => {
	const bitmap = createEmptyBitmap();
	setBitRange(bitmap, 10, 20, true);

	for (let i = 10; i < 20; i++) {
		expect(getBit(bitmap, i)).toBeTrue();
	}

	expect(getBit(bitmap, 9)).toBeFalse();
	expect(getBit(bitmap, 20)).toBeFalse();
});

test('setBitRange can clear bits', () => {
	const bitmap = createEmptyBitmap();
	setBitRange(bitmap, 10, 20, true);
	setBitRange(bitmap, 15, 25, false);

	for (let i = 10; i < 15; i++) {
		expect(getBit(bitmap, i)).toBeTrue();
	}

	for (let i = 15; i < 25; i++) {
		expect(getBit(bitmap, i)).toBeFalse();
	}
});

test('isRangeFree detects free ranges', () => {
	const booked = createEmptyBitmap();
	const held = createEmptyBitmap();

	expect(isRangeFree(booked, held, 100, 200)).toBeTrue();

	setBitRange(booked, 150, 160, true);
	expect(isRangeFree(booked, held, 100, 200)).toBeFalse();
	expect(isRangeFree(booked, held, 100, 150)).toBeTrue();
	expect(isRangeFree(booked, held, 160, 200)).toBeTrue();
});

test('isRangeFree detects held ranges', () => {
	const booked = createEmptyBitmap();
	const held = createEmptyBitmap();

	setBitRange(held, 150, 160, true);
	expect(isRangeFree(booked, held, 100, 200)).toBeFalse();
	expect(isRangeFree(booked, held, 100, 150)).toBeTrue();
	expect(isRangeFree(booked, held, 160, 200)).toBeTrue();
});

test('createBitmapDay creates proper structure', () => {
	const day = createBitmapDay(15);
	expect(day.booked.length).toBe(180);
	expect(day.held.length).toBe(180);
	expect(day.resolution).toBe(15);
});
