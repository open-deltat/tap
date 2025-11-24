'use client';

import { generateDisplayedSlots } from '@tap/client';
import type { LedgerEvent } from '@tap/core';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import * as React from 'react';
import { format, fromDayKey } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { DatePickerSection as Calendar } from './calendar';
import {
	type AvailabilitySlot,
	type TimeRange,
	useAvailability,
} from './hooks/use-availability';
import { useAvailabilityStream } from './hooks/use-availability-stream';
import { useClientTimezone } from './hooks/use-client-timezone';
import { SlotsView as SlotsList } from './slots-list';
import { TimezoneSelector as TimezoneSelect } from './timezone-select';

export type { AvailabilitySlot, TimeRange };
// Re-export hooks for consumers who want to build custom UIs
export { useAvailability, useAvailabilityStream, useClientTimezone };

export type AvailabilityPickerProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	onSlotSelect: (slot: TimeRange) => void;
	className?: string;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	initialTimezone?: string;
	timezone?: string;
	onTimezoneChange?: (timezone: string) => void;
};

export const AvailabilityPicker = React.memo<AvailabilityPickerProps>(
	({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		onSlotSelect,
		className,
		durationMs = 60 * 60000,
		fromHour = 0,
		toHour = 24,
		initialTimezone,
		timezone: controlledTimezone,
		onTimezoneChange: controlledOnTimezoneChange,
	}) => {
		// Start with no selected date to allow auto-selection of first available day
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			undefined,
		);

		const { timezone: internalTimezone, setTimezone: setInternalTimezone } =
			useClientTimezone(initialTimezone);

		const timezone = controlledTimezone ?? internalTimezone;
		const setTimezone = controlledOnTimezoneChange ?? setInternalTimezone;

		const [lastEvent, setLastEvent] = React.useState<LedgerEvent | null>(null);

		// Availability
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
			},
		});

		// Refresh month availability when month changes
		const handleMonthChange = React.useCallback(
			(date: Date) => {
				refreshMonth(date);
			},
			[refreshMonth],
		);

		const displayedSlots = React.useMemo(() => {
			if (!selectedDate) return [];
			return generateDisplayedSlots({
				selectedDate,
				slots,
				durationMs,
				timezone,
				lastEvent,
			});
		}, [slots, durationMs, selectedDate, timezone, lastEvent]);

		const formatDateTitle = (date: Date) => {
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
			});
		};

		return (
			<div
				className={cn(
					'flex flex-col gap-0 h-auto md:h-[600px] border rounded-3xl overflow-hidden shadow-sm bg-background',
					className,
				)}
			>
				{/* Header Section */}
				<div className="flex items-center justify-between p-4 border-b bg-background z-10">
					<div className="flex flex-col">
						<h3 className="text-sm font-semibold flex items-center gap-2">
							{selectedDate ? (
								<>
									<CalendarIcon className="h-4 w-4 text-muted-foreground" />
									{formatDateTitle(selectedDate)}
								</>
							) : (
								'Select Date'
							)}
							<div
								className={`transition-opacity duration-300 ml-2 ${isLoading ? 'opacity-100' : 'opacity-0'}`}
							>
								<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
							</div>
						</h3>
						<div className="flex items-center gap-2 mt-1">
							<p className="text-xs text-muted-foreground">
								{selectedDate
									? `Times shown in ${timezone}`
									: 'Select a date from the calendar'}
							</p>
						</div>
					</div>
				</div>

				<div className="flex flex-col md:flex-row flex-1 overflow-hidden">
					<div className="w-full md:w-[320px] bg-background shrink-0">
						<Calendar
							selectedDate={selectedDate}
							onSelectDate={setSelectedDate}
							onMonthChange={handleMonthChange}
							availableDays={availableDays}
							isLoading={isLoading}
							timezone={timezone}
							onTimezoneChange={setTimezone}
						/>
					</div>

					<div className="flex-1 relative bg-background flex flex-col min-h-[300px] md:min-h-0 overflow-hidden">
						<SlotsList
							selectedDate={selectedDate}
							isLoading={isLoading}
							error={error}
							displayedSlots={displayedSlots}
							onSlotClick={onSlotSelect}
							timezone={timezone}
						/>
					</div>
				</div>

				{/* Footer Section with Timezone Selector */}
				<div className="p-3 border-t bg-muted/5 flex justify-start">
					<TimezoneSelect timezone={timezone} onTimezoneChange={setTimezone} />
				</div>
			</div>
		);
	},
);

AvailabilityPicker.displayName = 'AvailabilityPicker';
