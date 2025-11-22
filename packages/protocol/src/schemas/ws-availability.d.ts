import { z } from 'zod';
export declare const AvailabilityWsHelloSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'stream.hello'>;
		resourceId: z.ZodNullable<
			z.ZodEffects<z.ZodString, import('./primitives').ResourceId, string>
		>;
		tenantId: z.ZodNullable<
			z.ZodEffects<z.ZodString, import('./primitives').TenantId, string>
		>;
		cursor: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		type: 'stream.hello';
		resourceId: import('./primitives').ResourceId | null;
		tenantId: import('./primitives').TenantId | null;
		cursor: string;
	},
	{
		type: 'stream.hello';
		resourceId: string | null;
		tenantId: string | null;
		cursor: string;
	}
>;
export type AvailabilityWsHello = z.infer<typeof AvailabilityWsHelloSchema>;
export declare const AvailabilityDeltaKindSchema: z.ZodEnum<
	[
		'HoldPlaced',
		'HoldReleased',
		'HoldExpired',
		'BookingConfirmed',
		'BookingCancelled',
	]
>;
export type AvailabilityDeltaKind = z.infer<typeof AvailabilityDeltaKindSchema>;
export declare const AvailabilityDeltaPayloadSchema: z.ZodObject<
	{
		kind: z.ZodEnum<
			[
				'HoldPlaced',
				'HoldReleased',
				'HoldExpired',
				'BookingConfirmed',
				'BookingCancelled',
			]
		>;
		slotId: z.ZodEffects<z.ZodString, import('./primitives').SlotId, string>;
		resourceId: z.ZodEffects<
			z.ZodString,
			import('./primitives').ResourceId,
			string
		>;
		tenantId: z.ZodEffects<
			z.ZodString,
			import('./primitives').TenantId,
			string
		>;
		start: z.ZodString;
		end: z.ZodString;
		holdId: z.ZodOptional<
			z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>
		>;
		bookingId: z.ZodOptional<
			z.ZodEffects<z.ZodString, import('./primitives').BookingId, string>
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
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
		kind:
			| 'HoldPlaced'
			| 'HoldReleased'
			| 'HoldExpired'
			| 'BookingConfirmed'
			| 'BookingCancelled';
		holdId?: import('./primitives').HoldId | undefined;
		bookingId?: import('./primitives').BookingId | undefined;
	},
	{
		slotId: string;
		resourceId: string;
		tenantId: string;
		start: string;
		end: string;
		kind:
			| 'HoldPlaced'
			| 'HoldReleased'
			| 'HoldExpired'
			| 'BookingConfirmed'
			| 'BookingCancelled';
		holdId?: string | undefined;
		bookingId?: string | undefined;
	}
>;
export type AvailabilityDeltaPayload = z.infer<
	typeof AvailabilityDeltaPayloadSchema
>;
export declare const AvailabilityWsDeltaSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'stream.delta'>;
		eventId: z.ZodString;
		payload: z.ZodObject<
			{
				kind: z.ZodEnum<
					[
						'HoldPlaced',
						'HoldReleased',
						'HoldExpired',
						'BookingConfirmed',
						'BookingCancelled',
					]
				>;
				slotId: z.ZodEffects<
					z.ZodString,
					import('./primitives').SlotId,
					string
				>;
				resourceId: z.ZodEffects<
					z.ZodString,
					import('./primitives').ResourceId,
					string
				>;
				tenantId: z.ZodEffects<
					z.ZodString,
					import('./primitives').TenantId,
					string
				>;
				start: z.ZodString;
				end: z.ZodString;
				holdId: z.ZodOptional<
					z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>
				>;
				bookingId: z.ZodOptional<
					z.ZodEffects<z.ZodString, import('./primitives').BookingId, string>
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
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
				kind:
					| 'HoldPlaced'
					| 'HoldReleased'
					| 'HoldExpired'
					| 'BookingConfirmed'
					| 'BookingCancelled';
				holdId?: import('./primitives').HoldId | undefined;
				bookingId?: import('./primitives').BookingId | undefined;
			},
			{
				slotId: string;
				resourceId: string;
				tenantId: string;
				start: string;
				end: string;
				kind:
					| 'HoldPlaced'
					| 'HoldReleased'
					| 'HoldExpired'
					| 'BookingConfirmed'
					| 'BookingCancelled';
				holdId?: string | undefined;
				bookingId?: string | undefined;
			}
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
		type: 'stream.delta';
		eventId: string;
		payload: {
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
			kind:
				| 'HoldPlaced'
				| 'HoldReleased'
				| 'HoldExpired'
				| 'BookingConfirmed'
				| 'BookingCancelled';
			holdId?: import('./primitives').HoldId | undefined;
			bookingId?: import('./primitives').BookingId | undefined;
		};
	},
	{
		type: 'stream.delta';
		eventId: string;
		payload: {
			slotId: string;
			resourceId: string;
			tenantId: string;
			start: string;
			end: string;
			kind:
				| 'HoldPlaced'
				| 'HoldReleased'
				| 'HoldExpired'
				| 'BookingConfirmed'
				| 'BookingCancelled';
			holdId?: string | undefined;
			bookingId?: string | undefined;
		};
	}
>;
export type AvailabilityWsDelta = z.infer<typeof AvailabilityWsDeltaSchema>;
export declare const AvailabilityWsErrorSchema: z.ZodObject<
	{
		type: z.ZodLiteral<'stream.error'>;
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
		type: 'stream.error';
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
		type: 'stream.error';
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
export type AvailabilityWsError = z.infer<typeof AvailabilityWsErrorSchema>;
export declare const AvailabilityWsServerMessageSchema: z.ZodUnion<
	[
		z.ZodObject<
			{
				type: z.ZodLiteral<'stream.hello'>;
				resourceId: z.ZodNullable<
					z.ZodEffects<z.ZodString, import('./primitives').ResourceId, string>
				>;
				tenantId: z.ZodNullable<
					z.ZodEffects<z.ZodString, import('./primitives').TenantId, string>
				>;
				cursor: z.ZodString;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'stream.hello';
				resourceId: import('./primitives').ResourceId | null;
				tenantId: import('./primitives').TenantId | null;
				cursor: string;
			},
			{
				type: 'stream.hello';
				resourceId: string | null;
				tenantId: string | null;
				cursor: string;
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'stream.delta'>;
				eventId: z.ZodString;
				payload: z.ZodObject<
					{
						kind: z.ZodEnum<
							[
								'HoldPlaced',
								'HoldReleased',
								'HoldExpired',
								'BookingConfirmed',
								'BookingCancelled',
							]
						>;
						slotId: z.ZodEffects<
							z.ZodString,
							import('./primitives').SlotId,
							string
						>;
						resourceId: z.ZodEffects<
							z.ZodString,
							import('./primitives').ResourceId,
							string
						>;
						tenantId: z.ZodEffects<
							z.ZodString,
							import('./primitives').TenantId,
							string
						>;
						start: z.ZodString;
						end: z.ZodString;
						holdId: z.ZodOptional<
							z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>
						>;
						bookingId: z.ZodOptional<
							z.ZodEffects<
								z.ZodString,
								import('./primitives').BookingId,
								string
							>
						>;
					},
					'strip',
					z.ZodTypeAny,
					{
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
						kind:
							| 'HoldPlaced'
							| 'HoldReleased'
							| 'HoldExpired'
							| 'BookingConfirmed'
							| 'BookingCancelled';
						holdId?: import('./primitives').HoldId | undefined;
						bookingId?: import('./primitives').BookingId | undefined;
					},
					{
						slotId: string;
						resourceId: string;
						tenantId: string;
						start: string;
						end: string;
						kind:
							| 'HoldPlaced'
							| 'HoldReleased'
							| 'HoldExpired'
							| 'BookingConfirmed'
							| 'BookingCancelled';
						holdId?: string | undefined;
						bookingId?: string | undefined;
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'stream.delta';
				eventId: string;
				payload: {
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
					kind:
						| 'HoldPlaced'
						| 'HoldReleased'
						| 'HoldExpired'
						| 'BookingConfirmed'
						| 'BookingCancelled';
					holdId?: import('./primitives').HoldId | undefined;
					bookingId?: import('./primitives').BookingId | undefined;
				};
			},
			{
				type: 'stream.delta';
				eventId: string;
				payload: {
					slotId: string;
					resourceId: string;
					tenantId: string;
					start: string;
					end: string;
					kind:
						| 'HoldPlaced'
						| 'HoldReleased'
						| 'HoldExpired'
						| 'BookingConfirmed'
						| 'BookingCancelled';
					holdId?: string | undefined;
					bookingId?: string | undefined;
				};
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'stream.error'>;
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
				type: 'stream.error';
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
				type: 'stream.error';
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
export type AvailabilityWsServerMessage = z.infer<
	typeof AvailabilityWsServerMessageSchema
>;
export declare const AvailabilityWsClientMessageSchema: z.ZodUnion<
	[
		z.ZodObject<
			{
				type: z.ZodLiteral<'stream.subscribe'>;
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
				from: z.ZodOptional<z.ZodString>;
				to: z.ZodOptional<z.ZodString>;
				cursor: z.ZodOptional<z.ZodString>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'stream.subscribe';
				resourceId: string & {
					__brand: 'ResourceId';
				};
				tenantId: string & {
					__brand: 'TenantId';
				};
				from?: string | undefined;
				to?: string | undefined;
				cursor?: string | undefined;
			},
			{
				type: 'stream.subscribe';
				resourceId: string;
				tenantId: string;
				from?: string | undefined;
				to?: string | undefined;
				cursor?: string | undefined;
			}
		>,
		z.ZodObject<
			{
				type: z.ZodLiteral<'stream.ping'>;
				nonce: z.ZodOptional<z.ZodString>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'stream.ping';
				nonce?: string | undefined;
			},
			{
				type: 'stream.ping';
				nonce?: string | undefined;
			}
		>,
	]
>;
export type AvailabilityWsClientMessage = z.infer<
	typeof AvailabilityWsClientMessageSchema
>;
//# sourceMappingURL=ws-availability.d.ts.map
