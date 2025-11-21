import type { PublicBookRequest } from '../types';
import { handleGetAvailability } from './routes/availability';
import { handleBook } from './routes/booking';
import { handlePlaceHold, handleReleaseHold } from './routes/hold';
import { matchRoute } from './utils/route-matcher';

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

			const result = await handleGetAvailability({
				tenantSlug,
				resourceSlug,
				from: from || '',
				to: to || '',
				durationMinutes: durationMinutes || undefined,
			});

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.error }), {
					status: result.status,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return new Response(
				JSON.stringify({
					slots: result.slots,
					asOfEventId: result.asOfEventId,
					resourceId: result.resourceId,
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

			const result = await handlePlaceHold({
				tenantSlug,
				resourceSlug,
				start: body.start,
				end: body.end,
				clientRef: body.clientRef,
			});

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.error }), {
					status: result.status,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return new Response(
				JSON.stringify({
					holdId: result.holdId,
					expiresAt: result.expiresAt,
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

			const result = await handleReleaseHold({
				tenantSlug,
				resourceSlug,
				holdId,
			});

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.error }), {
					status: result.status,
					headers: { 'Content-Type': 'application/json' },
				});
			}

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
			const sessionId = req.headers.get('x-tap-session-id') || undefined;

			const result = await handleBook({
				tenantSlug,
				resourceSlug,
				body,
				sessionId,
			});

			if (!result.success) {
				return new Response(JSON.stringify({ error: result.error }), {
					status: result.status,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return new Response(
				JSON.stringify({
					bookingId: result.bookingId,
					start: result.start,
					end: result.end,
					status: result.status,
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
