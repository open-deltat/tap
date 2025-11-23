'use client';

import { Activity, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAvailabilityStream } from '@/hooks/use-availability-stream';

type EventLoggerProps = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

type LogEntry = {
	id: string;
	timestamp: Date;
	type: string;
	payload?: Record<string, unknown>;
};

export const EventLogger = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
}: EventLoggerProps) => {
	const [logs, setLogs] = useState<LogEntry[]>([]);

	const addLog = (type: string, payload?: Record<string, unknown>) => {
		setLogs((prev) => [
			{
				id: Math.random().toString(36).substring(7),
				timestamp: new Date(),
				type,
				payload,
			},
			...prev.slice(0, 49),
		]);
	};

	const { isConnected } = useAvailabilityStream({
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		enabled: true,
		onConnect: () => addLog('Connection', { status: 'Connected' }),
		onDisconnect: () => addLog('Connection', { status: 'Disconnected' }),
		onDelta: (event) => addLog(event.type, event.payload),
	});

	return (
		<Card className="h-[400px] flex flex-col shadow-sm border-border/50">
			<CardHeader className="pb-3 border-b bg-muted/5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Activity className="h-4 w-4 text-primary" />
						<CardTitle className="text-sm font-medium">
							Live Protocol Stream
						</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<Badge
							variant={isConnected ? 'default' : 'destructive'}
							className="text-[10px] h-5"
						>
							{isConnected ? 'Connected' : 'Disconnected'}
						</Badge>
						<button
							type="button"
							onClick={() => setLogs([])}
							className="text-muted-foreground hover:text-foreground transition-colors"
							title="Clear logs"
						>
							<RefreshCw className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
				<div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40">
					<div className="flex flex-col divide-y">
						{logs.length === 0 ? (
							<div className="p-8 text-center text-xs text-muted-foreground italic">
								Waiting for events...
							</div>
						) : (
							logs.map((log) => (
								<div
									key={log.id}
									className="p-3 hover:bg-muted/5 transition-colors"
								>
									<div className="flex items-center justify-between mb-1.5">
										<Badge
											variant="outline"
											className="font-mono text-[10px] uppercase tracking-wider"
										>
											{log.type}
										</Badge>
										<span className="text-[10px] text-muted-foreground font-mono">
											{log.timestamp.toLocaleTimeString()}
										</span>
									</div>
									{log.payload && (
										<div className="font-mono text-[10px] text-muted-foreground break-all bg-muted/30 p-2 rounded-md">
											{JSON.stringify(log.payload, null, 2)}
										</div>
									)}
								</div>
							))
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
