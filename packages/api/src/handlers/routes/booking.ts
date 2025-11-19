import type { BookingId, HoldId, ResourceId, SessionId, TenantId } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import { ulid } from 'ulid';
import {
	getAllocator,
	getEventStore,
	resourceRepository,
	tenantRepository,
	validateHorizon,
} from '../../services/context';
import type { PublicBookRequest } from '../../types';

export type BookParams = {
	tenantSlug: string;
	resourceSlug: string;
	body: PublicBookRequest;
	sessionId?: string;
};

export type BookResult =
	| {
			success: true;
			bookingId: string;
			start: string;
			end: string;
			status: 'CONFIRMED';
	  }
	| {
			success: false;
			error: string;
			status: number;
	  };

export const handleBook = async (params: BookParams): Promise<BookResult> => {
	const { tenantSlug, resourceSlug, body } = params;
	const sessionId = (params.sessionId || 'sess_http_default') as SessionId;

	if (!body.customerName || !body.customerEmail) {
		return {
			success: false,
			error: 'Missing required fields: customerName, customerEmail',
			status: 400,
		};
	}

	const tenant = await tenantRepository.getBySlug(tenantSlug);
	if (!tenant) {
		return {
			success: false,
			error: 'Tenant not found',
			status: 404,
		};
	}

	const resource = await resourceRepository.getBySlug(tenantSlug, resourceSlug);
	if (!resource || resource.tenantId !== tenant.id) {
		return {
			success: false,
			error: 'Resource not found',
			status: 404,
		};
	}

	const allocator = getAllocator();
	const eventStore = getEventStore();
	let holdId: string = '';
	let start: number = 0;
	let end: number = 0;

	if (body.holdId) {
		const events = await eventStore.getByTenant(tenant.id);
		const holdEvent = events.find(
			(e) => e.type === 'HoldPlaced' && e.payload.holdId === body.holdId,
		);

		if (!holdEvent || holdEvent.type !== 'HoldPlaced') {
			return {
				success: false,
				error: 'Hold not found',
				status: 404,
			};
		}

		if (
			holdEvent.tenantId !== tenant.id ||
			holdEvent.resourceId !== resource.id
		) {
			return {
				success: false,
				error: 'Hold not found',
				status: 404,
			};
		}

		const dayStart = parseDayToUnixStartOfDayUTC(holdEvent.payload.day);
		start = dayStart + holdEvent.payload.startMinute * 60 * 1000;
		end = dayStart + holdEvent.payload.endMinute * 60 * 1000;
		holdId = holdEvent.payload.holdId;
	} else if (body.start && body.end) {
		const startUnix =
			typeof body.start === 'number' ? body.start : new Date(body.start).getTime();
		const endUnix =
			typeof body.end === 'number' ? end : new Date(body.end).getTime();

		if (Number.isNaN(startUnix) || Number.isNaN(endUnix)) {
			return {
				success: false,
				error: 'Invalid start or end date',
				status: 400,
			};
		}

		const startDate = new Date(startUnix);
		const dayStr = startDate.toISOString().split('T')[0];
		if (!dayStr) {
			return {
				success: false,
				error: 'Invalid start date',
				status: 400,
			};
		}

		const horizonCheck = validateHorizon(dayStr, resource);
		if (!horizonCheck.valid) {
			return {
				success: false,
				error: horizonCheck.error,
				status: 400,
			};
		}

		const day = dayStr;
		const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
		const startMinute = Math.floor((startUnix - dayStartUnix) / (60 * 1000));
		const endMinute = Math.floor((endUnix - dayStartUnix) / (60 * 1000));

		const holdResult = await allocator.placeHold({
			tenantId: tenant.id as TenantId,
			resourceId: resource.id as ResourceId,
			sessionId,
			day,
			startMinute,
			endMinute,
			expiresAt: Date.now() + 30_000,
		});

		if (!holdResult.success) {
			return {
				success: false,
				error: 'Slot not available',
				status: 409,
			};
		}

		await eventStore.append(holdResult.event);
		holdId = holdResult.holdId;
		start = startUnix;
		end = endUnix;
	} else {
		return {
			success: false,
			error: 'Missing required fields: either holdId or (start and end)',
			status: 400,
		};
	}

	const bookingId = ulid() as BookingId;
	const confirmParams: Parameters<typeof allocator.confirmBooking>[0] = {
		tenantId: tenant.id as TenantId,
		resourceId: resource.id as ResourceId,
		holdId: holdId as HoldId,
		sessionId,
		bookingId,
		start,
		end,
		customerName: body.customerName,
		customerEmail: body.customerEmail,
		paymentStatus: 'NONE',
	};

	if (body.customerPhone) {
		confirmParams.customerPhone = body.customerPhone;
	}

	const confirmEvent = await allocator.confirmBooking(confirmParams);

	if (!confirmEvent) {
		return {
			success: false,
			error: 'Failed to confirm booking',
			status: 500,
		};
	}

	await eventStore.append(confirmEvent);

	return {
		success: true,
		bookingId,
		start: new Date(start).toISOString(),
		end: new Date(end).toISOString(),
		status: 'CONFIRMED' as const,
	};
};

