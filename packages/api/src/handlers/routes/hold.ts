import type { HoldId, ResourceId, TenantId } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import { validateHorizon } from '../../services/context';
import {
	getAllocator,
	getEventStore,
	resourceRepository,
	tenantRepository,
} from '../../services/context';

export type PlaceHoldParams = {
	tenantSlug: string;
	resourceSlug: string;
	start: string | number;
	end: string | number;
	clientRef?: string;
};

export type PlaceHoldResult =
	| {
			success: true;
			holdId: string;
			expiresAt: number;
	  }
	| {
			success: false;
			error: string;
			status: number;
	  };

export const handlePlaceHold = async (
	params: PlaceHoldParams,
): Promise<PlaceHoldResult> => {
	const { tenantSlug, resourceSlug, start, end, clientRef } = params;

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

	const startUnix =
		typeof start === 'number' ? start : new Date(start).getTime();
	const endUnix = typeof end === 'number' ? end : new Date(end).getTime();

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

	const allocator = getAllocator();
	const holdResult = await allocator.placeHold({
		tenantId: tenant.id as TenantId,
		resourceId: resource.id as ResourceId,
		day,
		startMinute,
		endMinute,
		expiresAt: Date.now() + 30_000,
		...(clientRef ? { clientRef } : {}),
	});

	if (!holdResult.success) {
		return {
			success: false,
			error: 'Slot not available',
			status: 409,
		};
	}

	const eventStore = getEventStore();
	await eventStore.append(holdResult.event);

	return {
		success: true,
		holdId: holdResult.holdId,
		expiresAt: Date.now() + 30_000,
	};
};

export type ReleaseHoldParams = {
	tenantSlug: string;
	resourceSlug: string;
	holdId: string;
};

export type ReleaseHoldResult =
	| {
			success: true;
			released: boolean;
	  }
	| {
			success: false;
			error: string;
			status: number;
	  };

export const handleReleaseHold = async (
	params: ReleaseHoldParams,
): Promise<ReleaseHoldResult> => {
	const { tenantSlug, resourceSlug, holdId } = params;

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

	const event = await allocator.releaseHold({
		holdId: holdId as HoldId,
		tenantId: tenant.id as TenantId,
		resourceId: resource.id as ResourceId,
	});

	if (!event) {
		return {
			success: false,
			error: 'Hold not found',
			status: 404,
		};
	}

	await eventStore.append(event);

	return {
		success: true,
		released: true,
	};
};

