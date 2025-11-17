import { z } from 'zod';
export declare const LedgerEventSchema: z.ZodDiscriminatedUnion<
	'type',
	[
		z.ZodObject<
			{
				eventId: z.ZodString;
				tenantId: z.ZodString;
				resourceId: z.ZodString;
				version: z.ZodLiteral<1>;
				createdAt: z.ZodNumber;
			} & {
				type: z.ZodLiteral<'ResourceCreated'>;
				payload: z.ZodObject<
					{
						resource: z.ZodObject<
							Pick<
								{
									id: z.ZodString;
									tenantId: z.ZodString;
									name: z.ZodString;
									slug: z.ZodString;
									timezone: z.ZodString;
									slotMinutes: z.ZodEnum<['5', '10', '15', '30', '60']>;
									horizonDays: z.ZodDefault<z.ZodNumber>;
									requiresPayment: z.ZodDefault<z.ZodBoolean>;
									metadata: z.ZodOptional<
										z.ZodRecord<z.ZodString, z.ZodUnknown>
									>;
								},
								'id' | 'name' | 'slug' | 'timezone' | 'slotMinutes'
							>,
							'strip',
							z.ZodTypeAny,
							{
								id: string;
								name: string;
								slug: string;
								timezone: string;
								slotMinutes: '5' | '10' | '15' | '30' | '60';
							},
							{
								id: string;
								name: string;
								slug: string;
								timezone: string;
								slotMinutes: '5' | '10' | '15' | '30' | '60';
							}
						>;
					},
					'strip',
					z.ZodTypeAny,
					{
						resource: {
							id: string;
							name: string;
							slug: string;
							timezone: string;
							slotMinutes: '5' | '10' | '15' | '30' | '60';
						};
					},
					{
						resource: {
							id: string;
							name: string;
							slug: string;
							timezone: string;
							slotMinutes: '5' | '10' | '15' | '30' | '60';
						};
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'ResourceCreated';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					resource: {
						id: string;
						name: string;
						slug: string;
						timezone: string;
						slotMinutes: '5' | '10' | '15' | '30' | '60';
					};
				};
			},
			{
				type: 'ResourceCreated';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					resource: {
						id: string;
						name: string;
						slug: string;
						timezone: string;
						slotMinutes: '5' | '10' | '15' | '30' | '60';
					};
				};
			}
		>,
		z.ZodObject<
			{
				eventId: z.ZodString;
				tenantId: z.ZodString;
				resourceId: z.ZodString;
				version: z.ZodLiteral<1>;
				createdAt: z.ZodNumber;
			} & {
				type: z.ZodLiteral<'HoldPlaced'>;
				payload: z.ZodObject<
					{
						holdId: z.ZodString;
						day: z.ZodString;
						startMinute: z.ZodNumber;
						endMinute: z.ZodNumber;
						expiresAt: z.ZodNumber;
						clientRef: z.ZodOptional<z.ZodString>;
					},
					'strip',
					z.ZodTypeAny,
					{
						holdId: string;
						day: string;
						startMinute: number;
						endMinute: number;
						expiresAt: number;
						clientRef?: string | undefined;
					},
					{
						holdId: string;
						day: string;
						startMinute: number;
						endMinute: number;
						expiresAt: number;
						clientRef?: string | undefined;
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'HoldPlaced';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
					day: string;
					startMinute: number;
					endMinute: number;
					expiresAt: number;
					clientRef?: string | undefined;
				};
			},
			{
				type: 'HoldPlaced';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
					day: string;
					startMinute: number;
					endMinute: number;
					expiresAt: number;
					clientRef?: string | undefined;
				};
			}
		>,
		z.ZodObject<
			{
				eventId: z.ZodString;
				tenantId: z.ZodString;
				resourceId: z.ZodString;
				version: z.ZodLiteral<1>;
				createdAt: z.ZodNumber;
			} & {
				type: z.ZodLiteral<'HoldExpired'>;
				payload: z.ZodObject<
					{
						holdId: z.ZodString;
					},
					'strip',
					z.ZodTypeAny,
					{
						holdId: string;
					},
					{
						holdId: string;
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'HoldExpired';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
				};
			},
			{
				type: 'HoldExpired';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
				};
			}
		>,
		z.ZodObject<
			{
				eventId: z.ZodString;
				tenantId: z.ZodString;
				resourceId: z.ZodString;
				version: z.ZodLiteral<1>;
				createdAt: z.ZodNumber;
			} & {
				type: z.ZodLiteral<'BookingConfirmed'>;
				payload: z.ZodObject<
					{
						bookingId: z.ZodString;
						holdId: z.ZodString;
						start: z.ZodNumber;
						end: z.ZodNumber;
						customerName: z.ZodOptional<z.ZodString>;
						customerEmail: z.ZodOptional<z.ZodString>;
						customerPhone: z.ZodOptional<z.ZodString>;
						paymentStatus: z.ZodOptional<
							z.ZodEnum<['NONE', 'PENDING', 'PAID']>
						>;
						priceCents: z.ZodOptional<z.ZodNumber>;
					},
					'strip',
					z.ZodTypeAny,
					{
						holdId: string;
						start: number;
						end: number;
						bookingId: string;
						priceCents?: number | undefined;
						paymentStatus?: 'NONE' | 'PENDING' | 'PAID' | undefined;
						customerName?: string | undefined;
						customerEmail?: string | undefined;
						customerPhone?: string | undefined;
					},
					{
						holdId: string;
						start: number;
						end: number;
						bookingId: string;
						priceCents?: number | undefined;
						paymentStatus?: 'NONE' | 'PENDING' | 'PAID' | undefined;
						customerName?: string | undefined;
						customerEmail?: string | undefined;
						customerPhone?: string | undefined;
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'BookingConfirmed';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
					start: number;
					end: number;
					bookingId: string;
					priceCents?: number | undefined;
					paymentStatus?: 'NONE' | 'PENDING' | 'PAID' | undefined;
					customerName?: string | undefined;
					customerEmail?: string | undefined;
					customerPhone?: string | undefined;
				};
			},
			{
				type: 'BookingConfirmed';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					holdId: string;
					start: number;
					end: number;
					bookingId: string;
					priceCents?: number | undefined;
					paymentStatus?: 'NONE' | 'PENDING' | 'PAID' | undefined;
					customerName?: string | undefined;
					customerEmail?: string | undefined;
					customerPhone?: string | undefined;
				};
			}
		>,
		z.ZodObject<
			{
				eventId: z.ZodString;
				tenantId: z.ZodString;
				resourceId: z.ZodString;
				version: z.ZodLiteral<1>;
				createdAt: z.ZodNumber;
			} & {
				type: z.ZodLiteral<'BookingCancelled'>;
				payload: z.ZodObject<
					{
						bookingId: z.ZodString;
					},
					'strip',
					z.ZodTypeAny,
					{
						bookingId: string;
					},
					{
						bookingId: string;
					}
				>;
			},
			'strip',
			z.ZodTypeAny,
			{
				type: 'BookingCancelled';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					bookingId: string;
				};
			},
			{
				type: 'BookingCancelled';
				tenantId: string;
				resourceId: string;
				createdAt: number;
				eventId: string;
				version: 1;
				payload: {
					bookingId: string;
				};
			}
		>,
	]
>;
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
export type ResourceCreatedEvent = LedgerEvent & {
	type: 'ResourceCreated';
};
export type HoldPlacedEvent = LedgerEvent & {
	type: 'HoldPlaced';
};
export type HoldExpiredEvent = LedgerEvent & {
	type: 'HoldExpired';
};
export type BookingConfirmedEvent = LedgerEvent & {
	type: 'BookingConfirmed';
};
export type BookingCancelledEvent = LedgerEvent & {
	type: 'BookingCancelled';
};
//# sourceMappingURL=events.d.ts.map
