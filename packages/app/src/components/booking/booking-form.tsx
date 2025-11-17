'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { AvailabilitySlot } from '@/lib/availability-state';
import { format, fromUnixTimestamp } from '@/lib/timezone';

export type BookingFormProps = {
	slot: AvailabilitySlot;
	onSubmit: (data: {
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}) => Promise<void>;
	onCancel: () => void;
	isSubmitting?: boolean;
	error?: Error | null;
};

export const BookingForm = React.memo<BookingFormProps>(
	({ slot, onSubmit, onCancel, isSubmitting = false, error }) => {
		const nameId = React.useId();
		const emailId = React.useId();
		const phoneId = React.useId();
		const [customerName, setCustomerName] = React.useState('');
		const [customerEmail, setCustomerEmail] = React.useState('');
		const [customerPhone, setCustomerPhone] = React.useState('');

		const handleSubmit = async (e: React.FormEvent) => {
			e.preventDefault();
			if (!customerName.trim() || !customerEmail.trim()) {
				return;
			}
			await onSubmit({
				customerName: customerName.trim(),
				customerEmail: customerEmail.trim(),
				customerPhone: customerPhone.trim() || undefined,
			});
		};

		const formatTime = (timestamp: number): string => {
			const date = fromUnixTimestamp(timestamp);
			return format(date, 'h:mm a');
		};

		return (
			<div className="mt-6 p-6 border rounded-lg bg-card">
				<h3 className="text-lg font-semibold mb-4">Complete Your Booking</h3>
				<p className="text-sm text-muted-foreground mb-4">
					{formatTime(slot.start)} - {formatTime(slot.end)}
				</p>

				{error && (
					<div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
						{error.message}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor={nameId} className="block text-sm font-medium mb-1">
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
							disabled={isSubmitting}
						/>
					</div>

					<div>
						<label htmlFor={emailId} className="block text-sm font-medium mb-1">
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
							disabled={isSubmitting}
						/>
					</div>

					<div>
						<label htmlFor={phoneId} className="block text-sm font-medium mb-1">
							Phone <span className="text-muted-foreground">(optional)</span>
						</label>
						<input
							id={phoneId}
							type="tel"
							value={customerPhone}
							onChange={(e) => setCustomerPhone(e.target.value)}
							className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
							placeholder="+1 (555) 123-4567"
							disabled={isSubmitting}
						/>
					</div>

					<div className="flex gap-3 pt-2">
						<Button
							type="submit"
							disabled={
								isSubmitting || !customerName.trim() || !customerEmail.trim()
							}
							className="flex-1"
						>
							{isSubmitting ? 'Booking...' : 'Confirm Booking'}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onCancel}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
					</div>
				</form>
			</div>
		);
	},
);

BookingForm.displayName = 'BookingForm';
