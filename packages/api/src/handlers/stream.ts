import type { LedgerEvent } from '@tap/core';
import { getEventStore } from '../services/context';

const BOOKING_EVENT_TYPES: LedgerEvent['type'][] = [
	'HoldPlaced',
	'HoldExpired',
	'BookingConfirmed',
	'BookingCancelled',
];

const isBookingEvent = (event: LedgerEvent): boolean => {
	return BOOKING_EVENT_TYPES.includes(event.type);
};

const formatSSEMessage = (event: string, data: unknown): string => {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

const POLL_INTERVAL_MS = 1000;

export const handleEventStream = async (req: Request): Promise<Response> => {
	const url = new URL(req.url);
	const cursor = url.searchParams.get('cursor');

	if (!cursor) {
		return new Response(
			JSON.stringify({ error: 'cursor parameter is required' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const eventStore = getEventStore();

	let lastCursor = cursor;

	const stream = new ReadableStream({
		async start(controller) {
			let isClosed = false;

			const sendDelta = (event: LedgerEvent) => {
				if (isClosed) return;
				try {
					const message = formatSSEMessage('delta', event);
					controller.enqueue(new TextEncoder().encode(message));
					lastCursor = event.eventId;
				} catch {
					isClosed = true;
				}
			};

			const pollForNewEvents = async () => {
				if (isClosed) return;

				try {
					const newEvents = await eventStore.getAfterCursor(lastCursor);
					const bookingEvents = newEvents.filter(isBookingEvent);

					for (const event of bookingEvents) {
						sendDelta(event);
					}
				} catch (error) {
					if (!isClosed) {
						const errorMessage = formatSSEMessage('error', {
							message: error instanceof Error ? error.message : 'Unknown error',
						});
						controller.enqueue(new TextEncoder().encode(errorMessage));
					}
				}
			};

			await pollForNewEvents();

			const pollInterval = setInterval(async () => {
				if (
					!isClosed &&
					(controller.desiredSize === null || controller.desiredSize > 0)
				) {
					await pollForNewEvents();
				}
			}, POLL_INTERVAL_MS);

			req.signal.addEventListener('abort', () => {
				isClosed = true;
				clearInterval(pollInterval);
				try {
					controller.close();
				} catch {}
			});
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
