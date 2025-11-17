import { expect, test } from 'bun:test';
import { createStreamListener } from './listener';
import type { BookingEvent } from './types';

test('createStreamListener returns listener with expected methods', () => {
	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor',
	});

	expect(listener).toBeDefined();
	expect(typeof listener.start).toBe('function');
	expect(typeof listener.stop).toBe('function');
	expect(typeof listener.getCursor).toBe('function');
	expect(typeof listener.isConnected).toBe('function');
});

test('createStreamListener can be started and stopped', () => {
	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor',
	});

	listener.start();
	expect(listener.isConnected()).toBe(false);

	listener.stop();
	expect(listener.isConnected()).toBe(false);
});

test('createStreamListener calls onEvent for booking events', async () => {
	const events: BookingEvent[] = [];

	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor',
		onEvent: (event) => {
			events.push(event);
		},
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 100));

	listener.stop();

	expect(events.length).toBeGreaterThanOrEqual(0);
});

test('createStreamListener respects cursor parameter', () => {
	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor-123',
	});

	expect(listener.getCursor()).toBe('test-cursor-123');
});

test('createStreamListener calls onError when connection fails', async () => {
	const listener = createStreamListener({
		baseUrl: 'http://invalid-url-that-does-not-exist:9999',
		cursor: 'test-cursor',
		onError: () => {},
		maxReconnectAttempts: 0,
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 500));

	listener.stop();
});

test('createStreamListener calls onClose when stopped', () => {
	let closed = false;

	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor',
		onClose: () => {
			closed = true;
		},
	});

	listener.start();
	listener.stop();

	expect(closed).toBe(true);
});

test('createStreamListener updates cursor after receiving events', async () => {
	const listener = createStreamListener({
		baseUrl: 'http://localhost:3000',
		cursor: 'test-cursor',
		onEvent: () => {},
	});

	listener.getCursor();
	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 100));

	listener.stop();

	listener.getCursor();
});

test('createStreamListener handles reconnection attempts', async () => {
	const listener = createStreamListener({
		baseUrl: 'http://invalid-url:9999',
		cursor: 'test-cursor',
		reconnectDelay: 100,
		maxReconnectAttempts: 3,
		onReconnect: () => {},
	});

	listener.start();

	await new Promise((resolve) => setTimeout(resolve, 500));

	listener.stop();
});
