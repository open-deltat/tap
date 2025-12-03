import { TapError } from '@tap/core';
import {
	type AuthContext,
	OfferCreateRequestSchema,
	type OfferCreateResponse,
	OfferDeleteRequestSchema,
	type OfferDeleteResponse,
	OffersGetRequestSchema,
	type OffersGetResponse,
	resourceId,
	validateRangeOffer,
} from '@tap/protocol';
import { ulid } from 'ulid';
import { requireScope } from '../auth/context';
import { offerRepository } from '../core';

export const handleOffersGet = async (
	req: Request,
	authCtx: AuthContext,
): Promise<Response> => {
	const authResult = requireScope(authCtx, 'read');
	if (!authResult.authorized) {
		return new TapError('TAP_UNAUTHORIZED', authResult.message).toResponse();
	}
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
				result.error.format(),
			);
			return error.toResponse();
		}

		const offers = await offerRepository.getByResourceId(
			resourceId(result.data.resourceId),
		);

		// Map offers to response format (structurally identical but different type sources)
		const response: OffersGetResponse = {
			offers: offers.map((offer) => ({
				...offer,
				tenantId: offer.tenantId,
				resourceId: offer.resourceId,
			})),
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

export const handleOfferCreate = async (
	req: Request,
	authCtx: AuthContext,
): Promise<Response> => {
	const authResult = requireScope(authCtx, 'manage');
	if (!authResult.authorized) {
		return new TapError('TAP_UNAUTHORIZED', authResult.message).toResponse();
	}

	try {
		const json = await req.json();
		const result = OfferCreateRequestSchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format(),
			);
			return error.toResponse();
		}

		// Validate range offer start < end
		if (result.data.type === 'range' && !validateRangeOffer(result.data)) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Range offer start must be before end',
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

export const handleOfferDelete = async (
	req: Request,
	authCtx: AuthContext,
): Promise<Response> => {
	const authResult = requireScope(authCtx, 'manage');
	if (!authResult.authorized) {
		return new TapError('TAP_UNAUTHORIZED', authResult.message).toResponse();
	}

	try {
		const json = await req.json();
		const result = OfferDeleteRequestSchema.safeParse(json);

		if (!result.success) {
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Invalid request body',
				result.error.format(),
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
