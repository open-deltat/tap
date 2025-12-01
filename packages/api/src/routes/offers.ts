import { TapError } from '@tap/core';
import {
	OfferCreateRequestSchema,
	type OfferCreateResponse,
	OfferDeleteRequestSchema,
	type OfferDeleteResponse,
	OffersGetRequestSchema,
	type OffersGetResponse,
	resourceId,
} from '@tap/protocol';
import { ulid } from 'ulid';
import { offerRepository } from '../core';

export const handleOffersGet = async (req: Request): Promise<Response> => {
	try {
		const url = new URL(req.url);
		const resourceIdParam = url.searchParams.get('resourceId');

		const result = OffersGetRequestSchema.safeParse({
			resourceId: resourceIdParam,
		});

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request parameters',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		const offers = await offerRepository.getByResourceId(
			resourceId(result.data.resourceId),
		);

		const response: OffersGetResponse = {
			offers: offers as OffersGetResponse['offers'],
		};
		return Response.json(response);
	} catch (e) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return error.toResponse();
	}
};

export const handleOfferCreate = async (req: Request): Promise<Response> => {
	try {
		const json = await req.json();
		const result = OfferCreateRequestSchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		const offerId = result.data.id ?? ulid();
		const offer = { ...result.data, id: offerId };

		await offerRepository.create(offer);

		const response: OfferCreateResponse = { offer };
		return Response.json(response);
	} catch (e) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return error.toResponse();
	}
};

export const handleOfferDelete = async (req: Request): Promise<Response> => {
	try {
		const json = await req.json();
		const result = OfferDeleteRequestSchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format() as Record<string, unknown>,
			);
			return error.toResponse();
		}

		await offerRepository.delete(result.data.offerId);

		const response: OfferDeleteResponse = { deleted: true };
		return Response.json(response);
	} catch (e) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return error.toResponse();
	}
};
