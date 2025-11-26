import {
	calculateHoldExpiration,
	createBookingId,
	createSessionId,
	DEFAULT_BOOKING_HOLD_EXPIRATION_MS,
	TapError,
} from '@tap/core';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	BookPostRequestBodySchema,
	type BookPostResponse,
	createAvailabilityTopic,
	parseSlotId,
	type SlotId,
} from '@tap/protocol';
import type { Server } from 'bun';
import { getInventory } from '../core';
import { serverContext } from '../server-context';

export async function handleBook(
	req: Request,
	_server: Server<unknown>,
): Promise<Response> {
	try {
		const json = await req.json();
		const result = BookPostRequestBodySchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		const body = result.data;

		let parsed: { start: Date; end: Date };
		try {
			parsed = parseSlotId(body.slotId);
		} catch (err) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid slot ID format',
				err instanceof Error ? { message: err.message } : undefined,
			);
			return error.toResponse();
		}

		let holdId = body.holdId;
		let sessionId = body.holdSessionId;

		if (!holdId || !sessionId) {
			const inventory = getInventory(body.tenantId, body.resourceId);
			const tempSessionId = createSessionId();
			const holdResult = await inventory.placeHold({
				tenantId: body.tenantId,
				resourceId: body.resourceId,
				sessionId: tempSessionId,
				timezone: 'UTC',
				startUnix: parsed.start.getTime(),
				endUnix: parsed.end.getTime(),
				expiresAt: calculateHoldExpiration(
					Date.now(),
					DEFAULT_BOOKING_HOLD_EXPIRATION_MS,
				),
				...(body.clientRef !== undefined && { clientRef: body.clientRef }),
			});

			if (!holdResult.success) {
				const error = new TapError(
					'TAP_SLOT_UNAVAILABLE',
					'Slot is not available',
				);
				return error.toResponse();
			}

			if ('holdId' in holdResult) {
				holdId = holdResult.holdId;
			}
			sessionId = tempSessionId;
		}

		if (!holdId || !sessionId) {
			const error = new TapError(
				'TAP_INTERNAL_ERROR',
				'Failed to establish hold context',
			);
			return error.toResponse();
		}

		const inventory = getInventory(body.tenantId, body.resourceId);
		const event = await inventory.confirmBooking({
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			holdId,
			sessionId,
			bookingId: createBookingId(),
			start: parsed.start.getTime(),
			end: parsed.end.getTime(),
			customerName: body.customer.name,
			customerEmail: body.customer.email,
			...(body.customer.phone !== undefined && {
				customerPhone: body.customer.phone,
			}),
		});

		if (!event) {
			const error = new TapError('TAP_HOLD_EXPIRED', 'Hold invalid or expired');
			return error.toResponse();
		}

		// Broadcast via WebSocket
		const topic = createAvailabilityTopic(body.tenantId, body.resourceId);
		const payload: AvailabilityDeltaPayload = {
			kind: 'BookingConfirmed',
			slotId: body.slotId as SlotId,
			resourceId: body.resourceId,
			tenantId: body.tenantId,
			startUnix: parsed.start.getTime(),
			endUnix: parsed.end.getTime(),
			bookingId: event.payload.bookingId,
			holdId: holdId || undefined,
		};

		const message: AvailabilityWsServerMessage = {
			type: 'stream.delta',
			eventId: event.eventId,
			payload,
		};

		serverContext.server?.publish(topic, JSON.stringify(message));

		const response: BookPostResponse = {
			bookingId: event.payload.bookingId,
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			slotId: body.slotId,
			start: parsed.start.getTime(),
			end: parsed.end.getTime(),
			paymentStatus: event.payload.paymentStatus || 'NONE',
			clientRef: body.clientRef || undefined,
		};

		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (e) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return error.toResponse();
	}
}
