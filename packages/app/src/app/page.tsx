'use client';

import { BookingCalendar } from '@/components/booking/booking-calendar';

export default function Home() {
	const apiBaseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

	const handleSlotSelected = (slot: { start: number; end: number }) => {
		console.log('Selected slot:', slot);
	};

	return (
		<main className="container mx-auto p-8">
			<h1 className="text-3xl font-bold mb-8">Book Appointment</h1>
			<BookingCalendar
				apiBaseUrl={apiBaseUrl}
				tenantSlug="demo-tenant"
				resourceSlug="demo-resource"
				durationMinutes={60}
				fromHour={9}
				toHour={17}
				onSlotSelected={handleSlotSelected}
			/>
		</main>
	);
}
