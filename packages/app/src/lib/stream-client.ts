'use client';

import { createStreamListener } from '../../../stream-client/src/listener';
import type { BookingEvent } from '../../../stream-client/src/types';

export type StreamClientOptions = {
	baseUrl: string;
	cursor: string;
	onEvent?: (event: BookingEvent) => void;
	onError?: (error: Error) => void;
	onConnect?: () => void;
	onClose?: () => void;
	maxReconnectAttempts?: number;
	reconnectDelay?: number;
};

export type StreamClient = {
	start: () => void;
	stop: () => void;
	getCursor: () => string | undefined;
	isConnected: () => boolean;
};

export const createStreamClient = (
	options: StreamClientOptions,
): StreamClient => {
	const listener = createStreamListener({
		baseUrl: options.baseUrl,
		cursor: options.cursor,
		onEvent: options.onEvent,
		onError: options.onError,
		onConnect: options.onConnect,
		onClose: options.onClose,
		maxReconnectAttempts: options.maxReconnectAttempts,
		reconnectDelay: options.reconnectDelay,
	});

	return {
		start: () => listener.start(),
		stop: () => listener.stop(),
		getCursor: () => listener.getCursor(),
		isConnected: () => listener.isConnected(),
	};
};



