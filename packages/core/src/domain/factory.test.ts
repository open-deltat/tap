import { describe, expect, it } from 'bun:test';
import type { ResourceId, TenantId } from '@open-tap/protocol';
import { createEvent } from './factory';

const TENANT_ID = 'tenant-test' as TenantId;
const RESOURCE_ID = 'resource-test' as ResourceId;

describe('createEvent', () => {
	it('creates event with unique eventId (ULID)', () => {
		const event1 = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		const event2 = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-2',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		expect(event1.eventId).toBeDefined();
		expect(event2.eventId).toBeDefined();
		expect(event1.eventId).not.toBe(event2.eventId);
		expect(event1.eventId.length).toBe(26);
	});

	it('sets correct type on event', () => {
		const holdPlaced = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		const holdReleased = createEvent('HoldReleased', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
		});

		const bookingConfirmed = createEvent('BookingConfirmed', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			bookingId: 'booking-1',
			start: 1000,
			end: 2000,
		});

		expect(holdPlaced.type).toBe('HoldPlaced');
		expect(holdReleased.type).toBe('HoldReleased');
		expect(bookingConfirmed.type).toBe('BookingConfirmed');
	});

	it('includes tenantId and resourceId in event', () => {
		const event = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		expect(event.tenantId).toBe(TENANT_ID);
		expect(event.resourceId).toBe(RESOURCE_ID);
	});

	it('sets version to 1', () => {
		const event = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		expect(event.version).toBe(1);
	});

	it('sets createdAt to current timestamp', () => {
		const before = Date.now();
		const event = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});
		const after = Date.now();

		expect(event.createdAt).toBeGreaterThanOrEqual(before);
		expect(event.createdAt).toBeLessThanOrEqual(after);
	});

	it('puts extra params in payload', () => {
		const event = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
			clientRef: 'my-ref',
		});

		expect(event.payload.holdId).toBe('hold-1');
		expect(event.payload.startUnix).toBe(1000);
		expect(event.payload.endUnix).toBe(2000);
		expect(event.payload.expiresAt).toBe(3000);
		expect(event.payload.clientRef).toBe('my-ref');
	});

	it('does not include tenantId and resourceId in payload', () => {
		const event = createEvent('HoldPlaced', {
			tenantId: TENANT_ID,
			resourceId: RESOURCE_ID,
			holdId: 'hold-1',
			startUnix: 1000,
			endUnix: 2000,
			expiresAt: 3000,
		});

		expect(event.payload.tenantId).toBeUndefined();
		expect(event.payload.resourceId).toBeUndefined();
	});

	describe('event types', () => {
		it('creates HoldPlaced event', () => {
			const event = createEvent('HoldPlaced', {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: 'hold-1',
				startUnix: 1000,
				endUnix: 2000,
				expiresAt: 3000,
			});

			expect(event.type).toBe('HoldPlaced');
			expect(event.payload.holdId).toBe('hold-1');
		});

		it('creates HoldReleased event', () => {
			const event = createEvent('HoldReleased', {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: 'hold-1',
				startUnix: 1000,
				endUnix: 2000,
			});

			expect(event.type).toBe('HoldReleased');
			expect(event.payload.holdId).toBe('hold-1');
		});

		it('creates HoldExpired event', () => {
			const event = createEvent('HoldExpired', {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: 'hold-1',
				startUnix: 1000,
				endUnix: 2000,
			});

			expect(event.type).toBe('HoldExpired');
			expect(event.payload.holdId).toBe('hold-1');
		});

		it('creates BookingConfirmed event', () => {
			const event = createEvent('BookingConfirmed', {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				bookingId: 'booking-1',
				holdId: 'hold-1',
				start: 1000,
				end: 2000,
				customerName: 'John Doe',
			});

			expect(event.type).toBe('BookingConfirmed');
			expect(event.payload.bookingId).toBe('booking-1');
			expect(event.payload.holdId).toBe('hold-1');
			expect(event.payload.customerName).toBe('John Doe');
		});

		it('creates BookingCancelled event', () => {
			const event = createEvent('BookingCancelled', {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				bookingId: 'booking-1',
				start: 1000,
				end: 2000,
			});

			expect(event.type).toBe('BookingCancelled');
			expect(event.payload.bookingId).toBe('booking-1');
		});
	});

	describe('ULID ordering', () => {
		it('generates ULIDs that sort chronologically', async () => {
			const events: string[] = [];

			for (let i = 0; i < 5; i++) {
				const event = createEvent('HoldPlaced', {
					tenantId: TENANT_ID,
					resourceId: RESOURCE_ID,
					holdId: `hold-${i}`,
					startUnix: 1000,
					endUnix: 2000,
					expiresAt: 3000,
				});
				events.push(event.eventId);
				await new Promise((resolve) => setTimeout(resolve, 2));
			}

			const sorted = [...events].sort();
			expect(sorted).toEqual(events);
		});
	});
});
