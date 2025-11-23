import { type BookingConfirmedEvent, TapError } from '@tap/core';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	type BookingId,
	type BookPostRequestBody,
	BookPostRequestBodySchema,
	type BookPostResponse,
	createAvailabilityTopic,
	type HoldId,
	parseSlotId,
	type ResourceId,
	type SessionId,
	type TenantId,
} from '@tap/protocol';
import type { Server } from 'bun';
import { ulid } from 'ulid';
import { core } from '../core';

async function confirmBookingWithHold(
	tenantId: TenantId,
	resourceId: ResourceId,
	holdId: HoldId,
	sessionId: SessionId,
	_slotId: string,
	start: Date,
	end: Date,
	customer: BookPostRequestBody['customer'],
): Promise<BookingConfirmedEvent | null> {
	const event = await core.confirmBooking({
		tenantId,
		resourceId,
		holdId,
		sessionId,
		bookingId: ulid() as BookingId,
		start: start.getTime(),
		end: end.getTime(),
		customerName: customer.name,
		customerEmail: customer.email,
		customerPhone: customer.phone,
		paymentStatus: 'PENDING',
		priceCents: 1000, // Mock
	});
	return event;
}

export async function handleBook(
	req: Request,
	server: Server,
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

		let start: Date;
		let end: Date;
		try {
			const parsed = parseSlotId(body.slotId);
			start = parsed.start;
			end = parsed.end;
		} catch (err) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid slot ID format',
				err as Record<string, unknown>,
			);
			return error.toResponse();
		}

		let holdId = body.holdId;
		let sessionId = body.holdSessionId;

		// If no hold provided, try to place one instantly
		if (!holdId || !sessionId) {
			const tempSessionId = `session_${ulid()}` as SessionId;

			const holdResult = await core.placeHold({
				tenantId: body.tenantId,
				resourceId: body.resourceId,
				sessionId: tempSessionId,
				timezone: 'UTC', // TODO: Fetch resource timezone
				startUnix: start.getTime(),
				endUnix: end.getTime(),
				expiresAt: Date.now() + 60000, // 1 min expiry
				clientRef: body.clientRef,
			});

			if (!holdResult.success) {
				const error = new TapError(
					'TAP_SLOT_UNAVAILABLE',
					'Slot is not available',
				);
				return error.toResponse();
			}

			// Core placeHold returns HoldPlacedEvent | Failure
			// If success is true, it should have holdId.
			// We might need to check the type of holdResult more closely.
			// Assuming holdResult.success means holdResult is HoldPlacedEvent (or contains holdId)
			// Let's check core types later if this fails, but assuming holdId exists on success.
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

		const event = await confirmBookingWithHold(
			body.tenantId,
			body.resourceId,
			holdId,
			sessionId,
			body.slotId,
			start,
			end,
			body.customer,
		);

		if (!event) {
			// This implies the hold was invalid or expired or session mismatch
			const error = new TapError('TAP_HOLD_EXPIRED', 'Hold invalid or expired');
			return error.toResponse();
		}

		// Broadcast update via Server Pub/Sub
		const topic = createAvailabilityTopic(body.tenantId, body.resourceId);
		const payload: AvailabilityDeltaPayload = {
			kind: 'BookingConfirmed',
			slotId: body.slotId,
			resourceId: body.resourceId,
			tenantId: body.tenantId,
			start: start.toISOString(),
			end: end.toISOString(),
			bookingId: event.payload.bookingId,
			holdId: holdId || undefined,
		};

		const message: AvailabilityWsServerMessage = {
			type: 'stream.delta',
			eventId: event.eventId,
			payload,
		};

		server.publish(topic, JSON.stringify(message));

		const response: BookPostResponse = {
			bookingId: event.payload.bookingId,
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			slotId: body.slotId,
			start: start.toISOString(),
			end: end.toISOString(),
			paymentStatus: 'PENDING',
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
