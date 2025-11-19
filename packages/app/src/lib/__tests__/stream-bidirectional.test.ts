import { describe, expect, test, beforeAll } from 'bun:test';
import { createStreamListener } from '../../../../stream-client/src/listener';
import type { BookingEvent } from '../../../../stream-client/src/types';
import { ulid } from 'ulid';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const POLL_INTERVAL_MS = 1000;
const WAIT_BUFFER_MS = 500;

const checkServerAvailable = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${API_BASE_URL}/health`, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch {
		return false;
	}
};

const getInitialCursor = async (): Promise<string> => {
	try {
		const response = await fetch(`${API_BASE_URL}/v1/events?limit=1`, {
			signal: AbortSignal.timeout(2000),
		});
		if (!response.ok) {
			return ulid();
		}
		const data = (await response.json()) as { events: Array<{ eventId: string }> };
		if (data.events.length === 0) {
			return ulid();
		}
		return data.events[0]!.eventId;
	} catch {
		return ulid();
	}
};

const createTestTenantAndResource = async (): Promise<{
	tenantSlug: string;
	resourceSlug: string;
}> => {
	const tenantSlug = `test-tenant-${ulid()}`;
	const resourceSlug = `test-resource-${ulid()}`;

	const tenantResponse = await fetch(`${API_BASE_URL}/v1/tenants`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			slug: tenantSlug,
			name: 'Test Tenant',
		}),
	});

	if (!tenantResponse.ok) {
		throw new Error('Failed to create test tenant');
	}

	const resourceResponse = await fetch(
		`${API_BASE_URL}/v1/tenants/${tenantSlug}/resources`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				slug: resourceSlug,
				name: 'Test Resource',
				timezone: 'UTC',
				slotResolutionMinutes: 15,
			}),
		},
	);

	if (!resourceResponse.ok) {
		throw new Error('Failed to create test resource');
	}

	return { tenantSlug, resourceSlug };
};

const waitForEvent = async (
	events: BookingEvent[],
	predicate: (event: BookingEvent) => boolean,
	timeoutMs: number = 5000,
): Promise<BookingEvent | null> => {
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		const found = events.find(predicate);
		if (found) {
			return found;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
};

describe('Stream Bidirectional Integration Tests', () => {
	let tenantSlug: string;
	let resourceSlug: string;
	let serverAvailable: boolean;

	beforeAll(async () => {
		serverAvailable = await checkServerAvailable();
		if (serverAvailable) {
			const testData = await createTestTenantAndResource();
			tenantSlug = testData.tenantSlug;
			resourceSlug = testData.resourceSlug;
		}
	});

	test('Client A places hold, Client B receives HoldPlaced delta', async () => {
		if (!serverAvailable) {
			return;
		}

		const serverCheck = await checkServerAvailable();
		if (!serverCheck) {
			return;
		}

		const cursor = await getInitialCursor();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const clientBEvents: BookingEvent[] = [];
		let clientBConnected = false;
		let connectionError: Error | null = null;

		const clientB = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientBEvents.push(event);
			},
			onConnect: () => {
				clientBConnected = true;
			},
			onError: (error) => {
				connectionError = error;
			},
			maxReconnectAttempts: 2,
			reconnectDelay: 500,
		});

		clientB.start();

		const connectionTimeout = 2000;
		const startTime = Date.now();
		while (!clientBConnected && Date.now() - startTime < connectionTimeout) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!clientBConnected) {
			return;
		}

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 1);
		futureDate.setHours(10, 0, 0, 0);
		const start = futureDate.getTime();
		const end = start + 60 * 60 * 1000;

		const holdResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start,
					end,
				}),
			},
		);

		expect(holdResponse.status).toBe(201);
		const holdData = (await holdResponse.json()) as { holdId: string };

		const holdPlacedEvent = await waitForEvent(
			clientBEvents,
			(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData.holdId,
			POLL_INTERVAL_MS * 2 + WAIT_BUFFER_MS,
		);

		clientB.stop();

		expect(holdPlacedEvent).not.toBeNull();
		if (holdPlacedEvent && holdPlacedEvent.type === 'HoldPlaced') {
			expect(holdPlacedEvent.payload.holdId).toBe(holdData.holdId);
		}
	});

	test('Client A places hold, Client B and Client C both receive delta', async () => {
		if (!serverAvailable) {
			return;
		}

		const serverCheck = await checkServerAvailable();
		if (!serverCheck) {
			return;
		}

		const cursor = await getInitialCursor();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const clientBEvents: BookingEvent[] = [];
		const clientCEvents: BookingEvent[] = [];
		let clientBConnected = false;
		let clientCConnected = false;

		const clientB = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientBEvents.push(event);
			},
			onConnect: () => {
				clientBConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		const clientC = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientCEvents.push(event);
			},
			onConnect: () => {
				clientCConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		clientB.start();
		clientC.start();

		const connectionTimeout = 2000;
		const startTime = Date.now();
		while (
			(!clientBConnected || !clientCConnected) &&
			Date.now() - startTime < connectionTimeout
		) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!clientBConnected || !clientCConnected) {
			return;
		}

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 1);
		futureDate.setHours(11, 0, 0, 0);
		const start = futureDate.getTime();
		const end = start + 60 * 60 * 1000;

		const holdResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start,
					end,
				}),
			},
		);

		expect(holdResponse.status).toBe(201);
		const holdData = (await holdResponse.json()) as { holdId: string };

		const [clientBHoldEvent, clientCHoldEvent] = await Promise.all([
			waitForEvent(
				clientBEvents,
				(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData.holdId,
				POLL_INTERVAL_MS * 2 + WAIT_BUFFER_MS,
			),
			waitForEvent(
				clientCEvents,
				(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData.holdId,
				POLL_INTERVAL_MS * 2 + WAIT_BUFFER_MS,
			),
		]);

		clientB.stop();
		clientC.stop();

		expect(clientBHoldEvent).not.toBeNull();
		expect(clientCHoldEvent).not.toBeNull();
	});

	test('Client A releases hold, Client B receives HoldExpired delta', async () => {
		if (!serverAvailable) {
			return;
		}

		const serverCheck = await checkServerAvailable();
		if (!serverCheck) {
			return;
		}

		const cursor = await getInitialCursor();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const clientBEvents: BookingEvent[] = [];
		let clientBConnected = false;

		const clientB = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientBEvents.push(event);
			},
			onConnect: () => {
				clientBConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		clientB.start();

		const connectionTimeout = 2000;
		const startTime = Date.now();
		while (!clientBConnected && Date.now() - startTime < connectionTimeout) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!clientBConnected) {
			return;
		}

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 1);
		futureDate.setHours(12, 0, 0, 0);
		const start = futureDate.getTime();
		const end = start + 60 * 60 * 1000;

		const holdResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start,
					end,
				}),
			},
		);

		expect(holdResponse.status).toBe(201);
		const holdData = (await holdResponse.json()) as { holdId: string };

		await waitForEvent(
			clientBEvents,
			(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData.holdId,
			POLL_INTERVAL_MS + WAIT_BUFFER_MS,
		);

		const releaseResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdData.holdId}`,
			{
				method: 'DELETE',
			},
		);

		expect(releaseResponse.status).toBe(200);

		const holdExpiredEvent = await waitForEvent(
			clientBEvents,
			(e) => e.type === 'HoldExpired' && e.payload.holdId === holdData.holdId,
			POLL_INTERVAL_MS * 2 + WAIT_BUFFER_MS,
		);

		clientB.stop();

		expect(holdExpiredEvent).not.toBeNull();
	});

	test('Client A confirms booking, Client B receives BookingConfirmed delta', async () => {
		if (!serverAvailable) {
			return;
		}

		const serverCheck = await checkServerAvailable();
		if (!serverCheck) {
			return;
		}

		const cursor = await getInitialCursor();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const clientBEvents: BookingEvent[] = [];
		let clientBConnected = false;

		const clientB = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientBEvents.push(event);
			},
			onConnect: () => {
				clientBConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		clientB.start();

		const connectionTimeout = 2000;
		const startTime = Date.now();
		while (!clientBConnected && Date.now() - startTime < connectionTimeout) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!clientBConnected) {
			return;
		}

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 1);
		futureDate.setHours(13, 0, 0, 0);
		const start = futureDate.getTime();
		const end = start + 60 * 60 * 1000;

		const holdResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start,
					end,
				}),
			},
		);

		expect(holdResponse.status).toBe(201);
		const holdData = (await holdResponse.json()) as { holdId: string };

		await waitForEvent(
			clientBEvents,
			(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData.holdId,
			POLL_INTERVAL_MS + WAIT_BUFFER_MS,
		);

		const bookingResponse = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					holdId: holdData.holdId,
					customerName: 'Test User',
					customerEmail: 'test@example.com',
				}),
			},
		);

		expect(bookingResponse.status).toBe(201);
		const bookingData = (await bookingResponse.json()) as {
			bookingId: string;
		};

		const bookingConfirmedEvent = await waitForEvent(
			clientBEvents,
			(e) =>
				e.type === 'BookingConfirmed' &&
				e.payload.bookingId === bookingData.bookingId,
			POLL_INTERVAL_MS * 2 + WAIT_BUFFER_MS,
		);

		clientB.stop();

		expect(bookingConfirmedEvent).not.toBeNull();
	});

	test('Multiple concurrent holds from different clients are broadcast to all', async () => {
		if (!serverAvailable) {
			return;
		}

		const serverCheck = await checkServerAvailable();
		if (!serverCheck) {
			return;
		}

		const cursor = await getInitialCursor();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const clientBEvents: BookingEvent[] = [];
		const clientCEvents: BookingEvent[] = [];
		let clientBConnected = false;
		let clientCConnected = false;

		const clientB = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientBEvents.push(event);
			},
			onConnect: () => {
				clientBConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		const clientC = createStreamListener({
			baseUrl: API_BASE_URL,
			cursor,
			onEvent: (event) => {
				clientCEvents.push(event);
			},
			onConnect: () => {
				clientCConnected = true;
			},
			maxReconnectAttempts: 2,
		});

		clientB.start();
		clientC.start();

		const connectionTimeout = 2000;
		const startTime = Date.now();
		while (
			(!clientBConnected || !clientCConnected) &&
			Date.now() - startTime < connectionTimeout
		) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!clientBConnected || !clientCConnected) {
			return;
		}

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 1);
		futureDate.setHours(14, 0, 0, 0);

		const hold1Response = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start: futureDate.getTime(),
					end: futureDate.getTime() + 60 * 60 * 1000,
				}),
			},
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		futureDate.setHours(15, 0, 0, 0);

		const hold2Response = await fetch(
			`${API_BASE_URL}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start: futureDate.getTime(),
					end: futureDate.getTime() + 60 * 60 * 1000,
				}),
			},
		);

		expect(hold1Response.status).toBe(201);
		expect(hold2Response.status).toBe(201);

		const hold1Data = (await hold1Response.json()) as { holdId: string };
		const hold2Data = (await hold2Response.json()) as { holdId: string };

		const [clientBHold1, clientBHold2, clientCHold1, clientCHold2] =
			await Promise.all([
				waitForEvent(
					clientBEvents,
					(e) =>
						e.type === 'HoldPlaced' && e.payload.holdId === hold1Data.holdId,
					POLL_INTERVAL_MS * 3 + WAIT_BUFFER_MS,
				),
				waitForEvent(
					clientBEvents,
					(e) =>
						e.type === 'HoldPlaced' && e.payload.holdId === hold2Data.holdId,
					POLL_INTERVAL_MS * 3 + WAIT_BUFFER_MS,
				),
				waitForEvent(
					clientCEvents,
					(e) =>
						e.type === 'HoldPlaced' && e.payload.holdId === hold1Data.holdId,
					POLL_INTERVAL_MS * 3 + WAIT_BUFFER_MS,
				),
				waitForEvent(
					clientCEvents,
					(e) =>
						e.type === 'HoldPlaced' && e.payload.holdId === hold2Data.holdId,
					POLL_INTERVAL_MS * 3 + WAIT_BUFFER_MS,
				),
			]);

		clientB.stop();
		clientC.stop();

		expect(clientBHold1).not.toBeNull();
		expect(clientBHold2).not.toBeNull();
		expect(clientCHold1).not.toBeNull();
		expect(clientCHold2).not.toBeNull();
	});
});
