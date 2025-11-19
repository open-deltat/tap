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
	placeHold: (slot: { start: number; end: number }) => Promise<string | null>;
	releaseHold: (holdId: string) => Promise<boolean>;
	confirmBooking: (params: {
		holdId: string;
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}) => Promise<string | null>;
	isPlacingHold: boolean;
	isReleasingHold: boolean;
	isConfirming: boolean;
	error: Error | null;
};

export const useBooking = (options: UseBookingOptions): UseBookingResult => {
	const { apiBaseUrl, tenantSlug, resourceSlug, onSuccess, onError } = options;
	const [isPlacingHold, setIsPlacingHold] = useState(false);
	const [isReleasingHold, setIsReleasingHold] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const placeHold = async (slot: {
		start: number;
		end: number;
	}): Promise<string | null> => {
		setIsPlacingHold(true);
		setError(null);

		try {
			const response = await fetch(
				`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						start: slot.start,
						end: slot.end,
					}),
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					error: response.statusText,
				}));
				throw new Error(
					errorData.error || `Failed to place hold: ${response.status}`,
				);
			}

			const data = (await response.json()) as { holdId: string };
			return data.holdId;
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error');
			setError(error);
			onError?.(error);
			return null;
		} finally {
			setIsPlacingHold(false);
		}
	};

	const releaseHold = async (holdId: string): Promise<boolean> => {
		setIsReleasingHold(true);
		setError(null);

		try {
			const response = await fetch(
				`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdId}`,
				{
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
					},
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					error: response.statusText,
				}));
				throw new Error(
					errorData.error || `Failed to release hold: ${response.status}`,
				);
			}

			return true;
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error');
			setError(error);
			onError?.(error);
			return false;
		} finally {
			setIsReleasingHold(false);
		}
	};

	const confirmBooking = async (params: {
		holdId: string;
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
		placeHold,
		releaseHold,
		confirmBooking,
		isPlacingHold,
		isReleasingHold,
		isConfirming,
		error,
	};
};
