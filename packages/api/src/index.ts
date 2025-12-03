import { TapError } from '@tap/core';
import {
	API_ROUTES,
	type HealthResponse,
	type ResourceId,
	type SlotId,
	type TenantId,
} from '@tap/protocol';
import type { Server, ServerWebSocket } from 'bun';
import { getAuthContext } from './auth/context';
import { docsHtml, openApiDocument } from './docs';
import { handleAvailability } from './routes/availability';
import {
	type AvailabilityWSData,
	availabilityWebSocketHandler,
} from './routes/availability/websocket-handler';
import { handleBook } from './routes/book';
import { handleBookings } from './routes/bookings';
import { handleCancel } from './routes/cancel';
import {
	type HoldWSData,
	holdWebSocketHandler,
} from './routes/hold/websocket-handler';
import {
	handleOfferCreate,
	handleOfferDelete,
	handleOffersGet,
} from './routes/offers';
import { handleSessionCreate } from './routes/session';
import { setServer } from './server-context';

const VERSION = '0.1.0';

export type WSData = AvailabilityWSData | HoldWSData;

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const handleHttp = (
	req: Request,
	server: Server<WSData>,
): Promise<Response> | Response | undefined => {
	const url = new URL(req.url);
	const method = req.method;
	const pathname = url.pathname;

	if (method === 'OPTIONS') {
		return new Response(null, { headers: CORS_HEADERS });
	}

	const addCors = (res: Response) => {
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			res.headers.set(key, value);
		}
		return res;
	};

	try {
		if (pathname === API_ROUTES.DOCS && method === 'GET') {
			return addCors(
				new Response(docsHtml, { headers: { 'Content-Type': 'text/html' } }),
			);
		}

		if (pathname === API_ROUTES.OPENAPI && method === 'GET') {
			return addCors(Response.json(openApiDocument));
		}

		if (pathname === API_ROUTES.AVAILABILITY && method === 'POST') {
			return handleAvailability(req)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.BOOK && method === 'POST') {
			return handleBook(req, server)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.CANCEL && method === 'POST') {
			return handleCancel(req, server)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.BOOKINGS && method === 'POST') {
			return handleBookings(req)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.HEALTH && method === 'GET') {
			const response: HealthResponse = {
				status: 'ok',
				version: VERSION,
				timestamp: Date.now(),
			};
			return addCors(Response.json(response));
		}

		if (pathname === API_ROUTES.SESSION && method === 'POST') {
			return addCors(handleSessionCreate());
		}

		if (pathname === API_ROUTES.DISCOVERY && method === 'GET') {
			const discovery = {
				tap_version: VERSION,
				endpoints: {
					availability: API_ROUTES.AVAILABILITY,
					book: API_ROUTES.BOOK,
					cancel: API_ROUTES.CANCEL,
					session: API_ROUTES.SESSION,
					offers: API_ROUTES.OFFERS,
					availability_ws: API_ROUTES.AVAILABILITY_WS,
					hold_ws: API_ROUTES.HOLD_WS,
					health: API_ROUTES.HEALTH,
					docs: API_ROUTES.DOCS,
					openapi: API_ROUTES.OPENAPI,
				},
				capabilities: ['holds', 'bookings', 'realtime', 'offers', 'sessions'],
			};
			return addCors(Response.json(discovery));
		}

		if (pathname === API_ROUTES.OFFERS && method === 'GET') {
			const authCtx = getAuthContext(req);
			return handleOffersGet(req, authCtx)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.OFFERS_CREATE && method === 'POST') {
			const authCtx = getAuthContext(req);
			return handleOfferCreate(req, authCtx)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.OFFERS_DELETE && method === 'POST') {
			const authCtx = getAuthContext(req);
			return handleOfferDelete(req, authCtx)
				.then(addCors)
				.catch((e) => {
					const error = new TapError(
						'TAP_INTERNAL_ERROR',
						e instanceof Error ? e.message : 'Unknown error',
					);
					return addCors(error.toResponse());
				});
		}

		if (pathname === API_ROUTES.AVAILABILITY_WS) {
			const success = server.upgrade(req, {
				data: { type: 'availability' } as AvailabilityWSData,
			});
			if (success) return undefined;
			return new Response('WebSocket upgrade failed', { status: 400 });
		}

		if (pathname === API_ROUTES.HOLD_WS) {
			const tenantId = url.searchParams.get('tenantId');
			const resourceId = url.searchParams.get('resourceId');
			const slotId = url.searchParams.get('slotId');

			if (!tenantId || !resourceId || !slotId) {
				return new Response('Missing query params', { status: 400 });
			}

			const success = server.upgrade(req, {
				data: {
					type: 'hold',
					tenantId: tenantId as TenantId,
					resourceId: resourceId as ResourceId,
					slotId: slotId as SlotId,
				} as HoldWSData,
			});

			if (success) return undefined;
			return new Response('WebSocket upgrade failed', { status: 400 });
		}

		return new Response('Not Found', { status: 404 });
	} catch (e) {
		const error = new TapError(
			'TAP_INTERNAL_ERROR',
			e instanceof Error ? e.message : 'Unknown error',
		);
		return addCors(error.toResponse());
	}
};

const server = Bun.serve({
	port: 3000,
	fetch: handleHttp,
	websocket: {
		open(ws: ServerWebSocket<WSData>) {
			if (ws.data.type === 'availability') {
				availabilityWebSocketHandler.open(
					ws as ServerWebSocket<AvailabilityWSData>,
				);
			} else if (ws.data.type === 'hold') {
				holdWebSocketHandler.open(ws as ServerWebSocket<HoldWSData>);
			}
		},
		message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
			if (ws.data.type === 'availability') {
				availabilityWebSocketHandler.message(
					ws as ServerWebSocket<AvailabilityWSData>,
					message,
				);
			} else if (ws.data.type === 'hold') {
				holdWebSocketHandler.message(
					ws as ServerWebSocket<HoldWSData>,
					message,
				);
			}
		},
		close(ws: ServerWebSocket<WSData>) {
			if (ws.data.type === 'availability') {
				availabilityWebSocketHandler.close(
					ws as ServerWebSocket<AvailabilityWSData>,
				);
			} else if (ws.data.type === 'hold') {
				holdWebSocketHandler.close(ws as ServerWebSocket<HoldWSData>);
			}
		},
	},
});

setServer(server);

if (import.meta.main) {
	console.log(`Listening on localhost:${server.port}`);
}
