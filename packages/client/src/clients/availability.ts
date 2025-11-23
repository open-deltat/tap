import { API_ROUTES, type AvailabilityPostResponse } from '@tap/protocol';
import { format } from 'date-fns';
import { format as formatTz, fromZonedTime } from 'date-fns-tz';
import type { TimeSlot } from '../types';

export type { TimeSlot as AvailabilitySlot } from '../types';

export type GetAvailabilityOptions = {
	date: Date;
	timezone?: string;
	durationMs?: number; // default 60 * 60000 (1 hour)
	fromHour?: number; // default 0
	toHour?: number; // default 24
};

export type GetMonthlyAvailabilityOptions = {
	date: Date; // Any date in the month
	timezone?: string;
	durationMs?: number;
};

export type AvailabilityResult = {
	slots: TimeSlot[];
	asOfEventId: string | null;
};

export class AvailabilityClient {
	constructor(
		private apiBaseUrl: string,
		private tenantId: string,
		private resourceId: string,
	) {}

	async getAvailability(
		options: GetAvailabilityOptions,
	): Promise<AvailabilityResult> {
		const {
			date,
			timezone,
			durationMs = 60 * 60000,
			fromHour = 0,
			toHour = 24,
		} = options;

		let fromDate: Date;
		let toDate: Date;

		if (timezone) {
			// If we have a timezone, we interpret 'date' (which is a local date object from Calendar)
			// as "The day YYYY-MM-DD in the target timezone".
			const dateStr = format(date, 'yyyy-MM-dd');

			// Use strictly ISO format for fromZonedTime: YYYY-MM-DDTHH:mm:ss
			const startStr = `${dateStr}T${fromHour.toString().padStart(2, '0')}:00:00`;

			fromDate = fromZonedTime(startStr, timezone);

			if (toHour === 24) {
				const nextDay = new Date(date);
				nextDay.setDate(nextDay.getDate() + 1);
				const nextDayStr = format(nextDay, 'yyyy-MM-dd');
				toDate = fromZonedTime(`${nextDayStr}T00:00:00`, timezone);
			} else {
				const endStr = `${dateStr}T${toHour.toString().padStart(2, '0')}:00:00`;
				toDate = fromZonedTime(endStr, timezone);
			}
		} else {
			// Legacy local fallback
			fromDate = new Date(date);
			fromDate.setHours(fromHour, 0, 0, 0);
			toDate = new Date(date);
			toDate.setHours(toHour, 0, 0, 0);
		}

		const body = {
			tenantId: this.tenantId,
			resourceId: this.resourceId,
			from: fromDate.toISOString(),
			to: toDate.toISOString(),
			slotDurationMs: durationMs,
		};

		const response = await fetch(
			`${this.apiBaseUrl}${API_ROUTES.AVAILABILITY}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status}`);
		}

		const data = (await response.json()) as AvailabilityPostResponse;

		return {
			slots: data.freeSlots.map((s) => ({
				start: s.start,
				end: s.end,
			})),
			asOfEventId: data.asOfEventId,
		};
	}

	async getMonthlyAvailability(
		options: GetMonthlyAvailabilityOptions,
	): Promise<Set<string>> {
		const { date, timezone, durationMs = 60 * 60000 } = options;

		// Fetch a slightly wider range to cover calendar grid (prev/next month days)
		const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
		const startOfGrid = new Date(startOfMonth);
		startOfGrid.setDate(startOfGrid.getDate() - 7); // -7 days buffer

		const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
		const endOfGrid = new Date(endOfMonth);
		endOfGrid.setDate(endOfGrid.getDate() + 7); // +7 days buffer
		endOfGrid.setHours(23, 59, 59, 999);

		const body = {
			tenantId: this.tenantId,
			resourceId: this.resourceId,
			from: startOfGrid.toISOString(),
			to: endOfGrid.toISOString(),
			slotDurationMs: durationMs,
		};

		const response = await fetch(
			`${this.apiBaseUrl}${API_ROUTES.AVAILABILITY}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch month availability: ${response.status}`);
		}

		const data = (await response.json()) as AvailabilityPostResponse;
		const days = new Set<string>();

		for (const slot of data.freeSlots) {
			let dateKey: string;
			if (timezone) {
				dateKey = formatTz(new Date(slot.start), 'yyyy-MM-dd', {
					timeZone: timezone,
				});
			} else {
				dateKey = formatTz(new Date(slot.start), 'yyyy-MM-dd');
			}
			if (dateKey) days.add(dateKey);
		}

		return days;
	}
}
