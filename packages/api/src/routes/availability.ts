import { calculateAvailability, TapError } from '@tap/core';
import {
	AvailabilityPostRequestBodySchema,
	type AvailabilityPostResponse,
} from '@tap/protocol';
import { parseISO } from 'date-fns';
import { ulid } from 'ulid';
import { core } from '../core';

export async function handleAvailability(req: Request): Promise<Response> {
	try {
		const json = await req.json();
		console.log('Availability Request:', JSON.stringify(json, null, 2));
		const result = AvailabilityPostRequestBodySchema.safeParse(json);

		if (!result.success) {
			console.error('Validation Error:', result.error);
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		const body = result.data;

		const fromDate = parseISO(body.from);
		const toDate = parseISO(body.to);

		const slots = calculateAvailability({
			inventoryState: core.getState,
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			from: fromDate,
			to: toDate,
			...(body.slotDurationMinutes
				? { slotDurationMinutes: body.slotDurationMinutes }
				: {}),
		});

		const response: AvailabilityPostResponse = {
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			resolutionMinutes: body.slotDurationMinutes || 15,
			asOfEventId: ulid(),
			freeSlots: slots.map((s) => ({
				slotId: s.slotId,
				resourceId: s.resourceId,
				tenantId: s.tenantId,
				start: s.start,
				end: s.end,
			})),
			pricing: slots.map((s) => ({
				slotId: s.slotId,
				price: { amountCents: 1000, currency: 'USD' }, // Mock pricing
			})),
		};

		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (e) {
		console.error('Internal Error in handleAvailability:', e);
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return error.toResponse();
	}
}
