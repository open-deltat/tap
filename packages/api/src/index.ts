import type { ResourceId, SlotId, TenantId } from '@tap/core';
import type { Server } from 'bun';
import { handleAvailability } from './routes/availability';
import { handleBook } from './routes/book';
import { type WSData, websocketHandler } from './routes/websockets';

// CORS headers
const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function handleHttp(
	req: Request,
	server: Server<WSData>,
): Promise<Response> | Response | undefined {
	console.log(`[${req.method}] ${req.url}`);
	const url = new URL(req.url);
	const method = req.method;
	const pathname = url.pathname;

	// Handle CORS preflight
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
		if (pathname === '/availability' && method === 'POST') {
			return handleAvailability(req)
				.then(addCors)
				.catch((e) => {
					console.error('Error in handleAvailability:', e);
					const res = new Response(
						JSON.stringify({ error: 'Internal Server Error' }),
						{
							status: 500,
							headers: { 'Content-Type': 'application/json' },
						},
					);
					return addCors(res);
				});
		}

		if (pathname === '/book' && method === 'POST') {
			return handleBook(req, server)
				.then(addCors)
				.catch((e) => {
					console.error('Error in handleBook:', e);
					const res = new Response(
						JSON.stringify({ error: 'Internal Server Error' }),
						{
							status: 500,
							headers: { 'Content-Type': 'application/json' },
						},
					);
					return addCors(res);
				});
		}

		if (pathname === '/availability-ws') {
			const success = server.upgrade(req, {
				data: { type: 'availability' },
			});
			if (success) return undefined;
			return new Response('WebSocket upgrade failed', { status: 400 });
		}

		if (pathname === '/hold-ws') {
			const tenantId = url.searchParams.get('tenantId');
			const resourceId = url.searchParams.get('resourceId');
			const slotId = url.searchParams.get('slotId');

			if (!tenantId || !resourceId || !slotId) {
				return new Response('Missing query params', { status: 400 });
			}

			const success = server.upgrade(req, {
				data: {
					type: 'hold' as const,
					tenantId: tenantId as TenantId,
					resourceId: resourceId as ResourceId,
					slotId: slotId as SlotId,
				},
			});
			if (success) return undefined;
			return new Response('WebSocket upgrade failed', { status: 400 });
		}

		return new Response('Not Found', { status: 404 });
	} catch (e) {
		console.error('Critical Error in handleHttp:', e);
		const res = new Response('Internal Server Error', { status: 500 });
		return addCors(res);
	}
}

const server = Bun.serve({
	port: 3000,
	fetch: handleHttp,
	websocket: websocketHandler,
});

if (import.meta.main) {
	console.log(`Listening on localhost:${server.port}`);
}

// export default server;
