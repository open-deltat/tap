'use client';

import { BookingManager } from '@tap/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

	const manager = useMemo(
		() =>
			new BookingManager({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
				onSuccess,
				onError,
			}),
		[apiBaseUrl, tenantSlug, resourceSlug, onSuccess, onError],
	);

	const [state, setState] = useState(() => manager.getState());

	useEffect(() => {
		manager.setCallbacks({
			onStateChange: (newState) => {
				setState(newState);
			},
		});
	}, [manager]);

	const confirmBooking = useCallback(
		async (params: {
			slotId: string;
			holdId: string;
			sessionId: string;
			customerName: string;
			customerEmail: string;
			customerPhone?: string;
		}): Promise<string | null> => {
			return await manager.confirmBooking(params);
		},
		[manager],
	);

	return {
		confirmBooking,
		isConfirming: state.isConfirming,
		error: state.error,
	};
};
