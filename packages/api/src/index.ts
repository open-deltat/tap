import { TapError } from '@open-tap/core';
import {
	API_ROUTES,
	type HealthResponse,
	resourceId,
	slotId,
	tenantId,
} from '@open-tap/protocol';
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

function isAvailabilityWS(
	ws: ServerWebSocket<WSData>,
): ws is ServerWebSocket<AvailabilityWSData> {
	return ws.data.type === 'availability';
}

function isHoldWS(
	ws: ServerWebSocket<WSData>,
): ws is ServerWebSocket<HoldWSData> {
	return ws.data.type === 'hold';
}

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
			const serverId = process.env.TAP_SERVER_ID || 'tap-server';
			const discovery = {
				tap_version: VERSION,
				server_id: serverId,
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
				access: {
					reads: 'free',
					writes: 'authenticated',
					bulk: 'subscription',
				},
			};
			return addCors(Response.json(discovery));
		}

		if (pathname === API_ROUTES.OFFERS && method === 'GET') {
			return getAuthContext(req)
				.then((authCtx) => handleOffersGet(req, authCtx))
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
			return getAuthContext(req)
				.then((authCtx) => handleOfferCreate(req, authCtx))
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
			return getAuthContext(req)
				.then((authCtx) => handleOfferDelete(req, authCtx))
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
			const data: AvailabilityWSData = { type: 'availability' };
			const success = server.upgrade(req, { data });
			if (success) return undefined;
			return new Response('WebSocket upgrade failed', { status: 400 });
		}

		if (pathname === API_ROUTES.HOLD_WS) {
			const tenantIdParam = url.searchParams.get('tenantId');
			const resourceIdParam = url.searchParams.get('resourceId');
			const slotIdParam = url.searchParams.get('slotId');

			if (!tenantIdParam || !resourceIdParam || !slotIdParam) {
				return new Response('Missing query params', { status: 400 });
			}

			const data: HoldWSData = {
				type: 'hold',
				tenantId: tenantId(tenantIdParam),
				resourceId: resourceId(resourceIdParam),
				slotId: slotId(slotIdParam),
			};
			const success = server.upgrade(req, { data });

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
			if (isAvailabilityWS(ws)) {
				availabilityWebSocketHandler.open(ws);
			} else if (isHoldWS(ws)) {
				holdWebSocketHandler.open(ws);
			}
		},
		message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
			if (isAvailabilityWS(ws)) {
				availabilityWebSocketHandler.message(ws, message);
			} else if (isHoldWS(ws)) {
				holdWebSocketHandler.message(ws, message);
			}
		},
		close(ws: ServerWebSocket<WSData>) {
			if (isAvailabilityWS(ws)) {
				availabilityWebSocketHandler.close(ws);
			} else if (isHoldWS(ws)) {
				holdWebSocketHandler.close(ws);
			}
		},
	},
});

setServer(server);

if (import.meta.main) {
	console.log(`Listening on localhost:${server.port}`);
}
