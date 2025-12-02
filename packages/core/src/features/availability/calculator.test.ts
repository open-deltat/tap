import { describe, expect, it } from 'bun:test';
import type { ResourceId, TenantId } from '@tap/protocol';
import type { Offer } from '../../domain/models';
import type { InventoryState } from '../inventory-types';
import { calculateAvailability } from './calculator';

const TENANT_ID = 'tenant-test' as TenantId;
const RESOURCE_ID = 'resource-test' as ResourceId;

const createEmptyState = (): InventoryState => ({
	booked: [],
	held: [],
});

const createWeeklyOffer = (
	overrides: Partial<Extract<Offer, { type: 'weekly' }>> = {},
): Extract<Offer, { type: 'weekly' }> => ({
	id: 'offer-1',
	tenantId: TENANT_ID,
	resourceId: RESOURCE_ID,
	type: 'weekly',
	daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
	startTime: '09:00',
	endTime: '17:00',
	timezone: 'UTC',
	capacity: 1,
	...overrides,
});

const createRangeOffer = (
	overrides: Partial<Extract<Offer, { type: 'range' }>> = {},
): Extract<Offer, { type: 'range' }> => ({
	id: 'offer-2',
	tenantId: TENANT_ID,
	resourceId: RESOURCE_ID,
	type: 'range',
	start: '2025-01-15T09:00:00.000Z',
	end: '2025-01-15T17:00:00.000Z',
	capacity: 1,
	...overrides,
});

describe('calculateAvailability', () => {
	describe('basic slot generation', () => {
		it('generates slots from offers when no holds or bookings', async () => {
			const offer = createWeeklyOffer({
				daysOfWeek: [3],
				startTime: '09:00',
				endTime: '10:00',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots.length).toBe(4);

			for (const slot of slots) {
				expect(slot.tenantId).toBe(TENANT_ID);
				expect(slot.resourceId).toBe(RESOURCE_ID);
				expect(slot.end - slot.start).toBe(15 * 60 * 1000);
			}
		});

		it('returns empty when no offers', async () => {
			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
			});

			expect(slots).toHaveLength(0);
		});

		it('uses default slot duration of 15 minutes', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
			});

			expect(slots).toHaveLength(4);
		});

		it('respects custom slot duration', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 30 * 60 * 1000,
			});

			expect(slots).toHaveLength(2);
		});

		it('generates correct slotIds', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T09:30:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(2);

			expect(slots[0]?.slotId).toBe(
				'2025-01-15T09:00:00.000Z_2025-01-15T09:15:00.000Z',
			);
			expect(slots[1]?.slotId).toBe(
				'2025-01-15T09:15:00.000Z_2025-01-15T09:30:00.000Z',
			);
		});
	});

	describe('subtracting holds', () => {
		it('excludes slots that are held', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [],
				held: [
					{
						start: new Date('2025-01-15T09:15:00.000Z').getTime(),
						end: new Date('2025-01-15T09:30:00.000Z').getTime(),
						value: 1,
					},
				],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(3);

			const slotStarts = slots.map((s) => new Date(s.start).toISOString());
			expect(slotStarts).not.toContain('2025-01-15T09:15:00.000Z');
		});

		it('excludes multiple held slots', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T11:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [],
				held: [
					{
						start: new Date('2025-01-15T09:00:00.000Z').getTime(),
						end: new Date('2025-01-15T09:15:00.000Z').getTime(),
						value: 1,
					},
					{
						start: new Date('2025-01-15T10:00:00.000Z').getTime(),
						end: new Date('2025-01-15T10:15:00.000Z').getTime(),
						value: 1,
					},
				],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(6);
		});
	});

	describe('subtracting bookings', () => {
		it('excludes slots that are booked', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [
					{
						start: new Date('2025-01-15T09:30:00.000Z').getTime(),
						end: new Date('2025-01-15T09:45:00.000Z').getTime(),
						value: 1,
					},
				],
				held: [],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(3);

			const slotStarts = slots.map((s) => new Date(s.start).toISOString());
			expect(slotStarts).not.toContain('2025-01-15T09:30:00.000Z');
		});

		it('excludes slots spanning multiple consecutive bookings', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T11:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [
					{
						start: new Date('2025-01-15T09:30:00.000Z').getTime(),
						end: new Date('2025-01-15T10:00:00.000Z').getTime(),
						value: 1,
					},
					{
						start: new Date('2025-01-15T10:00:00.000Z').getTime(),
						end: new Date('2025-01-15T10:30:00.000Z').getTime(),
						value: 1,
					},
				],
				held: [],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(4);
		});
	});

	describe('combined holds and bookings', () => {
		it('excludes both held and booked slots', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T11:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [
					{
						start: new Date('2025-01-15T09:00:00.000Z').getTime(),
						end: new Date('2025-01-15T09:15:00.000Z').getTime(),
						value: 1,
					},
				],
				held: [
					{
						start: new Date('2025-01-15T10:00:00.000Z').getTime(),
						end: new Date('2025-01-15T10:15:00.000Z').getTime(),
						value: 1,
					},
				],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(6);
		});

		it('handles overlapping hold and booking', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [
					{
						start: new Date('2025-01-15T09:15:00.000Z').getTime(),
						end: new Date('2025-01-15T09:45:00.000Z').getTime(),
						value: 1,
					},
				],
				held: [
					{
						start: new Date('2025-01-15T09:30:00.000Z').getTime(),
						end: new Date('2025-01-15T10:00:00.000Z').getTime(),
						value: 1,
					},
				],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(1);
			expect(new Date(slots[0]?.start ?? 0).toISOString()).toBe(
				'2025-01-15T09:00:00.000Z',
			);
		});
	});

	describe('clamping to query range', () => {
		it('clamps slots to query from boundary', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T08:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const from = new Date('2025-01-15T09:00:00.000Z');
			const to = new Date('2025-01-15T10:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(4);

			for (const slot of slots) {
				expect(slot.start).toBeGreaterThanOrEqual(from.getTime());
			}
		});

		it('clamps slots to query to boundary', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T12:00:00.000Z',
			});

			const from = new Date('2025-01-15T09:00:00.000Z');
			const to = new Date('2025-01-15T10:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(4);

			for (const slot of slots) {
				expect(slot.end).toBeLessThanOrEqual(to.getTime());
			}
		});
	});

	describe('edge cases', () => {
		it('handles slot duration larger than offer window', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T09:15:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 30 * 60 * 1000,
			});

			expect(slots).toHaveLength(0);
		});

		it('handles exactly fitting slot', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T09:30:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 30 * 60 * 1000,
			});

			expect(slots).toHaveLength(1);
		});

		it('handles query range with no matching offers', async () => {
			const offer = createWeeklyOffer({
				daysOfWeek: [1],
				startTime: '09:00',
				endTime: '17:00',
			});

			const saturday = new Date('2025-01-11T00:00:00.000Z');
			const sunday = new Date('2025-01-12T23:59:59.999Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from: saturday,
				to: sunday,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(0);
		});

		it('handles completely consumed offer window', async () => {
			const offer = createRangeOffer({
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const state: InventoryState = {
				booked: [
					{
						start: new Date('2025-01-15T09:00:00.000Z').getTime(),
						end: new Date('2025-01-15T10:00:00.000Z').getTime(),
						value: 1,
					},
				],
				held: [],
			};

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => state,
				offers: [offer],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(0);
		});

		it('handles multiple offers for same time range', async () => {
			const offer1 = createRangeOffer({
				id: 'offer-1',
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});
			const offer2 = createRangeOffer({
				id: 'offer-2',
				start: '2025-01-15T09:00:00.000Z',
				end: '2025-01-15T10:00:00.000Z',
			});

			const from = new Date('2025-01-15T00:00:00.000Z');
			const to = new Date('2025-01-16T00:00:00.000Z');

			const slots = await calculateAvailability({
				inventoryState: async () => createEmptyState(),
				offers: [offer1, offer2],
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				from,
				to,
				slotDurationMs: 15 * 60 * 1000,
			});

			expect(slots).toHaveLength(4);
		});
	});
});
