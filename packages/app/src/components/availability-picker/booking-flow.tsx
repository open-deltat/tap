'use client';

import { createSlotId } from '@tap/protocol';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useBooking } from '../availability-picker/hooks/use-booking';
import { useHoldStream } from '../availability-picker/hooks/use-hold-stream';
import { AvailabilityPicker, type TimeRange, useClientTimezone } from '.';
import { BookingForm } from './booking-form';

export type BookingFlowProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	slotResolutionMinutes?: number;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	onBookingConfirmed?: (bookingId: string) => void;
	className?: string;
	initialTimezone?: string;
	onTimezoneChange?: (timezone: string) => void;
};

export const BookingFlow = React.memo<BookingFlowProps>(
	({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		durationMs = 60 * 60000,
		fromHour = 0,
		toHour = 24,
		onBookingConfirmed,
		className,
		initialTimezone,
		onTimezoneChange,
	}) => {
		const { timezone, setTimezone } = useClientTimezone(initialTimezone);

		const handleTimezoneChange = React.useCallback(
			(newTimezone: string) => {
				setTimezone(newTimezone);
				onTimezoneChange?.(newTimezone);
			},
			[setTimezone, onTimezoneChange],
		);

		React.useEffect(() => {
			onTimezoneChange?.(timezone);
		}, [timezone, onTimezoneChange]);

		const [activeHold, setActiveHold] = React.useState<{
			holdId: string;
			sessionId: string;
			expiresAt: number;
			slot: TimeRange;
		} | null>(null);

		// UI States
		const [view, setView] = React.useState<'slots' | 'booking'>('slots');
		const [holdExpirationCountdown, setHoldExpirationCountdown] =
			React.useState<number | null>(null);

		// Hold Manager
		const {
			sessionId: currentSessionId,
			placeHold: placeHoldWS,
			releaseHold: releaseHoldWS,
		} = useHoldStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
		});

		// Booking
		const {
			confirmBooking,
			isConfirming,
			error: bookingError,
		} = useBooking({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			onSuccess: (bookingId) => {
				setActiveHold(null);
				setView('slots');
				onBookingConfirmed?.(bookingId);
			},
			onError: (error) => {
				console.error('Booking error:', error);
			},
		});

		// Cleanup hold on unmount/change
		React.useEffect(() => {
			return () => {
				if (activeHold) {
					releaseHoldWS(activeHold.holdId);
				}
			};
		}, [activeHold, releaseHoldWS]);

		// Countdown
		React.useEffect(() => {
			if (activeHold) {
				const updateCountdown = () => {
					const remaining = Math.max(0, activeHold.expiresAt - Date.now());
					setHoldExpirationCountdown(remaining);
					if (remaining === 0) {
						setActiveHold(null);
						setView('slots');
					}
				};
				updateCountdown();
				const interval = setInterval(updateCountdown, 1000);
				return () => clearInterval(interval);
			} else {
				setHoldExpirationCountdown(null);
			}
		}, [activeHold]);

		const handleSlotClick = React.useCallback(
			async (slot: TimeRange) => {
				try {
					const slotId = createSlotId(new Date(slot.start), new Date(slot.end));

					const holdId = await placeHoldWS({ slotId });

					setActiveHold({
						holdId,
						sessionId: '', // We'll read currentSessionId from the hook scope on submit
						slot,
						expiresAt: Date.now() + 60000, // 60s
					});
					setView('booking');
				} catch (e) {
					console.error('Failed to place hold', e);
				}
			},
			[placeHoldWS],
		);

		const handleReleaseHold = React.useCallback(() => {
			if (activeHold) {
				releaseHoldWS(activeHold.holdId);
				setActiveHold(null);
				setView('slots');
			}
		}, [activeHold, releaseHoldWS]);

		const handleConfirmBooking = React.useCallback(
			async (params: {
				slotId: string;
				customerName: string;
				customerEmail: string;
				customerPhone: string;
			}) => {
				if (!activeHold || !currentSessionId) return;

				await confirmBooking({
					slotId: params.slotId,
					holdId: activeHold.holdId,
					sessionId: currentSessionId,
					customerName: params.customerName,
					customerEmail: params.customerEmail,
					customerPhone: params.customerPhone || undefined,
				});
			},
			[activeHold, currentSessionId, confirmBooking],
		);

		const formatTime = (timestamp: number): string => {
			const date = new Date(timestamp);
			return new Intl.DateTimeFormat('en-US', {
				hour: 'numeric',
				minute: 'numeric',
				hour12: true,
				timeZone: timezone,
			}).format(date);
		};

		const formatCountdown = (ms: number): string => {
			const seconds = Math.ceil(ms / 1000);
			return `${seconds}s`;
		};

		return (
			<div
				className={cn(
					'flex flex-col gap-0 h-auto md:h-[600px] border rounded-3xl overflow-hidden shadow-sm bg-background relative',
					className,
				)}
			>
				{view === 'booking' && activeHold ? (
					<BookingForm
						activeHold={activeHold}
						bookingError={bookingError}
						isConfirming={isConfirming}
						onReleaseHold={handleReleaseHold}
						onConfirmBooking={handleConfirmBooking}
						formatTime={formatTime}
						formatCountdown={formatCountdown}
						holdExpirationCountdown={holdExpirationCountdown}
					/>
				) : (
					<AvailabilityPicker
						apiBaseUrl={apiBaseUrl}
						tenantSlug={tenantSlug}
						resourceSlug={resourceSlug}
						durationMs={durationMs}
						fromHour={fromHour}
						toHour={toHour}
						initialTimezone={initialTimezone}
						timezone={timezone}
						onTimezoneChange={handleTimezoneChange}
						onSlotSelect={handleSlotClick}
						className="border-none shadow-none h-full"
					/>
				)}
			</div>
		);
	},
);

BookingFlow.displayName = 'BookingFlow';
