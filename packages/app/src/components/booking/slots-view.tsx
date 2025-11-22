'use client';

import { Calendar as CalendarIcon, Clock, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AvailabilitySlot } from '@/hooks/use-availability';

export type SlotsViewProps = {
	selectedDate: Date | undefined;
	isLoading: boolean;
	error: Error | null;
	displayedSlots: { start: number; end: number; available: boolean }[];
	onSlotClick: (slot: AvailabilitySlot) => void;
	timezone: string;
	formatDate: (date: Date | number, fmt: string) => string;
};

export const SlotsView = ({
	selectedDate,
	isLoading,
	error,
	displayedSlots,
	onSlotClick,
	timezone,
	formatDate,
}: SlotsViewProps) => {
	// Format helper using the passed formatter
	const formatTime = (timestamp: number) => {
		return formatDate(timestamp, 'h:mm a');
	};

	const formatDateTitle = (date: Date) => {
		// Use local formatting to match the calendar selection visual,
		// ignoring the target timezone shift for the header title.
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
		});
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background">
			<div className="p-4 border-b bg-background sticky top-0 z-10">
				<h3 className="text-sm font-semibold flex items-center gap-2">
					{selectedDate ? (
						<>
							<CalendarIcon className="h-4 w-4 text-muted-foreground" />
							{formatDateTitle(selectedDate)}
						</>
					) : (
						'Availability'
					)}
				</h3>
				<p className="text-xs text-muted-foreground mt-0.5">
					{selectedDate
						? `Select a time (${timezone})`
						: 'Select a date from the calendar.'}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{error && (
					<div className="p-3 mb-4 rounded-md border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-center gap-2">
						<Info className="h-3 w-3" />
						{error.message}
					</div>
				)}

				{!selectedDate ? (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
						<CalendarIcon className="h-10 w-10 mb-3 opacity-10" />
						<p className="text-sm">Select a date to view availability</p>
					</div>
				) : isLoading ? (
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
						{Array.from({ length: 9 }).map((_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
								key={`skeleton-${i}`}
								className="h-12 rounded-md bg-muted animate-pulse"
							/>
						))}
					</div>
				) : displayedSlots.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
						<Clock className="h-10 w-10 mb-3 opacity-10" />
						<p className="text-sm">No slots available in {timezone}</p>
					</div>
				) : (
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
						{displayedSlots.map((slot) => (
							<Button
								key={`${slot.start}-${slot.end}`}
								variant="outline"
								disabled={!slot.available}
								className="h-auto py-2 px-3 justify-center flex-col gap-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary transition-all group disabled:opacity-30 disabled:hover:border-input disabled:hover:bg-transparent"
								onClick={() => onSlotClick(slot)}
							>
								<span className="font-medium text-sm">
									{formatTime(slot.start)}
								</span>
							</Button>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
