'use client';

import { BookingClient } from '@tap/client';
import { useMemo, useState } from 'react';

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

	const client = useMemo(
		() =>
			new BookingClient({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
			}),
		[apiBaseUrl, tenantSlug, resourceSlug],
	);

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
			const bookingId = await client.confirmBooking(params);
			onSuccess?.(bookingId);
			return bookingId;
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
