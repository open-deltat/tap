import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { BookingId, ResourceId, TenantId } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../services/context';
import { handlePublicRequest } from './public';
import { handleEventStream } from './stream';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from './test-setup';

let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
let testResource: Awaited<ReturnType<typeof createTestResource>>;

beforeAll(async () => {
	testTenant = await createTestTenant();
	testResource = await createTestResource(testTenant);
	await createTestOffer(testTenant, testResource);
});

afterAll(async () => {});

test('TAP flow: availability snapshot returns slots with unix timestamps', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/availability?from=2025-12-01T00:00:00Z&to=2025-12-01T23:59:59Z&durationMinutes=60`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.slots).toBeDefined();
	expect(Array.isArray(body.slots)).toBe(true);

	if (body.slots.length > 0) {
		const slot = body.slots[0];
		expect(typeof slot.start).toBe('number');
		expect(typeof slot.end).toBe('number');
		expect(slot.start).toBeGreaterThan(0);
		expect(slot.end).toBeGreaterThan(slot.start);
		expect(Number.isInteger(slot.start)).toBe(true);
		expect(Number.isInteger(slot.end)).toBe(true);
	}
});

test('TAP flow: availability snapshot uses UTC for day parsing', async () => {
	const day = '2025-12-25';
	const expectedDayStart = parseDayToUnixStartOfDayUTC(day);

	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/availability?from=${day}T00:00:00Z&to=${day}T23:59:59Z&durationMinutes=60`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	if (body.slots.length > 0) {
		const slot = body.slots[0];
		expect(slot.start).toBeGreaterThanOrEqual(expectedDayStart);
		expect(slot.start).toBeLessThan(expectedDayStart + 24 * 60 * 60 * 1000);
	}
});

test('TAP flow: stream returns SSE with correct format', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await eventStore.append(holdResult.event);

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult.event.eventId}`,
		{
			method: 'GET',
		},
	);

	const response = await handleEventStream(req);
	expect(response.status).toBe(200);
	expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	expect(response.headers.get('Cache-Control')).toBe('no-cache');
	expect(response.headers.get('Connection')).toBe('keep-alive');
});

test('TAP flow: stream sends delta events with unix timestamps', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-24',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await eventStore.append(holdResult.event);
	await new Promise((resolve) => setTimeout(resolve, 100));

	const bookingId = ulid() as BookingId;
	const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-24');
	const start = dayStartUnix + 600 * 60 * 1000;
	const end = dayStartUnix + 660 * 60 * 1000;

	const confirmEvent = await allocator.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId,
		start,
		end,
	});

	if (!confirmEvent) {
		throw new Error('Failed to confirm booking');
	}

	await eventStore.append(confirmEvent);
	await new Promise((resolve) => setTimeout(resolve, 100));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult.event.eventId}`,
		{
			method: 'GET',
		},
	);

	const response = await handleEventStream(req);
	const reader = response.body?.getReader();
	expect(reader).toBeDefined();

	if (reader) {
		const decoder = new TextDecoder();
		let receivedData = '';

		await new Promise((resolve) => setTimeout(resolve, 1500));

		const startTime = Date.now();
		while (Date.now() - startTime < 3000) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) {
				receivedData += decoder.decode(value, { stream: true });
				if (
					receivedData.includes('BookingConfirmed') &&
					receivedData.includes(confirmEvent.eventId)
				) {
					break;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		reader.cancel();

		expect(receivedData).toContain('event: delta');
		expect(receivedData).toContain('BookingConfirmed');
		expect(receivedData).toContain(confirmEvent.eventId);

		const lines = receivedData.split('\n');
		for (const line of lines) {
			if (line.startsWith('data: ')) {
				try {
					const eventData = JSON.parse(line.slice(6));
					if (eventData.type === 'BookingConfirmed') {
						expect(typeof eventData.createdAt).toBe('number');
						expect(eventData.payload.start).toBe(start);
						expect(eventData.payload.end).toBe(end);
						break;
					}
				} catch {}
			}
		}
	}
});

test('TAP flow: public booking creates event with unix timestamps', async () => {
	const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-26');
	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const startISO = new Date(startUnix).toISOString();
	const endISO = new Date(endUnix).toISOString();

	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: startISO,
				end: endISO,
				customerName: 'Test User',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.bookingId).toBeDefined();
	expect(body.status).toBe('CONFIRMED');
	expect(typeof body.start).toBe('string');
	expect(typeof body.end).toBe('string');

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(
		testTenant.id as TenantId,
		testResource.id as ResourceId,
	);
	const bookingEvent = events.find(
		(e) =>
			e.type === 'BookingConfirmed' && e.payload.bookingId === body.bookingId,
	);

	expect(bookingEvent).toBeDefined();
	if (bookingEvent && bookingEvent.type === 'BookingConfirmed') {
		expect(bookingEvent.payload.start).toBe(startUnix);
		expect(bookingEvent.payload.end).toBe(endUnix);
		expect(typeof bookingEvent.createdAt).toBe('number');
		expect(bookingEvent.createdAt).toBeGreaterThan(0);
	}
});

test('TAP flow: concurrent bookings return 409 conflict', async () => {
	const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-27');
	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const startISO = new Date(startUnix).toISOString();
	const endISO = new Date(endUnix).toISOString();

	const [response1, response2] = await Promise.all([
		handlePublicRequest(
			new Request(
				`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						start: startISO,
						end: endISO,
						customerName: 'User 1',
						customerEmail: 'user1@example.com',
					}),
				},
			),
		),
		handlePublicRequest(
			new Request(
				`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						start: startISO,
						end: endISO,
						customerName: 'User 2',
						customerEmail: 'user2@example.com',
					}),
				},
			),
		),
	]);

	const successCount = [response1, response2]
		.map((r) => r.status)
		.filter((s) => s === 201).length;
	const conflictCount = [response1, response2]
		.map((r) => r.status)
		.filter((s) => s === 409).length;

	expect(successCount).toBe(1);
	expect(conflictCount).toBe(1);
});

test('TAP flow: stream reflects booking changes immediately', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;

	const initialHold = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-28',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!initialHold.success) {
		throw new Error('Failed to place initial hold');
	}

	await eventStore.append(initialHold.event);
	await new Promise((resolve) => setTimeout(resolve, 100));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${initialHold.event.eventId}`,
		{
			method: 'GET',
		},
	);

	const response = await handleEventStream(req);
	const reader = response.body?.getReader();
	expect(reader).toBeDefined();

	if (reader) {
		const decoder = new TextDecoder();
		const receivedEvents: string[] = [];

		const bookingId = ulid() as BookingId;
		const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-28');
		const start = dayStartUnix + 600 * 60 * 1000;
		const end = dayStartUnix + 660 * 60 * 1000;

		const confirmEvent = await allocator.confirmBooking({
			tenantId,
			resourceId,
			holdId: initialHold.holdId,
			bookingId,
			start,
			end,
		});

		if (!confirmEvent) {
			throw new Error('Failed to confirm booking');
		}

		await eventStore.append(confirmEvent);
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const startTime = Date.now();
		while (Date.now() - startTime < 2000) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) {
				const chunk = decoder.decode(value, { stream: true });
				if (chunk.includes('event: delta')) {
					const matches = chunk.match(/data: ({[^}]+})/g);
					if (matches) {
						receivedEvents.push(...matches);
					}
					if (chunk.includes('BookingConfirmed')) {
						break;
					}
				}
			}
		}

		reader.cancel();

		expect(receivedEvents.length).toBeGreaterThan(0);
		const hasBookingConfirmed = receivedEvents.some((e) =>
			e.includes('BookingConfirmed'),
		);
		expect(hasBookingConfirmed).toBe(true);
	}
});

test('TAP flow: availability snapshot excludes booked slots', async () => {
	const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-29');
	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const startISO = new Date(startUnix).toISOString();
	const endISO = new Date(endUnix).toISOString();

	const bookReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: startISO,
				end: endISO,
				customerName: 'Test User',
				customerEmail: 'test@example.com',
			}),
		},
	);

	await handlePublicRequest(bookReq);

	const availabilityReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/availability?from=2025-12-29T00:00:00Z&to=2025-12-29T23:59:59Z&durationMinutes=60`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(availabilityReq);
	expect(response.status).toBe(200);

	const body = await response.json();
	const bookedSlot = body.slots.find(
		(slot: { start: number; end: number }) =>
			slot.start === startUnix && slot.end === endUnix,
	);

	expect(bookedSlot).toBeUndefined();
});

test('TAP flow: stream cursor allows reconnection', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;

	const hold1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-30',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!hold1.success) {
		throw new Error('Failed to place hold 1');
	}

	await eventStore.append(hold1.event);
	await new Promise((resolve) => setTimeout(resolve, 100));

	const hold2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-30',
		startMinute: 700,
		endMinute: 760,
		expiresAt: Date.now() + 60_000,
	});

	if (!hold2.success) {
		throw new Error('Failed to place hold 2');
	}

	await eventStore.append(hold2.event);
	await new Promise((resolve) => setTimeout(resolve, 100));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${hold1.event.eventId}`,
		{
			method: 'GET',
		},
	);

	const response = await handleEventStream(req);
	const reader = response.body?.getReader();
	expect(reader).toBeDefined();

	if (reader) {
		const decoder = new TextDecoder();
		let receivedData = '';

		await new Promise((resolve) => setTimeout(resolve, 1200));

		const startTime = Date.now();
		while (Date.now() - startTime < 2000) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) {
				receivedData += decoder.decode(value, { stream: true });
				if (receivedData.includes(hold2.event.eventId)) {
					break;
				}
			}
		}

		reader.cancel();

		expect(receivedData).toContain(hold2.event.eventId);
		expect(receivedData).not.toContain(hold1.event.eventId);
	}
});

test('TAP flow: all timestamps are unix milliseconds', async () => {
	const dayStartUnix = parseDayToUnixStartOfDayUTC('2025-12-31');
	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const startISO = new Date(startUnix).toISOString();
	const endISO = new Date(endUnix).toISOString();

	const bookReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: startISO,
				end: endISO,
				customerName: 'Test User',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(bookReq);
	expect(response.status).toBe(201);

	const body = await response.json();
	const eventStore = getEventStore();
	const events = await eventStore.getByResource(
		testTenant.id as TenantId,
		testResource.id as ResourceId,
	);
	const bookingEvent = events.find(
		(e) =>
			e.type === 'BookingConfirmed' && e.payload.bookingId === body.bookingId,
	);

	expect(bookingEvent).toBeDefined();
	if (bookingEvent && bookingEvent.type === 'BookingConfirmed') {
		expect(bookingEvent.payload.start).toBe(startUnix);
		expect(bookingEvent.payload.end).toBe(endUnix);
		expect(Number.isInteger(bookingEvent.payload.start)).toBe(true);
		expect(Number.isInteger(bookingEvent.payload.end)).toBe(true);
		expect(Number.isInteger(bookingEvent.createdAt)).toBe(true);
	}
});
