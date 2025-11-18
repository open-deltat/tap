'use client';

import * as React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { useAvailability } from '@/hooks/use-availability';
import { useBooking } from '@/hooks/use-booking';
import { useStreamListener } from '@/hooks/use-stream-listener';
import type { AvailabilitySlot } from '@/lib/availability-state';
import { getClientTimezone } from '@/lib/timezone';
import { BookingForm } from './booking-form';
import { TimeSlotSelector } from './time-slot-selector';

export type BookingCalendarProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	slotResolutionMinutes?: number;
	durationMinutes?: number;
	fromHour?: number;
	toHour?: number;
	onSlotSelected?: (slot: AvailabilitySlot) => void;
	className?: string;
};

export const BookingCalendar = React.memo<BookingCalendarProps>(
	({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		slotResolutionMinutes = 15,
		durationMinutes = 60,
		fromHour = 0,
		toHour = 24,
		onSlotSelected,
		className,
	}) => {
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			new Date(),
		);
		const [selectedSlot, setSelectedSlot] =
			React.useState<AvailabilitySlot | null>(null);
		const [holdId, setHoldId] = React.useState<string | null>(null);
		const [showBookingForm, setShowBookingForm] = React.useState(false);

		const { slots, isLoading, error, refresh, applyDelta, cursor } =
			useAvailability({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
				selectedDate,
				slotResolutionMinutes,
				durationMinutes,
				fromHour,
				toHour,
			});

		const {
			placeHold,
			confirmBooking,
			isPlacingHold,
			isConfirming,
			error: bookingError,
		} = useBooking({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			onSuccess: (bookingId) => {
				console.log('Booking confirmed:', bookingId);
				setSelectedSlot(null);
				setHoldId(null);
				setShowBookingForm(false);
				refresh();
			},
			onError: (error) => {
				console.error('Booking error:', error);
			},
		});

		useStreamListener({
			apiBaseUrl,
			cursor,
			enabled: cursor !== null,
			onEvent: (event) => {
				applyDelta(event);
			},
			onError: (error) => {
				console.error('Stream error:', error);
			},
		});

		React.useEffect(() => {
			const handleBeforeUnload = () => {
				if (holdId) {
					fetch(
						`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdId}`,
						{
							method: 'DELETE',
							keepalive: true,
						},
					).catch(() => {});
				}
			};

			window.addEventListener('beforeunload', handleBeforeUnload);
			return () => {
				window.removeEventListener('beforeunload', handleBeforeUnload);
				if (holdId) {
					fetch(
						`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdId}`,
						{
							method: 'DELETE',
							keepalive: true,
						},
					).catch(() => {});
				}
			};
		}, [holdId, apiBaseUrl, tenantSlug, resourceSlug]);

		const handleSlotSelect = async (slot: AvailabilitySlot) => {
			setSelectedSlot(slot);
			onSlotSelected?.(slot);

			const id = await placeHold(slot);
			if (id) {
				setHoldId(id);
				setShowBookingForm(true);
			}
		};

		const handleDateSelect = (date: Date | undefined) => {
			setSelectedDate(date);
			setSelectedSlot(null);
			setHoldId(null);
			setShowBookingForm(false);
		};

		const handleBookingSubmit = async (data: {
			customerName: string;
			customerEmail: string;
			customerPhone?: string;
		}) => {
			if (!holdId) return;
			await confirmBooking({
				holdId,
				...data,
			});
		};

		const handleBookingCancel = () => {
			setSelectedSlot(null);
			setHoldId(null);
			setShowBookingForm(false);
		};

		return (
			<div className={`flex flex-col md:flex-row gap-6 ${className || ''}`}>
				<div className="flex-shrink-0">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={handleDateSelect}
						className="rounded-lg border"
						disabled={(date) => date < new Date()}
					/>
					{selectedDate && (
						<div className="mt-4 text-sm text-muted-foreground">
							<p>Timezone: {getClientTimezone()}</p>
							<p>
								Selected:{' '}
								{selectedDate.toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
						</div>
					)}
				</div>

				<div className="flex-1 min-w-0">
					{selectedDate ? (
						<>
							<h3 className="text-lg font-semibold mb-4">Available Times</h3>
							{error && (
								<div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
									{error.message}
								</div>
							)}
							{bookingError && (
								<div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
									{bookingError.message}
								</div>
							)}
							{showBookingForm && selectedSlot ? (
								<BookingForm
									slot={selectedSlot}
									onSubmit={handleBookingSubmit}
									onCancel={handleBookingCancel}
									isSubmitting={isConfirming}
									error={bookingError}
								/>
							) : (
								<TimeSlotSelector
									slots={slots}
									selectedSlot={selectedSlot}
									onSelectSlot={handleSlotSelect}
									isLoading={isLoading || isPlacingHold}
								/>
							)}
						</>
					) : (
						<div className="flex items-center justify-center h-full text-muted-foreground">
							<p>Select a date to view available times</p>
						</div>
					)}
				</div>
			</div>
		);
	},
);

BookingCalendar.displayName = 'BookingCalendar';
