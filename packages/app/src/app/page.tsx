'use client';

import type { ResourceId, TenantId } from '@tap/protocol';
import Link from 'next/link';
import { EnhancedCalendar } from '@/components/booking/enhanced-calendar';

export default function Home() {
	const apiBaseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

	// Hardcoded IDs for demo
	const TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;
	const RESOURCE_ID = '01AN4Z07BY79KA1307SR9X4MV4' as ResourceId;

	const handleBookingConfirmed = (bookingId: string) => {
		console.log('Booking confirmed:', bookingId);
		alert(`Booking Confirmed! ID: ${bookingId}`);
	};

	return (
		<main className="container mx-auto p-8 max-w-6xl">
			<div className="flex justify-between items-center mb-8">
				<h1 className="text-3xl font-bold">TAP Booking Demo</h1>
				<Link
					href="/debug"
					className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors"
				>
					Go to Debugger
				</Link>
			</div>

			<div className="bg-white rounded-xl shadow-sm border p-6">
				<EnhancedCalendar
					apiBaseUrl={apiBaseUrl}
					tenantSlug={TENANT_ID}
					resourceSlug={RESOURCE_ID}
					durationMs={60 * 60000}
					fromHour={9}
					toHour={17}
					onBookingConfirmed={handleBookingConfirmed}
				/>
			</div>
		</main>
	);
}
