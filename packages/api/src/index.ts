import type { ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import { handlePrivateRequest } from './handlers/private';
import {
	handlePublicRequest,
	registerResource,
	registerTenant,
} from './handlers/public';

const PORT = parseInt(process.env.PORT || '3000', 10);

const _server = Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (url.pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (url.pathname.startsWith('/v1/public/')) {
			return handlePublicRequest(req);
		}

		if (url.pathname.startsWith('/v1/')) {
			return handlePrivateRequest(req);
		}

		return new Response('Not Found', { status: 404 });
	},
});

const tenantId = ulid() as TenantId;
const resourceId = ulid() as ResourceId;

registerTenant('demo', tenantId);
registerResource('demo', 'room-1', resourceId, tenantId);

console.log(`🚀 TAP API running at http://localhost:${PORT}`);
console.log(`\n📋 Endpoints:`);
console.log(`  GET  /health                                    - Health check`);
console.log(
	`  GET  /v1/public/:tenantSlug/:resourceSlug/availability - Public availability`,
);
console.log(
	`  POST /v1/public/:tenantSlug/:resourceSlug/book  - Public booking`,
);
console.log(
	`  GET  /v1/availability                          - Private availability`,
);
console.log(`  POST /v1/holds                                 - Place hold`);
console.log(
	`  POST /v1/bookings                              - Confirm booking`,
);
console.log(`  GET  /v1/events                                - Get events`);
console.log(`\n🧪 Demo tenant: demo, resource: room-1`);
