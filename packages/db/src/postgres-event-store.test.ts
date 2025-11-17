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

test.skipIf(shouldSkip || !eventStore)(
	'append and getAll work correctly',
	async () => {
		if (!eventStore) return;
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
	},
);

test.skipIf(shouldSkip || !eventStore)(
	'getByResource filters correctly',
	async () => {
		if (!eventStore) return;
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

		const resource1Events = await eventStore.getByResource(
			tenantId,
			resourceId1,
		);
		expect(resource1Events.length).toBeGreaterThanOrEqual(1);
		expect(resource1Events.some((e) => e.eventId === event1.eventId)).toBe(
			true,
		);

		const resource2Events = await eventStore.getByResource(
			tenantId,
			resourceId2,
		);
		expect(resource2Events.length).toBeGreaterThanOrEqual(1);
		expect(resource2Events.some((e) => e.eventId === event2.eventId)).toBe(
			true,
		);
	},
);

test.skipIf(shouldSkip || !eventStore)(
	'getByTenant filters correctly',
	async () => {
		if (!eventStore) return;
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
	},
);
