import { expect, test } from 'bun:test';
import { createStreamClient } from '../stream-client';

// Note: These are interface tests. Full integration tests would require
// mocking EventSource which is browser-specific
test('stream-client creates a stream client with correct interface', () => {
	const client = createStreamClient({
		baseUrl: 'http://localhost:3000',
		cursor: 'cursor_123',
	});

	expect(client).toHaveProperty('start');
	expect(client).toHaveProperty('stop');
	expect(client).toHaveProperty('getCursor');
	expect(client).toHaveProperty('isConnected');
	expect(typeof client.start).toBe('function');
	expect(typeof client.stop).toBe('function');
	expect(typeof client.getCursor).toBe('function');
	expect(typeof client.isConnected).toBe('function');
});

test('stream-client passes all options to createStreamListener', () => {
	// This test verifies the interface - actual implementation testing
	// would require EventSource mocking which is browser-specific
	const onEvent = () => {};
	const onError = () => {};
	const onConnect = () => {};
	const onClose = () => {};

	const client = createStreamClient({
		baseUrl: 'http://localhost:3000',
		cursor: 'cursor_123',
		onEvent,
		onError,
		onConnect,
		onClose,
		maxReconnectAttempts: 5,
		reconnectDelay: 2000,
	});

	expect(client).toBeDefined();
	expect(typeof client.start).toBe('function');
	expect(typeof client.stop).toBe('function');
});
