'use client';

import { Calendar as CalendarIcon, Clock, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { TimeRange } from './hooks/use-availability';

export type SlotsViewProps = {
	selectedDate: Date | undefined;
	isLoading: boolean;
	error: Error | null;
	displayedSlots: {
		start: number;
		end: number;
		available: boolean;
		isReleased?: boolean;
	}[];
	onSlotClick: (slot: TimeRange) => void;
	timezone: string;
};

export const SlotsView = ({
	selectedDate,
	isLoading,
	error,
	displayedSlots,
	onSlotClick,
	timezone,
}: SlotsViewProps) => {
	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		return new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: 'numeric',
			hour12: true,
			timeZone: timezone,
		}).format(date);
	};

	return (
		<div className="flex-1 flex flex-col h-full bg-background">
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
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in duration-500">
						{Array.from({ length: 12 }).map((_, i) => (
							<Skeleton
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
								key={`skeleton-${i}`}
								className="h-[38px] w-full rounded-md"
							/>
						))}
					</div>
				) : displayedSlots.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-300">
						<Clock className="h-10 w-10 mb-3 opacity-10" />
						<p className="text-sm">No slots available in {timezone}</p>
					</div>
				) : (
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
						{displayedSlots.map((slot) => (
							<SlotButton
								key={`${slot.start}-${slot.end}`}
								slot={slot}
								formatTime={formatTime}
								onClick={onSlotClick}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

const SlotButton = ({
	slot,
	formatTime,
	onClick,
}: {
	slot: {
		start: number;
		end: number;
		available: boolean;
		isReleased?: boolean;
	};
	formatTime: (ts: number) => string;
	onClick: (slot: TimeRange) => void;
}) => {
	const [isFlashing, setIsFlashing] = useState(false);
	const [isReappearing, setIsReappearing] = useState(false);
	const prevAvailable = useRef(slot.available);

	useEffect(() => {
		if (prevAvailable.current === true && slot.available === false) {
			setIsFlashing(true);
			const timer = setTimeout(() => setIsFlashing(false), 500);
			return () => clearTimeout(timer);
		}
		// Trigger reappearing animation either by state transition or explicit flag
		if (
			(prevAvailable.current === false && slot.available === true) ||
			slot.isReleased
		) {
			setIsReappearing(true);
			const timer = setTimeout(() => setIsReappearing(false), 500);
			return () => clearTimeout(timer);
		}
		prevAvailable.current = slot.available;
	}, [slot.available, slot.isReleased]);

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (slot.available) {
			onClick({ start: slot.start, end: slot.end });
		}
	};

	return (
		<Button
			variant="outline"
			disabled={!slot.available}
			type="button"
			className={cn(
				'h-auto py-2 px-3 justify-center flex-col gap-0.5 transition-all duration-500 group cursor-pointer',
				isFlashing
					? 'bg-destructive/10 border-destructive text-destructive disabled:opacity-100'
					: isReappearing
						? 'bg-green-500/10 border-green-500 text-green-600'
						: !slot.available
							? 'opacity-30 hover:bg-transparent hover:border-input cursor-not-allowed'
							: 'hover:border-primary hover:bg-primary/5 hover:text-primary cursor-pointer',
			)}
			onClick={handleClick}
		>
			<span className="font-medium text-sm">{formatTime(slot.start)}</span>
		</Button>
	);
};
