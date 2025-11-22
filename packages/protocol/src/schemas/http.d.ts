import { z } from 'zod';
export declare const AvailabilityPostRequestBodySchema: z.ZodObject<
	{
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
		from: z.ZodString;
		to: z.ZodString;
		slotDurationMinutes: z.ZodOptional<z.ZodNumber>;
	},
	'strip',
	z.ZodTypeAny,
	{
		resourceId: string & {
			__brand: 'ResourceId';
		};
		tenantId: string & {
			__brand: 'TenantId';
		};
		from: string;
		to: string;
		slotDurationMinutes?: number | undefined;
	},
	{
		resourceId: string;
		tenantId: string;
		from: string;
		to: string;
		slotDurationMinutes?: number | undefined;
	}
>;
export type AvailabilityPostRequestBody = z.infer<
	typeof AvailabilityPostRequestBodySchema
>;
export declare const AvailabilityPostResponseSchema: z.ZodObject<
	{
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
		resolutionMinutes: z.ZodNumber;
		asOfEventId: z.ZodString;
		freeSlots: z.ZodArray<
			z.ZodObject<
				{
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
				},
				{
					slotId: string;
					resourceId: string;
					tenantId: string;
					start: string;
					end: string;
				}
			>,
			'many'
		>;
		pricing: z.ZodOptional<
			z.ZodArray<
				z.ZodObject<
					{
						slotId: z.ZodEffects<
							z.ZodString,
							import('./primitives').SlotId,
							string
						>;
						price: z.ZodOptional<
							z.ZodObject<
								{
									amountCents: z.ZodNumber;
									currency: z.ZodString;
								},
								'strip',
								z.ZodTypeAny,
								{
									amountCents: number;
									currency: string;
								},
								{
									amountCents: number;
									currency: string;
								}
							>
						>;
					},
					'strip',
					z.ZodTypeAny,
					{
						slotId: string & {
							__brand: 'SlotId';
						};
						price?:
							| {
									amountCents: number;
									currency: string;
							  }
							| undefined;
					},
					{
						slotId: string;
						price?:
							| {
									amountCents: number;
									currency: string;
							  }
							| undefined;
					}
				>,
				'many'
			>
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
		resourceId: string & {
			__brand: 'ResourceId';
		};
		tenantId: string & {
			__brand: 'TenantId';
		};
		resolutionMinutes: number;
		asOfEventId: string;
		freeSlots: {
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
		}[];
		pricing?:
			| {
					slotId: string & {
						__brand: 'SlotId';
					};
					price?:
						| {
								amountCents: number;
								currency: string;
						  }
						| undefined;
			  }[]
			| undefined;
	},
	{
		resourceId: string;
		tenantId: string;
		resolutionMinutes: number;
		asOfEventId: string;
		freeSlots: {
			slotId: string;
			resourceId: string;
			tenantId: string;
			start: string;
			end: string;
		}[];
		pricing?:
			| {
					slotId: string;
					price?:
						| {
								amountCents: number;
								currency: string;
						  }
						| undefined;
			  }[]
			| undefined;
	}
>;
export type AvailabilityPostResponse = z.infer<
	typeof AvailabilityPostResponseSchema
>;
export declare const BookPostRequestBodySchema: z.ZodObject<
	{
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
		customer: z.ZodObject<
			{
				name: z.ZodString;
				email: z.ZodString;
				phone: z.ZodOptional<z.ZodString>;
			},
			'strip',
			z.ZodTypeAny,
			{
				name: string;
				email: string;
				phone?: string | undefined;
			},
			{
				name: string;
				email: string;
				phone?: string | undefined;
			}
		>;
		clientRef: z.ZodOptional<z.ZodString>;
		holdSessionId: z.ZodOptional<
			z.ZodEffects<z.ZodString, import('./primitives').SessionId, string>
		>;
		holdId: z.ZodOptional<
			z.ZodEffects<z.ZodString, import('./primitives').HoldId, string>
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
		customer: {
			name: string;
			email: string;
			phone?: string | undefined;
		};
		clientRef?: string | undefined;
		holdSessionId?: import('./primitives').SessionId | undefined;
		holdId?: import('./primitives').HoldId | undefined;
	},
	{
		slotId: string;
		resourceId: string;
		tenantId: string;
		customer: {
			name: string;
			email: string;
			phone?: string | undefined;
		};
		clientRef?: string | undefined;
		holdSessionId?: string | undefined;
		holdId?: string | undefined;
	}
>;
export type BookPostRequestBody = z.infer<typeof BookPostRequestBodySchema>;
export declare const BookPostResponseSchema: z.ZodObject<
	{
		bookingId: z.ZodEffects<
			z.ZodString,
			import('./primitives').BookingId,
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
		start: z.ZodString;
		end: z.ZodString;
		paymentStatus: z.ZodEnum<['NONE', 'PENDING', 'PAID']>;
		clientRef: z.ZodOptional<z.ZodString>;
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
		bookingId: string & {
			__brand: 'BookingId';
		};
		paymentStatus: 'NONE' | 'PENDING' | 'PAID';
		clientRef?: string | undefined;
	},
	{
		slotId: string;
		resourceId: string;
		tenantId: string;
		start: string;
		end: string;
		bookingId: string;
		paymentStatus: 'NONE' | 'PENDING' | 'PAID';
		clientRef?: string | undefined;
	}
>;
export type BookPostResponse = z.infer<typeof BookPostResponseSchema>;
//# sourceMappingURL=http.d.ts.map
