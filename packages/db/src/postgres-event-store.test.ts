import { beforeAll, expect, test } from 'bun:test';
import type {
	EventStore,
	HoldId,
	LedgerEvent,
	ResourceId,
	TenantId,
} from '@tap/core';
import { ulid } from 'ulid';

let createPostgresEventStore:
	| ((connectionString: string) => EventStore)
	| undefined;
let migrate: ((connectionString?: string) => Promise<void>) | undefined;
let eventStore: EventStore | undefined;

try {
	const dbModule = await import('./postgres-event-store');
	createPostgresEventStore = dbModule.createPostgresEventStore;
	const migrateModule = await import('./migrate');
	migrate = migrateModule.migrate;
} catch (error) {
	console.log('⚠️  Drizzle/Postgres not available, skipping tests:', error);
}

const shouldSkip = !createPostgresEventStore || !migrate;

beforeAll(async () => {
	if (shouldSkip) return;

	const connectionString =
		process.env.DATABASE_URL ||
		process.env.POSTGRES_URL ||
		'postgresql://tap:tap@localhost:5432/tap';

	// Run migration
	try {
		await migrate?.(connectionString);
	} catch (error) {
		// Migration might fail if table exists, that's ok
		console.log('Migration note:', error);
	}

	if (createPostgresEventStore) {
		eventStore = createPostgresEventStore(connectionString);
	}
});

test.skipIf(shouldSkip)('append and getAll work correctly', async () => {
	if (!eventStore) {
		throw new Error('eventStore not initialized');
	}
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const event: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await eventStore.append(event);
	const all = await eventStore.getAll();

	expect(all.length).toBeGreaterThanOrEqual(1);
	const found = all.find((e) => e.eventId === event.eventId);
	expect(found).toBeDefined();
	if (found) {
		expect(found.type).toBe('HoldPlaced');
		expect(found.tenantId).toBe(tenantId);
		expect(found.resourceId).toBe(resourceId);
	}
});

test.skipIf(shouldSkip)('getByResource filters correctly', async () => {
	if (!eventStore) {
		throw new Error('eventStore not initialized');
	}
	const tenantId = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;

	const event1: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId: resourceId1,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	const event2: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId: resourceId2,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await eventStore.append(event1);
	await eventStore.append(event2);

	const resource1Events = await eventStore.getByResource(tenantId, resourceId1);
	expect(resource1Events.length).toBeGreaterThanOrEqual(1);
	expect(resource1Events.some((e) => e.eventId === event1.eventId)).toBe(true);

	const resource2Events = await eventStore.getByResource(tenantId, resourceId2);
	expect(resource2Events.length).toBeGreaterThanOrEqual(1);
	expect(resource2Events.some((e) => e.eventId === event2.eventId)).toBe(true);
});

test.skipIf(shouldSkip)('getByTenant filters correctly', async () => {
	if (!eventStore) {
		throw new Error('eventStore not initialized');
	}
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const event1: LedgerEvent = {
		eventId: ulid(),
		tenantId: tenantId1,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	const event2: LedgerEvent = {
		eventId: ulid(),
		tenantId: tenantId2,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await eventStore.append(event1);
	await eventStore.append(event2);

	const tenant1Events = await eventStore.getByTenant(tenantId1);
	expect(tenant1Events.length).toBeGreaterThanOrEqual(1);
	expect(tenant1Events.some((e) => e.eventId === event1.eventId)).toBe(true);
	expect(tenant1Events.every((e) => e.tenantId === tenantId1)).toBe(true);

	const tenant2Events = await eventStore.getByTenant(tenantId2);
	expect(tenant2Events.length).toBeGreaterThanOrEqual(1);
	expect(tenant2Events.some((e) => e.eventId === event2.eventId)).toBe(true);
	expect(tenant2Events.every((e) => e.tenantId === tenantId2)).toBe(true);
});

test.skipIf(shouldSkip)(
	'getAfterCursor returns events after cursor',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}
		const tenantId = ulid() as TenantId;
		const resourceId = ulid() as ResourceId;

		const event1: LedgerEvent = {
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.now(),
			payload: {
				holdId: ulid() as HoldId,
				day: '2025-12-01',
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.now() + 60_000,
			},
		};

		const event2: LedgerEvent = {
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: Date.now() + 1000,
			payload: {
				bookingId: ulid(),
				holdId: ulid() as HoldId,
				start: Date.now(),
				end: Date.now() + 60 * 60 * 1000,
			},
		};

		await eventStore.append(event1);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await eventStore.append(event2);

		const afterCursor = await eventStore.getAfterCursor(event1.eventId);
		expect(afterCursor.length).toBeGreaterThanOrEqual(1);
		expect(afterCursor.some((e) => e.eventId === event2.eventId)).toBe(true);
	},
);

test.skipIf(shouldSkip)(
	'getAfterCursor with tenantId filters correctly',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}
		const tenantId1 = ulid() as TenantId;
		const tenantId2 = ulid() as TenantId;
		const resourceId = ulid() as ResourceId;

		const event1: LedgerEvent = {
			eventId: ulid(),
			tenantId: tenantId1,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.now(),
			payload: {
				holdId: ulid() as HoldId,
				day: '2025-12-01',
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.now() + 60_000,
			},
		};

		const event2: LedgerEvent = {
			eventId: ulid(),
			tenantId: tenantId2,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.now() + 1000,
			payload: {
				holdId: ulid() as HoldId,
				day: '2025-12-01',
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.now() + 60_000,
			},
		};

		const event3: LedgerEvent = {
			eventId: ulid(),
			tenantId: tenantId1,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: Date.now() + 2000,
			payload: {
				bookingId: ulid(),
				holdId: ulid() as HoldId,
				start: Date.now(),
				end: Date.now() + 60 * 60 * 1000,
			},
		};

		await eventStore.append(event1);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await eventStore.append(event2);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await eventStore.append(event3);

		const afterCursor = await eventStore.getAfterCursor(
			event1.eventId,
			tenantId1,
		);
		expect(afterCursor.length).toBeGreaterThanOrEqual(1);
		expect(afterCursor.some((e) => e.eventId === event3.eventId)).toBe(true);
		expect(afterCursor.every((e) => e.tenantId === tenantId1)).toBe(true);
	},
);

test.skipIf(shouldSkip)(
	'getAfterCursor returns empty array if cursor not found',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}
		const fakeCursor = ulid();

		const afterCursor = await eventStore.getAfterCursor(fakeCursor);
		expect(afterCursor.length).toBe(0);
	},
);

test.skipIf(shouldSkip)(
	'event store preserves unix timestamps (timezone-agnostic)',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}
		const tenantId = ulid() as TenantId;
		const resourceId = ulid() as ResourceId;

		const unixCreatedAt = 1735084800000;
		const unixExpiresAt = unixCreatedAt + 60_000;
		const unixStart = unixCreatedAt + 600 * 60 * 1000;
		const unixEnd = unixCreatedAt + 660 * 60 * 1000;

		const holdEvent: LedgerEvent = {
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: unixCreatedAt,
			payload: {
				holdId: ulid() as HoldId,
				day: '2025-12-25',
				startMinute: 600,
				endMinute: 660,
				expiresAt: unixExpiresAt,
			},
		};

		const bookingEvent: LedgerEvent = {
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: unixCreatedAt + 1000,
			payload: {
				bookingId: ulid(),
				holdId: ulid() as HoldId,
				start: unixStart,
				end: unixEnd,
			},
		};

		await eventStore.append(holdEvent);
		await eventStore.append(bookingEvent);

		const all = await eventStore.getAll();
		const foundHold = all.find((e) => e.eventId === holdEvent.eventId);
		const foundBooking = all.find((e) => e.eventId === bookingEvent.eventId);

		expect(foundHold).toBeDefined();
		if (foundHold && foundHold.type === 'HoldPlaced') {
			expect(foundHold.createdAt).toBe(unixCreatedAt);
			expect(foundHold.payload.expiresAt).toBe(unixExpiresAt);
			expect(typeof foundHold.createdAt).toBe('number');
			expect(typeof foundHold.payload.expiresAt).toBe('number');
		}

		expect(foundBooking).toBeDefined();
		if (foundBooking && foundBooking.type === 'BookingConfirmed') {
			expect(foundBooking.createdAt).toBe(unixCreatedAt + 1000);
			expect(foundBooking.payload.start).toBe(unixStart);
			expect(foundBooking.payload.end).toBe(unixEnd);
			expect(typeof foundBooking.createdAt).toBe('number');
			expect(typeof foundBooking.payload.start).toBe('number');
			expect(typeof foundBooking.payload.end).toBe('number');
		}
	},
);

test.skipIf(shouldSkip)(
	'event store converts Date to unix on read (timezone-agnostic)',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}
		const tenantId = ulid() as TenantId;
		const resourceId = ulid() as ResourceId;

		const unixTimestamp = 1735084800000;

		const event: LedgerEvent = {
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: unixTimestamp,
			payload: {
				holdId: ulid() as HoldId,
				day: '2025-12-25',
				startMinute: 600,
				endMinute: 660,
				expiresAt: unixTimestamp + 60_000,
			},
		};

		await eventStore.append(event);
		const retrieved = await eventStore.getByResource(tenantId, resourceId);
		const found = retrieved.find((e) => e.eventId === event.eventId);

		expect(found).toBeDefined();
		if (found) {
			expect(found.createdAt).toBe(unixTimestamp);
			expect(found.createdAt).not.toBeInstanceOf(Date);
			expect(typeof found.createdAt).toBe('number');
		}
	},
);
