import {
	API_ROUTES,
	type AvailabilityPostRequestBody,
	type AvailabilityPostResponse,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import { format as formatTz } from 'date-fns-tz';

export type GetAvailabilityParams = Omit<
	AvailabilityPostRequestBody,
	'tenantId' | 'resourceId'
>;

export class AvailabilityClient {
	constructor(
		private apiBaseUrl: string,
		private tenantId: string,
		private resourceId: string,
	) {}

	async getAvailability(
		params: GetAvailabilityParams,
	): Promise<AvailabilityPostResponse> {
		const body: AvailabilityPostRequestBody = {
			tenantId: this.tenantId as TenantId,
			resourceId: this.resourceId as ResourceId,
			...params,
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

		return (await response.json()) as AvailabilityPostResponse;
	}

	/**
	 * Extracts available days (YYYY-MM-DD) from a set of slots.
	 * This logic is client-specific (presentation), but useful to have near the fetcher.
	 */
	extractAvailableDays(
		slots: AvailabilityPostResponse['freeSlots'],
		timezone?: string,
	): Set<string> {
		const days = new Set<string>();
		for (const slot of slots) {
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
