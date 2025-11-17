import type { BookingId, ResourceId, TenantId } from '@tap/core';
import { createAllocator, createInMemoryEventStore } from '@tap/core';
import { ulid } from 'ulid';
import { getAvailability } from '../services/availability';
import { createTenantResolver } from '../services/tenant-resolver';
import type { PublicBookRequest } from '../types';

const allocator = createAllocator();
const eventStore = createInMemoryEventStore();
const tenantResolver = createTenantResolver();

const tenants = new Map<string, TenantId>();
const resources = new Map<string, { id: ResourceId; tenantId: TenantId }>();

const matchRoute = (
	pathname: string,
	pattern: string,
): Record<string, string> | null => {
	const patternParts = pattern.split('/').filter(Boolean);
	const pathParts = pathname.split('/').filter(Boolean);

	if (patternParts.length !== pathParts.length) {
		return null;
	}

	const params: Record<string, string> = {};
	for (let i = 0; i < patternParts.length; i++) {
		const patternPart = patternParts[i];
		const pathPart = pathParts[i];
		if (!patternPart || !pathPart) {
			return null;
		}
		if (patternPart.startsWith(':')) {
			const key = patternPart.slice(1);
			params[key] = pathPart;
		} else if (patternPart !== pathPart) {
			return null;
		}
	}
	return params;
};

export const handlePublicRequest = async (req: Request): Promise<Response> => {
	const url = new URL(req.url);
	const pathname = url.pathname;

	if (
		req.method === 'GET' &&
		pathname.match(/^\/v1\/public\/[^/]+\/[^/]+\/availability$/)
	) {
		try {
			const match = matchRoute(
				pathname,
				'/v1/public/:tenantSlug/:resourceSlug/availability',
			);
			if (!match) {
				return new Response('Not Found', { status: 404 });
			}

			const tenantSlug = match.tenantSlug;
			const resourceSlug = match.resourceSlug;
			if (!tenantSlug || !resourceSlug) {
				return new Response('Not Found', { status: 404 });
			}

			const url = new URL(req.url);
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			const durationMinutes = url.searchParams.get('durationMinutes');

			if (!from || !to) {
				return new Response(
					JSON.stringify({ error: 'Missing required query params: from, to' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const tenantId = await tenantResolver.resolveBySlug(tenantSlug);
			if (!tenantId) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = resources.get(`${tenantSlug}:${resourceSlug}`);
			if (!resource || resource.tenantId !== tenantId) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const fromDate = new Date(from);
			const toDate = new Date(to);
			const slots: Array<{ start: number; end: number }> = [];

			for (
				let date = new Date(fromDate);
				date <= toDate;
				date.setDate(date.getDate() + 1)
			) {
				const day = date.toISOString().split('T')[0];
				if (!day) continue;
				const state = allocator.getState(tenantId, resource.id);
				const availabilityParams: Parameters<typeof getAvailability>[0] = {
					state,
					day,
				};
				if (durationMinutes) {
					availabilityParams.durationMinutes = parseInt(durationMinutes, 10);
				}
				const daySlots = getAvailability(availabilityParams);
				slots.push(...daySlots);
			}

			return new Response(JSON.stringify({ slots }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: error instanceof Error ? error.message : 'Unknown error',
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
		}
	}

	if (
		req.method === 'POST' &&
		pathname.match(/^\/v1\/public\/[^/]+\/[^/]+\/book$/)
	) {
		try {
			const match = matchRoute(
				pathname,
				'/v1/public/:tenantSlug/:resourceSlug/book',
			);
			if (!match) {
				return new Response('Not Found', { status: 404 });
			}

			const tenantSlug = match.tenantSlug;
			const resourceSlug = match.resourceSlug;
			if (!tenantSlug || !resourceSlug) {
				return new Response('Not Found', { status: 404 });
			}

			const body = (await req.json()) as PublicBookRequest;

			if (
				!body.start ||
				!body.end ||
				!body.customerName ||
				!body.customerEmail
			) {
				return new Response(
					JSON.stringify({
						error:
							'Missing required fields: start, end, customerName, customerEmail',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const tenantId = await tenantResolver.resolveBySlug(tenantSlug);
			if (!tenantId) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = resources.get(`${tenantSlug}:${resourceSlug}`);
			if (!resource || resource.tenantId !== tenantId) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const startDate = new Date(body.start);
			const endDate = new Date(body.end);
			const dayStr = startDate.toISOString().split('T')[0];
			if (!dayStr) {
				return new Response(JSON.stringify({ error: 'Invalid start date' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			const day = dayStr;
			const startMinute = startDate.getHours() * 60 + startDate.getMinutes();
			const endMinute = endDate.getHours() * 60 + endDate.getMinutes();

			const holdResult = await allocator.placeHold({
				tenantId,
				resourceId: resource.id,
				day,
				startMinute,
				endMinute,
				expiresAt: Date.now() + 60_000,
			});

			if (!holdResult.success) {
				return new Response(JSON.stringify({ error: 'Slot not available' }), {
					status: 409,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			await eventStore.append(holdResult.event);

			const bookingId = ulid() as BookingId;
			const confirmParams: Parameters<typeof allocator.confirmBooking>[0] = {
				tenantId,
				resourceId: resource.id,
				holdId: holdResult.holdId,
				bookingId,
				start: startDate.getTime(),
				end: endDate.getTime(),
				customerName: body.customerName,
				customerEmail: body.customerEmail,
				paymentStatus: 'NONE',
			};

			if (body.customerPhone) {
				confirmParams.customerPhone = body.customerPhone;
			}

			const confirmEvent = await allocator.confirmBooking(confirmParams);

			if (!confirmEvent) {
				return new Response(
					JSON.stringify({ error: 'Failed to confirm booking' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } },
				);
			}

			await eventStore.append(confirmEvent);

			return new Response(
				JSON.stringify({
					bookingId,
					start: startDate.toISOString(),
					end: endDate.toISOString(),
					status: 'CONFIRMED',
				}),
				{ status: 201, headers: { 'Content-Type': 'application/json' } },
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: error instanceof Error ? error.message : 'Unknown error',
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
		}
	}

	return new Response('Not Found', { status: 404 });
};

export const registerTenant = (slug: string, id: TenantId) => {
	tenants.set(slug, id);
	tenantResolver.register(slug, id);
};

export const registerResource = (
	tenantSlug: string,
	resourceSlug: string,
	id: ResourceId,
	tenantId: TenantId,
) => {
	resources.set(`${tenantSlug}:${resourceSlug}`, { id, tenantId });
};
