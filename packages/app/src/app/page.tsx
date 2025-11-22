'use client';

import type { ResourceId, TenantId } from '@tap/protocol';
import Link from 'next/link';
import { BookingFlow } from '@/components/booking/booking-flow';
import { EventLogger } from '@/components/demo/event-logger';
import { NetworkStatus } from '@/components/demo/network-status';

export default function Home() {
	const apiBaseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

	// Hardcoded IDs for demo
	const TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;
	const RESOURCE_ID = '01AN4Z07BY79KA1307SR9X4MV4' as ResourceId;

	const handleBookingConfirmed = (bookingId: string) => {
		console.log('Booking confirmed:', bookingId);
		// alert(`Booking Confirmed! ID: ${bookingId}`);
	};

	return (
		<main className="min-h-screen bg-muted/5 p-4 md:p-8">
			<div className="max-w-[1600px] mx-auto space-y-6">
				<header className="flex justify-between items-center">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">
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
								<div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
								<h2 className="text-sm font-medium text-blue-600">
									Client A (Berlin)
								</h2>
							</div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								Connected
							</span>
						</div>
						<div className="bg-white rounded-xl shadow-sm border p-1">
							<BookingFlow
								apiBaseUrl={apiBaseUrl}
								tenantSlug={TENANT_ID}
								resourceSlug={RESOURCE_ID}
								durationMs={60 * 60000}
								onBookingConfirmed={handleBookingConfirmed}
								className="h-auto md:h-[500px] border-none shadow-none"
								initialTimezone="Europe/Berlin"
							/>
						</div>
					</div>

					{/* Client B */}
					<div className="space-y-3">
						<div className="flex items-center justify-between px-1">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
								<h2 className="text-sm font-medium text-indigo-600">
									Client B (New York)
								</h2>
							</div>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
								Connected
							</span>
						</div>
						<div className="bg-white rounded-xl shadow-sm border p-1">
							<BookingFlow
								apiBaseUrl={apiBaseUrl}
								tenantSlug={TENANT_ID}
								resourceSlug={RESOURCE_ID}
								durationMs={60 * 60000}
								onBookingConfirmed={handleBookingConfirmed}
								className="h-auto md:h-[500px] border-none shadow-none"
								initialTimezone="America/New_York"
							/>
						</div>
					</div>
				</div>

				{/* Info & Logs Section */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[400px]">
					<div className="lg:col-span-2">
						<EventLogger
							apiBaseUrl={apiBaseUrl}
							tenantSlug={TENANT_ID}
							resourceSlug={RESOURCE_ID}
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
