import { z } from 'zod';
export declare const TenantSchema: z.ZodObject<
	{
		id: z.ZodString;
		name: z.ZodString;
		slug: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		id: string;
		name: string;
		slug: string;
	},
	{
		id: string;
		name: string;
		slug: string;
	}
>;
export declare const ResourceSchema: z.ZodObject<
	{
		id: z.ZodString;
		tenantId: z.ZodString;
		name: z.ZodString;
		slug: z.ZodString;
		timezone: z.ZodString;
		slotMinutes: z.ZodEnum<['5', '10', '15', '30', '60']>;
		horizonDays: z.ZodDefault<z.ZodNumber>;
		requiresPayment: z.ZodDefault<z.ZodBoolean>;
		metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
	},
	'strip',
	z.ZodTypeAny,
	{
		id: string;
		name: string;
		slug: string;
		tenantId: string;
		timezone: string;
		slotMinutes: '5' | '10' | '15' | '30' | '60';
		horizonDays: number;
		requiresPayment: boolean;
		metadata?: Record<string, unknown> | undefined;
	},
	{
		id: string;
		name: string;
		slug: string;
		tenantId: string;
		timezone: string;
		slotMinutes: '5' | '10' | '15' | '30' | '60';
		horizonDays?: number | undefined;
		requiresPayment?: boolean | undefined;
		metadata?: Record<string, unknown> | undefined;
	}
>;
export declare const OfferSchema: z.ZodObject<
	{
		id: z.ZodString;
		tenantId: z.ZodString;
		resourceId: z.ZodString;
		daysOfWeek: z.ZodArray<z.ZodNumber, 'many'>;
		startTime: z.ZodString;
		endTime: z.ZodString;
		priceCents: z.ZodOptional<z.ZodNumber>;
		currency: z.ZodDefault<z.ZodString>;
	},
	'strip',
	z.ZodTypeAny,
	{
		id: string;
		tenantId: string;
		resourceId: string;
		daysOfWeek: number[];
		startTime: string;
		endTime: string;
		currency: string;
		priceCents?: number | undefined;
	},
	{
		id: string;
		tenantId: string;
		resourceId: string;
		daysOfWeek: number[];
		startTime: string;
		endTime: string;
		priceCents?: number | undefined;
		currency?: string | undefined;
	}
>;
export declare const BookingSchema: z.ZodObject<
	{
		id: z.ZodString;
		tenantId: z.ZodString;
		resourceId: z.ZodString;
		holdId: z.ZodOptional<z.ZodString>;
		start: z.ZodNumber;
		end: z.ZodNumber;
		status: z.ZodDefault<z.ZodEnum<['CONFIRMED', 'CANCELLED']>>;
		paymentStatus: z.ZodDefault<z.ZodEnum<['NONE', 'PENDING', 'PAID']>>;
		paymentProvider: z.ZodOptional<z.ZodString>;
		paymentRef: z.ZodOptional<z.ZodString>;
		customerName: z.ZodOptional<z.ZodString>;
		customerEmail: z.ZodOptional<z.ZodString>;
		customerPhone: z.ZodOptional<z.ZodString>;
		externalRef: z.ZodOptional<z.ZodString>;
		createdAt: z.ZodDefault<z.ZodNumber>;
	},
	'strip',
	z.ZodTypeAny,
	{
		status: 'CONFIRMED' | 'CANCELLED';
		id: string;
		tenantId: string;
		resourceId: string;
		start: number;
		end: number;
		paymentStatus: 'NONE' | 'PENDING' | 'PAID';
		createdAt: number;
		holdId?: string | undefined;
		paymentProvider?: string | undefined;
		paymentRef?: string | undefined;
		customerName?: string | undefined;
		customerEmail?: string | undefined;
		customerPhone?: string | undefined;
		externalRef?: string | undefined;
	},
	{
		id: string;
		tenantId: string;
		resourceId: string;
		start: number;
		end: number;
		status?: 'CONFIRMED' | 'CANCELLED' | undefined;
		holdId?: string | undefined;
		paymentStatus?: 'NONE' | 'PENDING' | 'PAID' | undefined;
		paymentProvider?: string | undefined;
		paymentRef?: string | undefined;
		customerName?: string | undefined;
		customerEmail?: string | undefined;
		customerPhone?: string | undefined;
		externalRef?: string | undefined;
		createdAt?: number | undefined;
	}
>;
export declare const HoldSchema: z.ZodObject<
	{
		id: z.ZodString;
		tenantId: z.ZodString;
		resourceId: z.ZodString;
		day: z.ZodString;
		startMinute: z.ZodNumber;
		endMinute: z.ZodNumber;
		expiresAt: z.ZodNumber;
		clientRef: z.ZodOptional<z.ZodString>;
		createdAt: z.ZodDefault<z.ZodNumber>;
	},
	'strip',
	z.ZodTypeAny,
	{
		id: string;
		tenantId: string;
		resourceId: string;
		createdAt: number;
		day: string;
		startMinute: number;
		endMinute: number;
		expiresAt: number;
		clientRef?: string | undefined;
	},
	{
		id: string;
		tenantId: string;
		resourceId: string;
		day: string;
		startMinute: number;
		endMinute: number;
		expiresAt: number;
		createdAt?: number | undefined;
		clientRef?: string | undefined;
	}
>;
export type Tenant = z.infer<typeof TenantSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Hold = z.infer<typeof HoldSchema>;
//# sourceMappingURL=schemas.d.ts.map
