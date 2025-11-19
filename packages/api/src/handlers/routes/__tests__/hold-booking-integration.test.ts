import { afterAll, beforeAll, expect, test } from 'bun:test';
import { handlePlaceHold, handleReleaseHold } from '../hold';
import { handleGetAvailability } from '../availability';
import { getEventStore } from '../../../services/context';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from '../../test-setup';

let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
let testResource: Awaited<ReturnType<typeof createTestResource>>;

beforeAll(async () => {
	testTenant = await createTestTenant();
	testResource = await createTestResource(testTenant);
	await createTestOffer(testTenant, testResource);
});

afterAll(async () => {
	// Cleanup handled by test isolation
});

test('Full flow: place hold → emit delta → update availability', async () => {
	const day = '2025-12-10';
	const start = `${day}T10:00:00Z`;
	const end = `${day}T11:00:00Z`;

	const availabilityBefore = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: start,
		to: end,
		durationMinutes: '60',
	});

	expect(availabilityBefore.success).toBe(true);
	if (!availabilityBefore.success) {
		throw new Error('Failed to get availability');
	}

	const slotsBefore = availabilityBefore.slots.length;

	const holdResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start,
		end,
	});

	expect(holdResult.success).toBe(true);
	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const availabilityAfter = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: start,
		to: end,
		durationMinutes: '60',
	});

	expect(availabilityAfter.success).toBe(true);
	if (!availabilityAfter.success) {
		throw new Error('Failed to get availability after hold');
	}

	expect(availabilityAfter.slots.length).toBeLessThan(slotsBefore);
});

test('Full flow: place hold → release → slot available again', async () => {
	const day = '2025-12-11';
	const start = `${day}T10:00:00Z`;
	const end = `${day}T11:00:00Z`;

	const availabilityBefore = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: start,
		to: end,
		durationMinutes: '60',
	});

	expect(availabilityBefore.success).toBe(true);
	if (!availabilityBefore.success) {
		throw new Error('Failed to get availability');
	}

	const slotsBefore = availabilityBefore.slots.length;

	const holdResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start,
		end,
	});

	expect(holdResult.success).toBe(true);
	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const releaseResult = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		holdId: holdResult.holdId,
	});

	expect(releaseResult.success).toBe(true);

	await new Promise((resolve) => setTimeout(resolve, 100));

	const availabilityAfter = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: start,
		to: end,
		durationMinutes: '60',
	});

	expect(availabilityAfter.success).toBe(true);
	if (!availabilityAfter.success) {
		throw new Error('Failed to get availability after release');
	}

	expect(availabilityAfter.slots.length).toBe(slotsBefore);
});

test('Hold events are emitted to event store', async () => {
	const day = '2025-12-12';
	const start = `${day}T10:00:00Z`;
	const end = `${day}T11:00:00Z`;

	const holdResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start,
		end,
	});

	expect(holdResult.success).toBe(true);
	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(
		testTenant.id as any,
		testResource.id as any,
	);

	const holdPlacedEvent = events.find(
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdResult.holdId,
	);

	expect(holdPlacedEvent).toBeDefined();
	expect(holdPlacedEvent?.type).toBe('HoldPlaced');
	expect(holdPlacedEvent?.payload.holdId).toBe(holdResult.holdId);
});

test('Release hold emits HoldExpired event', async () => {
	const day = '2025-12-13';
	const start = `${day}T10:00:00Z`;
	const end = `${day}T11:00:00Z`;

	const holdResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start,
		end,
	});

	expect(holdResult.success).toBe(true);
	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	const releaseResult = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		holdId: holdResult.holdId,
	});

	expect(releaseResult.success).toBe(true);

	await new Promise((resolve) => setTimeout(resolve, 100));

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(
		testTenant.id as any,
		testResource.id as any,
	);

	const holdExpiredEvent = events.find(
		(e) => e.type === 'HoldExpired' && e.payload.holdId === holdResult.holdId,
	);

	expect(holdExpiredEvent).toBeDefined();
	expect(holdExpiredEvent?.type).toBe('HoldExpired');
	expect(holdExpiredEvent?.payload.holdId).toBe(holdResult.holdId);
});

test('Concurrent holds on same slot: only one succeeds', async () => {
	const day = '2025-12-14';
	const start = `${day}T10:00:00Z`;
	const end = `${day}T11:00:00Z`;

	const [result1, result2] = await Promise.all([
		handlePlaceHold({
			tenantSlug: testTenant.slug,
			resourceSlug: testResource.slug,
			start,
			end,
		}),
		handlePlaceHold({
			tenantSlug: testTenant.slug,
			resourceSlug: testResource.slug,
			start,
			end,
		}),
	]);

	const successCount = [result1, result2].filter((r) => r.success).length;
	const conflictCount = [result1, result2].filter(
		(r) => !r.success && r.status === 409,
	).length;

	expect(successCount).toBe(1);
	expect(conflictCount).toBe(1);
});



