import type { BookingId, ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import {
	bookingRepository,
	getAllocator,
	getEventStore,
} from '../services/context';
import type { ConfirmBookingRequest, PlaceHoldRequest } from '../types';

export const handlePrivateRequest = async (req: Request): Promise<Response> => {
	const url = new URL(req.url);
	const pathname = url.pathname;

	if (req.method === 'GET' && pathname === '/v1/availability') {
		try {
			const url = new URL(req.url);
			const tenantId = url.searchParams.get('tenantId') as TenantId | null;
			const resourceId = url.searchParams.get(
				'resourceId',
			) as ResourceId | null;
			const day = url.searchParams.get('day');

			if (!tenantId || !resourceId || !day) {
				return new Response(
					JSON.stringify({
						error: 'Missing required params: tenantId, resourceId, day',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const allocator = getAllocator();
			const state = allocator.getState(tenantId, resourceId);
			const dayState = state.get(day);

			if (!dayState) {
				return new Response(
					JSON.stringify({ day, available: true, booked: [], held: [] }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const booked: number[] = [];
			const held: number[] = [];

			for (let m = 0; m < 1440; m++) {
				const byte = m >> 3;
				const bit = m & 7;
				const bookedByte = dayState.booked[byte];
				const heldByte = dayState.held[byte];
				if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
					booked.push(m);
				}
				if (heldByte !== undefined && (heldByte & (1 << bit)) !== 0) {
					held.push(m);
				}
			}

			return new Response(
				JSON.stringify({
					day,
					available: booked.length === 0 && held.length === 0,
					booked,
					held,
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
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

	if (req.method === 'POST' && pathname === '/v1/holds') {
		try {
			const body = (await req.json()) as PlaceHoldRequest & {
				tenantId: TenantId;
				resourceId: ResourceId;
			};

			if (
				!body.tenantId ||
				!body.resourceId ||
				!body.day ||
				typeof body.startMinute !== 'number' ||
				typeof body.endMinute !== 'number'
			) {
				return new Response(
					JSON.stringify({ error: 'Missing required fields' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const expiresAt = body.expiresAtMs || Date.now() + 60_000;

			const allocator = getAllocator();
			const holdParams: Parameters<typeof allocator.placeHold>[0] = {
				tenantId: body.tenantId,
				resourceId: body.resourceId,
				day: body.day,
				startMinute: body.startMinute,
				endMinute: body.endMinute,
				expiresAt,
			};

			if (body.clientRef) {
				holdParams.clientRef = body.clientRef;
			}

			const result = await allocator.placeHold(holdParams);

			if (!result.success) {
				return new Response(JSON.stringify({ error: 'Slot not available' }), {
					status: 409,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const eventStore = getEventStore();
			await eventStore.append(result.event);

			return new Response(
				JSON.stringify({ holdId: result.holdId, event: result.event }),
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

	if (req.method === 'POST' && pathname === '/v1/bookings') {
		try {
			const body = (await req.json()) as ConfirmBookingRequest & {
				tenantId: TenantId;
				resourceId: ResourceId;
			};

			if (!body.tenantId || !body.resourceId || !body.holdId) {
				return new Response(
					JSON.stringify({
						error: 'Missing required fields: tenantId, resourceId, holdId',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const bookingId = body.bookingId || (ulid() as BookingId);
			const allocator = getAllocator();
			const eventStore = getEventStore();

			if (!body.start || !body.end) {
				const events = await eventStore.getByTenant(body.tenantId);
				const holdEvent = events.find(
					(e) => e.type === 'HoldPlaced' && e.payload.holdId === body.holdId,
				);

				if (!holdEvent || holdEvent.type !== 'HoldPlaced') {
					return new Response(JSON.stringify({ error: 'Hold not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json' },
					});
				}

				const dayStart = new Date(holdEvent.payload.day).setHours(0, 0, 0, 0);
				const start = dayStart + holdEvent.payload.startMinute * 60 * 1000;
				const end = dayStart + holdEvent.payload.endMinute * 60 * 1000;

				const confirmParams: Parameters<typeof allocator.confirmBooking>[0] = {
					tenantId: body.tenantId,
					resourceId: body.resourceId,
					holdId: body.holdId,
					bookingId,
					start,
					end,
				};

				if (body.customerName !== undefined)
					confirmParams.customerName = body.customerName;
				if (body.customerEmail !== undefined)
					confirmParams.customerEmail = body.customerEmail;
				if (body.customerPhone !== undefined)
					confirmParams.customerPhone = body.customerPhone;
				if (body.paymentStatus !== undefined)
					confirmParams.paymentStatus = body.paymentStatus;
				if (body.priceCents !== undefined)
					confirmParams.priceCents = body.priceCents;

				const event = await allocator.confirmBooking(confirmParams);

				if (!event) {
					return new Response(
						JSON.stringify({ error: 'Hold not found or expired' }),
						{ status: 404, headers: { 'Content-Type': 'application/json' } },
					);
				}

				await eventStore.append(event);

				return new Response(JSON.stringify({ bookingId, event }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const start =
				typeof body.start === 'string'
					? new Date(body.start).getTime()
					: body.start;
			const end =
				typeof body.end === 'string' ? new Date(body.end).getTime() : body.end;

			const confirmParams: Parameters<typeof allocator.confirmBooking>[0] = {
				tenantId: body.tenantId,
				resourceId: body.resourceId,
				holdId: body.holdId,
				bookingId,
				start,
				end,
			};

			if (body.customerName !== undefined)
				confirmParams.customerName = body.customerName;
			if (body.customerEmail !== undefined)
				confirmParams.customerEmail = body.customerEmail;
			if (body.customerPhone !== undefined)
				confirmParams.customerPhone = body.customerPhone;
			if (body.paymentStatus !== undefined)
				confirmParams.paymentStatus = body.paymentStatus;
			if (body.priceCents !== undefined)
				confirmParams.priceCents = body.priceCents;

			const event = await allocator.confirmBooking(confirmParams);

			if (!event) {
				return new Response(
					JSON.stringify({ error: 'Hold not found or expired' }),
					{ status: 404, headers: { 'Content-Type': 'application/json' } },
				);
			}

			await eventStore.append(event);

			return new Response(JSON.stringify({ bookingId, event }), {
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
		pathname.match(/^\/v1\/bookings\/[^/]+\/cancel$/)
	) {
		try {
			const match = pathname.match(/^\/v1\/bookings\/([^/]+)\/cancel$/);
			if (!match || !match[1]) {
				return new Response('Not Found', { status: 404 });
			}

			const bookingId = match[1] as BookingId;
			const body = (await req.json()) as {
				tenantId: TenantId;
				resourceId: ResourceId;
				day: string;
				startMinute: number;
				endMinute: number;
			};

			if (
				!body.tenantId ||
				!body.resourceId ||
				!body.day ||
				typeof body.startMinute !== 'number' ||
				typeof body.endMinute !== 'number'
			) {
				return new Response(
					JSON.stringify({
						error:
							'Missing required fields: tenantId, resourceId, day, startMinute, endMinute',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const booking = await bookingRepository.getById(bookingId);
			if (!booking || booking.status === 'CANCELLED') {
				return new Response(JSON.stringify({ error: 'Booking not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const allocator = getAllocator();
			const cancelEvent = await allocator.cancelBooking({
				tenantId: body.tenantId,
				resourceId: body.resourceId,
				bookingId,
				day: body.day,
				startMinute: body.startMinute,
				endMinute: body.endMinute,
			});

			if (!cancelEvent) {
				return new Response(
					JSON.stringify({ error: 'Booking not found or already cancelled' }),
					{ status: 404, headers: { 'Content-Type': 'application/json' } },
				);
			}

			const eventStore = getEventStore();
			await eventStore.append(cancelEvent);
			await bookingRepository.update(bookingId, { status: 'CANCELLED' });

			return new Response(JSON.stringify({ bookingId, event: cancelEvent }), {
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

	if (req.method === 'GET' && pathname === '/v1/events/stream') {
		try {
			const { handleEventStream } = await import('./stream');
			return await handleEventStream(req);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: error instanceof Error ? error.message : 'Unknown error',
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
		}
	}

	if (req.method === 'GET' && pathname === '/v1/events') {
		try {
			const url = new URL(req.url);
			const tenantId = url.searchParams.get('tenantId');
			const cursor = url.searchParams.get('cursor');
			const limit = parseInt(url.searchParams.get('limit') || '100', 10);

			const eventStore = getEventStore();
			let events = await eventStore.getAll();

			if (tenantId) {
				events = await eventStore.getByTenant(tenantId);
			}

			if (cursor) {
				const cursorIndex = events.findIndex((e) => e.eventId === cursor);
				if (cursorIndex >= 0) {
					events = events.slice(cursorIndex + 1);
				}
			}

			events = events.slice(0, limit);

			return new Response(
				JSON.stringify({
					events,
					nextCursor: events[events.length - 1]?.eventId,
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
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
