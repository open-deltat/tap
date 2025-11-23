import {
	type AvailabilitySlot,
	createSlotId,
	type DayKey,
	type Minute,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import type { Offer } from '../../domain/models';
import { isRangeAvailable } from '../../infrastructure/bitmap';
import type { InventoryState } from '../inventory/types';

// Default offer: Mon-Fri, 09:00-17:00
const DEFAULT_OFFER: Offer = {
	id: 'default',
	tenantId: 'default' as TenantId,
	resourceId: 'default' as ResourceId,
	daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
	startTime: '09:00',
	endTime: '17:00',
	currency: 'USD',
	capacity: 1,
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

	const slots: AvailabilitySlot[] = [];
	const stateMap = inventoryState(tenantId, resourceId);
	const offers = getOffersForResource(tenantId, resourceId);

	// Strict UTC iteration
	// 1. Start at UTC midnight of the 'from' date
	//    Or specifically, just iterate over the days covered by [from, to] in UTC
	const startUtc = Date.UTC(
		from.getUTCFullYear(),
		from.getUTCMonth(),
		from.getUTCDate(),
	);
	const endUtc = Date.UTC(
		to.getUTCFullYear(),
		to.getUTCMonth(),
		to.getUTCDate(),
	);

	// Iterate day by day (UTC)
	for (let dayTs = startUtc; dayTs <= endUtc; dayTs += 86400000) {
		const currentDay = new Date(dayTs);
		const dayKey = currentDay.toISOString().split('T')[0] as DayKey;
		const dayOfWeek = currentDay.getUTCDay(); // 0=Sun, 1=Mon...

		// Find applicable offers
		const activeOffers = offers.filter((o) => o.daysOfWeek.includes(dayOfWeek));

		for (const offer of activeOffers) {
			const [startHour, startMin] = offer.startTime.split(':').map(Number);
			const [endHour, endMin] = offer.endTime.split(':').map(Number);

			// Construct offer start/end in strict UTC
			const offerStart = new Date(dayTs);
			offerStart.setUTCHours(startHour ?? 0, startMin ?? 0, 0, 0);

			const offerEnd = new Date(dayTs);
			offerEnd.setUTCHours(endHour ?? 0, endMin ?? 0, 0, 0);

			// Clamp to query range
			if (offerEnd.getTime() < from.getTime()) continue;
			if (offerStart.getTime() > to.getTime()) continue;

			// Calculate grid
			let slotStart = new Date(offerStart);

			while (offerEnd.getTime() - slotStart.getTime() >= slotDurationMs) {
				// Manual addMinutes to avoid local timezone jumps if using date-fns incorrectly,
				// but date-fns addMinutes is generally safe for UTC if inputs are correct.
				// Let's stick to UTC timestamps for safety.
				const slotEnd = new Date(slotStart.getTime() + slotDurationMs);

				// Check if slot is within query range
				if (slotStart >= from && slotEnd <= to) {
					// Check availability in bitmap
					// Convert ms to minutes for bitmap check (ceil to be safe or floor?)
					// If we request 15 mins (900000ms), we check 15 mins.
					const durationMinutes = Math.ceil(slotDurationMs / 60000);

					const isFree = checkBitmapAvailability(
						stateMap,
						dayKey,
						slotStart,
						durationMinutes,
						offer.capacity ?? 1,
					);

					if (isFree) {
						slots.push({
							slotId: createSlotId(slotStart, slotEnd),
							resourceId,
							tenantId,
							start: slotStart.getTime(),
							end: slotEnd.getTime(),
						});
					}
				}

				slotStart = slotEnd;
			}
		}
	}

	return slots;
}

function checkBitmapAvailability(
	stateMap: InventoryState,
	dayKey: DayKey,
	slotStart: Date,
	duration: number,
	capacity: number,
): boolean {
	const dayState = stateMap.get(dayKey);
	// If no state exists for this day, it means no bookings/holds, so it's free (assuming offers permit)
	if (!dayState) return true;

	const startMinute = (slotStart.getUTCHours() * 60 +
		slotStart.getUTCMinutes()) as Minute;
	const endMinute = (startMinute + duration) as Minute;

	return isRangeAvailable(
		dayState.booked,
		dayState.held,
		startMinute,
		endMinute,
		capacity,
	);
}
