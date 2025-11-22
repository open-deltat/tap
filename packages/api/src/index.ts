import type { ResourceId, SlotId, TenantId } from '@tap/core';
import type { Server } from 'bun';
import { handleAvailability } from './routes/availability';
import { handleBook } from './routes/book';
import { type WSData, websocketHandler } from './routes/websockets';

function handleHttp(
	req: Request,
	server: Server<WSData>,
): Promise<Response> | Response | undefined {
	const url = new URL(req.url);
	const method = req.method;
	const pathname = url.pathname;

	if (pathname === '/availability' && method === 'POST') {
		return handleAvailability(req);
	}

	if (pathname === '/book' && method === 'POST') {
		return handleBook(req, server);
	}

	if (pathname === '/availability-ws') {
		const success = server.upgrade(req, {
			data: { type: 'availability' },
		});
		return success
			? undefined
			: new Response('WebSocket upgrade failed', { status: 400 });
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
		return success
			? undefined
			: new Response('WebSocket upgrade failed', { status: 400 });
	}

	return new Response('Not Found', { status: 404 });
}

const server = Bun.serve({
	port: 3000,
	fetch: handleHttp,
	websocket: websocketHandler,
});

if (import.meta.main) {
	console.log(`Listening on localhost:${server.port}`);
}

export default server;
