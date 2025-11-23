import {
	type AvailabilitySlot,
	createSlotId,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import type { Offer, WeeklyOffer } from '../../domain/models';
import type { Interval } from '../../infrastructure/intervals';
import {
	getCompositeTimeline,
	mergeIntervals,
	subtractIntervals,
} from '../../infrastructure/intervals';
import type { InventoryState } from '../inventory-types';
import { generateOfferIntervals } from './offers';

// Default offer: Mon-Fri, 09:00-17:00
const DEFAULT_OFFER: WeeklyOffer = {
	type: 'weekly',
	id: 'default',
	tenantId: 'default' as TenantId,
	resourceId: 'default' as ResourceId,
	daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
	startTime: '09:00',
	endTime: '17:00',
	currency: 'USD',
	capacity: 1,
	timezone: 'UTC', // Default to UTC
};

// In a real system this would be a repository lookup
function getOffersForResource(
	tenantId: TenantId,
	resourceId: ResourceId,
): Offer[] {
	return [
		{
			...DEFAULT_OFFER,
			tenantId,
			resourceId,
		},
	];
}

export function calculateAvailability(params: {
	inventoryState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => InventoryState;
	tenantId: TenantId;
	resourceId: ResourceId;
	from: Date;
	to: Date;
	slotDurationMs?: number;
}): AvailabilitySlot[] {
	const {
		inventoryState,
		tenantId,
		resourceId,
		from,
		to,
		slotDurationMs = 15 * 60000,
	} = params;

	const state = inventoryState(tenantId, resourceId);
	const offers = getOffersForResource(tenantId, resourceId);

	// 1. Generate "Green" Intervals (Offers)
	const offerIntervals = generateOfferIntervals(offers, from, to);

	// 2. Generate "Red" Intervals (Bookings + Holds)
	//    Currently assuming capacity=1 means ANY booking/hold blocks it.
	//    For multi-capacity, we would need to sum capacity consumption.
	//    Since Offers also have capacity, we need to handle that.

	// Simplification for now:
	// - Merge all booked/held intervals.
	// - Subtract them from offer intervals.
	// - This assumes single capacity or that the state intervals already account for capacity (not yet).
	//
	// Re-visiting the "Capacity" thought:
	// If Offer Capacity = 5, and we have 2 bookings.
	// Availability = Offer - Bookings > 0.
	//
	// Let's use the composite timeline approach for robustness.

	// A. Timeline of Capacity Provision (Offers)
	//    Since offers might overlap (Alice + Bob), we sum them.
	const capacityProvided = getCompositeTimeline(
		offerIntervals.map((i) => ({ ...i, value: i.value ?? 1 })),
	);

	// B. Timeline of Capacity Consumption (Inventory)
	const consumptionIntervals = [...state.booked, ...state.held].map((i) => ({
		...i,
		value: i.value ?? 1,
	}));
	// Merge consumption to flatten overlaps if any (though usually distinct bookings)
	// Actually, we want to SUM consumption.
	// But `state.booked` usually contains distinct bookings.
	// Let's sum them.
	const capacityConsumed = getCompositeTimeline(consumptionIntervals);

	// C. Subtract Consumption from Provision
	//    Available = Provided - Consumed
	//    Since we don't have a subtractTimeline function yet, let's do a simpler boolean check for V1.
	//    V1 Assumption: Capacity = 1.
	//    If Capacity > 1, this logic needs `subtractValues`.
	//    Given the previous Bitmap logic used `isRangeAvailable` with `capacity`, we should respect that.
	//
	//    Let's stick to the "Boolean Available" logic for now (Capacity 1).
	//    If offers have capacity > 1, we treat it as "Is there at least 1 slot free?".

	// V1: Flatten Consumption
	const busyIntervals = mergeIntervals(consumptionIntervals);

	// V1: Flatten Offers (Union)
	//     If multiple offers overlap, we just merge them to find "Open Time".
	//     We ignore the "Count" of capacity for now (assuming 1).
	const openIntervals = mergeIntervals(offerIntervals);

	// D. Subtract Busy from Open
	const freeIntervals = subtractIntervals(openIntervals, busyIntervals);

	// 3. Discretize into Slots
	//    Now we have smooth free intervals [10:00, 14:00].
	//    We need to chop this into 15min slots.
	const slots: AvailabilitySlot[] = [];

	for (const interval of freeIntervals) {
		// Clamp to query window
		const start = Math.max(interval.start, from.getTime());
		const end = Math.min(interval.end, to.getTime());

		if (end <= start) continue;

		let current = start;
		while (current + slotDurationMs <= end) {
			const slotEnd = current + slotDurationMs;
			slots.push({
				slotId: createSlotId(new Date(current), new Date(slotEnd)),
				resourceId,
				tenantId,
				start: current,
				end: slotEnd,
			});
			current += slotDurationMs;
		}
	}

	return slots;
}
