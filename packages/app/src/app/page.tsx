'use client';

import { EnhancedCalendar } from '@/components/booking/enhanced-calendar';

export default function Home() {
	const apiBaseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

	const handleBookingConfirmed = (bookingId: string) => {
		console.log('Booking confirmed:', bookingId);
		// Show success message or redirect?
	};

	return (
		<main className="container mx-auto p-8">
			<h1 className="text-3xl font-bold mb-8">TAP Booking Demo</h1>
			<EnhancedCalendar
				apiBaseUrl={apiBaseUrl}
				tenantSlug="demo-tenant"
				resourceSlug="demo-resource"
				durationMinutes={60}
				fromHour={9}
				toHour={17}
				onBookingConfirmed={handleBookingConfirmed}
			/>
		</main>
	);
}
