import { TapError } from '@tap/core';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	CancelPostRequestBodySchema,
	type CancelPostResponse,
	createAvailabilityTopic,
	createSlotId,
	type SlotId,
} from '@tap/protocol';
import type { Server } from 'bun';
import { getInventory } from '../core';
import { serverContext } from '../server-context';

export const handleCancel = async (
	req: Request,
	_server: Server<unknown>,
): Promise<Response> => {
	const json = await req.json();
	const result = CancelPostRequestBodySchema.safeParse(json);

	if (!result.success) {
		const error = new TapError(
			'TAP_INVALID_INPUT',
			'Invalid request body',
			result.error.format() as Record<string, unknown>,
		);
		return error.toResponse();
	}

	const { tenantId, resourceId, bookingId } = result.data;

	const inventory = getInventory(tenantId, resourceId);
	const booking = await inventory.getBookingById(bookingId);

	if (!booking) {
		const error = new TapError('TAP_BOOKING_NOT_FOUND', 'Booking not found');
		return error.toResponse();
	}

	if (booking.status === 'CANCELLED') {
		const error = new TapError(
			'TAP_BOOKING_ALREADY_CANCELLED',
			'Booking already cancelled',
		);
		return error.toResponse();
	}

	const event = await inventory.cancelBooking({
		tenantId,
		resourceId,
		bookingId,
		startUnix: booking.start,
		endUnix: booking.end,
	});

	if (!event) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			'Failed to cancel booking',
		);
		return error.toResponse();
	}

	const slotId = createSlotId(new Date(booking.start), new Date(booking.end));
	const topic = createAvailabilityTopic(tenantId, resourceId);

	const payload: AvailabilityDeltaPayload = {
		kind: 'BookingCancelled',
		slotId: slotId as SlotId,
		resourceId,
		tenantId,
		startUnix: booking.start,
		endUnix: booking.end,
		bookingId,
	};

	const message: AvailabilityWsServerMessage = {
		type: 'stream.delta',
		eventId: event.eventId,
		payload,
	};

	serverContext.server?.publish(topic, JSON.stringify(message));

	const response: CancelPostResponse = {
		bookingId,
		tenantId,
		resourceId,
		slotId,
		cancelled: true,
	};

	return new Response(JSON.stringify(response), {
		headers: { 'Content-Type': 'application/json' },
	});
};
