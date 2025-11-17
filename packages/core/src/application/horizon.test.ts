import { expect, test } from 'bun:test';
import { isWithinHorizon } from './horizon';

test('isWithinHorizon returns true for today', () => {
	const today = new Date();
	const day = today.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns true for date within horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 30);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns false for date beyond horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 100);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon returns false for past dates', () => {
	const past = new Date();
	past.setDate(past.getDate() - 1);
	const day = past.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon returns true for exact horizon boundary', () => {
	const future = new Date();
	future.setDate(future.getDate() + 90);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns false for one day beyond horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 91);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon respects custom now parameter', () => {
	const baseDate = new Date('2025-01-01');
	const future = new Date('2025-01-31');
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 30, baseDate.getTime())).toBe(true);
});

test('isWithinHorizon returns false for date beyond horizon with custom now', () => {
	const baseDate = new Date('2025-01-01');
	const future = new Date('2025-02-02');
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 30, baseDate.getTime())).toBe(false);
});
