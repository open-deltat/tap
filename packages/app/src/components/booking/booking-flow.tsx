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
import { useClientTimezone } from '@/hooks/use-client-timezone';
import { useHoldStream } from '@/hooks/use-hold-stream';
import {
	format,
	fromDayKey,
	fromUnixTimestamp,
	fromZonedTime,
} from '@/lib/timezone';
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
	initialTimezone?: string;
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
	}) => {
		// Start with no selected date to allow auto-selection of first available day
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			undefined,
		);

		// Use the new hook for timezone management
		const {
			timezone,
			setTimezone,
			format: formatTz,
		} = useClientTimezone(initialTimezone);

		const [activeHold, setActiveHold] = React.useState<{
			holdId: string;
			sessionId: string;
			expiresAt: number;
			slot: AvailabilitySlot;
		} | null>(null);

		const [lastEvent, setLastEvent] = React.useState<LedgerEvent | null>(null);

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
		} = useAvailability({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			selectedDate,
			durationMs,
			fromHour,
			toHour,
			timezone,
		});

		// Auto-select first available day when availableDays updates and no date is selected
		React.useEffect(() => {
			if (!selectedDate && availableDays.size > 0) {
				const sortedDays = Array.from(availableDays).sort();

				// Filter out past days using local comparison to today
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const todayStr = format(today, 'yyyy-MM-dd');

				// We assume availableDays are in YYYY-MM-DD format
				// We want to filter for days >= todayStr
				const futureDays = sortedDays.filter((day) => day >= todayStr);

				if (futureDays.length > 0) {
					const firstDay = futureDays[0];
					if (firstDay) {
						const date = fromDayKey(firstDay);
						setSelectedDate(date);
					}
				}
			}
		}, [availableDays, selectedDate]);

		// Availability Stream (Deltas)
		useAvailabilityStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			enabled: true,
			onDelta: (event: LedgerEvent) => {
				applyDelta(event);
				setLastEvent(event);

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
			return formatTz(date, 'h:mm a');
		};

		const formatCountdown = (ms: number): string => {
			const seconds = Math.ceil(ms / 1000);
			return `${seconds}s`;
		};

		const displayedSlots = React.useMemo(() => {
			if (!selectedDate) return [];

			const list = [];
			const resolutionMs = durationMs || 60 * 60000;

			// 1. Generate ALL possible slots for the day based on fromHour/toHour in the TARGET timezone
			// selectedDate is a local Date object, e.g., Nov 24 at 00:00 local time.
			// We extract the date string "2025-11-24"
			const dateStr = format(selectedDate, 'yyyy-MM-dd');

			// Create start timestamp: YYYY-MM-DD at 00:00:00 in target timezone (Always start at midnight)
			const startStr = `${dateStr}T00:00:00`;

			let startTime: number;
			let endTime: number;

			try {
				// startStr is e.g. 2025-11-24T00:00:00
				// fromZonedTime interprets this as 00:00 in NY (UTC-5) -> 05:00 UTC
				startTime = fromZonedTime(startStr, timezone).getTime();

				// Always generate 24 hours from start
				const nextDay = new Date(selectedDate);
				nextDay.setDate(nextDay.getDate() + 1);
				const nextDayStr = format(nextDay, 'yyyy-MM-dd');
				endTime = fromZonedTime(`${nextDayStr}T00:00:00`, timezone).getTime();
			} catch (e) {
				console.error('Timezone conversion error', e);
				return [];
			}

			let current = startTime;
			const end = endTime;

			while (current + resolutionMs <= end) {
				const slotStart = current;
				const slotEnd = current + resolutionMs;

				// 2. Check if this specific range is fully covered by an available slot
				// We look for ANY available slot that completely contains [slotStart, slotEnd]
				// (Since slots from store are merged free ranges)
				const isAvailable = slots.some(
					(s) => s.start <= slotStart && s.end >= slotEnd,
				);

				let isReleased = false;
				if (lastEvent?.type === 'HoldReleased' && lastEvent.payload.startUnix) {
					const evStart = lastEvent.payload.startUnix;
					const evEnd = lastEvent.payload.endUnix || evStart;

					// Check if event overlaps with slot
					if (Math.max(slotStart, evStart) < Math.min(slotEnd, evEnd)) {
						isReleased = true;
					}
				}

				list.push({
					start: slotStart,
					end: slotEnd,
					available: isAvailable,
					isReleased,
				});

				current += resolutionMs;
			}

			return list;
		}, [slots, durationMs, selectedDate, timezone, lastEvent]);

		return (
			<div
				className={cn(
					'flex flex-col md:flex-row gap-4 h-auto md:h-[500px]',
					className,
				)}
			>
				<div className="w-full md:w-[320px] bg-background border rounded-3xl shadow-sm overflow-hidden shrink-0">
					<DatePickerSection
						selectedDate={selectedDate}
						onSelectDate={(date) => {
							setSelectedDate(date);
							if (activeHold) handleReleaseHold();
						}}
						onMonthChange={handleMonthChange}
						availableDays={availableDays}
						isLoading={isLoading}
						timezone={timezone}
						onTimezoneChange={setTimezone}
					/>
				</div>

				<div className="flex-1 relative bg-background border rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-[300px] md:min-h-0">
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
							timezone={timezone}
							formatDate={formatTz}
						/>
					)}
				</div>
			</div>
		);
	},
);

BookingFlow.displayName = 'BookingFlow';
