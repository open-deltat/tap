'use client';

import type { ResourceId, TenantId } from '@tap/protocol';
import { BookingsCalendar } from '@/components/demo/bookings-calendar';

const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
const TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;
const RESOURCE_ID = '01AN4Z07BY79KA1307SR9X4MV4' as ResourceId;

export default function AdminPage() {
	return (
		<main className="min-h-screen bg-muted/5 p-4 md:p-8">
			<div className="max-w-4xl mx-auto space-y-6">
				<header>
					<h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
					<p className="text-sm text-muted-foreground">
						Resource booking overview
					</p>
				</header>

				<div className="h-[600px]">
					<BookingsCalendar
						apiBaseUrl={API_BASE_URL}
						tenantId={TENANT_ID}
						resourceId={RESOURCE_ID}
						initialTimezone="Europe/Berlin"
					/>
				</div>
			</div>
		</main>
	);
}
