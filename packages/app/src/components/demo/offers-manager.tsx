'use client';

import {
	API_ROUTES,
	type OfferInput,
	type OffersGetResponse,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import {
	Calendar,
	Clock,
	Globe,
	Loader2,
	Plus,
	Repeat,
	Trash2,
	X,
} from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OffersManagerProps = {
	apiBaseUrl: string;
	tenantId: TenantId;
	resourceId: ResourceId;
	initialTimezone?: string;
};

const DAYS = [
	{ value: 0, label: 'Sun' },
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' },
];

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

export const OffersManager = ({
	apiBaseUrl,
	tenantId,
	resourceId,
	initialTimezone = 'Europe/Berlin',
}: OffersManagerProps) => {
	const [timezone, setTimezone] = React.useState(initialTimezone);
	const [offers, setOffers] = React.useState<OffersGetResponse['offers']>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isCreating, setIsCreating] = React.useState(false);
	const [deletingId, setDeletingId] = React.useState<string | null>(null);
	const [showForm, setShowForm] = React.useState(false);
	const [offerType, setOfferType] = React.useState<'weekly' | 'range'>(
		'weekly',
	);

	const [weeklyDays, setWeeklyDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
	const [startTime, setStartTime] = React.useState('09:00');
	const [endTime, setEndTime] = React.useState('17:00');
	const [rangeStart, setRangeStart] = React.useState('');
	const [rangeEnd, setRangeEnd] = React.useState('');

	const fetchOffers = React.useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await fetch(
				`${apiBaseUrl}${API_ROUTES.OFFERS}?resourceId=${resourceId}`,
			);
			if (!response.ok) throw new Error('Failed to fetch offers');
			const data = (await response.json()) as OffersGetResponse;
			setOffers(data.offers);
		} catch (error) {
			console.error('Error fetching offers:', error);
		} finally {
			setIsLoading(false);
		}
	}, [apiBaseUrl, resourceId]);

	React.useEffect(() => {
		fetchOffers();
	}, [fetchOffers]);

	const handleCreate = async () => {
		setIsCreating(true);
		try {
			const offer: OfferInput =
				offerType === 'weekly'
					? {
							type: 'weekly',
							tenantId,
							resourceId,
							daysOfWeek: weeklyDays,
							startTime,
							endTime,
							timezone,
							capacity: 1,
							currency: 'USD',
						}
					: {
							type: 'range',
							tenantId,
							resourceId,
							start: new Date(rangeStart).toISOString(),
							end: new Date(rangeEnd).toISOString(),
							timezone,
							capacity: 1,
							currency: 'USD',
						};

			const response = await fetch(`${apiBaseUrl}${API_ROUTES.OFFERS_CREATE}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(offer),
			});

			if (!response.ok) throw new Error('Failed to create offer');

			setShowForm(false);
			setWeeklyDays([1, 2, 3, 4, 5]);
			setStartTime('09:00');
			setEndTime('17:00');
			setRangeStart('');
			setRangeEnd('');
			await fetchOffers();
		} catch (error) {
			console.error('Error creating offer:', error);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async (offerId: string) => {
		setDeletingId(offerId);
		try {
			const response = await fetch(`${apiBaseUrl}${API_ROUTES.OFFERS_DELETE}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ offerId }),
			});

			if (!response.ok) throw new Error('Failed to delete offer');
			await fetchOffers();
		} catch (error) {
			console.error('Error deleting offer:', error);
		} finally {
			setDeletingId(null);
		}
	};

	const toggleDay = (day: number) => {
		setWeeklyDays((prev) =>
			prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
		);
	};

	const formatOffer = (offer: OffersGetResponse['offers'][number]) => {
		if (offer.type === 'weekly') {
			const days = offer.daysOfWeek
				.sort((a, b) => a - b)
				.map((d) => DAYS.find((day) => day.value === d)?.label)
				.join(', ');
			return `${days} ${offer.startTime}–${offer.endTime}`;
		}
		const start = new Date(offer.start);
		const end = new Date(offer.end);
		return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
	};

	return (
		<div className="bg-background rounded-2xl border shadow-sm overflow-hidden h-full flex flex-col">
			<div className="flex items-center justify-between p-3 border-b">
				<div className="flex items-center gap-2">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium">Offers</span>
					<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
						{offers.length}
					</Badge>
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
					{isLoading && (
						<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowForm(true)}
						className="h-7 text-xs"
					>
						<Plus className="h-3 w-3 mr-1" />
						Add
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-2 space-y-1">
				{offers.length === 0 && !isLoading && (
					<div className="text-center text-xs text-muted-foreground py-8">
						No offers configured.
						<br />
						Add one to enable availability.
					</div>
				)}
				{offers.map((offer) => (
					<div
						key={offer.id}
						className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
					>
						<div className="flex items-center gap-2">
							{offer.type === 'weekly' ? (
								<Repeat className="h-3 w-3 text-muted-foreground" />
							) : (
								<Clock className="h-3 w-3 text-muted-foreground" />
							)}
							<span className="text-xs">{formatOffer(offer)}</span>
							<Badge
								variant={offer.type === 'weekly' ? 'default' : 'secondary'}
								className="text-[8px] px-1 py-0"
							>
								{offer.type}
							</Badge>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => offer.id && handleDelete(offer.id)}
							disabled={!offer.id || deletingId === offer.id}
						>
							{offer.id && deletingId === offer.id ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
							)}
						</Button>
					</div>
				))}
			</div>

			{showForm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-background rounded-xl border shadow-lg p-4 max-w-sm w-full mx-4">
						<div className="flex items-center justify-between mb-4">
							<h3 className="font-semibold text-sm">Create Offer</h3>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setShowForm(false)}
								className="h-6 w-6"
							>
								<X className="h-3 w-3" />
							</Button>
						</div>

						<div className="space-y-4">
							<div className="flex gap-2">
								<Button
									variant={offerType === 'weekly' ? 'default' : 'outline'}
									size="sm"
									onClick={() => setOfferType('weekly')}
									className="flex-1"
								>
									<Repeat className="h-3 w-3 mr-1" />
									Weekly
								</Button>
								<Button
									variant={offerType === 'range' ? 'default' : 'outline'}
									size="sm"
									onClick={() => setOfferType('range')}
									className="flex-1"
								>
									<Clock className="h-3 w-3 mr-1" />
									One-time
								</Button>
							</div>

							{offerType === 'weekly' ? (
								<>
									<div>
										<Label className="text-xs">Days</Label>
										<div className="flex gap-1 mt-1">
											{DAYS.map((day) => (
												<Button
													key={day.value}
													variant={
														weeklyDays.includes(day.value)
															? 'default'
															: 'outline'
													}
													size="sm"
													onClick={() => toggleDay(day.value)}
													className="h-7 w-8 p-0 text-[10px]"
												>
													{day.label.slice(0, 2)}
												</Button>
											))}
										</div>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div>
											<Label className="text-xs">Start</Label>
											<Input
												type="time"
												value={startTime}
												onChange={(e) => setStartTime(e.target.value)}
												className="h-8 text-xs"
											/>
										</div>
										<div>
											<Label className="text-xs">End</Label>
											<Input
												type="time"
												value={endTime}
												onChange={(e) => setEndTime(e.target.value)}
												className="h-8 text-xs"
											/>
										</div>
									</div>
								</>
							) : (
								<>
									<div>
										<Label className="text-xs">Start Date/Time</Label>
										<Input
											type="datetime-local"
											value={rangeStart}
											onChange={(e) => setRangeStart(e.target.value)}
											className="h-8 text-xs"
										/>
									</div>
									<div>
										<Label className="text-xs">End Date/Time</Label>
										<Input
											type="datetime-local"
											value={rangeEnd}
											onChange={(e) => setRangeEnd(e.target.value)}
											className="h-8 text-xs"
										/>
									</div>
								</>
							)}
						</div>

						<div className="mt-4 flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="flex-1"
								onClick={() => setShowForm(false)}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="flex-1"
								onClick={handleCreate}
								disabled={isCreating}
							>
								{isCreating ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									'Create'
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
