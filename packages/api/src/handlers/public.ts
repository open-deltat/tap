import type { BookingId, HoldId, ResourceId, TenantId } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import { ulid } from 'ulid';
import { getAvailability } from '../services/availability';
import {
	getAllocator,
	getEventStore,
	offerRepository,
	resourceRepository,
	tenantRepository,
	validateHorizon,
} from '../services/context';
import type { PublicBookRequest } from '../types';

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

			const tenant = await tenantRepository.getBySlug(tenantSlug);
			if (!tenant) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = await resourceRepository.getBySlug(
				tenantSlug,
				resourceSlug,
			);
			if (!resource || resource.tenantId !== tenant.id) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const offers = await offerRepository.getByResourceId(resource.id);
			const allocator = getAllocator();
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

				const horizonCheck = validateHorizon(day, resource);
				if (!horizonCheck.valid) {
					continue;
				}

				const state = allocator.getState(
					tenant.id as TenantId,
					resource.id as ResourceId,
				);
				const availabilityParams: Parameters<typeof getAvailability>[0] = {
					state,
					day,
					offers,
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
		pathname.match(/^\/v1\/public\/[^/]+\/[^/]+\/hold$/)
	) {
		try {
			const match = matchRoute(
				pathname,
				'/v1/public/:tenantSlug/:resourceSlug/hold',
			);
			if (!match) {
				return new Response('Not Found', { status: 404 });
			}

			const tenantSlug = match.tenantSlug;
			const resourceSlug = match.resourceSlug;
			if (!tenantSlug || !resourceSlug) {
				return new Response('Not Found', { status: 404 });
			}

			const body = (await req.json()) as {
				start: string | number;
				end: string | number;
				clientRef?: string;
			};
			if (!body.start || !body.end) {
				return new Response(
					JSON.stringify({ error: 'Missing required fields: start, end' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const tenant = await tenantRepository.getBySlug(tenantSlug);
			if (!tenant) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = await resourceRepository.getBySlug(
				tenantSlug,
				resourceSlug,
			);
			if (!resource || resource.tenantId !== tenant.id) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const startUnix =
				typeof body.start === 'number'
					? body.start
					: new Date(body.start).getTime();
			const endUnix =
				typeof body.end === 'number' ? body.end : new Date(body.end).getTime();

			if (Number.isNaN(startUnix) || Number.isNaN(endUnix)) {
				return new Response(
					JSON.stringify({ error: 'Invalid start or end date' }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
				);
			}

			const startDate = new Date(startUnix);
			const dayStr = startDate.toISOString().split('T')[0];
			if (!dayStr) {
				return new Response(JSON.stringify({ error: 'Invalid start date' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const horizonCheck = validateHorizon(dayStr, resource);
			if (!horizonCheck.valid) {
				return new Response(JSON.stringify({ error: horizonCheck.error }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const day = dayStr;
			const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
			const startMinute = Math.floor((startUnix - dayStartUnix) / (60 * 1000));
			const endMinute = Math.floor((endUnix - dayStartUnix) / (60 * 1000));

			const allocator = getAllocator();
			const holdResult = await allocator.placeHold({
				tenantId: tenant.id as TenantId,
				resourceId: resource.id as ResourceId,
				day,
				startMinute,
				endMinute,
				expiresAt: Date.now() + 30_000,
				...(body.clientRef ? { clientRef: body.clientRef } : {}),
			});

			if (!holdResult.success) {
				return new Response(JSON.stringify({ error: 'Slot not available' }), {
					status: 409,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const eventStore = getEventStore();
			await eventStore.append(holdResult.event);

			return new Response(
				JSON.stringify({
					holdId: holdResult.holdId,
					expiresAt: Date.now() + 30_000,
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

	if (
		req.method === 'DELETE' &&
		pathname.match(/^\/v1\/public\/[^/]+\/[^/]+\/hold\/[^/]+$/)
	) {
		try {
			const match = matchRoute(
				pathname,
				'/v1/public/:tenantSlug/:resourceSlug/hold/:holdId',
			);
			if (!match) {
				return new Response('Not Found', { status: 404 });
			}

			const tenantSlug = match.tenantSlug;
			const resourceSlug = match.resourceSlug;
			const holdId = match.holdId;
			if (!tenantSlug || !resourceSlug || !holdId) {
				return new Response('Not Found', { status: 404 });
			}

			const tenant = await tenantRepository.getBySlug(tenantSlug);
			if (!tenant) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = await resourceRepository.getBySlug(
				tenantSlug,
				resourceSlug,
			);
			if (!resource || resource.tenantId !== tenant.id) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const allocator = getAllocator();
			const eventStore = getEventStore();

			const event = await allocator.releaseHold({
				holdId: holdId as HoldId,
				tenantId: tenant.id as TenantId,
				resourceId: resource.id as ResourceId,
			});

			if (!event) {
				return new Response(JSON.stringify({ error: 'Hold not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			await eventStore.append(event);

			return new Response(JSON.stringify({ released: true }), {
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

			if (!body.customerName || !body.customerEmail) {
				return new Response(
					JSON.stringify({
						error: 'Missing required fields: customerName, customerEmail',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const tenant = await tenantRepository.getBySlug(tenantSlug);
			if (!tenant) {
				return new Response(JSON.stringify({ error: 'Tenant not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const resource = await resourceRepository.getBySlug(
				tenantSlug,
				resourceSlug,
			);
			if (!resource || resource.tenantId !== tenant.id) {
				return new Response(JSON.stringify({ error: 'Resource not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const allocator = getAllocator();
			const eventStore = getEventStore();
			let holdId: string;
			let start: number;
			let end: number;

			if (body.holdId) {
				const events = await eventStore.getByTenant(tenant.id);
				const holdEvent = events.find(
					(e) => e.type === 'HoldPlaced' && e.payload.holdId === body.holdId,
				);

				if (!holdEvent || holdEvent.type !== 'HoldPlaced') {
					return new Response(JSON.stringify({ error: 'Hold not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				if (
					holdEvent.tenantId !== tenant.id ||
					holdEvent.resourceId !== resource.id
				) {
					return new Response(JSON.stringify({ error: 'Hold not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				const dayStart = parseDayToUnixStartOfDayUTC(holdEvent.payload.day);
				start = dayStart + holdEvent.payload.startMinute * 60 * 1000;
				end = dayStart + holdEvent.payload.endMinute * 60 * 1000;
				holdId = holdEvent.payload.holdId;
			} else if (body.start && body.end) {
				const startUnix =
					typeof body.start === 'number'
						? body.start
						: new Date(body.start).getTime();
				const endUnix =
					typeof body.end === 'number'
						? body.end
						: new Date(body.end).getTime();

				if (Number.isNaN(startUnix) || Number.isNaN(endUnix)) {
					return new Response(
						JSON.stringify({ error: 'Invalid start or end date' }),
						{
							status: 400,
							headers: { 'Content-Type': 'application/json' },
						},
					);
				}

				const startDate = new Date(startUnix);
				const dayStr = startDate.toISOString().split('T')[0];
				if (!dayStr) {
					return new Response(JSON.stringify({ error: 'Invalid start date' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				const horizonCheck = validateHorizon(dayStr, resource);
				if (!horizonCheck.valid) {
					return new Response(JSON.stringify({ error: horizonCheck.error }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				const day = dayStr;
				const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
				const startMinute = Math.floor(
					(startUnix - dayStartUnix) / (60 * 1000),
				);
				const endMinute = Math.floor((endUnix - dayStartUnix) / (60 * 1000));

				const holdResult = await allocator.placeHold({
					tenantId: tenant.id as TenantId,
					resourceId: resource.id as ResourceId,
					day,
					startMinute,
					endMinute,
					expiresAt: Date.now() + 30_000,
				});

				if (!holdResult.success) {
					return new Response(JSON.stringify({ error: 'Slot not available' }), {
						status: 409,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				await eventStore.append(holdResult.event);
				holdId = holdResult.holdId;
				start = startUnix;
				end = endUnix;
			} else {
				return new Response(
					JSON.stringify({
						error: 'Missing required fields: either holdId or (start and end)',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const bookingId = ulid() as BookingId;
			const confirmParams: Parameters<typeof allocator.confirmBooking>[0] = {
				tenantId: tenant.id as TenantId,
				resourceId: resource.id as ResourceId,
				holdId: holdId as HoldId,
				bookingId,
				start,
				end,
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
					start: new Date(start).toISOString(),
					end: new Date(end).toISOString(),
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
