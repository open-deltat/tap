import { createHash } from 'node:crypto';
import {
	type AuthContext,
	type AuthScope,
	type TenantId,
	tenantId,
} from '@open-tap/protocol';

const DEMO_TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3';
const DEMO_API_KEY = 'demo_key_123';

const DEMO_KEYS = new Map<
	string,
	{ tenantId: TenantId; scopes: AuthScope[] }
>();
DEMO_KEYS.set(`${DEMO_TENANT_ID}:${DEMO_API_KEY}`, {
	tenantId: tenantId(DEMO_TENANT_ID),
	scopes: ['read', 'hold', 'book', 'cancel', 'manage'],
});

export const hashApiKey = (key: string): string => {
	return createHash('sha256').update(key).digest('hex');
};

export type ApiKeyLookup = {
	getByKeyHash: (keyHash: string) => Promise<{
		id: string;
		tenantId: TenantId;
		scopes: AuthScope[];
	} | null>;
	updateLastUsed?: (id: string) => Promise<void>;
};

let apiKeyLookup: ApiKeyLookup | null = null;

export const setApiKeyLookup = (lookup: ApiKeyLookup): void => {
	apiKeyLookup = lookup;
};

export const parseAuthHeader = async (
	header: string | null,
): Promise<AuthContext> => {
	if (!header) {
		return { type: 'anonymous' };
	}

	if (header.startsWith('TAP-Key ')) {
		const key = header.slice(8);

		const demoKey = DEMO_KEYS.get(key);
		if (demoKey) {
			return {
				type: 'api_key',
				tenantId: demoKey.tenantId,
				scopes: demoKey.scopes,
			};
		}

		if (apiKeyLookup) {
			const keyHash = hashApiKey(key);
			const dbKey = await apiKeyLookup.getByKeyHash(keyHash);
			if (dbKey) {
				if (apiKeyLookup.updateLastUsed) {
					apiKeyLookup.updateLastUsed(dbKey.id).catch(() => {});
				}
				return {
					type: 'api_key',
					tenantId: dbKey.tenantId,
					scopes: dbKey.scopes,
				};
			}
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

export const getAuthContext = async (req: Request): Promise<AuthContext> => {
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
