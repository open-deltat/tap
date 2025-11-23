import type {
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '@tap/protocol';
import { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { HoldExpiredEvent } from '../../domain/events';
import { setBitRange } from '../../infrastructure/bitmap';
import { createHoldExpiredEvent } from '../event-factory';
import type { HoldMetadata, InventoryState } from './types';

// Duplicated helper to break dependency cycle or just inline simple logic
const getSegments = (startUnix: number, endUnix: number, timezone: string) => {
	const segments: { day: DayKey; start: number; end: number }[] = [];
	let current = startUnix;
	if (endUnix <= startUnix) return [];

	while (current < endUnix) {
		const date = toZonedTime(current, timezone);
		const day = formatTz(date, 'yyyy-MM-dd', { timeZone: timezone }) as DayKey;
		const startMinute = date.getHours() * 60 + date.getMinutes();

		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		nextDay.setHours(0, 0, 0, 0);

		const endDate = toZonedTime(endUnix, timezone);
		const endDay = formatTz(endDate, 'yyyy-MM-dd', {
			timeZone: timezone,
		}) as DayKey;

		let endMinute = 1440;
		let stepEndUnix = 0;

		if (day === endDay) {
			const m = endDate.getHours() * 60 + endDate.getMinutes();
			endMinute = m;
			stepEndUnix = endUnix;
		} else {
			endMinute = 1440;
			stepEndUnix = fromZonedTime(nextDay, timezone).getTime();
		}

		segments.push({ day, start: startMinute, end: endMinute });
		current = stepEndUnix || endUnix;
	}
	return segments;
};

export type ExpiryManager = {
	expireHolds: (now: number) => HoldExpiredEvent[];
};

export const createExpiryManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
}): ExpiryManager => {
	return {
		expireHolds: (now: number) => {
			const expiredEvents: HoldExpiredEvent[] = [];
			for (const [holdId, metadata] of params.holds) {
				if (metadata.expiresAt <= now) {
					const segments = getSegments(
						metadata.startUnix,
						metadata.endUnix,
						metadata.timezone,
					);

					for (const { day, start, end } of segments) {
						const dayMap = params.getState(
							metadata.tenantId as TenantId,
							metadata.resourceId as ResourceId,
						);
						const dayState = dayMap.get(day);
						if (dayState) {
							setBitRange(dayState.held, start as Minute, end as Minute, false);
						}
					}
					params.holds.delete(holdId);

					expiredEvents.push(
						createHoldExpiredEvent({
							tenantId: metadata.tenantId,
							resourceId: metadata.resourceId,
							holdId,
							startUnix: metadata.startUnix,
							endUnix: metadata.endUnix,
						}),
					);
				}
			}
			return expiredEvents;
		},
	};
};
