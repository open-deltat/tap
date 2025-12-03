import { z } from 'zod';
import { TenantIdSchema } from './primitives';

export const AuthScopeSchema = z.enum([
	'read',
	'hold',
	'book',
	'cancel',
	'manage',
]);
export type AuthScope = z.infer<typeof AuthScopeSchema>;

export const AccessLevelSchema = z.enum([
	'public',
	'session',
	'authenticated',
	'payment',
	'booking_owner',
	'owner',
]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const AccessPolicySchema = z.object({
	availability: AccessLevelSchema.default('public'),
	hold: AccessLevelSchema.default('session'),
	book: AccessLevelSchema.default('payment'),
	cancel: AccessLevelSchema.default('booking_owner'),
	manage: AccessLevelSchema.default('owner'),
});
export type AccessPolicy = z.infer<typeof AccessPolicySchema>;

export const SessionSchema = z.object({
	sessionId: z.string(),
	expiresAt: z.number(),
});
export type Session = z.infer<typeof SessionSchema>;

export const ApiKeySchema = z.object({
	id: z.string(),
	tenantId: TenantIdSchema,
	secret: z.string(),
	scopes: z.array(AuthScopeSchema),
	name: z.string(),
	createdAt: z.number(),
	expiresAt: z.number().optional(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const AuthContextSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('anonymous'),
	}),
	z.object({
		type: z.literal('session'),
		sessionId: z.string(),
	}),
	z.object({
		type: z.literal('api_key'),
		tenantId: TenantIdSchema,
		scopes: z.array(AuthScopeSchema),
	}),
	z.object({
		type: z.literal('server'),
		serverId: z.string(),
	}),
	z.object({
		type: z.literal('payment'),
		paymentRef: z.string(),
		paymentProvider: z.string(),
	}),
]);
export type AuthContext = z.infer<typeof AuthContextSchema>;

export const SessionCreateResponseSchema = z.object({
	sessionId: z.string(),
	expiresAt: z.number(),
});
export type SessionCreateResponse = z.infer<typeof SessionCreateResponseSchema>;
