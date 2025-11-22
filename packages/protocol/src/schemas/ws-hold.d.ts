import { z } from 'zod';
/**
 * WS /hold-ws connection semantics:
 *
 * 1. Client connects with query params (tenantId, resourceId, slotId).
 * 2. Connection itself implies a request to HOLD that slot.
 * 3. Server validates availability.
 *    - If available: Sends hold.session.hello AND hold.confirmed.
 *    - If unavailable: Sends hold.error (TAP_SLOT_UNAVAILABLE) and closes.
 * 4. Hold validity == Connection lifetime (unless forcefully released).
 */
export declare const HoldWsHelloSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'hold.session.hello'>;
		sessionId: z.ZodEffects<
			z.ZodString,
			import('./primitives').SessionId,
			string
		>;
		tenantId: z.ZodEffects<
			z.ZodString,
			import('./primitives').TenantId,
			string
		>;
		resourceId: z.ZodEffects<
			z.ZodString,
			import('./primitives').ResourceId,
			string
		>;
		slotId: z.ZodEffects<z.ZodString, import('./primitives').SlotId, string>;
	},
	'strip',
	z.ZodTypeAny,
	{
		type: 'hold.session.hello';
		slotId: string & {
			__brand: 'SlotId';
		};
		resourceId: string & {
			__brand: 'ResourceId';
		};
		tenantId: string & {
			__brand: 'TenantId';
		};
		sessionId: string & {
			__brand: 'SessionId';
		};
	},
	{
		type: 'hold.session.hello';
		slotId: string;
		resourceId: string;
		tenantId: string;
		sessionId: string;
	}
>;
export type HoldWsHello = z.infer<typeof HoldWsHelloSchema>;
export declare const HoldWsConfirmedSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'hold.confirmed'>;
		holdId: z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>;
		tenantId: z.ZodEffects<
			z.ZodString,
			import('./primitives').TenantId,
			string
		>;
		resourceId: z.ZodEffects<
			z.ZodString,
			import('./primitives').ResourceId,
			string
		>;
		slotId: z.ZodEffects<z.ZodString, import('./primitives').SlotId, string>;
		start: z.ZodString;
		end: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		type: 'hold.confirmed';
		slotId: string & {
			__brand: 'SlotId';
		};
		resourceId: string & {
			__brand: 'ResourceId';
		};
		tenantId: string & {
			__brand: 'TenantId';
		};
		start: string;
		end: string;
		holdId: string & {
			__brand: 'HoldId';
		};
	},
	{
		type: 'hold.confirmed';
		slotId: string;
		resourceId: string;
		tenantId: string;
		start: string;
		end: string;
		holdId: string;
	}
>;
export type HoldWsConfirmed = z.infer<typeof HoldWsConfirmedSchema>;
export declare const HoldWsForceReleaseSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'hold.forceRelease'>;
		holdId: z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>;
		reason: z.ZodEnum<
			['DISCONNECTED', 'SERVER_SHUTDOWN', 'POLICY_LIMIT', 'RESOURCE_DISABLED']
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
		type: 'hold.forceRelease';
		holdId: string & {
			__brand: 'HoldId';
		};
		reason:
			| 'DISCONNECTED'
			| 'SERVER_SHUTDOWN'
			| 'POLICY_LIMIT'
			| 'RESOURCE_DISABLED';
	},
	{
		type: 'hold.forceRelease';
		holdId: string;
		reason:
			| 'DISCONNECTED'
			| 'SERVER_SHUTDOWN'
			| 'POLICY_LIMIT'
			| 'RESOURCE_DISABLED';
	}
>;
export type HoldWsForceRelease = z.infer<typeof HoldWsForceReleaseSchema>;
export declare const HoldWsErrorSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'hold.error'>;
		errorValue: z.ZodEnum<
			[
				'TAP_INVALID_INPUT',
				'TAP_RESOURCE_NOT_FOUND',
				'TAP_TENANT_NOT_FOUND',
				'TAP_SLOT_UNAVAILABLE',
				'TAP_HOLD_NOT_FOUND',
				'TAP_HOLD_EXPIRED',
				'TAP_BOOKING_NOT_FOUND',
				'TAP_UNAUTHENTICATED',
				'TAP_UNAUTHORIZED',
				'TAP_RATE_LIMIT_EXCEEDED',
				'TAP_CONCURRENCY_CONFLICT',
				'TAP_STORAGE_FAILURE',
				'TAP_INTERNAL_ERROR',
				'TAP_INVARIANT_VIOLATION',
				'TAP_QUOTA_EXCEEDED',
			]
		>;
		message: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		message: string;
		type: 'hold.error';
		errorValue:
			| 'TAP_INVALID_INPUT'
			| 'TAP_RESOURCE_NOT_FOUND'
			| 'TAP_TENANT_NOT_FOUND'
			| 'TAP_SLOT_UNAVAILABLE'
			| 'TAP_HOLD_NOT_FOUND'
			| 'TAP_HOLD_EXPIRED'
			| 'TAP_BOOKING_NOT_FOUND'
			| 'TAP_UNAUTHENTICATED'
			| 'TAP_UNAUTHORIZED'
			| 'TAP_RATE_LIMIT_EXCEEDED'
			| 'TAP_CONCURRENCY_CONFLICT'
			| 'TAP_STORAGE_FAILURE'
			| 'TAP_INTERNAL_ERROR'
			| 'TAP_INVARIANT_VIOLATION'
			| 'TAP_QUOTA_EXCEEDED';
	},
	{
		message: string;
		type: 'hold.error';
		errorValue:
			| 'TAP_INVALID_INPUT'
			| 'TAP_RESOURCE_NOT_FOUND'
			| 'TAP_TENANT_NOT_FOUND'
			| 'TAP_SLOT_UNAVAILABLE'
			| 'TAP_HOLD_NOT_FOUND'
			| 'TAP_HOLD_EXPIRED'
			| 'TAP_BOOKING_NOT_FOUND'
			| 'TAP_UNAUTHENTICATED'
			| 'TAP_UNAUTHORIZED'
			| 'TAP_RATE_LIMIT_EXCEEDED'
			| 'TAP_CONCURRENCY_CONFLICT'
			| 'TAP_STORAGE_FAILURE'
			| 'TAP_INTERNAL_ERROR'
			| 'TAP_INVARIANT_VIOLATION'
			| 'TAP_QUOTA_EXCEEDED';
	}
>;
export type HoldWsError = z.infer<typeof HoldWsErrorSchema>;
export declare const HoldWsServerMessageSchema: z.ZodUnion<
	[
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.session.hello'>;
				sessionId: z.ZodEffects<
					z.ZodString,
					import('./primitives').SessionId,
					string
				>;
				tenantId: z.ZodEffects<
					z.ZodString,
					import('./primitives').TenantId,
					string
				>;
				resourceId: z.ZodEffects<
					z.ZodString,
					import('./primitives').ResourceId,
					string
				>;
				slotId: z.ZodEffects<
					z.ZodString,
					import('./primitives').SlotId,
					string
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'hold.session.hello';
				slotId: string & {
					__brand: 'SlotId';
				};
				resourceId: string & {
					__brand: 'ResourceId';
				};
				tenantId: string & {
					__brand: 'TenantId';
				};
				sessionId: string & {
					__brand: 'SessionId';
				};
			},
			{
				type: 'hold.session.hello';
				slotId: string;
				resourceId: string;
				tenantId: string;
				sessionId: string;
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.confirmed'>;
				holdId: z.ZodEffects<
					z.ZodString,
					import('./primitives').HoldId,
					string
				>;
				tenantId: z.ZodEffects<
					z.ZodString,
					import('./primitives').TenantId,
					string
				>;
				resourceId: z.ZodEffects<
					z.ZodString,
					import('./primitives').ResourceId,
					string
				>;
				slotId: z.ZodEffects<
					z.ZodString,
					import('./primitives').SlotId,
					string
				>;
				start: z.ZodString;
				end: z.ZodString;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'hold.confirmed';
				slotId: string & {
					__brand: 'SlotId';
				};
				resourceId: string & {
					__brand: 'ResourceId';
				};
				tenantId: string & {
					__brand: 'TenantId';
				};
				start: string;
				end: string;
				holdId: string & {
					__brand: 'HoldId';
				};
			},
			{
				type: 'hold.confirmed';
				slotId: string;
				resourceId: string;
				tenantId: string;
				start: string;
				end: string;
				holdId: string;
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.forceRelease'>;
				holdId: z.ZodEffects<
					z.ZodString,
					import('./primitives').HoldId,
					string
				>;
				reason: z.ZodEnum<
					[
						'DISCONNECTED',
						'SERVER_SHUTDOWN',
						'POLICY_LIMIT',
						'RESOURCE_DISABLED',
					]
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'hold.forceRelease';
				holdId: string & {
					__brand: 'HoldId';
				};
				reason:
					| 'DISCONNECTED'
					| 'SERVER_SHUTDOWN'
					| 'POLICY_LIMIT'
					| 'RESOURCE_DISABLED';
			},
			{
				type: 'hold.forceRelease';
				holdId: string;
				reason:
					| 'DISCONNECTED'
					| 'SERVER_SHUTDOWN'
					| 'POLICY_LIMIT'
					| 'RESOURCE_DISABLED';
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.error'>;
				errorValue: z.ZodEnum<
					[
						'TAP_INVALID_INPUT',
						'TAP_RESOURCE_NOT_FOUND',
						'TAP_TENANT_NOT_FOUND',
						'TAP_SLOT_UNAVAILABLE',
						'TAP_HOLD_NOT_FOUND',
						'TAP_HOLD_EXPIRED',
						'TAP_BOOKING_NOT_FOUND',
						'TAP_UNAUTHENTICATED',
						'TAP_UNAUTHORIZED',
						'TAP_RATE_LIMIT_EXCEEDED',
						'TAP_CONCURRENCY_CONFLICT',
						'TAP_STORAGE_FAILURE',
						'TAP_INTERNAL_ERROR',
						'TAP_INVARIANT_VIOLATION',
						'TAP_QUOTA_EXCEEDED',
					]
				>;
				message: z.ZodString;
			},
			'strip',
			z.ZodTypeAny,
			{
				message: string;
				type: 'hold.error';
				errorValue:
					| 'TAP_INVALID_INPUT'
					| 'TAP_RESOURCE_NOT_FOUND'
					| 'TAP_TENANT_NOT_FOUND'
					| 'TAP_SLOT_UNAVAILABLE'
					| 'TAP_HOLD_NOT_FOUND'
					| 'TAP_HOLD_EXPIRED'
					| 'TAP_BOOKING_NOT_FOUND'
					| 'TAP_UNAUTHENTICATED'
					| 'TAP_UNAUTHORIZED'
					| 'TAP_RATE_LIMIT_EXCEEDED'
					| 'TAP_CONCURRENCY_CONFLICT'
					| 'TAP_STORAGE_FAILURE'
					| 'TAP_INTERNAL_ERROR'
					| 'TAP_INVARIANT_VIOLATION'
					| 'TAP_QUOTA_EXCEEDED';
			},
			{
				message: string;
				type: 'hold.error';
				errorValue:
					| 'TAP_INVALID_INPUT'
					| 'TAP_RESOURCE_NOT_FOUND'
					| 'TAP_TENANT_NOT_FOUND'
					| 'TAP_SLOT_UNAVAILABLE'
					| 'TAP_HOLD_NOT_FOUND'
					| 'TAP_HOLD_EXPIRED'
					| 'TAP_BOOKING_NOT_FOUND'
					| 'TAP_UNAUTHENTICATED'
					| 'TAP_UNAUTHORIZED'
					| 'TAP_RATE_LIMIT_EXCEEDED'
					| 'TAP_CONCURRENCY_CONFLICT'
					| 'TAP_STORAGE_FAILURE'
					| 'TAP_INTERNAL_ERROR'
					| 'TAP_INVARIANT_VIOLATION'
					| 'TAP_QUOTA_EXCEEDED';
			}
		>,
	]
>;
export type HoldWsServerMessage = z.infer<typeof HoldWsServerMessageSchema>;
export declare const HoldWsClientMessageSchema: z.ZodUnion<
	[
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.ping'>;
				nonce: z.ZodOptional<z.ZodString>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'hold.ping';
				nonce?: string | undefined;
			},
			{
				type: 'hold.ping';
				nonce?: string | undefined;
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'hold.release'>;
				holdId: z.ZodEffects<
					z.ZodString,
					import('./primitives').HoldId,
					string
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'hold.release';
				holdId: string & {
					__brand: 'HoldId';
				};
			},
			{
				type: 'hold.release';
				holdId: string;
			}
		>,
	]
>;
export type HoldWsClientMessage = z.infer<typeof HoldWsClientMessageSchema>;
//# sourceMappingURL=ws-hold.d.ts.map
