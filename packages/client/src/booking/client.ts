import {
	API_ROUTES,
	type BookPostRequestBody,
	type BookPostResponse,
	type HoldId,
	type ResourceId,
	type SessionId,
	type SlotId,
	type TenantId,
} from '@tap/protocol';

export type BookingClientOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export type ConfirmBookingParams = {
	slotId: string;
	holdId: string;
	sessionId: string;
	customerName: string;
	customerEmail: string;
	customerPhone?: string;
};

export class BookingClient {
	constructor(private options: BookingClientOptions) {}

	async confirmBooking(params: ConfirmBookingParams): Promise<string> {
		const { apiBaseUrl, tenantSlug, resourceSlug } = this.options;

		const body: BookPostRequestBody = {
			tenantId: tenantSlug as TenantId,
			resourceId: resourceSlug as ResourceId,
			slotId: params.slotId as SlotId,
			holdId: params.holdId as HoldId,
			holdSessionId: params.sessionId as SessionId,
			customer: {
				name: params.customerName,
				email: params.customerEmail,
				phone: params.customerPhone,
			},
		};

		const response = await fetch(`${apiBaseUrl}${API_ROUTES.BOOK}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({
				error: response.statusText,
			}));
			throw new Error(
				errorData.error?.message || `Failed to book: ${response.status}`,
			);
		}

		const data = (await response.json()) as BookPostResponse;
		return data.bookingId;
	}
}
