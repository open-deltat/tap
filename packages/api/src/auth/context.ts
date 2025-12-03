import {
	type AuthContext,
	type AuthScope,
	type TenantId,
	tenantId,
} from '@tap/protocol';

const API_KEYS = new Map<string, { tenantId: TenantId; scopes: AuthScope[] }>();

const DEMO_TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3';
const DEMO_API_KEY = 'demo_key_123';

API_KEYS.set(`${DEMO_TENANT_ID}:${DEMO_API_KEY}`, {
	tenantId: tenantId(DEMO_TENANT_ID),
	scopes: ['read', 'hold', 'book', 'cancel', 'manage'],
});

export const parseAuthHeader = (header: string | null): AuthContext => {
	if (!header) {
		return { type: 'anonymous' };
	}

	if (header.startsWith('TAP-Key ')) {
		const key = header.slice(8);
		const apiKey = API_KEYS.get(key);
		if (apiKey) {
			return {
				type: 'api_key',
				tenantId: apiKey.tenantId,
				scopes: apiKey.scopes,
			};
		}
		return { type: 'anonymous' };
	}

	if (header.startsWith('Bearer ')) {
		const token = header.slice(7);
		if (token.startsWith('sess_')) {
			return { type: 'session', sessionId: token };
		}
		return { type: 'anonymous' };
	}

	return { type: 'anonymous' };
};

export const getAuthContext = (req: Request): AuthContext => {
	const authHeader = req.headers.get('Authorization');
	return parseAuthHeader(authHeader);
};

export const hasScope = (ctx: AuthContext, scope: AuthScope): boolean => {
	if (ctx.type === 'api_key') {
		return ctx.scopes.includes(scope);
	}
	if (ctx.type === 'session') {
		return scope === 'read' || scope === 'hold';
	}
	if (ctx.type === 'anonymous') {
		return scope === 'read';
	}
	return false;
};

export const requireScope = (
	ctx: AuthContext,
	scope: AuthScope,
): { authorized: true } | { authorized: false; message: string } => {
	if (hasScope(ctx, scope)) {
		return { authorized: true };
	}
	return {
		authorized: false,
		message: `Missing required scope: ${scope}`,
	};
};
