'use client';

import { Globe, Loader2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format, getClientTimezone } from '@/lib/timezone';

export type DatePickerSectionProps = {
	selectedDate: Date | undefined;
	onSelectDate: (date: Date | undefined) => void;
	onMonthChange: (date: Date) => void;
	availableDays: Set<string>;
	isLoading: boolean;
};

export const DatePickerSection = ({
	selectedDate,
	onSelectDate,
	onMonthChange,
	availableDays,
	isLoading,
}: DatePickerSectionProps) => {
	return (
		<div className="flex flex-col h-full">
			<div className="p-4 flex-1 flex flex-col">
				<div className="flex items-center justify-between mb-4 px-2">
					<h2 className="text-sm font-semibold tracking-tight">Select Date</h2>
					{isLoading && (
						<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
					)}
				</div>
				<div className="flex-1 flex justify-center">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={onSelectDate}
						onMonthChange={onMonthChange}
						disabled={(date) => {
							if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
							const dateKey = format(date, 'yyyy-MM-dd');
							return !availableDays.has(dateKey);
						}}
					/>
				</div>
			</div>
			<div className="p-3 border-t bg-muted/5 text-[10px] text-muted-foreground flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Globe className="h-3 w-3" />
					<span>{getClientTimezone()}</span>
				</div>
				{selectedDate && <span>{format(selectedDate, 'MMM d, yyyy')}</span>}
			</div>
		</div>
	);
};
