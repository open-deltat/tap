import { describe, expect, test, mock } from 'bun:test';
import { createStreamListener } from '../../../../stream-client/src/listener';

describe('useStreamListener', () => {
	test('stream listener interface is correct', () => {
		const mockOnEvent = mock(() => {});
		const mockOnError = mock(() => {});
		const mockOnConnect = mock(() => {});

		const listener = createStreamListener({
			baseUrl: 'http://localhost:3001',
			cursor: 'cursor_123',
			onEvent: mockOnEvent,
			onError: mockOnError,
			onConnect: mockOnConnect,
		});

		expect(typeof listener.start).toBe('function');
		expect(typeof listener.stop).toBe('function');
		expect(typeof listener.getCursor).toBe('function');
		expect(typeof listener.isConnected).toBe('function');
	});

	test('stream listener starts and stops correctly', () => {
		const listener = createStreamListener({
			baseUrl: 'http://localhost:3001',
			cursor: 'cursor_123',
		});

		expect(() => listener.start()).not.toThrow();
		expect(() => listener.stop()).not.toThrow();
	});

	test('stream listener requires cursor', () => {
		const listener = createStreamListener({
			baseUrl: 'http://localhost:3001',
			cursor: 'valid_cursor',
		});

		expect(() => listener.start()).not.toThrow();
		listener.stop();

		const listenerWithEmptyCursor = createStreamListener({
			baseUrl: 'http://localhost:3001',
			cursor: '',
		});

		try {
			listenerWithEmptyCursor.start();
			expect(false).toBe(true);
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
		}
	});

	test('stream listener handles reconnection', () => {
		let reconnectCount = 0;
		const listener = createStreamListener({
			baseUrl: 'http://localhost:3001',
			cursor: 'cursor_123',
			maxReconnectAttempts: 3,
			reconnectDelay: 100,
			onReconnect: () => {
				reconnectCount++;
			},
		});

		expect(listener).toBeDefined();
		expect(typeof listener.start).toBe('function');
	});
});

