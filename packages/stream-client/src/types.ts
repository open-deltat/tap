import type { LedgerEvent } from '@tap/core';

export type BookingEventType =
	| 'HoldPlaced'
	| 'HoldExpired'
	| 'BookingConfirmed'
	| 'BookingCancelled';

export type BookingEvent = LedgerEvent & {
	type: BookingEventType;
};

export type StreamEvent = {
	type: 'delta' | 'heartbeat' | 'error';
	data: BookingEvent | { timestamp: number } | { message: string };
};

export type StreamListenerOptions = {
	baseUrl: string;
	cursor: string;
	reconnectDelay?: number;
	maxReconnectAttempts?: number;
	onEvent?: (event: BookingEvent) => void;
	onError?: (error: Error) => void;
	onReconnect?: (attempt: number) => void;
	onConnect?: () => void;
	onClose?: () => void;
};

export type StreamListener = {
	start: () => void;
	stop: () => void;
	getCursor: () => string | undefined;
	isConnected: () => boolean;
};
