'use client';

import type { LedgerEvent } from '@open-tap/core';
import { API_ROUTES, type BookingsPostResponse } from '@open-tap/protocol';
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Clock,
	Globe,
	Loader2,
	User,
	Wifi,
	WifiOff,
	X,
} from 'lucide-react';
import * as React from 'react';
import { useAvailabilityStream } from '@/components/availability-picker/hooks/use-availability-stream';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type BookedSlot = {
	slotId: string;
	bookingId: string;
	start: number;
	end: number;
	status: 'CONFIRMED' | 'CANCELLED';
	customerName?: string;
	customerEmail?: string;
};

type DayData = {
	dateKey: string;
	dayOfMonth: number;
	slots: BookedSlot[];
	isCurrentMonth: boolean;
	isToday: boolean;
};

type BookingsCalendarProps = {
	apiBaseUrl: string;
	tenantId: string;
	resourceId: string;
	initialTimezone?: string;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COMMON_TIMEZONES = [
	'UTC',
	'America/New_York',
	'America/Los_Angeles',
	'America/Chicago',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'Asia/Tokyo',
	'Asia/Shanghai',
	'Australia/Sydney',
];

const formatTime = (timestamp: number, timezone: string) =>
	new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone: timezone,
	}).format(new Date(timestamp));

const formatDateInTimezone = (timestamp: number, timezone: string) =>
	new Intl.DateTimeFormat('en-CA', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone: timezone,
	}).format(new Date(timestamp));

const getMonthDaysInTimezone = (
	year: number,
	month: number,
	timezone: string,
): DayData[] => {
	const todayKey = formatDateInTimezone(Date.now(), timezone);

	const firstOfMonth = new Date(year, month, 1);
	const formatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		timeZone: timezone,
	});
	const firstDayName = formatter.format(firstOfMonth);
	const dayIndex = DAYS.indexOf(firstDayName.slice(0, 3));

	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const daysInPrevMonth = new Date(year, month, 0).getDate();

	const days: DayData[] = [];

	for (let i = dayIndex - 1; i >= 0; i--) {
		const d = daysInPrevMonth - i;
		const prevMonth = month === 0 ? 11 : month - 1;
		const prevYear = month === 0 ? year - 1 : year;
		const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		days.push({
			dateKey,
			dayOfMonth: d,
			slots: [],
			isCurrentMonth: false,
			isToday: dateKey === todayKey,
		});
	}

	for (let d = 1; d <= daysInMonth; d++) {
		const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		days.push({
			dateKey,
			dayOfMonth: d,
			slots: [],
			isCurrentMonth: true,
			isToday: dateKey === todayKey,
		});
	}

	const endPadding = 7 - (days.length % 7);
	if (endPadding < 7) {
		const nextMonth = month === 11 ? 0 : month + 1;
		const nextYear = month === 11 ? year + 1 : year;
		for (let i = 1; i <= endPadding; i++) {
			const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
			days.push({
				dateKey,
				dayOfMonth: i,
				slots: [],
				isCurrentMonth: false,
				isToday: dateKey === todayKey,
			});
		}
	}

	return days;
};

export const BookingsCalendar = ({
	apiBaseUrl,
	tenantId,
	resourceId,
	initialTimezone = 'Europe/Berlin',
}: BookingsCalendarProps) => {
	const [timezone, setTimezone] = React.useState(initialTimezone);
	const [currentDate, setCurrentDate] = React.useState(new Date());
	const [bookedSlots, setBookedSlots] = React.useState<BookedSlot[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [cancellingId, setCancellingId] = React.useState<string | null>(null);
	const [selectedSlot, setSelectedSlot] = React.useState<BookedSlot | null>(
		null,
	);

	const year = currentDate.getFullYear();
	const month = currentDate.getMonth();

	const handleDelta = React.useCallback(
		(event: LedgerEvent) => {
			if (event.type === 'BookingConfirmed') {
				const newBooking: BookedSlot = {
					slotId: `${event.payload.start}_${event.payload.end}`,
					bookingId: event.payload.bookingId,
					start: event.payload.start,
					end: event.payload.end,
					status: 'CONFIRMED',
				};
				setBookedSlots((prev) => [...prev, newBooking]);
			}

			if (event.type === 'BookingCancelled') {
				setBookedSlots((prev) =>
					prev.filter((b) => b.bookingId !== event.payload.bookingId),
				);
				if (selectedSlot?.bookingId === event.payload.bookingId) {
					setSelectedSlot(null);
				}
			}
		},
		[selectedSlot],
	);

	const { isConnected } = useAvailabilityStream({
		apiBaseUrl,
		tenantSlug: tenantId,
		resourceSlug: resourceId,
		enabled: true,
		onDelta: handleDelta,
	});

	const fetchBookings = React.useCallback(async () => {
		setIsLoading(true);
		try {
			const from = new Date(year, month, 1);
			const to = new Date(year, month + 1, 0, 23, 59, 59);

			const response = await fetch(`${apiBaseUrl}${API_ROUTES.BOOKINGS}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId,
					resourceId,
					from: from.toISOString(),
					to: to.toISOString(),
					status: 'CONFIRMED',
				}),
			});

			if (!response.ok) throw new Error('Failed to fetch bookings');

			const data = (await response.json()) as BookingsPostResponse;

			setBookedSlots(
				data.bookings.map((b) => ({
					slotId: b.slotId,
					bookingId: b.bookingId,
					start: b.start,
					end: b.end,
					status: b.status,
					customerName: b.customerName,
					customerEmail: b.customerEmail,
				})),
			);
		} catch (error) {
			console.error('Error fetching bookings:', error);
		} finally {
			setIsLoading(false);
		}
	}, [apiBaseUrl, tenantId, resourceId, year, month]);

	React.useEffect(() => {
		fetchBookings();
	}, [fetchBookings]);

	const handleCancel = async (bookingId: string) => {
		setCancellingId(bookingId);
		try {
			const response = await fetch(`${apiBaseUrl}${API_ROUTES.CANCEL}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tenantId, resourceId, bookingId }),
			});

			if (!response.ok) throw new Error('Failed to cancel booking');

			setSelectedSlot(null);
			await fetchBookings();
		} catch (error) {
			console.error('Error cancelling booking:', error);
		} finally {
			setCancellingId(null);
		}
	};

	const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
	const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

	const days = React.useMemo(() => {
		const baseDays = getMonthDaysInTimezone(year, month, timezone);
		const slotsByDay = new Map<string, BookedSlot[]>();

		for (const slot of bookedSlots) {
			const dateKey = formatDateInTimezone(slot.start, timezone);
			const existing = slotsByDay.get(dateKey) || [];
			existing.push(slot);
			slotsByDay.set(dateKey, existing);
		}

		return baseDays.map((day) => ({
			...day,
			slots: slotsByDay.get(day.dateKey) || [],
		}));
	}, [year, month, bookedSlots, timezone]);

	const monthName = currentDate.toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
	});

	const totalBooked = bookedSlots.length;

	return (
		<div className="bg-background rounded-2xl border shadow-sm overflow-hidden h-full flex flex-col">
			<div className="flex items-center justify-between p-3 border-b">
				<div className="flex items-center gap-1.5">
					<Button
						variant="ghost"
						size="icon"
						onClick={goToPrevMonth}
						className="h-7 w-7"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={goToNextMonth}
						className="h-7 w-7"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					<span className="text-sm font-medium ml-1">{monthName}</span>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
						<Globe className="h-2.5 w-2.5" />
						<select
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							className="bg-transparent border-none outline-none cursor-pointer hover:text-foreground text-[10px]"
						>
							{COMMON_TIMEZONES.map((tz) => (
								<option key={tz} value={tz}>
									{tz.split('/').pop()}
								</option>
							))}
						</select>
					</div>
					<Badge
						variant={isConnected ? 'default' : 'secondary'}
						className="gap-1 text-[10px] px-1.5 py-0"
					>
						{isConnected ? (
							<Wifi className="h-2.5 w-2.5" />
						) : (
							<WifiOff className="h-2.5 w-2.5" />
						)}
						{isConnected ? 'Live' : 'Offline'}
					</Badge>
					<Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
						<CalendarIcon className="h-2.5 w-2.5" />
						{totalBooked}
					</Badge>
					{isLoading && (
						<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
					)}
				</div>
			</div>

			<div className="grid grid-cols-7 border-b">
				{DAYS.map((day) => (
					<div
						key={day}
						className="p-1 text-center text-[10px] font-medium text-muted-foreground border-r last:border-r-0"
					>
						{day}
					</div>
				))}
			</div>

			<div className="grid grid-cols-7 flex-1 overflow-y-auto">
				{days.map((day) => (
					<div
						key={day.dateKey}
						className={`
							min-h-[60px] p-0.5 border-r border-b last:border-r-0
							${!day.isCurrentMonth ? 'bg-muted/30' : ''}
							${day.isToday ? 'bg-primary/5' : ''}
						`}
					>
						<div
							className={`
								text-[10px] font-medium p-0.5 rounded w-5 h-5 flex items-center justify-center
								${day.isToday ? 'bg-primary text-primary-foreground' : ''}
								${!day.isCurrentMonth ? 'text-muted-foreground' : ''}
							`}
						>
							{day.dayOfMonth}
						</div>
						<div className="space-y-0.5 max-h-[40px] overflow-y-auto">
							{day.slots.map((slot) => (
								<button
									type="button"
									key={slot.bookingId}
									onClick={() => setSelectedSlot(slot)}
									className="w-full text-left px-1 py-0.5 rounded text-[8px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors truncate flex items-center gap-0.5"
								>
									<Clock className="h-2 w-2 shrink-0" />
									{formatTime(slot.start, timezone)}
								</button>
							))}
						</div>
					</div>
				))}
			</div>

			{selectedSlot && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-background rounded-xl border shadow-lg p-4 max-w-xs w-full mx-4">
						<div className="flex items-center justify-between mb-3">
							<h3 className="font-semibold text-sm">Booking Details</h3>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setSelectedSlot(null)}
								className="h-6 w-6"
							>
								<X className="h-3 w-3" />
							</Button>
						</div>

						<div className="space-y-2">
							<div className="flex items-center gap-2 text-xs">
								<CalendarIcon className="h-3 w-3 text-muted-foreground" />
								<span>
									{formatDateInTimezone(selectedSlot.start, timezone)}
								</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<Clock className="h-3 w-3 text-muted-foreground" />
								<span>
									{formatTime(selectedSlot.start, timezone)} –{' '}
									{formatTime(selectedSlot.end, timezone)}
								</span>
							</div>

							{selectedSlot.customerName && (
								<div className="flex items-center gap-2 text-xs">
									<User className="h-3 w-3 text-muted-foreground" />
									<span>{selectedSlot.customerName}</span>
								</div>
							)}

							{selectedSlot.customerEmail && (
								<div className="text-xs text-muted-foreground pl-5">
									{selectedSlot.customerEmail}
								</div>
							)}
						</div>

						<div className="mt-4 flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="flex-1"
								onClick={() => setSelectedSlot(null)}
							>
								Close
							</Button>
							<Button
								variant="destructive"
								size="sm"
								className="flex-1"
								onClick={() => handleCancel(selectedSlot.bookingId)}
								disabled={cancellingId === selectedSlot.bookingId}
							>
								{cancellingId === selectedSlot.bookingId ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									'Cancel'
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
