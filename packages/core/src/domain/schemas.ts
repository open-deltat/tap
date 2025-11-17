import { z } from 'zod';
import { ULIDSchema } from './ids';

export const TenantSchema = z.object({
	id: ULIDSchema,
	name: z.string(),
	slug: z.string().min(3),
});

export const ResourceSchema = z.object({
	id: ULIDSchema,
	tenantId: ULIDSchema,
	name: z.string(),
	slug: z.string().min(3),
	timezone: z.string(),
	slotMinutes: z.enum(['5', '10', '15', '30', '60']),
	horizonDays: z.number().int().default(90),
	requiresPayment: z.boolean().default(false),
	metadata: z.record(z.unknown()).optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
