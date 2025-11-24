import {
	calculateAvailability,
	createEventId,
	DEFAULT_SLOT_DURATION_MS,
	TapError,
} from '@tap/core';
import {
	AvailabilityPostRequestBodySchema,
	type AvailabilityPostResponse,
} from '@tap/protocol';
import { core } from '../core';

export async function handleAvailability(req: Request): Promise<Response> {
	try {
		const json = await req.json();
		const result = AvailabilityPostRequestBodySchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		const body = result.data;
		const slots = calculateAvailability({
			inventoryState: core.getState,
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			from: new Date(body.from),
			to: new Date(body.to),
			...(body.slotDurationMs ? { slotDurationMs: body.slotDurationMs } : {}),
		});

		const response: AvailabilityPostResponse = {
			tenantId: body.tenantId,
			resourceId: body.resourceId,
			resolutionMs: body.slotDurationMs || DEFAULT_SLOT_DURATION_MS,
			asOfEventId: createEventId(),
			freeSlots: slots,
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
