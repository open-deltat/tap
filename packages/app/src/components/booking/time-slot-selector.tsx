'use client';

import { Clock } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { AvailabilitySlot } from '@/lib/availability-state';
import { format, fromUnixTimestamp } from '@/lib/timezone';
import { cn } from '@/lib/utils';

export type TimeSlotSelectorProps = {
	slots: AvailabilitySlot[];
	selectedSlot: AvailabilitySlot | null;
	onSelectSlot: (slot: AvailabilitySlot) => void;
	isLoading?: boolean;
	className?: string;
};

export const TimeSlotSelector = React.memo<TimeSlotSelectorProps>(
	({ slots, selectedSlot, onSelectSlot, isLoading, className }) => {
		const formatTime = (timestamp: number): string => {
			const date = fromUnixTimestamp(timestamp);
			return format(date, 'h:mm a');
		};

		const isSlotSelected = (slot: AvailabilitySlot): boolean => {
			return (
				selectedSlot !== null &&
				selectedSlot.start === slot.start &&
				selectedSlot.end === slot.end
			);
		};

		if (isLoading) {
			return (
				<div
					className={cn(
						'flex flex-col items-center justify-center p-8 text-muted-foreground',
						className,
					)}
				>
					<Clock className="h-8 w-8 animate-spin mb-2" />
					<p>Loading available times...</p>
				</div>
			);
		}

		if (slots.length === 0) {
			return (
				<div
					className={cn(
						'flex flex-col items-center justify-center p-8 text-muted-foreground',
						className,
					)}
				>
					<Clock className="h-8 w-8 mb-2" />
					<p>No available times</p>
				</div>
			);
		}

		return (
			<div
				className={cn(
					'flex flex-col gap-2 overflow-y-auto max-h-[400px] p-4',
					className,
				)}
			>
				{slots.map((slot, index) => (
					<Button
						key={`${slot.start}-${slot.end}-${index}`}
						variant={isSlotSelected(slot) ? 'default' : 'outline'}
						className={cn(
							'w-full justify-start text-left',
							isSlotSelected(slot) && 'bg-primary text-primary-foreground',
						)}
						onClick={() => onSelectSlot(slot)}
					>
						<Clock className="mr-2 h-4 w-4" />
						{formatTime(slot.start)} - {formatTime(slot.end)}
					</Button>
				))}
			</div>
		);
	},
);

TimeSlotSelector.displayName = 'TimeSlotSelector';
