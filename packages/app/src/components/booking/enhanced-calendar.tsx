'use client';

import { Calendar, Clock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { useAvailability } from '@/hooks/use-availability';
import { useBooking } from '@/hooks/use-booking';
import { useStreamListener } from '@/hooks/use-stream-listener';
import type { AvailabilitySlot } from '@/lib/availability-state';
import {
	getClientTimezone,
	format,
	fromUnixTimestamp,
	getDayKey,
} from '@/lib/timezone';
import { cn } from '@/lib/utils';

export type EnhancedCalendarProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	slotResolutionMinutes?: number;
	durationMinutes?: number;
	fromHour?: number;
	toHour?: number;
	viewMode?: 'single' | 'week';
	onSlotSelected?: (slot: AvailabilitySlot) => void;
	onBookingConfirmed?: (bookingId: string) => void;
	className?: string;
};

type SlotStatus = 'available' | 'held-by-me' | 'held-by-other' | 'booked';

type SlotWithStatus = AvailabilitySlot & {
	status: SlotStatus;
	holdId?: string;
	expiresAt?: number;
};

export const EnhancedCalendar = React.memo<EnhancedCalendarProps>(
	({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		slotResolutionMinutes = 15,
		durationMinutes = 60,
		fromHour = 0,
		toHour = 24,
		viewMode = 'single',
		onSlotSelected,
		onBookingConfirmed,
		className,
	}) => {
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			new Date(),
		);
		const [selectedSlot, setSelectedSlot] =
			React.useState<SlotWithStatus | null>(null);
		const [activeHold, setActiveHold] = React.useState<{
			holdId: string;
			expiresAt: number;
			slot: AvailabilitySlot;
		} | null>(null);
		const [showBookingForm, setShowBookingForm] = React.useState(false);
		const [customerName, setCustomerName] = React.useState('');
		const [customerEmail, setCustomerEmail] = React.useState('');
		const [customerPhone, setCustomerPhone] = React.useState('');
		const [holdExpirationCountdown, setHoldExpirationCountdown] =
			React.useState<number | null>(null);
		const [streamConnected, setStreamConnected] = React.useState(false);
		const [heldSlots, setHeldSlots] = React.useState<
			Map<string, { holdId: string; expiresAt: number; isMine: boolean }>
		>(new Map());
		const [bookedSlots, setBookedSlots] = React.useState<Set<string>>(new Set());

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
			releaseHold: releaseHoldFn,
			confirmBooking,
			isPlacingHold,
			isConfirming,
			error: bookingError,
		} = useBooking({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			onSuccess: (bookingId) => {
				setSelectedSlot(null);
				setActiveHold(null);
				setShowBookingForm(false);
				setCustomerName('');
				setCustomerEmail('');
				setCustomerPhone('');
				onBookingConfirmed?.(bookingId);
				refresh();
			},
			onError: (error) => {
				console.error('Booking error:', error);
			},
		});

		const { isConnected } = useStreamListener({
			apiBaseUrl,
			cursor,
			enabled: cursor !== null,
			onEvent: (event) => {
				if (event.type === 'HoldPlaced') {
					const dayStart = new Date(event.payload.day + 'T00:00:00Z').getTime();
					const start = dayStart + event.payload.startMinute * 60 * 1000;
					const end = dayStart + event.payload.endMinute * 60 * 1000;

					setHeldSlots((prev) => {
						const next = new Map(prev);
						next.set(`${start}-${end}`, {
							holdId: event.payload.holdId,
							expiresAt: event.payload.expiresAt,
							isMine: activeHold?.holdId === event.payload.holdId,
						});
						return next;
					});
				} else if (event.type === 'HoldExpired') {
					setHeldSlots((prev) => {
						const next = new Map(prev);
						for (const [key, value] of next.entries()) {
							if (value.holdId === event.payload.holdId) {
								next.delete(key);
							}
						}
						if (activeHold?.holdId === event.payload.holdId) {
							setActiveHold(null);
							setShowBookingForm(false);
						}
						return next;
					});
				} else if (event.type === 'BookingConfirmed') {
					const start = new Date(event.payload.start).getTime();
					const end = new Date(event.payload.end).getTime();
					setBookedSlots((prev) => {
						const next = new Set(prev);
						next.add(`${start}-${end}`);
						return next;
					});
					setHeldSlots((prev) => {
						const next = new Map(prev);
						for (const [key, value] of next.entries()) {
							if (value.holdId === event.payload.holdId) {
								next.delete(key);
							}
						}
						return next;
					});
				} else if (event.type === 'BookingCancelled') {
					const start = new Date(event.payload.start).getTime();
					const end = new Date(event.payload.end).getTime();
					setBookedSlots((prev) => {
						const next = new Set(prev);
						next.delete(`${start}-${end}`);
						return next;
					});
				}
				applyDelta(event);
			},
			onError: (error) => {
				console.error('Stream error:', error);
			},
		});

		React.useEffect(() => {
			setStreamConnected(isConnected);
		}, [isConnected]);

		React.useEffect(() => {
			if (activeHold) {
				const updateCountdown = () => {
					const remaining = Math.max(0, activeHold.expiresAt - Date.now());
					setHoldExpirationCountdown(remaining);
					if (remaining === 0) {
						setActiveHold(null);
						setShowBookingForm(false);
					}
				};

				updateCountdown();
				const interval = setInterval(updateCountdown, 1000);
				return () => clearInterval(interval);
			} else {
				setHoldExpirationCountdown(null);
			}
		}, [activeHold]);

		React.useEffect(() => {
			const handleBeforeUnload = () => {
				if (activeHold) {
					fetch(
						`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${activeHold.holdId}`,
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
				if (activeHold) {
					fetch(
						`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${activeHold.holdId}`,
						{
							method: 'DELETE',
							keepalive: true,
						},
					).catch(() => {});
				}
			};
		}, [activeHold, apiBaseUrl, tenantSlug, resourceSlug]);

		const slotsWithStatus = React.useMemo((): SlotWithStatus[] => {
			return slots.map((slot) => {
				const slotKey = `${slot.start}-${slot.end}`;
				const heldInfo = heldSlots.get(slotKey);
				const isBooked = bookedSlots.has(slotKey);
				const isHeldByMe = heldInfo?.isMine ?? false;
				const isHeldByOther = heldInfo && !isHeldByMe;

				let status: SlotStatus = 'available';
				if (isBooked) {
					status = 'booked';
				} else if (isHeldByMe) {
					status = 'held-by-me';
				} else if (isHeldByOther) {
					status = 'held-by-other';
				}

				return {
					...slot,
					status,
					holdId: heldInfo?.holdId,
					expiresAt: heldInfo?.expiresAt,
				};
			});
		}, [slots, heldSlots, bookedSlots]);

		const handleSlotClick = async (slot: SlotWithStatus) => {
			if (slot.status === 'booked' || slot.status === 'held-by-other') {
				return;
			}

			if (slot.status === 'held-by-me' && slot.holdId) {
				setSelectedSlot(slot);
				setShowBookingForm(true);
				return;
			}

			setSelectedSlot(slot);
			const holdId = await placeHold(slot);
			if (holdId) {
				const expiresAt = Date.now() + 30_000;
				setActiveHold({ holdId, expiresAt, slot });
				setHeldSlots((prev) => {
					const next = new Map(prev);
					next.set(`${slot.start}-${slot.end}`, {
						holdId,
						expiresAt,
						isMine: true,
					});
					return next;
				});
				setShowBookingForm(true);
				onSlotSelected?.(slot);
			}
		};

		const handleReleaseHold = async () => {
			if (activeHold) {
				await releaseHoldFn(activeHold.holdId);
				setActiveHold(null);
				setSelectedSlot(null);
				setShowBookingForm(false);
				setHeldSlots((prev) => {
					const next = new Map(prev);
					next.delete(`${activeHold.slot.start}-${activeHold.slot.end}`);
					return next;
				});
			}
		};

		const handleBookingSubmit = async (e: React.FormEvent) => {
			e.preventDefault();
			if (!activeHold || !customerName.trim() || !customerEmail.trim()) {
				return;
			}
			await confirmBooking({
				holdId: activeHold.holdId,
				customerName: customerName.trim(),
				customerEmail: customerEmail.trim(),
				customerPhone: customerPhone.trim() || undefined,
			});
		};

		const formatTime = (timestamp: number): string => {
			const date = fromUnixTimestamp(timestamp);
			return format(date, 'h:mm a');
		};

		const formatCountdown = (ms: number): string => {
			const seconds = Math.ceil(ms / 1000);
			return `${seconds}s`;
		};

		const getSlotStatusColor = (status: SlotStatus): string => {
			switch (status) {
				case 'available':
					return 'bg-green-50 hover:bg-green-100 border-green-200 text-green-900';
				case 'held-by-me':
					return 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-900';
				case 'held-by-other':
					return 'bg-yellow-50 border-yellow-200 text-yellow-700 cursor-not-allowed opacity-60';
				case 'booked':
					return 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed';
				default:
					return '';
			}
		};

		const getWeekDates = (): Date[] => {
			if (!selectedDate) return [];
			const dates: Date[] = [];
			const startOfWeek = new Date(selectedDate);
			const day = startOfWeek.getDay();
			const diff = startOfWeek.getDate() - day;
			startOfWeek.setDate(diff);
			startOfWeek.setHours(0, 0, 0, 0);

			for (let i = 0; i < 7; i++) {
				const date = new Date(startOfWeek);
				date.setDate(startOfWeek.getDate() + i);
				dates.push(date);
			}
			return dates;
		};

		return (
			<div className={cn('flex flex-col gap-6', className)}>
				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-bold">Book Appointment</h2>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						{streamConnected ? (
							<>
								<div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
								<span>Live</span>
							</>
						) : (
							<>
								<div className="h-2 w-2 bg-gray-400 rounded-full" />
								<span>Connecting...</span>
							</>
						)}
					</div>
				</div>

				<div className="flex flex-col md:flex-row gap-6">
					<div className="flex-shrink-0">
						<CalendarComponent
							mode="single"
							selected={selectedDate}
							onSelect={setSelectedDate}
							className="rounded-lg border"
							disabled={(date) => date < new Date()}
						/>
						{selectedDate && (
							<div className="mt-4 text-sm text-muted-foreground space-y-1">
								<p>Timezone: {getClientTimezone()}</p>
								<p>
									{format(selectedDate, 'EEEE, MMMM d, yyyy')}
								</p>
							</div>
						)}
					</div>

					<div className="flex-1 min-w-0">
						{selectedDate ? (
							<>
								<div className="flex items-center justify-between mb-4">
									<h3 className="text-lg font-semibold">Available Times</h3>
									{activeHold && holdExpirationCountdown !== null && (
										<div className="flex items-center gap-2 text-sm text-orange-600">
											<Clock className="h-4 w-4" />
											<span>
												Hold expires in {formatCountdown(holdExpirationCountdown)}
											</span>
										</div>
									)}
								</div>

								{error && (
									<div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-center gap-2">
										<AlertCircle className="h-4 w-4" />
										{error.message}
									</div>
								)}

								{bookingError && (
									<div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-center gap-2">
										<AlertCircle className="h-4 w-4" />
										{bookingError.message}
									</div>
								)}

								{showBookingForm && activeHold ? (
									<div className="p-6 border rounded-lg bg-card space-y-4">
										<div className="flex items-center justify-between">
											<h3 className="text-lg font-semibold">
												Complete Your Booking
											</h3>
											<Button
												variant="ghost"
												size="sm"
												onClick={handleReleaseHold}
												disabled={isConfirming}
											>
												Release Hold
											</Button>
										</div>
										<p className="text-sm text-muted-foreground">
											{formatTime(activeHold.slot.start)} -{' '}
											{formatTime(activeHold.slot.end)}
										</p>

										<form onSubmit={handleBookingSubmit} className="space-y-4">
											<div>
												<label className="block text-sm font-medium mb-1">
													Name <span className="text-destructive">*</span>
												</label>
												<input
													type="text"
													required
													value={customerName}
													onChange={(e) => setCustomerName(e.target.value)}
													className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
													placeholder="John Doe"
													disabled={isConfirming}
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">
													Email <span className="text-destructive">*</span>
												</label>
												<input
													type="email"
													required
													value={customerEmail}
													onChange={(e) => setCustomerEmail(e.target.value)}
													className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
													placeholder="john@example.com"
													disabled={isConfirming}
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-1">
													Phone{' '}
													<span className="text-muted-foreground">
														(optional)
													</span>
												</label>
												<input
													type="tel"
													value={customerPhone}
													onChange={(e) => setCustomerPhone(e.target.value)}
													className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
													placeholder="+1 (555) 123-4567"
													disabled={isConfirming}
												/>
											</div>

											<div className="flex gap-3 pt-2">
												<Button
													type="submit"
													disabled={
														isConfirming ||
														!customerName.trim() ||
														!customerEmail.trim()
													}
													className="flex-1"
												>
													{isConfirming ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Booking...
														</>
													) : (
														<>
															<CheckCircle2 className="mr-2 h-4 w-4" />
															Confirm Booking
														</>
													)}
												</Button>
											</div>
										</form>
									</div>
								) : (
									<div className="space-y-2">
										{isLoading || isPlacingHold ? (
											<div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
												<Loader2 className="h-8 w-8 animate-spin mb-2" />
												<p>Loading available times...</p>
											</div>
										) : slotsWithStatus.length === 0 ? (
											<div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
												<Clock className="h-8 w-8 mb-2" />
												<p>No available times for this date</p>
											</div>
										) : (
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto p-2">
												{slotsWithStatus.map((slot, index) => (
													<Button
														key={`${slot.start}-${slot.end}-${index}`}
														variant="outline"
														className={cn(
															'w-full justify-start text-left h-auto py-3 px-4',
															getSlotStatusColor(slot.status),
															(slot.status === 'booked' ||
																slot.status === 'held-by-other') &&
																'cursor-not-allowed',
														)}
														onClick={() => handleSlotClick(slot)}
														disabled={
															slot.status === 'booked' ||
															slot.status === 'held-by-other' ||
															isPlacingHold
														}
													>
														<div className="flex items-center gap-2 w-full">
															<Clock className="h-4 w-4 flex-shrink-0" />
															<div className="flex-1 text-left">
																<div className="font-medium">
																	{formatTime(slot.start)} -{' '}
																	{formatTime(slot.end)}
																</div>
																{slot.status === 'held-by-me' && (
																	<div className="text-xs opacity-75">
																		Your hold
																	</div>
																)}
																{slot.status === 'held-by-other' && (
																	<div className="text-xs opacity-75">
																		Temporarily held
																	</div>
																)}
																{slot.status === 'booked' && (
																	<div className="text-xs opacity-75">
																		Booked
																	</div>
																)}
															</div>
														</div>
													</Button>
												))}
											</div>
										)}
									</div>
								)}
							</>
						) : (
							<div className="flex items-center justify-center h-full text-muted-foreground">
								<p>Select a date to view available times</p>
							</div>
						)}
					</div>
				</div>
			</div>
		);
	},
);

EnhancedCalendar.displayName = 'EnhancedCalendar';

