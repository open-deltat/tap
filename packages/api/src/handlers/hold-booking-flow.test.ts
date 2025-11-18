import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { BookingId, HoldId, ResourceId, TenantId } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../services/context';
import { handlePrivateRequest } from './private';
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

afterAll(async () => {
});

test('Hold + Booking flow: place hold with unix timestamps', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-10';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const expiresAtUnix = Date.now() + 60_000;

	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: expiresAtUnix,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.holdId).toBeDefined();
	expect(body.event).toBeDefined();
	expect(body.event.type).toBe('HoldPlaced');
	expect(body.event.payload.day).toBe(day);
	expect(body.event.payload.startMinute).toBe(600);
	expect(body.event.payload.endMinute).toBe(660);

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(tenantId, resourceId);
	const holdEvent = events.find(
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === body.holdId,
	);

	expect(holdEvent).toBeDefined();
	if (holdEvent && holdEvent.type === 'HoldPlaced') {
		expect(holdEvent.payload.expiresAt).toBe(expiresAtUnix);
		expect(typeof holdEvent.createdAt).toBe('number');
		expect(Number.isInteger(holdEvent.createdAt)).toBe(true);
	}
});

test('Hold + Booking flow: confirm booking from hold with unix timestamps', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-11';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);

	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	expect(holdResponse.status).toBe(201);
	const holdBody = await holdResponse.json();

	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: holdBody.holdId,
			start: startUnix,
			end: endUnix,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const bookingResponse = await handlePrivateRequest(bookingReq);
	expect(bookingResponse.status).toBe(200);

	const bookingBody = await bookingResponse.json();
	expect(bookingBody.bookingId).toBeDefined();
	expect(bookingBody.event).toBeDefined();
	expect(bookingBody.event.type).toBe('BookingConfirmed');

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(tenantId, resourceId);
	const bookingEvent = events.find(
		(e) =>
			e.type === 'BookingConfirmed' &&
			e.payload.bookingId === bookingBody.bookingId,
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

test('Hold + Booking flow: cannot confirm booking from expired hold', async () => {
	const allocator = getAllocator();
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-12';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	const eventStore = getEventStore();
	await eventStore.append(holdResult.event);

	allocator.expireHolds(Date.now());

	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: holdResult.holdId,
			start: startUnix,
			end: endUnix,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const bookingResponse = await handlePrivateRequest(bookingReq);
	expect(bookingResponse.status).toBe(404);

	const bookingBody = await bookingResponse.json();
	expect(bookingBody.error).toBeDefined();
});

test('Hold + Booking flow: concurrent holds on same slot', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-13';

	const [response1, response2] = await Promise.all([
		handlePrivateRequest(
			new Request('http://localhost/v1/holds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId,
					resourceId,
					day,
					startMinute: 600,
					endMinute: 660,
					expiresAtMs: Date.now() + 60_000,
				}),
			}),
		),
		handlePrivateRequest(
			new Request('http://localhost/v1/holds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId,
					resourceId,
					day,
					startMinute: 600,
					endMinute: 660,
					expiresAtMs: Date.now() + 60_000,
				}),
			}),
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

test('Hold + Booking flow: booking uses UTC for day parsing', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-14';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);

	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	const holdBody = await holdResponse.json();

	const expectedStart = dayStartUnix + 600 * 60 * 1000;
	const expectedEnd = dayStartUnix + 660 * 60 * 1000;

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: holdBody.holdId,
			start: expectedStart,
			end: expectedEnd,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const bookingResponse = await handlePrivateRequest(bookingReq);
	expect(bookingResponse.status).toBe(200);

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(tenantId, resourceId);
	const bookingEvent = events.find(
		(e) => e.type === 'BookingConfirmed' && e.payload.holdId === holdBody.holdId,
	);

	expect(bookingEvent).toBeDefined();
	if (bookingEvent && bookingEvent.type === 'BookingConfirmed') {
		expect(bookingEvent.payload.start).toBe(expectedStart);
		expect(bookingEvent.payload.end).toBe(expectedEnd);
	}
});

test('Hold + Booking flow: booking confirmation releases hold', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-15';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);

	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	const holdBody = await holdResponse.json();

	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: holdBody.holdId,
			start: startUnix,
			end: endUnix,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const bookingResponse = await handlePrivateRequest(bookingReq);
	expect(bookingResponse.status).toBe(200);

	const bookingBody = await bookingResponse.json();
	expect(bookingBody.bookingId).toBeDefined();

	const allocator = getAllocator();
	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);

	if (dayState) {
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const bookedByte = dayState.booked[byte];
			const heldByte = dayState.held[byte];
			if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
				if (heldByte !== undefined && (heldByte & (1 << bit)) !== 0) {
					throw new Error('Hold should be released after booking confirmation');
				}
			}
		}
	}
});

test('Hold + Booking flow: all timestamps are unix milliseconds', async () => {
	const tenantId = testTenant.id as TenantId;
	const resourceId = testResource.id as ResourceId;
	const day = '2025-01-16';
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const expiresAtUnix = Date.now() + 60_000;

	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: expiresAtUnix,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	const holdBody = await holdResponse.json();

	const startUnix = dayStartUnix + 600 * 60 * 1000;
	const endUnix = dayStartUnix + 660 * 60 * 1000;

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: holdBody.holdId,
			start: startUnix,
			end: endUnix,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const bookingResponse = await handlePrivateRequest(bookingReq);
	const bookingBody = await bookingResponse.json();

	const eventStore = getEventStore();
	const events = await eventStore.getByResource(tenantId, resourceId);

	const holdEvent = events.find(
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdBody.holdId,
	);
	const bookingEvent = events.find(
		(e) =>
			e.type === 'BookingConfirmed' &&
			e.payload.bookingId === bookingBody.bookingId,
	);

	expect(holdEvent).toBeDefined();
	expect(bookingEvent).toBeDefined();

	if (holdEvent && holdEvent.type === 'HoldPlaced') {
		expect(Number.isInteger(holdEvent.createdAt)).toBe(true);
		expect(Number.isInteger(holdEvent.payload.expiresAt)).toBe(true);
		expect(holdEvent.payload.expiresAt).toBe(expiresAtUnix);
	}

	if (bookingEvent && bookingEvent.type === 'BookingConfirmed') {
		expect(Number.isInteger(bookingEvent.createdAt)).toBe(true);
		expect(Number.isInteger(bookingEvent.payload.start)).toBe(true);
		expect(Number.isInteger(bookingEvent.payload.end)).toBe(true);
		expect(bookingEvent.payload.start).toBe(startUnix);
		expect(bookingEvent.payload.end).toBe(endUnix);
	}
});

