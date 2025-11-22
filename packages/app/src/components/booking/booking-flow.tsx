'use client';

import type { LedgerEvent } from '@tap/core';
import { createSlotId } from '@tap/protocol';
import * as React from 'react';
import {
	type AvailabilitySlot,
	useAvailability,
} from '@/hooks/use-availability';
import { useAvailabilityStream } from '@/hooks/use-availability-stream';
import { useBooking } from '@/hooks/use-booking';
import { useHoldStream } from '@/hooks/use-hold-stream';
import { format, fromUnixTimestamp } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { BookingForm } from './booking-form';
import { DatePickerSection } from './date-picker-section';
import { SlotsView } from './slots-view';

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
	}) => {
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			() => new Date(),
		);
		const [activeHold, setActiveHold] = React.useState<{
			holdId: string;
			sessionId: string;
			expiresAt: number;
			slot: AvailabilitySlot;
		} | null>(null);

		// UI States
		const [view, setView] = React.useState<'slots' | 'booking'>('slots');
		const [holdExpirationCountdown, setHoldExpirationCountdown] =
			React.useState<number | null>(null);

		// Availability
		const {
			slots,
			isLoading,
			error,
			refresh,
			applyDelta,
			availableDays,
			refreshMonth,
			debugLogs,
		} = useAvailability({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			selectedDate,
			durationMs,
			fromHour,
			toHour,
		});

		// Availability Stream (Deltas)
		useAvailabilityStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			enabled: true,
			onDelta: (event: LedgerEvent) => {
				applyDelta(event);

				// If our hold expired/released remotely
				if (activeHold) {
					if (
						event.type === 'HoldExpired' &&
						event.payload.holdId === activeHold.holdId
					) {
						setActiveHold(null);
						setView('slots');
					}
					if (
						event.type === 'HoldReleased' &&
						event.payload.holdId === activeHold.holdId
					) {
						setActiveHold(null);
						setView('slots');
					}
				}
			},
		});

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
				refresh();
			},
			onError: (error) => {
				console.error('Booking error:', error);
			},
		});

		// Refresh month availability when month changes
		const handleMonthChange = React.useCallback(
			(date: Date) => {
				refreshMonth(date);
			},
			[refreshMonth],
		);

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
			async (slot: AvailabilitySlot) => {
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
			const date = fromUnixTimestamp(timestamp);
			return format(date, 'h:mm a');
		};

		const formatCountdown = (ms: number): string => {
			const seconds = Math.ceil(ms / 1000);
			return `${seconds}s`;
		};

		const displayedSlots = React.useMemo(() => {
			if (!selectedDate) return [];

			const list = [];
			const resolutionMs = durationMs || 60 * 60000;

			// 1. Generate ALL possible slots for the day based on fromHour/toHour
			const dayStart = new Date(selectedDate);
			dayStart.setHours(fromHour, 0, 0, 0);
			const dayEnd = new Date(selectedDate);
			dayEnd.setHours(toHour, 0, 0, 0);

			let current = dayStart.getTime();
			const end = dayEnd.getTime();

			while (current + resolutionMs <= end) {
				const slotStart = current;
				const slotEnd = current + resolutionMs;

				// 2. Check if this specific range is fully covered by an available slot
				// We look for ANY available slot that completely contains [slotStart, slotEnd]
				// (Since slots from store are merged free ranges)
				const isAvailable = slots.some(
					(s) => s.start <= slotStart && s.end >= slotEnd,
				);

				list.push({
					start: slotStart,
					end: slotEnd,
					available: isAvailable,
				});

				current += resolutionMs;
			}

			// If there is an active hold, ensure its slot is marked available (or specially handled)
			// The hold actually CONSUMES availability, so it might not be in `slots` anymore.
			// But for the user who HOLDS it, it should be visible/selected.
			if (activeHold) {
				// Find the slot in our list that matches the hold
				const holdSlotIndex = list.findIndex(
					(s) => s.start === activeHold.slot.start,
				);
				if (holdSlotIndex !== -1) {
					// It exists in the grid.
					// If it's my hold, it should be interactable?
					// Actually the UI handles activeHold state separately in the view.
					// But we should make sure it renders as "available" in the list logic if we want to show it?
					// Wait, if I hold it, I am in "booking" view, so this list isn't shown.
					// If I release it, it goes back to being available (via WS delta).
					// So we probably don't need to force it here for the *list* view.
				}
			}

			return list;
		}, [slots, activeHold, durationMs, selectedDate, fromHour, toHour]);

		return (
			<div
				className={cn('flex flex-col md:flex-row gap-4 h-[500px]', className)}
			>
				<div className="w-full md:w-[320px] bg-background border rounded-xl shadow-sm overflow-hidden">
					<DatePickerSection
						selectedDate={selectedDate}
						onSelectDate={(date) => {
							setSelectedDate(date);
							if (activeHold) handleReleaseHold();
						}}
						onMonthChange={handleMonthChange}
						availableDays={availableDays}
						isLoading={isLoading}
					/>
				</div>

				<div className="flex-1 relative bg-background border rounded-xl shadow-sm overflow-hidden flex flex-col">
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
						<SlotsView
							selectedDate={selectedDate}
							isLoading={isLoading}
							error={error}
							displayedSlots={displayedSlots}
							onSlotClick={handleSlotClick}
							formatTime={formatTime}
						/>
					)}
				</div>

				{/* Debug Panel (Optional Toggle) */}
				{debugLogs.length > 0 && (
					<div className="hidden">
						{debugLogs.map((log, i) => (
							<div key={`${i}-${log.length}`}>{log}</div>
						))}
					</div>
				)}
			</div>
		);
	},
);

BookingFlow.displayName = 'BookingFlow';
