import type { ResourceId, TenantId } from '@tap/core';
import { getAvailability } from '../../services/availability';
import {
	getAllocator,
	offerRepository,
	resourceRepository,
	tenantRepository,
} from '../../services/context';

export type GetAvailabilityParams = {
	tenantSlug: string;
	resourceSlug: string;
	from: string;
	to: string;
	durationMinutes?: string;
};

export type GetAvailabilityResult =
	| {
			success: true;
			slots: Array<{ start: number; end: number }>;
			asOfEventId: string | null;
	  }
	| {
			success: false;
			error: string;
			status: number;
	  };

export const handleGetAvailability = async (
	params: GetAvailabilityParams,
): Promise<GetAvailabilityResult> => {
	const { tenantSlug, resourceSlug, from, to, durationMinutes } = params;

	if (!from || !to) {
		return {
			success: false,
			error: 'Missing required query params: from, to',
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

	const offers = await offerRepository.getByResourceId(resource.id);
	const allocator = getAllocator();
	const fromDate = new Date(from);
	const toDate = new Date(to);

	const MAX_RANGE_DAYS = 35;
	const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	if (diffDays > MAX_RANGE_DAYS) {
		return {
			success: false,
			error: `Date range too large (max ${MAX_RANGE_DAYS} days)`,
			status: 400,
		};
	}

	const slots: Array<{ start: number; end: number }> = [];

	const state = allocator.getState(tenant.id as TenantId, resource.id as ResourceId);

	for (
		let date = new Date(fromDate);
		date <= toDate;
		date.setDate(date.getDate() + 1)
	) {
		const dayStr = date.toISOString().split('T')[0];
		if (!dayStr) continue;

		const availabilityParams: Parameters<typeof getAvailability>[0] = {
			state,
			day: dayStr,
			offers,
		};
		if (durationMinutes) {
			availabilityParams.durationMinutes = parseInt(durationMinutes, 10);
		}
		const daySlots = getAvailability(availabilityParams);

		slots.push(...daySlots);
	}

	const eventStore = await import('../../services/context').then(
		(m) => m.getEventStore(),
	);
	const events = await eventStore.getByResource(
		tenant.id as TenantId,
		resource.id as ResourceId,
	);
	const asOfEventId = events[events.length - 1]?.eventId || null;

	return {
		success: true,
		slots,
		asOfEventId,
	};
};

