import { expect, test } from 'bun:test';
import type { ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../services/context';
import { handleEventStream } from './stream';

test('handleEventStream returns SSE response with correct headers', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult.success) {
		await eventStore.append(holdResult.event);
	}

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult.success ? holdResult.event.eventId : ''}`,
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

test('handleEventStream sends booking event deltas after cursor', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult1.success) {
		throw new Error('Failed to place first hold');
	}

	await eventStore.append(holdResult1.event);
	await new Promise((resolve) => setTimeout(resolve, 150));

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 700,
		endMinute: 760,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult2.success) {
		throw new Error('Failed to place second hold');
	}

	await eventStore.append(holdResult2.event);
	await new Promise((resolve) => setTimeout(resolve, 150));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult1.event.eventId}`,
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
		const timeoutMs = 2000;

		while (Date.now() - startTime < timeoutMs) {
			try {
				const { value, done } = await Promise.race([
					reader.read(),
					new Promise<{ value: undefined; done: true }>((resolve) =>
						setTimeout(() => resolve({ value: undefined, done: true }), 200),
					),
				]);
				if (done) break;
				if (value) {
					const chunk = decoder.decode(value, { stream: true });
					receivedData += chunk;
					if (
						receivedData.includes('event: delta') &&
						receivedData.includes(holdResult2.event.eventId)
					) {
						break;
					}
				}
			} catch {
				break;
			}
		}

		try {
			reader.cancel();
		} catch {}

		expect(receivedData).toContain('event: delta');
		expect(receivedData).toContain(holdResult2.event.eventId);
	}
}, 3000);

test('handleEventStream requires cursor parameter', async () => {
	const req = new Request('http://localhost/v1/events/stream', {
		method: 'GET',
	});

	const response = await handleEventStream(req);
	expect(response.status).toBe(400);
	const data = await response.json();
	expect(data.error).toContain('cursor');
});

test('handleEventStream sends all booking events after cursor', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult1 = await allocator.placeHold({
		tenantId: tenantId1,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult1.success) {
		await eventStore.append(holdResult1.event);
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const holdResult2 = await allocator.placeHold({
		tenantId: tenantId2,
		resourceId,
		day: '2025-12-01',
		startMinute: 700,
		endMinute: 760,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult2.success) {
		await eventStore.append(holdResult2.event);
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const holdResult3 = await allocator.placeHold({
		tenantId: tenantId1,
		resourceId,
		day: '2025-12-01',
		startMinute: 800,
		endMinute: 860,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult3.success) {
		await eventStore.append(holdResult3.event);
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult1.success ? holdResult1.event.eventId : ''}`,
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
				if (receivedData.includes('event: delta')) {
					break;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		reader.cancel();

		expect(receivedData).toContain('event: delta');
		const hasTenant1 = receivedData.includes(tenantId1);
		const hasTenant2 = receivedData.includes(tenantId2);
		expect(hasTenant1 || hasTenant2).toBe(true);
	}
});

test('handleEventStream only sends deltas, no heartbeats', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult1.success) {
		await eventStore.append(holdResult1.event);
	}

	await new Promise((resolve) => setTimeout(resolve, 100));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${holdResult1.success ? holdResult1.event.eventId : ''}`,
		{
			method: 'GET',
		},
	);

	const response = await handleEventStream(req);
	expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	expect(response.headers.get('Connection')).toBe('keep-alive');

	const reader = response.body?.getReader();
	expect(reader).toBeDefined();

	if (reader) {
		const decoder = new TextDecoder();
		let receivedData = '';

		const startTime = Date.now();
		const timeoutMs = 1000;

		while (Date.now() - startTime < timeoutMs) {
			try {
				const { value, done } = await Promise.race([
					reader.read(),
					new Promise<{ value: undefined; done: true }>((resolve) =>
						setTimeout(() => resolve({ value: undefined, done: true }), 200),
					),
				]);
				if (done) break;
				if (value) {
					const chunk = decoder.decode(value, { stream: true });
					receivedData += chunk;
				}
			} catch {
				break;
			}
		}

		try {
			reader.cancel();
		} catch {}

		expect(receivedData).not.toContain('event: heartbeat');
	}
});

test('handleEventStream respects cursor parameter', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	let firstEventId: string | undefined;
	if (holdResult1.success) {
		await eventStore.append(holdResult1.event);
		firstEventId = holdResult1.event.eventId;
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 700,
		endMinute: 760,
		expiresAt: Date.now() + 60_000,
	});

	if (holdResult2.success) {
		await eventStore.append(holdResult2.event);
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const req = new Request(
		`http://localhost/v1/events/stream?cursor=${firstEventId}`,
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

		try {
			const { value } = await reader.read();
			if (value) {
				receivedData += decoder.decode(value, { stream: true });
			}
		} catch {}

		try {
			reader.cancel();
		} catch {}

		if (holdResult2.success) {
			expect(receivedData).toContain(holdResult2.event.eventId);
		}
		expect(receivedData.length).toBeGreaterThan(0);
	}
});
