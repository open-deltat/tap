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

		const url = `${this.apiBaseUrl}${API_ROUTES.AVAILABILITY}`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				throw new Error(
					`API request failed: ${response.status} ${response.statusText}. ${errorText}`,
				);
			}

			return (await response.json()) as AvailabilityPostResponse;
		} catch (error) {
			if (error instanceof TypeError && error.message === 'Failed to fetch') {
				throw new Error(
					`Unable to connect to API at ${url}. Make sure the API server is running.`,
				);
			}
			throw error;
		}
	}

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
