'use client';

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
		holdId: string;
		sessionId: string;
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}): Promise<string | null> => {
		setIsConfirming(true);
		setError(null);

		try {
			const response = await fetch(
				`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Tap-Session-Id': params.sessionId,
					},
					body: JSON.stringify({
						holdId: params.holdId,
						customerName: params.customerName,
						customerEmail: params.customerEmail,
						customerPhone: params.customerPhone,
					}),
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					error: response.statusText,
				}));
				throw new Error(
					errorData.error || `Failed to book: ${response.status}`,
				);
			}

			const data = (await response.json()) as { bookingId: string };
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
