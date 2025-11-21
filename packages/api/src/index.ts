import { handlePrivateRequest } from './handlers/private';
import { handlePublicRequest } from './handlers/public';
import { tenantRepository, resourceRepository } from './services/context';
import { websocketHandler } from './handlers/ws/index';
import { initializeContext } from './services/context';
import { startHoldExpiryWorker } from './workers/hold-expiry';
import { ulid } from 'ulid';
import type { SessionId } from '@tap/core';

const PORT = parseInt(process.env.PORT || '3000', 10);

await initializeContext();

const stopHoldExpiryWorker = startHoldExpiryWorker(5000);

const _server = Bun.serve({
	port: PORT,
	async fetch(req, server) {
		const url = new URL(req.url);

		if (url.pathname === '/v1/hold-stream') {
			let tenantId = url.searchParams.get('tenantId');
			let resourceId = url.searchParams.get('resourceId');
			const tenantSlug = url.searchParams.get('tenantSlug');
			const resourceSlug = url.searchParams.get('resourceSlug');
			const cursor = url.searchParams.get('cursor') || undefined;

			if ((!tenantId || !resourceId) && tenantSlug && resourceSlug) {
				const tenant = await tenantRepository.getBySlug(tenantSlug);
				if (tenant) {
					tenantId = tenant.id;
					const resource = await resourceRepository.getBySlug(
						tenantSlug,
						resourceSlug,
					);
					if (resource && resource.tenantId === tenant.id) {
						resourceId = resource.id;
					}
				}
			}

			if (!tenantId || !resourceId) {
				return new Response(
					'Missing or invalid tenantId/resourceId or tenantSlug/resourceSlug',
					{ status: 400 },
				);
			}

			const sessionId = ('sess_' + ulid()) as SessionId;

			const success = server.upgrade(req, {
				data: {
					sessionId,
					tenantId,
					resourceId,
					cursor,
				},
			});

			if (success) {
				return undefined;
			}
			return new Response('Upgrade failed', { status: 500 });
		}

		if (req.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (url.pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
				headers: { 'Content-Type': 'application/json', ...corsHeaders },
			});
		}

		if (url.pathname.startsWith('/v1/public/')) {
			const response = await handlePublicRequest(req);
			const headers = new Headers(response.headers);
			Object.entries(corsHeaders).forEach(([key, value]) => {
				headers.set(key, value);
			});
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		if (url.pathname.startsWith('/v1/')) {
			const response = await handlePrivateRequest(req);
			const headers = new Headers(response.headers);
			Object.entries(corsHeaders).forEach(([key, value]) => {
				headers.set(key, value);
			});
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		return new Response('Not Found', { status: 404 });
	},
	websocket: websocketHandler,
});

process.on('SIGINT', () => {
	stopHoldExpiryWorker();
	process.exit(0);
});

process.on('SIGTERM', () => {
	stopHoldExpiryWorker();
	process.exit(0);
});

console.log(`🚀 TAP API running at http://localhost:${_server.port}`);
console.log(`\n📋 Endpoints:`);
console.log(`  GET  /health                                    - Health check`);
console.log(
	`  GET  /v1/public/:tenantSlug/:resourceSlug/availability - Public availability`,
);
console.log(`  POST /v1/public/:tenantSlug/:resourceSlug/hold - Place hold`);
console.log(
	`  DELETE /v1/public/:tenantSlug/:resourceSlug/hold/:holdId - Release hold`,
);
console.log(
	`  POST /v1/public/:tenantSlug/:resourceSlug/book - Public booking`,
);
console.log(
	`  GET  /v1/availability                          - Private availability`,
);
console.log(`  POST /v1/holds                                 - Place hold`);
console.log(
	`  POST /v1/bookings                              - Confirm booking`,
);
console.log(
	`  POST /v1/bookings/:id/cancel                   - Cancel booking`,
);
console.log(`  GET  /v1/events                                - Get events`);
console.log(
	`  GET  /v1/events/stream                          - Stream events (SSE)`,
);
