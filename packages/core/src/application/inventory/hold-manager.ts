import type {
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '@tap/protocol';
import { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ulid } from 'ulid';
import type {
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import {
	createBitmapDay,
	decrementRange,
	incrementRange,
	isRangeAvailable,
} from '../../infrastructure/bitmap';
import {
	createHoldExpiredEvent,
	createHoldPlacedEvent,
	createHoldReleasedEvent,
} from '../event-factory';
import type { HoldMetadata, InventoryState } from './types';

export type HoldManager = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		timezone: string;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
		clientRef?: string;
		capacity?: number;
	}) => Promise<
		| { success: true; holdId: HoldId; event: HoldPlacedEvent }
		| { success: false }
	>;
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
};

// Helper to calculate daily segments from a unix range in a timezone
const getSegments = (startUnix: number, endUnix: number, timezone: string) => {
	const segments: { day: DayKey; start: Minute; end: Minute }[] = [];

	let current = startUnix;

	// Safety break to prevent infinite loops on invalid ranges
	if (endUnix <= startUnix) return [];

	// Max range check (e.g. 90 days) could be done here or by caller.
	// For now we assume reasonable ranges.

	while (current < endUnix) {
		const date = toZonedTime(current, timezone);
		const day = formatTz(date, 'yyyy-MM-dd', { timeZone: timezone }) as DayKey;

		const startMinute = (date.getHours() * 60 + date.getMinutes()) as Minute;

		// Find when this day ends (next day 00:00:00)
		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		nextDay.setHours(0, 0, 0, 0);

		// Determine if endUnix is on the same day as current.
		const endDate = toZonedTime(endUnix, timezone);
		const endDay = formatTz(endDate, 'yyyy-MM-dd', {
			timeZone: timezone,
		}) as DayKey;

		let endMinute: Minute = 1440;
		let stepEndUnix = 0; // The real unix time where this segment ends

		if (day === endDay) {
			const m = endDate.getHours() * 60 + endDate.getMinutes();
			endMinute = m as Minute;
			stepEndUnix = endUnix;
		} else {
			// Ends on a later day.
			// This segment goes to 1440 (end of day).
			endMinute = 1440;
			// Calculate start of next day in UTC to advance loop
			// nextDay is "local" 00:00. date-fns-tz fromZonedTime converts "local" date to UTC timestamp.
			stepEndUnix = fromZonedTime(nextDay, timezone).getTime();
		}

		segments.push({ day, start: startMinute, end: endMinute });
		current = stepEndUnix;
	}
	return segments;
};

export const createHoldManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): HoldManager => {
	return {
		placeHold: async ({
			tenantId,
			resourceId,
			sessionId,
			timezone,
			startUnix,
			endUnix,
			expiresAt,
			clientRef,
			capacity = 1,
		}) => {
			const segments = getSegments(startUnix, endUnix, timezone);
			if (segments.length === 0) return { success: false };

			// Acquire locks for all days involved
			const lockKeys = segments
				.map((s) => `${tenantId}:${resourceId}:${s.day}`)
				.sort();
			const uniqueLockKeys = [...new Set(lockKeys)];

			const releases: (() => void)[] = [];
			try {
				for (const key of uniqueLockKeys) {
					releases.push(await params.withLock(key));
				}

				// 1. Check all segments availability
				// capacity is passed in params, default 1

				for (const segment of segments) {
					const dayMap = params.getState(tenantId, resourceId);
					let dayState = dayMap.get(segment.day);
					if (!dayState) {
						dayState = createBitmapDay(15);
						dayMap.set(segment.day, dayState);
					}
					if (
						!isRangeAvailable(
							dayState.booked,
							dayState.held,
							segment.start as Minute,
							segment.end as Minute,
							capacity,
						)
					) {
						return { success: false };
					}
				}

				// 2. If all free, apply hold
				for (const segment of segments) {
					const dayMap = params.getState(tenantId, resourceId);
					const dayState = dayMap.get(segment.day);
					// Should exist because we created it above
					if (dayState) {
						incrementRange(
							dayState.held,
							segment.start as Minute,
							segment.end as Minute,
						);
					}
				}

				const holdId = ulid() as HoldId;
				params.holds.set(holdId, {
					tenantId,
					resourceId,
					sessionId,
					timezone,
					startUnix,
					endUnix,
					expiresAt,
				});

				const event = createHoldPlacedEvent({
					tenantId,
					resourceId,
					holdId,
					startUnix,
					endUnix,
					expiresAt,
					...(clientRef !== undefined && { clientRef }),
				});

				return { success: true, holdId, event };
			} finally {
				// Release in reverse order
				for (const release of releases.reverse()) {
					release();
				}
			}
		},
		releaseHold: async ({ holdId, sessionId }) => {
			const hold = params.holds.get(holdId);
			if (!hold || hold.sessionId !== sessionId) {
				return { success: false };
			}

			const segments = getSegments(hold.startUnix, hold.endUnix, hold.timezone);
			const lockKeys = segments
				.map((s) => `${hold.tenantId}:${hold.resourceId}:${s.day}`)
				.sort();
			const uniqueLockKeys = [...new Set(lockKeys)];

			const releases: (() => void)[] = [];
			try {
				for (const key of uniqueLockKeys) {
					releases.push(await params.withLock(key));
				}

				// Re-check existence
				const currentHold = params.holds.get(holdId);
				if (!currentHold || currentHold.sessionId !== sessionId) {
					return { success: false };
				}

				for (const segment of segments) {
					const dayMap = params.getState(hold.tenantId, hold.resourceId);
					const dayState = dayMap.get(segment.day);
					if (dayState) {
						decrementRange(
							dayState.held,
							segment.start as Minute,
							segment.end as Minute,
						);
					}
				}

				params.holds.delete(holdId);

				const event = createHoldReleasedEvent({
					tenantId: hold.tenantId,
					resourceId: hold.resourceId,
					holdId,
					startUnix: hold.startUnix,
					endUnix: hold.endUnix,
				});

				return { success: true, event };
			} finally {
				for (const release of releases.reverse()) {
					release();
				}
			}
		},
		releaseHoldsForSession: async (sessionId) => {
			const sessionHolds: HoldId[] = [];
			for (const [id, meta] of params.holds.entries()) {
				if (meta.sessionId === sessionId) {
					sessionHolds.push(id);
				}
			}

			const events: HoldExpiredEvent[] = [];

			for (const holdId of sessionHolds) {
				const hold = params.holds.get(holdId);
				if (!hold) continue;

				const segments = getSegments(
					hold.startUnix,
					hold.endUnix,
					hold.timezone,
				);
				const lockKeys = segments
					.map((s) => `${hold.tenantId}:${hold.resourceId}:${s.day}`)
					.sort();
				const uniqueLockKeys = [...new Set(lockKeys)];

				const releases: (() => void)[] = [];
				try {
					for (const key of uniqueLockKeys) {
						releases.push(await params.withLock(key));
					}

					if (!params.holds.has(holdId)) continue;

					for (const segment of segments) {
						const dayMap = params.getState(hold.tenantId, hold.resourceId);
						const dayState = dayMap.get(segment.day);
						if (dayState) {
							decrementRange(
								dayState.held,
								segment.start as Minute,
								segment.end as Minute,
							);
						}
					}
					params.holds.delete(holdId);

					events.push(
						createHoldExpiredEvent({
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							holdId,
							startUnix: hold.startUnix,
							endUnix: hold.endUnix,
						}),
					);
				} finally {
					for (const release of releases.reverse()) {
						release();
					}
				}
			}
			return events;
		},
	};
};
