import type { LedgerEvent } from '@tap/core';
import type {
	BookingEvent,
	BookingEventType,
	StreamListener,
	StreamListenerOptions,
} from './types';

const BOOKING_EVENT_TYPES: BookingEventType[] = [
	'HoldPlaced',
	'HoldExpired',
	'BookingConfirmed',
	'BookingCancelled',
];

const isBookingEvent = (event: LedgerEvent): event is BookingEvent => {
	return BOOKING_EVENT_TYPES.includes(event.type as BookingEventType);
};

export const createStreamListener = (
	options: StreamListenerOptions,
): StreamListener => {
	let eventSource: EventSource | null = null;
	let currentCursor: string = options.cursor;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let isStopped = false;

	const buildUrl = (): string => {
		const url = new URL(`${options.baseUrl}/v1/events/stream`);
		if (!currentCursor) {
			throw new Error('cursor is required to start streaming');
		}
		url.searchParams.set('cursor', currentCursor);
		return url.toString();
	};

	const connect = (): void => {
		if (isStopped) return;

		try {
			if (typeof EventSource === 'undefined') {
				options.onError?.(
					new Error(
						'EventSource is not available in this environment. Use a browser or Node.js with a polyfill.',
					),
				);
				return;
			}

			const url = buildUrl();
			eventSource = new EventSource(url);

			eventSource.addEventListener('delta', (e: MessageEvent) => {
				try {
					const event = JSON.parse(e.data) as LedgerEvent;
					if (isBookingEvent(event)) {
						currentCursor = event.eventId;
						options.onEvent?.(event);
					}
				} catch (error) {
					options.onError?.(
						new Error(
							`Failed to parse delta event: ${error instanceof Error ? error.message : 'Unknown error'}`,
						),
					);
				}
			});

			eventSource.addEventListener('error', (e: MessageEvent) => {
				try {
					const errorData = JSON.parse(e.data) as { message: string };
					options.onError?.(new Error(errorData.message));
				} catch {
					options.onError?.(new Error('Stream error occurred'));
				}
			});

			eventSource.onerror = () => {
				if (eventSource?.readyState === EventSource.CLOSED) {
					eventSource.close();
					eventSource = null;

					if (!isStopped) {
						reconnectAttempts++;
						const maxAttempts = options.maxReconnectAttempts ?? Infinity;

						if (reconnectAttempts <= maxAttempts) {
							const delay = options.reconnectDelay ?? 1000 * reconnectAttempts;
							options.onReconnect?.(reconnectAttempts);
							reconnectTimer = setTimeout(() => {
								connect();
							}, delay);
						} else {
							options.onError?.(
								new Error(`Max reconnect attempts (${maxAttempts}) reached`),
							);
							options.onClose?.();
						}
					}
				}
			};

			eventSource.onopen = () => {
				reconnectAttempts = 0;
			};
		} catch (error) {
			options.onError?.(
				new Error(
					`Failed to create EventSource: ${error instanceof Error ? error.message : 'Unknown error'}`,
				),
			);
		}
	};

	const start = (): void => {
		if (isStopped) {
			isStopped = false;
			reconnectAttempts = 0;
		}
		connect();
	};

	const stop = (): void => {
		isStopped = true;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		options.onClose?.();
	};

	const getCursor = (): string | undefined => {
		return currentCursor;
	};

	const isConnected = (): boolean => {
		return eventSource !== null && eventSource.readyState === EventSource.OPEN;
	};

	return {
		start,
		stop,
		getCursor,
		isConnected,
	};
};
