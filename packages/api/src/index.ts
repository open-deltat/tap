import { handlePrivateRequest } from './handlers/private';
import { handlePublicRequest } from './handlers/public';
import { initializeContext } from './services/context';
import { startHoldExpiryWorker } from './workers/hold-expiry';

const PORT = parseInt(process.env.PORT || '3000', 10);

await initializeContext();

const stopHoldExpiryWorker = startHoldExpiryWorker(5000);

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

process.on('SIGINT', () => {
	stopHoldExpiryWorker();
	process.exit(0);
});

process.on('SIGTERM', () => {
	stopHoldExpiryWorker();
	process.exit(0);
});

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
console.log(
	`  POST /v1/bookings/:id/cancel                   - Cancel booking`,
);
console.log(`  GET  /v1/events                                - Get events`);
console.log(
	`  GET  /v1/events/stream                          - Stream events (SSE)`,
);
