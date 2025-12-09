import {
	calculateHoldExpiration,
	createSessionId,
	DEFAULT_HOLD_EXPIRATION_MS,
} from '@open-tap/core';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
	type HoldId,
	type SessionId as HoldSessionId,
	HoldWsClientMessageSchema,
	type HoldWsServerMessage,
	parseSlotId,
	type ResourceId,
	type SlotId,
	type TenantId,
} from '@open-tap/protocol';
import type { ServerWebSocket } from 'bun';
import { getInventory } from '../../core';
import { serverContext } from '../../server-context';

export type HoldWSData = {
	type: 'hold';
	sessionId?: HoldSessionId;
	holdId?: HoldId;
	tenantId?: TenantId;
	resourceId?: ResourceId;
	slotId?: SlotId;
};

export const holdWebSocketHandler = {
	async open(ws: ServerWebSocket<HoldWSData>) {
		const { tenantId, resourceId, slotId } = ws.data;

		if (!tenantId || !resourceId || !slotId) {
			ws.close(1008, 'Missing params');
			return;
		}

		try {
			const inventory = getInventory(tenantId, resourceId);
			const sessionId = createSessionId();

			let parsed: { start: Date; end: Date };
			try {
				parsed = parseSlotId(slotId);
			} catch (err) {
				const error: HoldWsServerMessage = {
					type: 'hold.error',
					errorValue: 'TAP_INVALID_INPUT',
					message:
						err instanceof Error ? err.message : 'Invalid slot ID format',
				};
				ws.send(JSON.stringify(error));
				ws.close();
				return;
			}

			let result: Awaited<ReturnType<typeof inventory.placeHold>>;
			try {
				result = await inventory.placeHold({
					tenantId,
					resourceId,
					sessionId,
					startUnix: parsed.start.getTime(),
					endUnix: parsed.end.getTime(),
					expiresAt: calculateHoldExpiration(
						Date.now(),
						DEFAULT_HOLD_EXPIRATION_MS,
					),
				});
			} catch (error) {
				const errorMsg: HoldWsServerMessage = {
					type: 'hold.error',
					errorValue: 'TAP_INTERNAL_ERROR',
					message:
						error instanceof Error ? error.message : 'Failed to place hold',
				};
				ws.send(JSON.stringify(errorMsg));
				ws.close();
				return;
			}

			if (result.success) {
				const successResult = result as {
					holdId: HoldId;
					event: { eventId: string };
				};
				ws.data.holdId = successResult.holdId;
				ws.data.sessionId = sessionId;
				ws.data.slotId = slotId;

				const hello: HoldWsServerMessage = {
					type: 'hold.session.hello',
					sessionId,
					tenantId,
					resourceId,
					slotId,
				};
				ws.send(JSON.stringify(hello));

				const startUnix = parsed.start.getTime();
				const endUnix = parsed.end.getTime();

				const confirmed: HoldWsServerMessage = {
					type: 'hold.confirmed',
					holdId: successResult.holdId,
					tenantId,
					resourceId,
					slotId,
					startUnix,
					endUnix,
				};
				ws.send(JSON.stringify(confirmed));

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
						holdId: successResult.holdId,
					} as AvailabilityDeltaPayload,
				};
				serverContext.server?.publish(topic, JSON.stringify(message));
			} else {
				const error: HoldWsServerMessage = {
					type: 'hold.error',
					errorValue: 'TAP_SLOT_UNAVAILABLE',
					message: 'Slot unavailable',
				};
				ws.send(JSON.stringify(error));
				ws.close();
			}
		} catch (e) {
			console.error('[Hold WS] Unhandled error:', e);
			const error: HoldWsServerMessage = {
				type: 'hold.error',
				errorValue: 'TAP_INTERNAL_ERROR',
				message: e instanceof Error ? e.message : 'Internal server error',
			};
			try {
				ws.send(JSON.stringify(error));
			} catch {
				// Connection may already be closed
			}
			ws.close(1011, 'Internal Error');
		}
	},

	message(ws: ServerWebSocket<HoldWSData>, message: string | Buffer) {
		const str = typeof message === 'string' ? message : message.toString();
		let json: unknown;
		try {
			json = JSON.parse(str);
		} catch (_e) {
			return;
		}

		const result = HoldWsClientMessageSchema.safeParse(json);
		if (result.success) {
			const msg = result.data;
			if (msg.type === 'hold.release' && ws.data.holdId === msg.holdId) {
				if (!ws.data.sessionId || !ws.data.tenantId || !ws.data.resourceId)
					return;
				const inventory = getInventory(ws.data.tenantId, ws.data.resourceId);
				inventory
					.releaseHold({
						holdId: msg.holdId,
						sessionId: ws.data.sessionId,
					})
					.then((res) => {
						if (res.success) {
							if (!ws.data.tenantId || !ws.data.resourceId || !ws.data.slotId) {
								return;
							}
							let parsed: { start: Date; end: Date };
							try {
								parsed = parseSlotId(ws.data.slotId);
							} catch {
								return;
							}
							const topic = createAvailabilityTopic(
								ws.data.tenantId,
								ws.data.resourceId,
							);
							const broadcastMessage: AvailabilityWsServerMessage = {
								type: 'stream.delta',
								eventId: (res as { event: { eventId: string } }).event.eventId,
								payload: {
									kind: 'HoldReleased',
									slotId: ws.data.slotId,
									resourceId: ws.data.resourceId,
									tenantId: ws.data.tenantId,
									startUnix: parsed.start.getTime(),
									endUnix: parsed.end.getTime(),
									holdId: msg.holdId,
								} as AvailabilityDeltaPayload,
							};
							serverContext.server?.publish(
								topic,
								JSON.stringify(broadcastMessage),
							);
						}
						ws.close();
					});
			}
		}
	},

	close(ws: ServerWebSocket<HoldWSData>) {
		if (
			ws.data.sessionId &&
			ws.data.holdId &&
			ws.data.tenantId &&
			ws.data.resourceId
		) {
			const inventory = getInventory(ws.data.tenantId, ws.data.resourceId);
			inventory
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
							!ws.data.holdId
						) {
							return;
						}
						let parsed: { start: Date; end: Date };
						try {
							parsed = parseSlotId(ws.data.slotId);
						} catch {
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
								startUnix: parsed.start.getTime(),
								endUnix: parsed.end.getTime(),
								holdId: ws.data.holdId,
							} as AvailabilityDeltaPayload,
						};
						serverContext.server?.publish(topic, JSON.stringify(message));
					}
				});
		}
	},
};
