import type { ServerWebSocket } from 'bun';
import { ulid } from 'ulid';
import type {
	HoldId,
	LedgerEvent,
	ResourceId,
	SessionId,
	TenantId,
} from '@tap/core';
import { getAllocator, getEventStore } from '../../services/context';

export type WebSocketData = {
	sessionId: SessionId;
	tenantId: TenantId;
	resourceId: ResourceId;
	cursor?: string;
	subscription?: ReturnType<typeof setInterval>;
};

type IncomingMessage =
	| {
			type: 'hold.request';
			requestId: string;
			day: string;
			startMinute: number;
			endMinute: number;
	  }
	| {
			type: 'hold.release';
			requestId: string;
			holdId: string;
	  };

const BOOKING_EVENT_TYPES: LedgerEvent['type'][] = [
	'HoldPlaced',
	'HoldExpired',
	'HoldReleased',
	'BookingConfirmed',
	'BookingCancelled',
];

const isBookingEvent = (event: LedgerEvent): boolean => {
	return BOOKING_EVENT_TYPES.includes(event.type);
};

const startStreaming = async (ws: ServerWebSocket<WebSocketData>) => {
	const eventStore = getEventStore();
	const { tenantId, resourceId } = ws.data;
	let lastCursor = ws.data.cursor || '0';

	if (lastCursor === 'LATEST') {
		try {
			const events = await eventStore.getByResource(tenantId, resourceId);
			const lastEvent = events[events.length - 1];
			lastCursor = lastEvent?.eventId || '0';
		} catch (error) {
			console.error('Failed to resolve LATEST cursor:', error);
			ws.send(
				JSON.stringify({
					type: 'error',
					message: 'Failed to resolve cursor',
				}),
			);
			return;
		}
	}

	// Send initial hello with cursor
	ws.send(
		JSON.stringify({
			type: 'session.hello',
			sessionId: ws.data.sessionId,
			cursor: lastCursor,
		}),
	);

	const poll = async () => {
		if (ws.readyState !== 1) return; // OPEN = 1

		try {
			const newEvents = await eventStore.getAfterCursor(lastCursor, tenantId);
			const filteredEvents = newEvents.filter((e) => {
				if (!isBookingEvent(e)) return false;
				// tenantId check is now redundant for DB fetch but good for safety if getAfterCursor implementation changes
				if (e.tenantId !== tenantId) return false;
				if (e.resourceId !== resourceId) return false;
				return true;
			});

			for (const event of filteredEvents) {
				ws.send(
					JSON.stringify({
						type: 'delta',
						event,
					}),
				);
			}

			if (newEvents.length > 0) {
				const lastEvent = newEvents[newEvents.length - 1];
				if (lastEvent) {
					lastCursor = lastEvent.eventId;
				}
			}
		} catch (error) {
			console.error('WS Stream polling error:', error);
		}
	};

	// Initial poll
	await poll();

	// Start polling loop
	const interval = setInterval(poll, 250);
	ws.data.subscription = interval;
};

export const websocketHandler = {
	async open(ws: ServerWebSocket<WebSocketData>) {
		// Start streaming immediately
		await startStreaming(ws);
	},

	async message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
		const allocator = getAllocator();
		const eventStore = getEventStore();
		const { sessionId, tenantId, resourceId } = ws.data;

		try {
			const msg = JSON.parse(message.toString()) as IncomingMessage;

			if (msg.type === 'hold.request') {
				const { day, startMinute, endMinute, requestId } = msg;

				const result = await allocator.placeHold({
					tenantId,
					resourceId,
					sessionId,
					day,
					startMinute,
					endMinute,
					expiresAt: Date.now() + 60_000, // 60s safety TTL
				});

				if (result.success) {
					await eventStore.append(result.event);
					ws.send(
						JSON.stringify({
							type: 'hold.confirmed',
							requestId,
							holdId: result.holdId,
							expiresAt: Date.now() + 60_000,
						}),
					);
				} else {
					ws.send(
						JSON.stringify({
							type: 'error',
							requestId,
							code: 'SLOT_UNAVAILABLE',
							message: 'Slot is not available',
						}),
					);
				}
			} else if (msg.type === 'hold.release') {
				const { holdId, requestId } = msg;

				const result = await allocator.releaseHold({
					holdId: holdId as HoldId,
					sessionId,
				});

				if (result.success) {
					await eventStore.append(result.event);
					ws.send(
						JSON.stringify({
							type: 'hold.released',
							requestId,
							holdId,
						}),
					);
				} else {
					ws.send(
						JSON.stringify({
							type: 'error',
							requestId,
							code: 'HOLD_NOT_FOUND',
							message: 'Hold not found or access denied',
						}),
					);
				}
			}
		} catch (error) {
			console.error('WS Message error:', error);
			ws.send(
				JSON.stringify({
					type: 'error',
					message: 'Invalid message format or internal error',
				}),
			);
		}
	},

	async close(ws: ServerWebSocket<WebSocketData>) {
		const allocator = getAllocator();
		const eventStore = getEventStore();
		const { sessionId } = ws.data;

		if (ws.data.subscription) {
			clearInterval(ws.data.subscription);
		}

		try {
			const expiredEvents = await allocator.releaseHoldsForSession(sessionId);
			for (const event of expiredEvents) {
				await eventStore.append(event);
			}
		} catch (error) {
			console.error('Error releasing holds for session:', error);
		}
	},
};
