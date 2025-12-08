import {
	type AvailabilitySlot,
	createSlotId,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import type { Offer } from '../../domain/models';
import {
	expandIntervals,
	mergeIntervals,
	subtractIntervals,
} from '../../infrastructure/intervals';
import type { InventoryState } from '../inventory-types';
import { generateOfferIntervals } from './offers';

export type CalculateAvailabilityParams = {
	inventoryState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => Promise<InventoryState>;
	offers: readonly Offer[];
	tenantId: TenantId;
	resourceId: ResourceId;
	from: Date;
	to: Date;
	slotDurationMs?: number;
};

const DEFAULT_SLOT_DURATION_MS = 15 * 60000;
const MINUTES_TO_MS = 60 * 1000;

const getMaxBuffer = (
	offers: readonly Offer[],
): { beforeMs: number; afterMs: number } => {
	let maxBefore = 0;
	let maxAfter = 0;
	for (const offer of offers) {
		maxBefore = Math.max(maxBefore, offer.bufferBeforeMinutes ?? 0);
		maxAfter = Math.max(maxAfter, offer.bufferAfterMinutes ?? 0);
	}
	return {
		beforeMs: maxBefore * MINUTES_TO_MS,
		afterMs: maxAfter * MINUTES_TO_MS,
	};
};

export const calculateAvailability = async (
	params: CalculateAvailabilityParams,
): Promise<AvailabilitySlot[]> => {
	const {
		inventoryState,
		offers,
		tenantId,
		resourceId,
		from,
		to,
		slotDurationMs = DEFAULT_SLOT_DURATION_MS,
	} = params;

	const state = await inventoryState(tenantId, resourceId);
	const { beforeMs, afterMs } = getMaxBuffer(offers);

	const offerIntervals = generateOfferIntervals(offers, from, to);
	const consumptionIntervals = [...state.booked, ...state.held].map((i) => ({
		...i,
		value: i.value ?? 1,
	}));

	const expandedConsumption = expandIntervals(
		consumptionIntervals,
		beforeMs,
		afterMs,
	);
	const busyIntervals = mergeIntervals(expandedConsumption);
	const openIntervals = mergeIntervals(offerIntervals);
	const freeIntervals = subtractIntervals(openIntervals, busyIntervals);

	const slots: AvailabilitySlot[] = [];

	for (const interval of freeIntervals) {
		const clampedStart = Math.max(interval.start, from.getTime());
		const clampedEnd = Math.min(interval.end, to.getTime());

		if (clampedEnd <= clampedStart) continue;

		for (
			let current = clampedStart;
			current + slotDurationMs <= clampedEnd;
			current += slotDurationMs
		) {
			const slotEnd = current + slotDurationMs;
			slots.push({
				slotId: createSlotId(new Date(current), new Date(slotEnd)),
				resourceId,
				tenantId,
				start: current,
				end: slotEnd,
			});
		}
	}

	return slots;
};
