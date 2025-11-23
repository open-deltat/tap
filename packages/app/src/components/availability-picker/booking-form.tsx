'use client';

import { createSlotId } from '@tap/protocol';
import { Check, ChevronLeft, Clock, Info, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TimeRange } from '../availability-picker';

export type BookingFormProps = {
	activeHold: {
		holdId: string;
		sessionId: string;
		expiresAt: number;
		slot: TimeRange;
	};
	bookingError: Error | null;
	isConfirming: boolean;
	onReleaseHold: () => void;
	onConfirmBooking: (params: {
		slotId: string;
		customerName: string;
		customerEmail: string;
		customerPhone: string;
	}) => Promise<void>;
	formatTime: (timestamp: number) => string;
	formatCountdown: (ms: number) => string;
	holdExpirationCountdown: number | null;
};

export const BookingForm = ({
	activeHold,
	bookingError,
	isConfirming,
	onReleaseHold,
	onConfirmBooking,
	formatTime,
	formatCountdown,
	holdExpirationCountdown,
}: BookingFormProps) => {
	const nameId = React.useId();
	const emailId = React.useId();
	const phoneId = React.useId();

	const [customerName, setCustomerName] = React.useState('');
	const [customerEmail, setCustomerEmail] = React.useState('');
	const [customerPhone, setCustomerPhone] = React.useState('');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!customerName.trim() || !customerEmail.trim()) return;

		const slotId = createSlotId(
			new Date(activeHold.slot.start),
			new Date(activeHold.slot.end),
		);

		await onConfirmBooking({
			slotId,
			customerName: customerName.trim(),
			customerEmail: customerEmail.trim(),
			customerPhone: customerPhone.trim(),
		});
	};

	return (
		<div className="absolute inset-0 bg-background z-10 flex flex-col animate-in slide-in-from-right-4 duration-300">
			<div className="p-4 border-b flex items-center justify-between bg-muted/10">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={onReleaseHold}
						className="h-7 w-7"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<div>
						<h3 className="font-semibold text-sm">Confirm Booking</h3>
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Clock className="h-3 w-3" />
							<span>
								{formatTime(activeHold.slot.start)} -{' '}
								{formatTime(activeHold.slot.end)}
							</span>
						</div>
					</div>
				</div>
				{holdExpirationCountdown !== null && (
					<Badge
						variant="secondary"
						className="text-[10px] font-medium px-2 py-0.5 bg-orange-100 text-orange-700 hover:bg-orange-100 animate-pulse tabular-nums"
					>
						{formatCountdown(holdExpirationCountdown)}
					</Badge>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				{bookingError && (
					<div className="mb-6 p-3 bg-destructive/10 text-destructive rounded-lg flex items-start gap-2 text-xs">
						<Info className="h-4 w-4 shrink-0" />
						<p>{bookingError.message}</p>
					</div>
				)}

				<form
					onSubmit={handleSubmit}
					className="space-y-4 max-w-sm mx-auto mt-2"
				>
					<div className="space-y-1.5">
						<Label htmlFor={nameId}>Full Name</Label>
						<Input
							id={nameId}
							type="text"
							required
							value={customerName}
							onChange={(e) => setCustomerName(e.target.value)}
							placeholder="Jane Doe"
							disabled={isConfirming}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor={emailId}>Email Address</Label>
						<Input
							id={emailId}
							type="email"
							required
							value={customerEmail}
							onChange={(e) => setCustomerEmail(e.target.value)}
							placeholder="jane@example.com"
							disabled={isConfirming}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor={phoneId}>
							Phone Number{' '}
							<span className="text-muted-foreground font-normal">
								(Optional)
							</span>
						</Label>
						<Input
							id={phoneId}
							type="tel"
							value={customerPhone}
							onChange={(e) => setCustomerPhone(e.target.value)}
							placeholder="+1 (555) 000-0000"
							disabled={isConfirming}
						/>
					</div>

					<div className="pt-4">
						<Button
							type="submit"
							className="w-full h-9 text-sm"
							disabled={
								isConfirming || !customerName.trim() || !customerEmail.trim()
							}
						>
							{isConfirming ? (
								<>
									<Loader2 className="mr-2 h-3 w-3 animate-spin" />
									Confirming...
								</>
							) : (
								<>
									<Check className="mr-2 h-3 w-3" />
									Confirm Booking
								</>
							)}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};
