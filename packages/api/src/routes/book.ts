import {
	calculateHoldExpiration,
	createBookingId,
	createSessionId,
	DEFAULT_BOOKING_HOLD_EXPIRATION_MS,
	TapError,
} from '@open-tap/core';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	BookPostRequestBodySchema,
	type BookPostResponse,
	createAvailabilityTopic,
	createSlotId,
	holdId,
	parseSlotId,
	type SlotId,
	tenantId,
} from '@open-tap/protocol';
import type { Server } from 'bun';
import { bookingRepository, getInventory } from '../core';
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
				result.error.format(),
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

		const existingBooking = await findExistingBooking(
			body.tenantId,
			body.holdId,
			body.clientRef,
		);

		if (existingBooking) {
			const response: BookPostResponse = {
				bookingId: existingBooking.id,
				tenantId: existingBooking.tenantId,
				resourceId: existingBooking.resourceId,
				slotId: createSlotId(
					new Date(existingBooking.start),
					new Date(existingBooking.end),
				),
				start: existingBooking.start,
				end: existingBooking.end,
				paymentStatus: existingBooking.paymentStatus,
				...(existingBooking.clientRef !== undefined && {
					clientRef: existingBooking.clientRef,
				}),
			};
			return new Response(JSON.stringify(response), {
				headers: { 'Content-Type': 'application/json' },
			});
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
			...(body.clientRef !== undefined && { clientRef: body.clientRef }),
			...(body.customer.phone !== undefined && {
				customerPhone: body.customer.phone,
			}),
		});

		if (!event) {
			const error = new TapError('TAP_HOLD_EXPIRED', 'Hold invalid or expired');
			return error.toResponse();
		}

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

async function findExistingBooking(
	tenantIdStr: string,
	holdIdStr?: string,
	clientRef?: string,
) {
	if (holdIdStr) {
		const byHold = await bookingRepository.getByHoldId(holdId(holdIdStr));
		if (byHold) return byHold;
	}

	if (clientRef) {
		const byClientRef = await bookingRepository.getByClientRef(
			tenantId(tenantIdStr),
			clientRef,
		);
		if (byClientRef) return byClientRef;
	}

	return null;
}
