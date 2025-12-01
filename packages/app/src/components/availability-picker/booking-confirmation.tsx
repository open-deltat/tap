'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type BookingConfirmationProps = {
	onConfirm: (customer: {
		name: string;
		email: string;
		phone: string;
	}) => Promise<void>;
	isConfirming: boolean;
	error: Error | null;
};

export const BookingConfirmation = ({
	onConfirm,
	isConfirming,
	error,
}: BookingConfirmationProps) => {
	const nameId = React.useId();
	const emailId = React.useId();
	const phoneId = React.useId();

	const [name, setName] = React.useState('');
	const [email, setEmail] = React.useState('');
	const [phone, setPhone] = React.useState('');
	const nameRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		const timer = setTimeout(() => nameRef.current?.focus(), 100);
		return () => clearTimeout(timer);
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !email.trim()) return;
		await onConfirm({
			name: name.trim(),
			email: email.trim(),
			phone: phone.trim(),
		});
	};

	const isValid = name.trim() && email.trim() && email.includes('@');

	return (
		<div className="p-4 max-w-sm mx-auto w-full">
			{error && (
				<div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
					<AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
					<p className="text-sm text-destructive">{error.message}</p>
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor={nameId}>Full Name</Label>
					<Input
						ref={nameRef}
						id={nameId}
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Jane Doe"
						required
						disabled={isConfirming}
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor={emailId}>Email Address</Label>
					<Input
						id={emailId}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="jane@example.com"
						required
						disabled={isConfirming}
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor={phoneId}>
						Phone Number{' '}
						<span className="text-muted-foreground font-normal">
							(optional)
						</span>
					</Label>
					<Input
						id={phoneId}
						type="tel"
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
						placeholder="+1 (555) 000-0000"
						disabled={isConfirming}
					/>
				</div>

				<div className="pt-2">
					<Button
						type="submit"
						className="w-full"
						disabled={!isValid || isConfirming}
					>
						{isConfirming ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Confirming...
							</>
						) : (
							<>
								<Check className="mr-2 h-4 w-4" />
								Confirm Booking
							</>
						)}
					</Button>
				</div>
			</form>
		</div>
	);
};
