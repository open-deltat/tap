import { describe, expect, test } from 'bun:test';
import { tenantId } from '@tap/protocol';
import {
	getAuthContext,
	hasScope,
	parseAuthHeader,
	requireScope,
} from './context';

const DEMO_TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3';
const DEMO_API_KEY = 'demo_key_123';

describe('parseAuthHeader', () => {
	test('returns anonymous for null header', async () => {
		const ctx = await parseAuthHeader(null);
		expect(ctx.type).toBe('anonymous');
	});

	test('returns anonymous for empty header', async () => {
		const ctx = await parseAuthHeader('');
		expect(ctx.type).toBe('anonymous');
	});

	test('returns anonymous for invalid format', async () => {
		const ctx = await parseAuthHeader('InvalidFormat token123');
		expect(ctx.type).toBe('anonymous');
	});

	test('parses valid TAP-Key header', async () => {
		const ctx = await parseAuthHeader(
			`TAP-Key ${DEMO_TENANT_ID}:${DEMO_API_KEY}`,
		);
		expect(ctx.type).toBe('api_key');
		if (ctx.type === 'api_key') {
			expect(ctx.tenantId).toBe(DEMO_TENANT_ID);
			expect(ctx.scopes).toContain('read');
			expect(ctx.scopes).toContain('manage');
		}
	});

	test('returns anonymous for invalid API key', async () => {
		const ctx = await parseAuthHeader('TAP-Key invalid:key');
		expect(ctx.type).toBe('anonymous');
	});

	test('parses session Bearer token', async () => {
		const ctx = await parseAuthHeader('Bearer sess_01HXYZ123');
		expect(ctx.type).toBe('session');
		if (ctx.type === 'session') {
			expect(ctx.sessionId).toBe('sess_01HXYZ123');
		}
	});

	test('returns anonymous for non-session Bearer token', async () => {
		const ctx = await parseAuthHeader('Bearer some_jwt_token');
		expect(ctx.type).toBe('anonymous');
	});

	test('handles malformed TAP-Key (missing colon)', async () => {
		const ctx = await parseAuthHeader('TAP-Key noColonHere');
		expect(ctx.type).toBe('anonymous');
	});

	test('handles TAP-Key with extra colons', async () => {
		const ctx = await parseAuthHeader(
			`TAP-Key ${DEMO_TENANT_ID}:${DEMO_API_KEY}:extra`,
		);
		expect(ctx.type).toBe('anonymous');
	});
});

describe('getAuthContext', () => {
	test('extracts auth from request headers', async () => {
		const req = new Request('http://localhost/test', {
			headers: { Authorization: `TAP-Key ${DEMO_TENANT_ID}:${DEMO_API_KEY}` },
		});
		const ctx = await getAuthContext(req);
		expect(ctx.type).toBe('api_key');
	});

	test('returns anonymous when no auth header', async () => {
		const req = new Request('http://localhost/test');
		const ctx = await getAuthContext(req);
		expect(ctx.type).toBe('anonymous');
	});
});

describe('hasScope', () => {
	describe('anonymous context', () => {
		const ctx = { type: 'anonymous' as const };

		test('has read scope', () => {
			expect(hasScope(ctx, 'read')).toBe(true);
		});

		test('does not have hold scope', () => {
			expect(hasScope(ctx, 'hold')).toBe(false);
		});

		test('does not have book scope', () => {
			expect(hasScope(ctx, 'book')).toBe(false);
		});

		test('does not have manage scope', () => {
			expect(hasScope(ctx, 'manage')).toBe(false);
		});
	});

	describe('session context', () => {
		const ctx = { type: 'session' as const, sessionId: 'sess_123' };

		test('has read scope', () => {
			expect(hasScope(ctx, 'read')).toBe(true);
		});

		test('has hold scope', () => {
			expect(hasScope(ctx, 'hold')).toBe(true);
		});

		test('does not have book scope', () => {
			expect(hasScope(ctx, 'book')).toBe(false);
		});

		test('does not have manage scope', () => {
			expect(hasScope(ctx, 'manage')).toBe(false);
		});
	});

	describe('api_key context', () => {
		const fullCtx = {
			type: 'api_key' as const,
			tenantId: tenantId(DEMO_TENANT_ID),
			scopes: ['read', 'hold', 'book', 'manage'] as const,
		};

		test('has all scopes when granted', () => {
			expect(hasScope(fullCtx, 'read')).toBe(true);
			expect(hasScope(fullCtx, 'hold')).toBe(true);
			expect(hasScope(fullCtx, 'book')).toBe(true);
			expect(hasScope(fullCtx, 'manage')).toBe(true);
		});

		const limitedCtx = {
			type: 'api_key' as const,
			tenantId: tenantId(DEMO_TENANT_ID),
			scopes: ['read'] as const,
		};

		test('only has granted scopes', () => {
			expect(hasScope(limitedCtx, 'read')).toBe(true);
			expect(hasScope(limitedCtx, 'hold')).toBe(false);
			expect(hasScope(limitedCtx, 'book')).toBe(false);
			expect(hasScope(limitedCtx, 'manage')).toBe(false);
		});
	});

	describe('server context', () => {
		const ctx = { type: 'server' as const, serverId: 'server_123' };

		test('does not have scopes (server auth is different)', () => {
			expect(hasScope(ctx, 'read')).toBe(false);
			expect(hasScope(ctx, 'manage')).toBe(false);
		});
	});

	describe('payment context', () => {
		const ctx = {
			type: 'payment' as const,
			paymentRef: 'pi_123',
			paymentProvider: 'stripe',
		};

		test('does not have scopes (payment is per-operation)', () => {
			expect(hasScope(ctx, 'read')).toBe(false);
			expect(hasScope(ctx, 'book')).toBe(false);
		});
	});
});

describe('requireScope', () => {
	test('returns authorized true when scope present', () => {
		const ctx = { type: 'anonymous' as const };
		const result = requireScope(ctx, 'read');
		expect(result.authorized).toBe(true);
	});

	test('returns authorized false with message when scope missing', () => {
		const ctx = { type: 'anonymous' as const };
		const result = requireScope(ctx, 'manage');
		expect(result.authorized).toBe(false);
		if (!result.authorized) {
			expect(result.message).toContain('manage');
		}
	});

	test('api_key with manage scope can manage', () => {
		const ctx = {
			type: 'api_key' as const,
			tenantId: tenantId(DEMO_TENANT_ID),
			scopes: ['manage'] as const,
		};
		const result = requireScope(ctx, 'manage');
		expect(result.authorized).toBe(true);
	});

	test('session can hold but not manage', () => {
		const ctx = { type: 'session' as const, sessionId: 'sess_123' };
		expect(requireScope(ctx, 'hold').authorized).toBe(true);
		expect(requireScope(ctx, 'manage').authorized).toBe(false);
	});
});
