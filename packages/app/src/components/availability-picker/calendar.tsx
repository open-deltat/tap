'use client';

import { Calendar } from '@/components/ui/calendar';
import { format } from '@/lib/timezone';

export type DatePickerSectionProps = {
	selectedDate: Date | undefined;
	onSelectDate: (date: Date | undefined) => void;
	onMonthChange: (date: Date) => void;
	availableDays: Set<string>;
	isLoading: boolean;
	timezone: string;
	onTimezoneChange: (timezone: string) => void;
};

export const DatePickerSection = ({
	selectedDate,
	onSelectDate,
	onMonthChange,
	availableDays,
	isLoading,
	timezone: _timezone,
	onTimezoneChange: _onTimezoneChange,
}: DatePickerSectionProps) => {
	return (
		<div className="flex flex-col h-full bg-background">
			<div
				className={`flex-1 flex justify-center transition-opacity duration-300 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
			>
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
	);
};
