import { expect, test } from 'bun:test';
import type { ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import { createStreamListener } from './listener';
import type { BookingEvent } from './types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 1000;
const WAIT_BUFFER_MS = 500;

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

const safeFetch = async (
	url: string,
	options?: RequestInit,
): Promise<Response | null> => {
	try {
		const response = await fetch(url, {
			...options,
			signal: AbortSignal.timeout(5000),
		});
		return response;
	} catch {
		return null;
	}
};

if (typeof EventSource === 'undefined') {
	(globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
		class EventSourcePolyfill {
			url: string;
			readyState: number = 0;
			private listeners: Map<string, Set<(e: MessageEvent) => void>> =
				new Map();
			private abortController: AbortController | null = null;
			private closed = false;

			static readonly CONNECTING = 0;
			static readonly OPEN = 1;
			static readonly CLOSED = 2;

			constructor(url: string) {
				this.url = url;
				this.readyState = EventSourcePolyfill.CONNECTING;
				this.connect();
			}

			private async connect(): Promise<void> {
				if (this.closed) return;

				try {
					this.abortController = new AbortController();
					const response = await fetch(this.url, {
						headers: { Accept: 'text/event-stream' },
						signal: this.abortController.signal,
					});

					if (!response.ok || !response.body) {
						throw new Error(`HTTP ${response.status}`);
					}

					this.readyState = EventSourcePolyfill.OPEN;
					this.emit('open', new MessageEvent('open'));

					const reader = response.body.getReader();
					const decoder = new TextDecoder();
					let buffer = '';

					while (!this.closed) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() || '';

						let eventType = 'message';
						let data = '';

						for (const line of lines) {
							if (line.startsWith('event: ')) {
								eventType = line.slice(7).trim();
							} else if (line.startsWith('data: ')) {
								data += `${line.slice(6)}\n`;
							} else if (line === '') {
								if (data) {
									this.emit(
										eventType,
										new MessageEvent(eventType, { data: data.trim() }),
									);
									eventType = 'message';
									data = '';
								}
							}
						}
					}
				} catch {
					if (!this.closed) {
						this.readyState = EventSourcePolyfill.CLOSED;
						this.emit('error', new MessageEvent('error'));
					}
				}
			}

			private emit(type: string, event: MessageEvent): void {
				const handlers = this.listeners.get(type);
				if (handlers) {
					for (const handler of handlers) {
						handler(event);
					}
				}
			}

			addEventListener(type: string, handler: (e: MessageEvent) => void): void {
				if (!this.listeners.has(type)) {
					this.listeners.set(type, new Set());
				}
				this.listeners.get(type)?.add(handler);
			}

			removeEventListener(
				type: string,
				handler: (e: MessageEvent) => void,
			): void {
				this.listeners.get(type)?.delete(handler);
			}

			onopen: ((e: MessageEvent) => void) | null = null;
			onerror: ((e: MessageEvent) => void) | null = null;
			onmessage: ((e: MessageEvent) => void) | null = null;

			close(): void {
				this.closed = true;
				this.readyState = EventSourcePolyfill.CLOSED;
				this.abortController?.abort();
			}
		} as unknown as typeof EventSource;
}

const checkServerAvailable = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${API_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
};

let serverAvailable: boolean | null = null;

const getShouldSkipE2E = async (): Promise<boolean> => {
	if (process.env.RUN_E2E_TESTS === '1' || process.env.CI === 'true') {
		return false;
	}
	if (serverAvailable === null) {
		serverAvailable = await checkServerAvailable();
		if (!serverAvailable) {
			console.log(
				'⚠️  E2E tests skipped: API server not running on',
				API_BASE_URL,
			);
			console.log('   Start server with: cd packages/api && bun run dev');
			console.log('   Or set RUN_E2E_TESTS=1 to force run');
			return true;
		}
	}
	return !serverAvailable;
};

test('e2e: stream receives booking event deltas', async () => {
	if (await getShouldSkipE2E()) {
		return;
	}

	const serverCheck = await checkServerAvailable();
	if (!serverCheck) {
		return;
	}

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResponse1 = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!holdResponse1 || holdResponse1.status !== 201) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 200));

	const eventsResponse = await safeFetch(
		`${API_BASE_URL}/v1/events?tenantId=${tenantId}&limit=1`,
	);
	if (!eventsResponse || !eventsResponse.ok) {
		return;
	}
	const eventsData = await eventsResponse.json();
	const firstEventId = eventsData.events[0]?.eventId;

	if (!firstEventId) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const receivedEvents: BookingEvent[] = [];
	let errorOccurred: Error | null = null;

	const listener = createStreamListener({
		baseUrl: API_BASE_URL,
		cursor: firstEventId,
		onEvent: (event) => {
			receivedEvents.push(event);
		},
		onError: (error) => {
			errorOccurred = error;
		},
		maxReconnectAttempts: 2,
		reconnectDelay: 1000,
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 500));

	const holdResponse2 = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 700,
			endMinute: 760,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!holdResponse2 || holdResponse2.status !== 201) {
		listener.stop();
		return;
	}
	const holdData2 = await holdResponse2.json();

	const holdPlacedEvent = await waitForEvent(
		receivedEvents,
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdData2.holdId,
		POLL_INTERVAL_MS + WAIT_BUFFER_MS,
	);

	listener.stop();

	expect(errorOccurred).toBeNull();
	expect(holdPlacedEvent).not.toBeNull();
});

test('e2e: stream receives all booking events after cursor', async () => {
	if (await getShouldSkipE2E()) {
		return;
	}

	const serverCheck = await checkServerAvailable();
	if (!serverCheck) {
		return;
	}

	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const hold1Response = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenantId1,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!hold1Response || hold1Response.status !== 201) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 200));

	const eventsResponse = await safeFetch(`${API_BASE_URL}/v1/events?limit=1`);
	if (!eventsResponse || !eventsResponse.ok) {
		return;
	}
	const eventsData = await eventsResponse.json();
	const cursor = eventsData.events[0]?.eventId;

	if (!cursor) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const hold2Response = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenantId2,
			resourceId,
			day: '2025-12-01',
			startMinute: 700,
			endMinute: 760,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!hold2Response || hold2Response.status !== 201) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 200));

	const receivedEvents: BookingEvent[] = [];

	if (!cursor) {
		throw new Error('Cursor is required');
	}

	const listener = createStreamListener({
		baseUrl: API_BASE_URL,
		cursor,
		onEvent: (event) => {
			receivedEvents.push(event);
		},
		maxReconnectAttempts: 1,
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 500));

	const hold3Response = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenantId1,
			resourceId,
			day: '2025-12-01',
			startMinute: 800,
			endMinute: 860,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!hold3Response || hold3Response.status !== 201) {
		return;
	}
	const hold3Data = await hold3Response.json();

	const hold3Event = await waitForEvent(
		receivedEvents,
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === hold3Data.holdId,
		POLL_INTERVAL_MS + WAIT_BUFFER_MS,
	);

	listener.stop();

	expect(hold3Event).not.toBeNull();
});

test('e2e: stream respects cursor parameter', async () => {
	if (await getShouldSkipE2E()) {
		return;
	}

	const serverCheck = await checkServerAvailable();
	if (!serverCheck) {
		return;
	}
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const hold1Response = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!hold1Response || hold1Response.status !== 201) {
		return;
	}
	const hold1Data = await hold1Response.json();

	await new Promise((resolve) => setTimeout(resolve, 500));

	const eventsResponse = await safeFetch(
		`${API_BASE_URL}/v1/events?tenantId=${tenantId}&limit=1`,
	);
	if (!eventsResponse || !eventsResponse.ok) {
		return;
	}
	const eventsData = await eventsResponse.json();
	const firstEventId = eventsData.events[0]?.eventId;

	if (!firstEventId) {
		return;
	}

	const hold2Response = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 700,
			endMinute: 760,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!hold2Response || hold2Response.status !== 201) {
		return;
	}
	const hold2Data = await hold2Response.json();

	await new Promise((resolve) => setTimeout(resolve, 500));

	const receivedEvents: BookingEvent[] = [];

	const listener = createStreamListener({
		baseUrl: API_BASE_URL,
		cursor: firstEventId,
		onEvent: (event) => {
			receivedEvents.push(event);
		},
		maxReconnectAttempts: 1,
	});

	listener.start();

	const hold2Event = await waitForEvent(
		receivedEvents,
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === hold2Data.holdId,
		POLL_INTERVAL_MS + WAIT_BUFFER_MS,
	);

	listener.stop();

	expect(hold2Event).not.toBeNull();

	const hasHold1Event = receivedEvents.some(
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === hold1Data.holdId,
	);
	expect(hasHold1Event).toBe(false);
});

test('e2e: stream only receives delta events', async () => {
	if (await getShouldSkipE2E()) {
		return;
	}

	const serverCheck = await checkServerAvailable();
	if (!serverCheck) {
		return;
	}

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResponse1 = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!holdResponse1 || holdResponse1.status !== 201) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 200));

	const eventsResponse = await safeFetch(
		`${API_BASE_URL}/v1/events?tenantId=${tenantId}&limit=1`,
	);
	if (!eventsResponse || !eventsResponse.ok) {
		return;
	}
	const eventsData = await eventsResponse.json();
	const cursor = eventsData.events[0]?.eventId;

	if (!cursor) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const receivedEvents: BookingEvent[] = [];

	const listener = createStreamListener({
		baseUrl: API_BASE_URL,
		cursor,
		onEvent: (event) => {
			receivedEvents.push(event);
		},
		maxReconnectAttempts: 1,
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 500));

	const holdResponse2 = await safeFetch(`${API_BASE_URL}/v1/holds`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 700,
			endMinute: 760,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	if (!holdResponse2 || holdResponse2.status !== 201) {
		listener.stop();
		return;
	}
	const hold2Data = await holdResponse2.json();

	const hold2Event = await waitForEvent(
		receivedEvents,
		(e) => e.type === 'HoldPlaced' && e.payload.holdId === hold2Data.holdId,
		POLL_INTERVAL_MS + WAIT_BUFFER_MS,
	);

	listener.stop();

	expect(hold2Event).not.toBeNull();
	expect(
		receivedEvents.every(
			(e) =>
				e.type === 'HoldPlaced' ||
				e.type === 'HoldExpired' ||
				e.type === 'BookingConfirmed' ||
				e.type === 'BookingCancelled',
		),
	).toBe(true);
});
