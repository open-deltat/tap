'use client';

import type {
	BookPostRequestBody,
	BookPostResponse,
	HoldId,
	ResourceId,
	SessionId,
	SlotId,
	TenantId,
} from '@tap/protocol';
import { useState } from 'react';

export type UseBookingOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	onSuccess?: (bookingId: string) => void;
	onError?: (error: Error) => void;
};

export type UseBookingResult = {
	confirmBooking: (params: {
		slotId: string;
		holdId: string;
		sessionId: string;
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}) => Promise<string | null>;
	isConfirming: boolean;
	error: Error | null;
};

export const useBooking = (options: UseBookingOptions): UseBookingResult => {
	const { apiBaseUrl, tenantSlug, resourceSlug, onSuccess, onError } = options;
	const [isConfirming, setIsConfirming] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const confirmBooking = async (params: {
		slotId: string;
		holdId: string;
		sessionId: string;
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}): Promise<string | null> => {
		setIsConfirming(true);
		setError(null);

		try {
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

			const response = await fetch(`${apiBaseUrl}/book`, {
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
			onSuccess?.(data.bookingId);
			return data.bookingId;
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error');
			setError(error);
			onError?.(error);
			return null;
		} finally {
			setIsConfirming(false);
		}
	};

	return {
		confirmBooking,
		isConfirming,
		error,
	};
};
