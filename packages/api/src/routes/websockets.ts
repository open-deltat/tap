import {
	type AvailabilityDeltaPayload,
	AvailabilityWsClientMessageSchema,
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
	type DayKey,
	type HoldId,
	type SessionId as HoldSessionId,
	HoldWsClientMessageSchema,
	type HoldWsServerMessage,
	parseSlotId,
	type ResourceId,
	type SlotId,
	type TenantId,
} from '@tap/protocol';
import type { ServerWebSocket } from 'bun';
import { core } from '../core';
import { serverContext } from '../server-context';

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
		console.log(`[WS] Open connection type=${ws.data.type}`);
		if (ws.data.type === 'availability') {
			// Wait for subscribe
			const hello: AvailabilityWsServerMessage = {
				type: 'stream.hello',
				resourceId: null,
				tenantId: null,
				cursor: crypto.randomUUID(),
			};
			ws.send(JSON.stringify(hello));
		} else if (ws.data.type === 'hold') {
			const { tenantId, resourceId, slotId } = ws.data;
			console.log(
				`[WS] Hold connection req: ${tenantId} ${resourceId} ${slotId}`,
			);
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

				const startUnix = start.getTime();
				const endUnix = end.getTime();

				const result = await core.placeHold({
					tenantId,
					resourceId,
					sessionId,
					timezone: 'UTC', // TODO: Fetch resource timezone
					startUnix,
					endUnix,
					expiresAt: Date.now() + 5 * 60 * 1000, // 5 min hold
				});

				if (result.success) {
					console.log('[WS] Hold placed successfully');
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
						startUnix,
						endUnix,
					};
					ws.send(JSON.stringify(confirmed));

					// Broadcast HoldPlaced via WS publish (broadcasts to all SUBSCRIBERS of topic, excluding self)
					const topic = createAvailabilityTopic(tenantId, resourceId);
					const message: AvailabilityWsServerMessage = {
						type: 'stream.delta',
						eventId: successResult.event.eventId,
						payload: {
							kind: 'HoldPlaced',
							slotId,
							resourceId,
							tenantId,
							startUnix,
							endUnix,
							holdId,
						} as AvailabilityDeltaPayload,
					};

					// Use server.publish to ensure broadcast to all subscribers
					const bytes = serverContext.server?.publish(
						topic,
						JSON.stringify(message),
					);
					console.log(
						`[WS] Published HoldPlaced to topic ${topic}. Bytes sent: ${bytes}`,
					);
				} else {
					console.log('[WS] Failed to place hold');
					const error: HoldWsServerMessage = {
						type: 'hold.error',
						errorValue: 'TAP_SLOT_UNAVAILABLE',
						message: 'Slot unavailable',
					};
					ws.send(JSON.stringify(error));
					ws.close();
				}
			} catch (e) {
				console.error('[WS] Error placing hold:', e);
				ws.close(1011, 'Internal Error');
			}
		}
	},

	message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
		const str = typeof message === 'string' ? message : message.toString();
		// console.log(`[WS] Message received: ${str.slice(0, 50)}...`);
		let json: unknown;
		try {
			json = JSON.parse(str);
		} catch (_e) {
			return;
		}

		if (ws.data.type === 'availability') {
			const result = AvailabilityWsClientMessageSchema.safeParse(json);
			if (result.success) {
				const msg = result.data;
				if (msg.type === 'stream.subscribe') {
					const topic = createAvailabilityTopic(msg.tenantId, msg.resourceId);
					ws.subscribe(topic);
					console.log(`[WS] Client subscribed to ${topic}`);
				}
			}
		} else if (ws.data.type === 'hold') {
			const result = HoldWsClientMessageSchema.safeParse(json);
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
										startUnix: new Date(ws.data.start).getTime(),
										endUnix: new Date(ws.data.end).getTime(),
										holdId: msg.holdId,
									} as AvailabilityDeltaPayload,
								};
								// Use server.publish to ensure broadcast to all subscribers
								const bytes = serverContext.server?.publish(
									topic,
									JSON.stringify(message),
								);
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
								!ws.data.end ||
								!ws.data.holdId
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
									startUnix: new Date(ws.data.start).getTime(),
									endUnix: new Date(ws.data.end).getTime(),
									holdId: ws.data.holdId,
								} as AvailabilityDeltaPayload,
							};
							// ws.publish(topic, JSON.stringify(message));
							const bytes = serverContext.server?.publish(
								topic,
								JSON.stringify(message),
							);
						}
					});
			}
		}
	},
};
