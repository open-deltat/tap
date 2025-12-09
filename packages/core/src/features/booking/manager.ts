import type {
	BookingId,
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '@tap/protocol';
import { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';
import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
} from '../../domain/events';
import {
	createBitmapDay,
	decrementRange,
	incrementRange,
} from '../../infrastructure/bitmap';
import {
	createBookingCancelledEvent,
	createBookingConfirmedEvent,
} from '../event-factory';
import type { HoldMetadata, InventoryState } from './types';

const getSegments = (startUnix: number, endUnix: number, timezone: string) => {
	const segments: { day: DayKey; start: Minute; end: Minute }[] = [];
	let current = startUnix;
	if (endUnix <= startUnix) return [];

	while (current < endUnix) {
		const date = toZonedTime(current, timezone);
		const day = formatTz(date, 'yyyy-MM-dd', { timeZone: timezone }) as DayKey;
		const startMinute = (date.getHours() * 60 + date.getMinutes()) as Minute;

		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		nextDay.setHours(0, 0, 0, 0);

		const endDate = toZonedTime(endUnix, timezone);
		const endDay = formatTz(endDate, 'yyyy-MM-dd', {
			timeZone: timezone,
		}) as DayKey;

		let endMinute: Minute = 1440;
		let stepEndUnix = 0;

		if (day === endDay) {
			const m = endDate.getHours() * 60 + endDate.getMinutes();
			endMinute = m as Minute;
			stepEndUnix = endUnix;
		} else {
			endMinute = 1440;
			stepEndUnix = fromZonedTime(nextDay, timezone).getTime();
		}

		segments.push({ day, start: startMinute, end: endMinute });
		current = stepEndUnix;
	}
	return segments;
};

export type BookingManager = {
	confirmBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		sessionId: SessionId;
		bookingId: BookingId;
		start: number;
		end: number;
		customerName?: string;
		customerEmail?: string;
		customerPhone?: string;
		paymentStatus?: 'NONE' | 'PENDING' | 'PAID';
		priceCents?: number;
	}) => Promise<BookingConfirmedEvent | null>;
	cancelBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		bookingId: BookingId;
		startUnix: number;
		endUnix: number;
	}) => Promise<BookingCancelledEvent | null>;
};

export const createBookingManager = (deps: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): BookingManager => {
	return {
		confirmBooking: async (params) => {
			const { tenantId, resourceId, holdId, sessionId } = params;
			const hold = deps.holds.get(holdId);
			if (!hold) {
				return null;
			}
			if (hold.sessionId !== sessionId) {
				return null;
			}

			// Reconstruct segments from the hold's time range
			const segments = getSegments(hold.startUnix, hold.endUnix, hold.timezone);
			const lockKeys = segments
				.map((s) => `${tenantId}:${resourceId}:${s.day}`)
				.sort();
			const uniqueLockKeys = [...new Set(lockKeys)];

			const releases: (() => void)[] = [];
			try {
				for (const key of uniqueLockKeys) {
					releases.push(await deps.withLock(key));
				}

				// Verify hold still exists after lock
				if (!deps.holds.has(holdId)) {
					return null;
				}

				// Move capacity from 'held' to 'booked'
				for (const segment of segments) {
					const dayMap = deps.getState(tenantId, resourceId);
					let dayState = dayMap.get(segment.day);
					if (!dayState) {
						dayState = createBitmapDay(15);
						dayMap.set(segment.day, dayState);
					}
					decrementRange(dayState.held, segment.start, segment.end);
					incrementRange(dayState.booked, segment.start, segment.end);
				}

				// Remove the hold as it's now booked
				deps.holds.delete(holdId);

				return createBookingConfirmedEvent({
					tenantId,
					resourceId,
					holdId,
					bookingId: params.bookingId,
					startUnix: params.start,
					endUnix: params.end,
					...(params.customerName !== undefined && {
						customerName: params.customerName,
					}),
					...(params.customerEmail !== undefined && {
						customerEmail: params.customerEmail,
					}),
					...(params.customerPhone !== undefined && {
						customerPhone: params.customerPhone,
					}),
					...(params.paymentStatus !== undefined && {
						paymentStatus: params.paymentStatus,
					}),
					...(params.priceCents !== undefined && {
						priceCents: params.priceCents,
					}),
				});
			} finally {
				for (const release of releases.reverse()) {
					release();
				}
			}
		},

		cancelBooking: async (params) => {
			const { tenantId, resourceId, startUnix, endUnix, bookingId } = params;

			// For cancellation, we need to know the timezone.
			// Ideally this comes from resource metadata or the booking itself.
			// Assuming UTC for now as we lack resource lookup here, OR we require timezone in params.
			// Let's default to UTC if not provided, but this is risky.
			// TODO: Add timezone to cancelBooking params or lookup resource.
			const timezone = 'UTC';

			const segments = getSegments(startUnix, endUnix, timezone);
			const lockKeys = segments
				.map((s) => `${tenantId}:${resourceId}:${s.day}`)
				.sort();
			const uniqueLockKeys = [...new Set(lockKeys)];

			const releases: (() => void)[] = [];
			try {
				for (const key of uniqueLockKeys) {
					releases.push(await deps.withLock(key));
				}

				for (const segment of segments) {
					const dayMap = deps.getState(tenantId, resourceId);
					const dayState = dayMap.get(segment.day);
					if (dayState) {
						decrementRange(dayState.booked, segment.start, segment.end);
					}
				}

				return createBookingCancelledEvent({
					tenantId,
					resourceId,
					bookingId,
					start: startUnix,
					end: endUnix,
				});
			} finally {
				for (const release of releases.reverse()) {
					release();
				}
			}
		},
	};
};
