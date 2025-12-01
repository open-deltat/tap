'use client';

import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const SKELETON_KEYS = [
	'a',
	'b',
	'c',
	'd',
	'e',
	'f',
	'g',
	'h',
	'i',
	'j',
	'k',
	'l',
];

type Slot = {
	start: number;
	end: number;
	available: boolean;
	isReleased?: boolean;
};

type SlotGridProps = {
	selectedDate: Date | undefined;
	isLoading: boolean;
	error: Error | null;
	displayedSlots: Slot[];
	onSlotClick: (slot: { start: number; end: number }) => void;
	timezone: string;
	isPlacingHold?: boolean;
};

export const SlotGrid = ({
	selectedDate,
	isLoading,
	error,
	displayedSlots,
	onSlotClick,
	timezone,
	isPlacingHold,
}: SlotGridProps) => {
	const formatTime = (timestamp: number) =>
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: 'numeric',
			hour12: true,
			timeZone: timezone,
		}).format(new Date(timestamp));

	if (!selectedDate) {
		return (
			<div className="flex flex-col items-center justify-center text-muted-foreground p-8">
				<CalendarIcon className="h-10 w-10 mb-3 opacity-20" />
				<p className="text-sm">Select a date to view availability</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center p-8">
				<div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 max-w-xs text-center">
					<p className="text-sm text-destructive">{error.message}</p>
				</div>
			</div>
		);
	}

	if (isLoading && displayedSlots.length === 0) {
		return (
			<div className="p-4">
				<div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
					{SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="h-10 w-full rounded-lg" />
					))}
				</div>
			</div>
		);
	}

	if (displayedSlots.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center text-muted-foreground p-8">
				<Clock className="h-10 w-10 mb-3 opacity-20" />
				<p className="text-sm">No slots available</p>
				<p className="text-xs text-muted-foreground mt-1">
					Try selecting another date
				</p>
			</div>
		);
	}

	return (
		<div className="p-4">
			<div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
				{displayedSlots.map((slot) => (
					<Button
						key={`${slot.start}-${slot.end}`}
						variant={slot.available ? 'outline' : 'ghost'}
						size="sm"
						disabled={!slot.available || isPlacingHold}
						onClick={() =>
							slot.available &&
							onSlotClick({ start: slot.start, end: slot.end })
						}
						className={cn(
							'h-10 text-sm font-medium',
							slot.available
								? 'hover:bg-primary hover:text-primary-foreground hover:border-primary'
								: 'opacity-30 cursor-not-allowed',
						)}
					>
						{formatTime(slot.start)}
					</Button>
				))}
			</div>
		</div>
	);
};
