'use client';

import type { ResourceId, TenantId } from '@tap/protocol';
import * as React from 'react';
import { BookingFlow } from '@/components/availability-picker/booking-flow';
import { AvailabilityState } from '@/components/demo/availability-state';
import { EventLogger } from '@/components/demo/event-logger';
import { NetworkStatus } from '@/components/demo/network-status';

export default function Home() {
	const apiBaseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

	const TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;
	const RESOURCE_ID = '01AN4Z07BY79KA1307SR9X4MV4' as ResourceId;

	const [clientATimezone, setClientATimezone] =
		React.useState<string>('Europe/Berlin');
	const [clientBTimezone, setClientBTimezone] =
		React.useState<string>('America/New_York');

	const handleBookingConfirmed = (bookingId: string) => {
		console.log('Booking confirmed:', bookingId);
	};

	return (
		<main className="min-h-screen bg-muted/5 p-4 md:p-8">
			<div className="max-w-[1600px] mx-auto space-y-6">
				<header className="flex justify-between items-center">
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							TAP Protocol Demo
						</h1>
						<p className="text-sm text-muted-foreground">
							Federated real-time booking synchronization
						</p>
					</div>
				</header>

				{/* Main Demo Area: Two Independent Clients */}
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
					{/* Client A */}
					<div className="space-y-3">
						<div className="flex items-center justify-between px-1">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
								<h2 className="text-sm font-medium text-foreground">
									Client A ({clientATimezone.split('/').pop()})
								</h2>
							</div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								Connected
							</span>
						</div>
						<div className="bg-white rounded-3xl shadow-sm border p-1">
							<BookingFlow
								apiBaseUrl={apiBaseUrl}
								tenantSlug={TENANT_ID}
								resourceSlug={RESOURCE_ID}
								durationMs={60 * 60000}
								onBookingConfirmed={handleBookingConfirmed}
								className="h-auto md:h-[500px] border-none shadow-none"
								initialTimezone="Europe/Berlin"
								onTimezoneChange={setClientATimezone}
							/>
						</div>
					</div>

					{/* Client B */}
					<div className="space-y-3">
						<div className="flex items-center justify-between px-1">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
								<h2 className="text-sm font-medium text-foreground">
									Client B ({clientBTimezone.split('/').pop()})
								</h2>
							</div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								Connected
							</span>
						</div>
						<div className="bg-white rounded-3xl shadow-sm border p-1">
							<BookingFlow
								apiBaseUrl={apiBaseUrl}
								tenantSlug={TENANT_ID}
								resourceSlug={RESOURCE_ID}
								durationMs={60 * 60000}
								onBookingConfirmed={handleBookingConfirmed}
								className="h-auto md:h-[500px] border-none shadow-none"
								initialTimezone="America/New_York"
								onTimezoneChange={setClientBTimezone}
							/>
						</div>
					</div>
				</div>

				{/* Info & Logs Section */}
				<div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-auto lg:h-[400px]">
					<div className="lg:col-span-2">
						<EventLogger
							apiBaseUrl={apiBaseUrl}
							tenantSlug={TENANT_ID}
							resourceSlug={RESOURCE_ID}
						/>
					</div>
					<div className="lg:col-span-1">
						<AvailabilityState
							apiBaseUrl={apiBaseUrl}
							tenantSlug={TENANT_ID}
							resourceSlug={RESOURCE_ID}
							timezone={clientATimezone}
						/>
					</div>
					<div className="lg:col-span-1">
						<NetworkStatus
							apiBaseUrl={apiBaseUrl}
							tenantSlug={TENANT_ID}
							resourceSlug={RESOURCE_ID}
						/>
					</div>
				</div>
			</div>
		</main>
	);
}
