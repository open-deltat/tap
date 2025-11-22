'use client';

import type { LedgerEvent } from '@tap/core';
import { createSlotId } from '@tap/protocol';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
	type AvailabilitySlot,
	useAvailability,
} from '@/hooks/use-availability';
import { useAvailabilityStream } from '@/hooks/use-availability-stream';
import { useBooking } from '@/hooks/use-booking';
import { useHoldStream } from '@/hooks/use-hold-stream';
import { format, fromUnixTimestamp, getClientTimezone } from '@/lib/timezone';
import { cn } from '@/lib/utils';

export type EnhancedCalendarProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	slotResolutionMinutes?: number;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	onBookingConfirmed?: (bookingId: string) => void;
	className?: string;
};

export const EnhancedCalendar = React.memo<EnhancedCalendarProps>(
	({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		durationMs = 60 * 60000,
		fromHour = 0,
		toHour = 24,
		onBookingConfirmed,
		className,
	}) => {
		const nameId = React.useId();
		const emailId = React.useId();
		const phoneId = React.useId();
		const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
			() => new Date(),
		);
		const [activeHold, setActiveHold] = React.useState<{
			holdId: string;
			sessionId: string;
			expiresAt: number;
			slot: AvailabilitySlot;
		} | null>(null);

		const [showBookingForm, setShowBookingForm] = React.useState(false);
		const [customerName, setCustomerName] = React.useState('');
		const [customerEmail, setCustomerEmail] = React.useState('');
		const [customerPhone, setCustomerPhone] = React.useState('');
		const [holdExpirationCountdown, setHoldExpirationCountdown] =
			React.useState<number | null>(null);

		// Availability
		const {
			slots,
			isLoading,
			error,
			refresh,
			applyDelta,
			availableDays,
			refreshMonth,
			debugLogs,
		} = useAvailability({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			selectedDate,
			durationMs,
			fromHour,
			toHour,
		});

		// Availability Stream (Deltas)
		useAvailabilityStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			enabled: true,
			onDelta: (event: LedgerEvent) => {
				console.log('[EnhancedCalendar] Stream Event:', event);
				applyDelta(event);

				// If our hold expired/released remotely
				if (activeHold) {
					if (
						event.type === 'HoldExpired' &&
						event.payload.holdId === activeHold.holdId
					) {
						setActiveHold(null);
						setShowBookingForm(false);
					}
					if (
						event.type === 'HoldReleased' &&
						event.payload.holdId === activeHold.holdId
					) {
						setActiveHold(null);
						setShowBookingForm(false);
					}
				}
			},
		});

		// Hold Manager
		const {
			sessionId: currentSessionId,
			placeHold: placeHoldWS,
			releaseHold: releaseHoldWS,
		} = useHoldStream({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
		});

		// Booking
		const {
			confirmBooking,
			isConfirming,
			error: bookingError,
		} = useBooking({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			onSuccess: (bookingId) => {
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

		// Refresh month availability when month changes
		const handleMonthChange = React.useCallback(
			(date: Date) => {
				refreshMonth(date);
			},
			[refreshMonth],
		);

		// Cleanup hold on unmount/change
		React.useEffect(() => {
			return () => {
				if (activeHold) {
					releaseHoldWS(activeHold.holdId);
				}
			};
		}, [activeHold, releaseHoldWS]);

		// Countdown
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

		const handleSlotClick = React.useCallback(
			async (slot: AvailabilitySlot) => {
				try {
					const slotId = createSlotId(new Date(slot.start), new Date(slot.end));

					const holdId = await placeHoldWS({ slotId });

					setActiveHold({
						holdId,
						sessionId: '', // We'll read currentSessionId from the hook scope on submit
						slot,
						expiresAt: Date.now() + 60000, // 60s
					});
					setShowBookingForm(true);
				} catch (e) {
					console.error('Failed to place hold', e);
				}
			},
			[placeHoldWS],
		);

		const handleReleaseHold = React.useCallback(() => {
			if (activeHold) {
				releaseHoldWS(activeHold.holdId);
				setActiveHold(null);
				setShowBookingForm(false);
			}
		}, [activeHold, releaseHoldWS]);

		const handleBookingSubmit = React.useCallback(
			async (e: React.FormEvent) => {
				e.preventDefault();
				if (
					!activeHold ||
					!customerName.trim() ||
					!customerEmail.trim() ||
					!currentSessionId // Ensure we have a session
				) {
					console.error('Missing required booking info');
					return;
				}

				const slotId = createSlotId(
					new Date(activeHold.slot.start),
					new Date(activeHold.slot.end),
				);

				await confirmBooking({
					slotId,
					holdId: activeHold.holdId,
					sessionId: currentSessionId,
					customerName: customerName.trim(),
					customerEmail: customerEmail.trim(),
					customerPhone: customerPhone.trim() || undefined,
				});
			},
			[
				activeHold,
				customerName,
				customerEmail,
				currentSessionId,
				confirmBooking,
				customerPhone,
			],
		);

		const formatTime = (timestamp: number): string => {
			const date = fromUnixTimestamp(timestamp);
			return format(date, 'h:mm a');
		};

		const formatCountdown = (ms: number): string => {
			const seconds = Math.ceil(ms / 1000);
			return `${seconds}s`;
		};

		const displayedSlots = React.useMemo(() => {
			const list = [];

			// Flatten merged slots back into discrete duration chunks
			const resolutionMs = durationMs || 60 * 60000;

			for (const slot of slots) {
				let current = slot.start;
				while (current + resolutionMs <= slot.end) {
					list.push({
						start: current,
						end: current + resolutionMs,
					});
					current += resolutionMs;
				}
			}

			// Add active hold if not present
			if (activeHold) {
				// Check if the active hold slot is already effectively covered by availability
				// (It shouldn't be, as holds remove availability, but let's be safe)
				const exists = list.some((s) => s.start === activeHold.slot.start);
				if (!exists) {
					list.push(activeHold.slot);
				}
			}

			return list.sort((a, b) => a.start - b.start);
		}, [slots, activeHold, durationMs]);

		return (
			<div className={cn('flex flex-col gap-6', className)}>
				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-bold">Book Appointment</h2>
					{/* Live indicator removed or simplified since we are always "live" via hook */}
				</div>

				<div className="flex flex-col md:flex-row gap-6">
					<div className="shrink-0">
						<CalendarComponent
							mode="single"
							selected={selectedDate}
							onSelect={(date) => {
								setSelectedDate(date);
								if (activeHold) handleReleaseHold();
							}}
							onMonthChange={handleMonthChange}
							className="rounded-lg border"
							disabled={(date) => {
								// Disable past dates
								if (date < new Date(new Date().setHours(0, 0, 0, 0)))
									return true;
								// Disable dates not in availableDays
								// If we have fetched availability, check against it.
								// Note: availableDays might be empty initially, so maybe only disable if we HAVE data?
								// For now, strict mode: if not in set, disable.
								// Be careful with timezone string conversion.
								// Ideally use a utility to format consistently.
								const dateKey = date.toISOString().split('T')[0] ?? '';
								return !availableDays.has(dateKey);
							}}
						/>
						{selectedDate && (
							<div className="mt-4 text-sm text-muted-foreground space-y-1">
								<p>Timezone: {getClientTimezone()}</p>
								<p>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
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
												Hold expires in{' '}
												{formatCountdown(holdExpirationCountdown)}
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
												type="button"
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
												<label
													htmlFor={nameId}
													className="block text-sm font-medium mb-1"
												>
													Name <span className="text-destructive">*</span>
												</label>
												<input
													id={nameId}
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
												<label
													htmlFor={emailId}
													className="block text-sm font-medium mb-1"
												>
													Email <span className="text-destructive">*</span>
												</label>
												<input
													id={emailId}
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
												<label
													htmlFor={phoneId}
													className="block text-sm font-medium mb-1"
												>
													Phone{' '}
													<span className="text-muted-foreground">
														(optional)
													</span>
												</label>
												<input
													id={phoneId}
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
										{isLoading ? (
											<div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
												<Loader2 className="h-8 w-8 animate-spin mb-2" />
												<p>Loading available times...</p>
											</div>
										) : displayedSlots.length === 0 ? (
											<div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
												<Clock className="h-8 w-8 mb-2" />
												<p>No available times for this date</p>
											</div>
										) : (
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto p-2">
												{displayedSlots.map((slot) => {
													const isHeldByMe =
														activeHold?.slot.start === slot.start;
													return (
														<Button
															key={`${slot.start}-${slot.end}`}
															type="button"
															variant={isHeldByMe ? 'default' : 'outline'}
															className={cn(
																'w-full justify-start text-left h-auto py-3 px-4',
																isHeldByMe
																	? 'bg-blue-600 hover:bg-blue-700 text-white'
																	: '',
															)}
															onClick={() =>
																isHeldByMe
																	? setShowBookingForm(true)
																	: handleSlotClick(slot)
															}
															disabled={!isHeldByMe && activeHold !== null}
														>
															<div className="flex items-center gap-2 w-full">
																<Clock className="h-4 w-4 shrink-0" />
																<div className="flex-1 text-left">
																	<div className="font-medium">
																		{formatTime(slot.start)} -{' '}
																		{formatTime(slot.end)}
																	</div>
																	{isHeldByMe && (
																		<div className="text-xs opacity-90">
																			Your Hold
																		</div>
																	)}
																</div>
															</div>
														</Button>
													);
												})}
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

				{/* Debug Logs Section */}
				<div className="mt-8 border-t pt-6">
					<details>
						<summary className="cursor-pointer font-medium text-sm text-muted-foreground hover:text-foreground">
							Show Store Logs
						</summary>
						<div className="mt-4 p-4 bg-slate-950 text-slate-50 rounded-lg overflow-x-auto text-xs font-mono max-h-60">
							{debugLogs.length === 0 ? (
								<div className="text-slate-500">No logs yet...</div>
							) : (
								debugLogs.map((log, i) => (
									<div
										key={`${i}-${log.length}`}
										className="border-b border-slate-800 pb-1 mb-1 last:border-0"
									>
										{log}
									</div>
								))
							)}
						</div>
					</details>
				</div>
			</div>
		);
	},
);

EnhancedCalendar.displayName = 'EnhancedCalendar';
