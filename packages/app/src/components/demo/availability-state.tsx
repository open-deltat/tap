'use client';

import { Calendar, Clock, Hash, RefreshCw, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAvailabilityStream } from '../availability-picker';
import { useAvailability } from '../availability-picker/hooks/use-availability';

type AvailabilityStateProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	timezone?: string;
};

export const AvailabilityState = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
	timezone = 'UTC',
}: AvailabilityStateProps) => {
	const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

	const { slots, isLoading, error, cursor, availableDays, refresh } =
		useAvailability({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			selectedDate,
			timezone,
		});

	const { isConnected } = useAvailabilityStream({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		enabled: true,
		onDelta: () => {
			refresh();
		},
	});

	const stats = useMemo(() => {
		if (slots.length === 0) {
			return {
				totalSlots: 0,
				earliestSlot: null,
				latestSlot: null,
				totalHours: 0,
			};
		}

		const sortedSlots = [...slots].sort((a, b) => a.start - b.start);
		const earliest = sortedSlots[0];
		const latest = sortedSlots[sortedSlots.length - 1];

		const totalMs = slots.reduce(
			(acc, slot) => acc + (slot.end - slot.start),
			0,
		);
		const totalHours = totalMs / (1000 * 60 * 60);

		return {
			totalSlots: slots.length,
			earliestSlot: earliest,
			latestSlot: latest,
			totalHours: Math.round(totalHours * 10) / 10,
		};
	}, [slots]);

	const formatTime = (timestamp: number): string => {
		const date = new Date(timestamp);
		return new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: 'numeric',
			hour12: true,
			timeZone: timezone,
			month: 'short',
			day: 'numeric',
		}).format(date);
	};

	const formatDate = (timestamp: number): string => {
		const date = new Date(timestamp);
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: timezone,
		}).format(date);
	};

	return (
		<Card className="h-full flex flex-col shadow-sm border-border/50">
			<CardHeader className="pb-3 border-b bg-muted/5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Calendar className="h-4 w-4 text-primary" />
						<CardTitle className="text-sm font-medium">
							Availability State
						</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<Badge
							variant={isConnected ? 'default' : 'destructive'}
							className="text-[10px] h-5"
						>
							{isConnected ? 'Live' : 'Offline'}
						</Badge>
						<button
							type="button"
							onClick={() => refresh()}
							disabled={isLoading}
							className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
							title="Refresh"
						>
							<RefreshCw
								className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
							/>
						</button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-4 flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
				{error && (
					<div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs border border-destructive/20">
						{error.message}
					</div>
				)}

				<div className="grid grid-cols-2 gap-3">
					<div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1">
						<div className="flex items-center gap-2 text-muted-foreground">
							<TrendingUp className="h-3.5 w-3.5" />
							<span className="text-[10px] font-medium uppercase tracking-wider">
								Total Slots
							</span>
						</div>
						<div className="text-2xl font-bold tabular-nums tracking-tight">
							{stats.totalSlots}
						</div>
					</div>

					<div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Clock className="h-3.5 w-3.5" />
							<span className="text-[10px] font-medium uppercase tracking-wider">
								Total Hours
							</span>
						</div>
						<div className="text-2xl font-bold tabular-nums tracking-tight">
							{stats.totalHours}h
						</div>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Hash className="h-3 w-3" />
						<span className="font-medium">Event Cursor</span>
					</div>
					<div className="font-mono text-[10px] text-foreground bg-muted/50 p-1.5 rounded border truncate">
						{cursor || 'No cursor'}
					</div>
				</div>

				{stats.earliestSlot && stats.latestSlot && (
					<div className="space-y-2">
						<div className="text-xs text-muted-foreground font-medium">
							Time Range
						</div>
						<div className="space-y-1.5 text-xs">
							<div className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border/50">
								<span className="text-muted-foreground">Earliest</span>
								<span className="font-mono font-medium">
									{formatTime(stats.earliestSlot.start)}
								</span>
							</div>
							<div className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border/50">
								<span className="text-muted-foreground">Latest</span>
								<span className="font-mono font-medium">
									{formatTime(stats.latestSlot.end)}
								</span>
							</div>
						</div>
					</div>
				)}

				<div className="flex-1 min-h-0 flex flex-col">
					<div className="flex items-center justify-between mb-2">
						<div className="text-xs text-muted-foreground font-medium">
							Available Days ({availableDays.size})
						</div>
					</div>
					<div className="flex-1 overflow-y-auto">
						{availableDays.size === 0 ? (
							<div className="text-xs text-muted-foreground italic text-center py-4">
								No available days
							</div>
						) : (
							<div className="flex flex-wrap gap-1.5">
								{Array.from(availableDays)
									.sort()
									.map((day) => (
										<Badge
											key={day}
											variant="outline"
											className="text-[10px] font-mono"
										>
											{day}
										</Badge>
									))}
							</div>
						)}
					</div>
				</div>

				{slots.length > 0 && (
					<div className="space-y-2">
						<div className="text-xs text-muted-foreground font-medium">
							Recent Slots ({Math.min(5, slots.length)})
						</div>
						<div className="space-y-1 max-h-32 overflow-y-auto">
							{slots
								.sort((a, b) => a.start - b.start)
								.slice(0, 5)
								.map((slot, idx) => (
									<div
										key={`${slot.start}-${slot.end}-${idx}`}
										className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border/50 text-xs"
									>
										<span className="font-mono text-muted-foreground">
											{formatTime(slot.start)}
										</span>
										<span className="text-muted-foreground">→</span>
										<span className="font-mono font-medium">
											{formatTime(slot.end)}
										</span>
									</div>
								))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
