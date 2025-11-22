import {
	type AvailabilitySlot,
	createSlotId,
	type DayKey,
	type Minute,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import {
	addDays,
	addMinutes,
	differenceInMinutes,
	format,
	startOfDay,
} from 'date-fns';
import type { Offer } from '../../domain/models';
import { getBit } from '../../infrastructure/bitmap';
import type { InventoryState } from '../inventory/types';

// Default offer: Mon-Fri, 09:00-17:00
const DEFAULT_OFFER: Offer = {
	id: 'default',
	tenantId: 'default' as unknown as TenantId,
	resourceId: 'default' as unknown as ResourceId,
	daysOfWeek: [1, 2, 3, 4, 5],
	startTime: '09:00',
	endTime: '17:00',
	currency: 'USD',
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
	slotDurationMinutes?: number;
}): AvailabilitySlot[] {
	const {
		inventoryState,
		tenantId,
		resourceId,
		from,
		to,
		slotDurationMinutes = 15,
	} = params;

	const slots: AvailabilitySlot[] = [];
	const stateMap = inventoryState(tenantId, resourceId);
	const offers = getOffersForResource(tenantId, resourceId);

	// Iterate day by day
	let currentDay = startOfDay(from);
	const endDay = startOfDay(to);

	// We iterate until the start of the day is past the end date
	// but we must process the day containing 'to' if 'to' has time components
	while (currentDay <= endDay) {
		// Use simple string splitting for UTC DayKey to align with PlaceHold logic
		// This avoids timezone shifts that happen with format(..., 'yyyy-MM-dd') if system is not UTC
		const dayKey = currentDay.toISOString().split('T')[0] as DayKey;
		const dayOfWeek = currentDay.getDay(); // 0=Sun, 1=Mon...

		// Find applicable offers
		const activeOffers = offers.filter((o) => o.daysOfWeek.includes(dayOfWeek));

		for (const offer of activeOffers) {
			const [startHour, startMin] = offer.startTime.split(':').map(Number);
			const [endHour, endMin] = offer.endTime.split(':').map(Number);

			const offerStart = new Date(currentDay);
			offerStart.setUTCHours(startHour ?? 0, startMin ?? 0, 0, 0);

			const offerEnd = new Date(currentDay);
			offerEnd.setUTCHours(endHour ?? 0, endMin ?? 0, 0, 0);

			// Clamp to query range
			// If offer ends before 'from', skip
			if (offerEnd < from) continue;
			// If offer starts after 'to', skip
			if (offerStart > to) continue;

			// Calculate grid
			// We want aligned slots from offerStart
			// e.g. 9:00, 9:15, 9:30

			let slotStart = offerStart;

			while (differenceInMinutes(offerEnd, slotStart) >= slotDurationMinutes) {
				const slotEnd = addMinutes(slotStart, slotDurationMinutes);

				// Check if slot is within query range
				if (slotStart >= from && slotEnd <= to) {
					// Check availability in bitmap
					const isFree = checkBitmapAvailability(
						stateMap,
						dayKey,
						slotStart,
						slotDurationMinutes,
					);

					if (isFree) {
						slots.push({
							slotId: createSlotId(slotStart, slotEnd),
							resourceId,
							tenantId,
							start: slotStart.toISOString(),
							end: slotEnd.toISOString(),
						});
					}
				}

				slotStart = addMinutes(slotStart, slotDurationMinutes);
			}
		}

		currentDay = addDays(currentDay, 1);
	}

	return slots;
}

function checkBitmapAvailability(
	stateMap: InventoryState,
	dayKey: DayKey,
	slotStart: Date,
	duration: number,
): boolean {
	const dayState = stateMap.get(dayKey);
	// If no state exists for this day, it means no bookings/holds, so it's free (assuming offers permit)
	if (!dayState) return true;

	const startMinute = slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();

	for (let i = 0; i < duration; i++) {
		const m = startMinute + i;
		if (
			getBit(dayState.booked, m as Minute) ||
			getBit(dayState.held, m as Minute)
		) {
			return false;
		}
	}

	return true;
}
