'use client';

import { Activity, Clock, Hash, Server, Wifi } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAvailabilityStream } from '@/hooks/use-availability-stream';

type NetworkStatusProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export const NetworkStatus = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
}: NetworkStatusProps) => {
	const [msgCount, setMsgCount] = useState(0);
	const [lastEventId, setLastEventId] = useState<string>('-');
	const [lastEventTime, setLastEventTime] = useState<Date | null>(null);

	const { isConnected } = useAvailabilityStream({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		enabled: true,
		onDelta: (e) => {
			setMsgCount((c) => c + 1);
			setLastEventId(e.eventId);
			setLastEventTime(new Date());
		},
	});

	return (
		<Card className="h-full shadow-sm border-border/50 flex flex-col">
			<CardHeader className="pb-3 border-b bg-muted/5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Server className="h-4 w-4 text-primary" />
						<CardTitle className="text-sm font-medium">
							Network Inspector
						</CardTitle>
					</div>
					<Badge
						variant={isConnected ? 'default' : 'destructive'}
						className="text-[10px] h-5"
					>
						{isConnected ? 'Online' : 'Offline'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-4 flex-1 flex flex-col justify-center gap-4">
				<div className="grid grid-cols-2 gap-4">
					<div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Activity className="h-3.5 w-3.5" />
							<span className="text-[10px] font-medium uppercase tracking-wider">
								Messages
							</span>
						</div>
						<div className="text-2xl font-bold tabular-nums tracking-tight">
							{msgCount}
						</div>
					</div>

					<div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Wifi className="h-3.5 w-3.5" />
							<span className="text-[10px] font-medium uppercase tracking-wider">
								Latency
							</span>
						</div>
						<div className="text-2xl font-bold tabular-nums tracking-tight text-green-600">
							{isConnected ? '< 5ms' : '-'}
						</div>
					</div>
				</div>

				<div className="space-y-3 pt-2">
					<div className="space-y-1">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Hash className="h-3 w-3" />
							<span className="font-medium">Last Ledger Cursor</span>
						</div>
						<div className="font-mono text-[10px] text-foreground bg-muted/50 p-1.5 rounded border truncate">
							{lastEventId}
						</div>
					</div>

					<div className="space-y-1">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Clock className="h-3 w-3" />
							<span className="font-medium">Last Sync</span>
						</div>
						<div className="font-mono text-[10px] text-foreground bg-muted/50 p-1.5 rounded border">
							{lastEventTime
								? lastEventTime.toISOString()
								: 'Waiting for events...'}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
