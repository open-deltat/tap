import { describe, expect, test } from 'bun:test';
import {
	AccessLevelSchema,
	AccessPolicySchema,
	ApiKeySchema,
	AuthContextSchema,
	AuthScopeSchema,
	SessionCreateResponseSchema,
	SessionSchema,
} from './auth';

const VALID_ULID = '01JD7RVSXRFMK5S0GF5JNCD1JY';

describe('AuthScopeSchema', () => {
	test('accepts valid scopes', () => {
		expect(AuthScopeSchema.parse('read')).toBe('read');
		expect(AuthScopeSchema.parse('hold')).toBe('hold');
		expect(AuthScopeSchema.parse('book')).toBe('book');
		expect(AuthScopeSchema.parse('cancel')).toBe('cancel');
		expect(AuthScopeSchema.parse('manage')).toBe('manage');
	});

	test('rejects invalid scope', () => {
		expect(() => AuthScopeSchema.parse('admin')).toThrow();
		expect(() => AuthScopeSchema.parse('write')).toThrow();
		expect(() => AuthScopeSchema.parse('')).toThrow();
	});
});

describe('AccessLevelSchema', () => {
	test('accepts valid access levels', () => {
		expect(AccessLevelSchema.parse('public')).toBe('public');
		expect(AccessLevelSchema.parse('session')).toBe('session');
		expect(AccessLevelSchema.parse('authenticated')).toBe('authenticated');
		expect(AccessLevelSchema.parse('payment')).toBe('payment');
		expect(AccessLevelSchema.parse('booking_owner')).toBe('booking_owner');
		expect(AccessLevelSchema.parse('owner')).toBe('owner');
	});

	test('rejects invalid access level', () => {
		expect(() => AccessLevelSchema.parse('admin')).toThrow();
		expect(() => AccessLevelSchema.parse('private')).toThrow();
	});
});

describe('AccessPolicySchema', () => {
	test('accepts complete policy', () => {
		const policy = AccessPolicySchema.parse({
			availability: 'public',
			hold: 'session',
			book: 'payment',
			cancel: 'booking_owner',
			manage: 'owner',
		});
		expect(policy.availability).toBe('public');
		expect(policy.manage).toBe('owner');
	});

	test('applies defaults for missing fields', () => {
		const policy = AccessPolicySchema.parse({});
		expect(policy.availability).toBe('public');
		expect(policy.hold).toBe('session');
		expect(policy.book).toBe('payment');
		expect(policy.cancel).toBe('booking_owner');
		expect(policy.manage).toBe('owner');
	});

	test('allows partial override', () => {
		const policy = AccessPolicySchema.parse({
			availability: 'authenticated',
		});
		expect(policy.availability).toBe('authenticated');
		expect(policy.hold).toBe('session');
	});
});

describe('SessionSchema', () => {
	test('accepts valid session', () => {
		const session = SessionSchema.parse({
			sessionId: 'sess_01HXYZ123',
			expiresAt: 1234567890000,
		});
		expect(session.sessionId).toBe('sess_01HXYZ123');
		expect(session.expiresAt).toBe(1234567890000);
	});

	test('rejects missing sessionId', () => {
		expect(() => SessionSchema.parse({ expiresAt: 1234567890000 })).toThrow();
	});

	test('rejects missing expiresAt', () => {
		expect(() => SessionSchema.parse({ sessionId: 'sess_123' })).toThrow();
	});
});

describe('ApiKeySchema', () => {
	test('accepts valid API key', () => {
		const key = ApiKeySchema.parse({
			id: VALID_ULID,
			tenantId: VALID_ULID,
			secret: 'sk_live_abc123',
			scopes: ['read', 'book'],
			name: 'Production Key',
			createdAt: 1234567890000,
		});
		expect(key.id).toBe(VALID_ULID);
		expect(key.scopes).toEqual(['read', 'book']);
	});

	test('accepts API key with optional expiresAt', () => {
		const key = ApiKeySchema.parse({
			id: VALID_ULID,
			tenantId: VALID_ULID,
			secret: 'sk_live_abc123',
			scopes: ['read'],
			name: 'Test Key',
			createdAt: 1234567890000,
			expiresAt: 9999999999000,
		});
		expect(key.expiresAt).toBe(9999999999000);
	});

	test('rejects invalid scope in array', () => {
		expect(() =>
			ApiKeySchema.parse({
				id: VALID_ULID,
				tenantId: VALID_ULID,
				secret: 'sk_live_abc123',
				scopes: ['read', 'invalid'],
				name: 'Test',
				createdAt: 1234567890000,
			}),
		).toThrow();
	});
});

describe('AuthContextSchema', () => {
	test('parses anonymous context', () => {
		const ctx = AuthContextSchema.parse({ type: 'anonymous' });
		expect(ctx.type).toBe('anonymous');
	});

	test('parses session context', () => {
		const ctx = AuthContextSchema.parse({
			type: 'session',
			sessionId: 'sess_123',
		});
		expect(ctx.type).toBe('session');
		if (ctx.type === 'session') {
			expect(ctx.sessionId).toBe('sess_123');
		}
	});

	test('parses api_key context', () => {
		const ctx = AuthContextSchema.parse({
			type: 'api_key',
			tenantId: VALID_ULID,
			scopes: ['read', 'manage'],
		});
		expect(ctx.type).toBe('api_key');
		if (ctx.type === 'api_key') {
			expect(ctx.scopes).toContain('manage');
		}
	});

	test('parses server context', () => {
		const ctx = AuthContextSchema.parse({
			type: 'server',
			serverId: 'airbnb_tap_prod',
		});
		expect(ctx.type).toBe('server');
	});

	test('parses payment context', () => {
		const ctx = AuthContextSchema.parse({
			type: 'payment',
			paymentRef: 'pi_123abc',
			paymentProvider: 'stripe',
		});
		expect(ctx.type).toBe('payment');
		if (ctx.type === 'payment') {
			expect(ctx.paymentRef).toBe('pi_123abc');
			expect(ctx.paymentProvider).toBe('stripe');
		}
	});

	test('rejects unknown type', () => {
		expect(() => AuthContextSchema.parse({ type: 'unknown' })).toThrow();
	});

	test('rejects session without sessionId', () => {
		expect(() => AuthContextSchema.parse({ type: 'session' })).toThrow();
	});

	test('rejects api_key without tenantId', () => {
		expect(() =>
			AuthContextSchema.parse({ type: 'api_key', scopes: ['read'] }),
		).toThrow();
	});
});

describe('SessionCreateResponseSchema', () => {
	test('accepts valid response', () => {
		const res = SessionCreateResponseSchema.parse({
			sessionId: 'sess_01HXYZ',
			expiresAt: 1234567890000,
		});
		expect(res.sessionId).toBe('sess_01HXYZ');
		expect(res.expiresAt).toBe(1234567890000);
	});

	test('rejects non-numeric expiresAt', () => {
		expect(() =>
			SessionCreateResponseSchema.parse({
				sessionId: 'sess_123',
				expiresAt: '2025-01-01',
			}),
		).toThrow();
	});
});
