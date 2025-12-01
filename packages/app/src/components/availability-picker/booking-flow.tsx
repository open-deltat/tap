'use client';

import { generateDisplayedSlots } from '@tap/client';
import type { LedgerEvent } from '@tap/core';
import { createSlotId } from '@tap/protocol';
import { ArrowLeft, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { format, fromDayKey } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { BookingConfirmation } from './booking-confirmation';
import { DatePickerSection as Calendar } from './calendar';
import { useAvailability } from './hooks/use-availability';
import { useAvailabilityStream } from './hooks/use-availability-stream';
import { useBooking } from './hooks/use-booking';
import { useClientTimezone } from './hooks/use-client-timezone';
import { useHoldStream } from './hooks/use-hold-stream';
import { SlotGrid } from './slot-grid';
import { TimezoneSelector as TimezoneSelect } from './timezone-select';

export type BookingFlowProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	onBookingConfirmed?: (bookingId: string) => void;
	className?: string;
	initialTimezone?: string;
	onTimezoneChange?: (timezone: string) => void;
};

type ActiveHold = {
	holdId: string;
	sessionId: string;
	expiresAt: number;
	slot: { start: number; end: number };
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
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			undefined,
		);
		const [lastEvent, setLastEvent] = React.useState<LedgerEvent | null>(null);
		const [activeHold, setActiveHold] = React.useState<ActiveHold | null>(null);
		const [holdCountdown, setHoldCountdown] = React.useState<number | null>(
			null,
		);
		const [isPlacingHold, setIsPlacingHold] = React.useState(false);
		const selectedDateKeyRef = React.useRef<string | null>(null);

		const handleTimezoneChange = React.useCallback(
			(newTimezone: string) => {
				setTimezone(newTimezone);
				onTimezoneChange?.(newTimezone);
			},
			[setTimezone, onTimezoneChange],
		);

		const { slots, isLoading, error, applyDelta, availableDays, refreshMonth } =
			useAvailability({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
				selectedDate,
				durationMs,
				fromHour,
				toHour,
				timezone,
			});

		React.useEffect(() => {
			if (!selectedDate && availableDays.size > 0) {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const todayStr = format(today, 'yyyy-MM-dd');
				const futureDays = Array.from(availableDays)
					.sort()
					.filter((day) => day >= todayStr);
				if (futureDays[0]) {
					setSelectedDate(fromDayKey(futureDays[0]));
				}
			}
		}, [availableDays, selectedDate]);

		useAvailabilityStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			enabled: true,
			onDelta: (event: LedgerEvent) => {
				applyDelta(event);
				setLastEvent(event);
			},
		});

		const { placeHold, releaseHold } = useHoldStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
		});

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
				onBookingConfirmed?.(bookingId);
			},
			onError: console.error,
		});

		React.useEffect(() => {
			return () => {
				if (activeHold) releaseHold(activeHold.holdId);
			};
		}, [activeHold, releaseHold]);

		React.useEffect(() => {
			if (!activeHold) {
				setHoldCountdown(null);
				return;
			}
			const update = () => {
				const remaining = Math.max(0, activeHold.expiresAt - Date.now());
				setHoldCountdown(remaining);
				if (remaining === 0) setActiveHold(null);
			};
			update();
			const interval = setInterval(update, 1000);
			return () => clearInterval(interval);
		}, [activeHold]);

		const currentDateKey = selectedDate
			? format(selectedDate, 'yyyy-MM-dd')
			: null;

		const displayedSlots = React.useMemo(() => {
			if (!selectedDate) return [];
			return generateDisplayedSlots(
				selectedDate,
				slots,
				timezone,
				durationMs,
				lastEvent,
			);
		}, [slots, durationMs, selectedDate, timezone, lastEvent]);

		const handleDateSelect = React.useCallback(
			(date: Date | undefined) => {
				if (activeHold) {
					releaseHold(activeHold.holdId);
					setActiveHold(null);
				}
				setSelectedDate(date);
			},
			[activeHold, releaseHold],
		);

		const handleSlotClick = React.useCallback(
			async (slot: { start: number; end: number }) => {
				if (isPlacingHold) return;
				setIsPlacingHold(true);
				try {
					const slotId = createSlotId(new Date(slot.start), new Date(slot.end));
					const { holdId, sessionId } = await placeHold({ slotId });
					setActiveHold({
						holdId,
						sessionId,
						slot,
						expiresAt: Date.now() + 60000,
					});
				} catch (e) {
					console.error('Failed to place hold', e);
				} finally {
					setIsPlacingHold(false);
				}
			},
			[placeHold, isPlacingHold],
		);

		const handleBack = React.useCallback(() => {
			if (activeHold) {
				releaseHold(activeHold.holdId);
				setActiveHold(null);
			}
		}, [activeHold, releaseHold]);

		const handleConfirm = React.useCallback(
			async (customer: { name: string; email: string; phone: string }) => {
				if (!activeHold) return;
				const slotId = createSlotId(
					new Date(activeHold.slot.start),
					new Date(activeHold.slot.end),
				);
				await confirmBooking({
					slotId,
					holdId: activeHold.holdId,
					sessionId: activeHold.sessionId,
					customerName: customer.name,
					customerEmail: customer.email,
					customerPhone: customer.phone || undefined,
				});
			},
			[activeHold, confirmBooking],
		);

		const formatTime = (ts: number) =>
			new Intl.DateTimeFormat('en-US', {
				hour: 'numeric',
				minute: 'numeric',
				hour12: true,
				timeZone: timezone,
			}).format(new Date(ts));

		const formatDateTitle = (date: Date) =>
			date.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
			});

		const isBookingView = !!activeHold;

		React.useEffect(() => {
			selectedDateKeyRef.current = currentDateKey;
		}, [currentDateKey]);

		return (
			<div
				className={cn(
					'flex flex-col border rounded-3xl overflow-hidden shadow-sm bg-background',
					className,
				)}
			>
				<div className="flex items-center justify-between p-4 border-b bg-background">
					<div className="flex items-center gap-2">
						{isBookingView && (
							<Button
								variant="ghost"
								size="icon"
								onClick={handleBack}
								className="h-8 w-8 shrink-0"
								aria-label="Go back"
							>
								<ArrowLeft className="h-4 w-4" />
							</Button>
						)}
						<div className="flex flex-col">
							<h3 className="text-sm font-semibold flex items-center gap-2">
								{isBookingView ? (
									'Confirm Booking'
								) : selectedDate ? (
									<>
										<CalendarIcon className="h-4 w-4 text-muted-foreground" />
										{formatDateTitle(selectedDate)}
									</>
								) : (
									'Select Date'
								)}
								{isLoading && (
									<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
								)}
							</h3>
							<p className="text-xs text-muted-foreground">
								{isBookingView && activeHold
									? `${formatTime(activeHold.slot.start)} – ${formatTime(activeHold.slot.end)}`
									: selectedDate
										? `Times shown in ${timezone}`
										: 'Select a date from the calendar'}
							</p>
						</div>
					</div>
					{holdCountdown !== null && (
						<HoldCountdownBadge seconds={Math.ceil(holdCountdown / 1000)} />
					)}
				</div>

				<div className="md:grid md:grid-cols-[auto_1fr]">
					<div className="bg-background md:border-r shrink-0 max-h-[350px] overflow-y-auto">
						<Calendar
							selectedDate={selectedDate}
							onSelectDate={handleDateSelect}
							onMonthChange={refreshMonth}
							availableDays={availableDays}
							isLoading={isLoading}
							timezone={timezone}
							onTimezoneChange={handleTimezoneChange}
						/>
					</div>

					<div className="max-h-[350px] overflow-y-auto">
						{isBookingView && activeHold ? (
							<BookingConfirmation
								onConfirm={handleConfirm}
								isConfirming={isConfirming}
								error={bookingError}
							/>
						) : (
							<SlotGrid
								key={currentDateKey}
								selectedDate={selectedDate}
								isLoading={isLoading}
								error={error}
								displayedSlots={displayedSlots}
								onSlotClick={handleSlotClick}
								timezone={timezone}
								isPlacingHold={isPlacingHold}
							/>
						)}
					</div>
				</div>

				<div className="p-3 border-t bg-muted/5 flex justify-start">
					<TimezoneSelect
						timezone={timezone}
						onTimezoneChange={handleTimezoneChange}
					/>
				</div>
			</div>
		);
	},
);

BookingFlow.displayName = 'BookingFlow';

const HoldCountdownBadge = ({ seconds }: { seconds: number }) => {
	const isUrgent = seconds <= 10;

	return (
		<div
			className={cn(
				'px-3 py-1 rounded-full text-xs font-medium tabular-nums',
				isUrgent
					? 'bg-destructive/10 text-destructive'
					: 'bg-muted text-muted-foreground',
			)}
		>
			{seconds}s
		</div>
	);
};
