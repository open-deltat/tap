import { createAvailabilityTopic, parseSlotId } from '@tap/core';
import {
	type AvailabilityDeltaPayload,
	AvailabilityWsClientMessageSchema,
	type AvailabilityWsServerMessage,
	type DayKey,
	type HoldId,
	type SessionId as HoldSessionId,
	HoldWsClientMessageSchema,
	type HoldWsServerMessage,
	type ResourceId,
	type SlotId,
	type TenantId,
} from '@tap/protocol';
import type { Server, ServerWebSocket } from 'bun';
import { core } from '../core';

let serverInstance: Server | undefined;

export const setServer = (server: Server) => {
	serverInstance = server;
};

export type WSData = {
	type: 'availability' | 'hold';
	sessionId?: HoldSessionId;
	holdId?: HoldId;
	tenantId?: TenantId;
	resourceId?: ResourceId;
	slotId?: SlotId;
	start?: string;
	end?: string;
};

export const websocketHandler = {
	async open(ws: ServerWebSocket<WSData>) {
		if (ws.data.type === 'availability') {
			// Wait for subscribe
			const hello: AvailabilityWsServerMessage = {
				type: 'stream.hello',
				resourceId: 'pending' as ResourceId, // Cast pending as ResourceId or change schema to allow pending. Schema allows literal 'pending'.
				tenantId: 'pending' as TenantId,
				cursor: crypto.randomUUID(),
			};
			ws.send(JSON.stringify(hello));
		} else if (ws.data.type === 'hold') {
			const { tenantId, resourceId, slotId } = ws.data;
			if (!tenantId || !resourceId || !slotId) {
				ws.close(1008, 'Missing params');
				return;
			}

			// Try to place hold immediately on connection
			const sessionId = `session_${crypto.randomUUID()}` as HoldSessionId;
			ws.data.sessionId = sessionId;

			try {
				const { start, end } = parseSlotId(slotId);
				ws.data.start = start.toISOString();
				ws.data.end = end.toISOString();

				const result = await core.placeHold({
					tenantId,
					resourceId,
					sessionId,
					day: start.toISOString().split('T')[0] as DayKey,
					startMinute: start.getUTCHours() * 60 + start.getUTCMinutes(),
					endMinute: end.getUTCHours() * 60 + end.getUTCMinutes(),
					expiresAt: Date.now() + 5 * 60 * 1000, // 5 min hold
				});

				if (result.success) {
					// If result.success is true, we assume holdId is present in the result.
					// We cast result to any to access holdId as the strict type might be a union where success=true implies holdId.
					// In a stricter world, we would narrow the type properly.
					const successResult = result as {
						holdId: HoldId;
						event: { eventId: string };
					};
					const holdId = successResult.holdId;
					ws.data.holdId = holdId;

					const hello: HoldWsServerMessage = {
						type: 'hold.session.hello',
						sessionId,
						tenantId,
						resourceId,
						slotId,
					};
					ws.send(JSON.stringify(hello));

					const confirmed: HoldWsServerMessage = {
						type: 'hold.confirmed',
						holdId,
						tenantId,
						resourceId,
						slotId,
						start: start.toISOString(),
						end: end.toISOString(),
					};
					ws.send(JSON.stringify(confirmed));

					// Broadcast HoldPlaced
					const topic = createAvailabilityTopic(tenantId, resourceId);
					const message: AvailabilityWsServerMessage = {
						type: 'stream.delta',
						eventId: successResult.event.eventId,
						payload: {
							kind: 'HoldPlaced',
							slotId,
							resourceId,
							tenantId,
							start: start.toISOString(),
							end: end.toISOString(),
							holdId,
						} as AvailabilityDeltaPayload,
					};
					if (serverInstance) {
						serverInstance.publish(topic, JSON.stringify(message));
					} else {
						ws.publish(topic, JSON.stringify(message));
					}
				} else {
					const error: HoldWsServerMessage = {
						type: 'hold.error',
						errorValue: 'TAP_SLOT_UNAVAILABLE',
						message: 'Slot unavailable',
					};
					ws.send(JSON.stringify(error));
					ws.close();
				}
			} catch (_e) {
				ws.close(1011, 'Internal Error');
			}
		}
	},

	message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
		const str = typeof message === 'string' ? message : message.toString();

		if (ws.data.type === 'availability') {
			const result = AvailabilityWsClientMessageSchema.safeParse(
				JSON.parse(str),
			);
			if (result.success) {
				const msg = result.data;
				if (msg.type === 'stream.subscribe') {
					const topic = createAvailabilityTopic(msg.tenantId, msg.resourceId);
					ws.subscribe(topic);
				}
			}
		} else if (ws.data.type === 'hold') {
			const result = HoldWsClientMessageSchema.safeParse(JSON.parse(str));
			if (result.success) {
				const msg = result.data;
				if (msg.type === 'hold.release' && ws.data.holdId === msg.holdId) {
					// Release hold
					if (!ws.data.sessionId) return;
					core
						.releaseHold({
							holdId: msg.holdId,
							sessionId: ws.data.sessionId,
						})
						.then((res) => {
							if (res.success) {
								// Broadcast HoldReleased
								if (
									!ws.data.tenantId ||
									!ws.data.resourceId ||
									!ws.data.slotId ||
									!ws.data.start ||
									!ws.data.end
								) {
									return;
								}
								const topic = createAvailabilityTopic(
									ws.data.tenantId,
									ws.data.resourceId,
								);

								const message: AvailabilityWsServerMessage = {
									type: 'stream.delta',
									eventId: (res as { event: { eventId: string } }).event
										.eventId,
									payload: {
										kind: 'HoldReleased',
										slotId: ws.data.slotId,
										resourceId: ws.data.resourceId,
										tenantId: ws.data.tenantId,
										start: ws.data.start,
										end: ws.data.end,
									},
								};
								if (serverInstance) {
									serverInstance.publish(topic, JSON.stringify(message));
								} else {
									ws.publish(topic, JSON.stringify(message));
								}
							}
							ws.close();
						});
				}
			}
		}
	},

	close(ws: ServerWebSocket<WSData>) {
		if (ws.data.type === 'availability') {
			// Bun automatically unsubscribes on close
		} else if (ws.data.type === 'hold') {
			if (ws.data.sessionId && ws.data.holdId) {
				// Release hold on disconnect
				core
					.releaseHold({
						holdId: ws.data.holdId,
						sessionId: ws.data.sessionId,
					})
					.then((res) => {
						if (res.success) {
							if (
								!ws.data.tenantId ||
								!ws.data.resourceId ||
								!ws.data.slotId ||
								!ws.data.start ||
								!ws.data.end
							) {
								return;
							}
							const topic = createAvailabilityTopic(
								ws.data.tenantId,
								ws.data.resourceId,
							);
							const message: AvailabilityWsServerMessage = {
								type: 'stream.delta',
								eventId: (res as { event: { eventId: string } }).event.eventId,
								payload: {
									kind: 'HoldReleased',
									slotId: ws.data.slotId,
									resourceId: ws.data.resourceId,
									tenantId: ws.data.tenantId,
									start: ws.data.start,
									end: ws.data.end,
								},
							};
							if (serverInstance) {
								serverInstance.publish(topic, JSON.stringify(message));
							} else {
								ws.publish(topic, JSON.stringify(message));
							}
						}
					});
			}
		}
	},
};
