import { beforeAll, expect, test } from 'bun:test';
import type { LedgerEvent } from '@tap/core';
import { ulid } from 'ulid';

let createPostgresEventStore:
	| ((connectionString: string) => import('@tap/core').EventStore)
	| undefined;
let migrate: ((connectionString?: string) => Promise<void>) | undefined;
let eventStore: import('@tap/core').EventStore | undefined;

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

	try {
		await migrate?.(connectionString);
	} catch (error) {
		console.log('Migration note:', error);
	}

	if (createPostgresEventStore) {
		eventStore = createPostgresEventStore(connectionString);
	}
});

test.skipIf(shouldSkip)(
	'event store preserves unix timestamps across DST transitions',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}

		const unixTimestamps = [
			Date.UTC(2024, 2, 10, 6, 0, 0, 0),
			Date.UTC(2024, 2, 10, 7, 0, 0, 0),
			Date.UTC(2024, 10, 3, 6, 0, 0, 0),
			Date.UTC(2024, 10, 3, 7, 0, 0, 0),
		];

		const events: LedgerEvent[] = unixTimestamps.map((unix) => ({
			eventId: ulid(),
			tenantId: ulid(),
			resourceId: ulid(),
			type: 'HoldPlaced',
			version: 1,
			createdAt: unix,
			payload: {
				holdId: ulid(),
				day: '2024-03-10',
				startMinute: 600,
				endMinute: 660,
				expiresAt: unix + 60_000,
			},
		}));

		for (const event of events) {
			await eventStore.append(event);
		}

		const all = await eventStore.getAll();
		const retrieved = all.filter((e) =>
			events.some((ev) => ev.eventId === e.eventId),
		);

		expect(retrieved.length).toBe(events.length);

		for (let i = 0; i < events.length; i++) {
			const original = events[i];
			const found = retrieved.find((e) => e.eventId === original.eventId);
			expect(found).toBeDefined();
			if (found) {
				expect(found.createdAt).toBe(original.createdAt);
				expect(typeof found.createdAt).toBe('number');
			}
		}
	},
);

test.skipIf(shouldSkip)(
	'event store handles events with identical timestamps correctly',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}

		const identicalTimestamp = Date.UTC(2025, 0, 15, 12, 0, 0, 0);

		const events: LedgerEvent[] = Array.from({ length: 5 }, () => ({
			eventId: ulid(),
			tenantId: ulid(),
			resourceId: ulid(),
			type: 'HoldPlaced',
			version: 1,
			createdAt: identicalTimestamp,
			payload: {
				holdId: ulid(),
				day: '2025-01-15',
				startMinute: 600,
				endMinute: 660,
				expiresAt: identicalTimestamp + 60_000,
			},
		}));

		for (const event of events) {
			await eventStore.append(event);
		}

		const all = await eventStore.getAll();
		const retrieved = all.filter((e) =>
			events.some((ev) => ev.eventId === e.eventId),
		);

		expect(retrieved.length).toBe(events.length);

		for (const event of events) {
			const found = retrieved.find((e) => e.eventId === event.eventId);
			expect(found).toBeDefined();
			if (found) {
				expect(found.createdAt).toBe(identicalTimestamp);
			}
		}
	},
);

test.skipIf(shouldSkip)(
	'event store preserves unix timestamps at year boundaries',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}

		const yearBoundaryTimestamps = [
			Date.UTC(2024, 11, 31, 23, 59, 59, 999),
			Date.UTC(2025, 0, 1, 0, 0, 0, 0),
			Date.UTC(2025, 0, 1, 0, 0, 0, 1),
		];

		const events: LedgerEvent[] = yearBoundaryTimestamps.map((unix) => ({
			eventId: ulid(),
			tenantId: ulid(),
			resourceId: ulid(),
			type: 'HoldPlaced',
			version: 1,
			createdAt: unix,
			payload: {
				holdId: ulid(),
				day: '2025-01-01',
				startMinute: 600,
				endMinute: 660,
				expiresAt: unix + 60_000,
			},
		}));

		for (const event of events) {
			await eventStore.append(event);
		}

		const all = await eventStore.getAll();
		const retrieved = all.filter((e) =>
			events.some((ev) => ev.eventId === e.eventId),
		);

		expect(retrieved.length).toBe(events.length);

		for (let i = 0; i < events.length; i++) {
			const original = events[i];
			const found = retrieved.find((e) => e.eventId === original.eventId);
			expect(found).toBeDefined();
			if (found) {
				expect(found.createdAt).toBe(original.createdAt);
			}
		}
	},
);

test.skipIf(shouldSkip)(
	'event store maintains ordering with unix timestamps',
	async () => {
		if (!eventStore) {
			throw new Error('eventStore not initialized');
		}

		const timestamps = [
			Date.UTC(2025, 0, 1, 0, 0, 0, 0),
			Date.UTC(2025, 0, 1, 0, 0, 0, 1),
			Date.UTC(2025, 0, 1, 0, 0, 0, 2),
		];

		const events: LedgerEvent[] = timestamps.map((unix) => ({
			eventId: ulid(),
			tenantId: ulid(),
			resourceId: ulid(),
			type: 'HoldPlaced',
			version: 1,
			createdAt: unix,
			payload: {
				holdId: ulid(),
				day: '2025-01-01',
				startMinute: 600,
				endMinute: 660,
				expiresAt: unix + 60_000,
			},
		}));

		for (const event of events) {
			await eventStore.append(event);
		}

		const all = await eventStore.getAll();
		const retrieved = all.filter((e) =>
			events.some((ev) => ev.eventId === e.eventId),
		);

		expect(retrieved.length).toBe(events.length);

		for (let i = 0; i < retrieved.length - 1; i++) {
			const current = retrieved[i];
			const next = retrieved[i + 1];
			if (current && next) {
				expect(current.createdAt).toBeLessThanOrEqual(next.createdAt);
			}
		}
	},
);
