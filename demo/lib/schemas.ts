import { z } from "zod";

export const ResourceSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  slotMinutes: z.number().default(60),
  bufferMinutes: z.number().default(0),
  price: z.number().nullable().default(null),
});

export type Resource = z.infer<typeof ResourceSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
  blocking: z.boolean(),
});

export type Rule = z.infer<typeof RuleSchema>;

export const BookingSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
  label: z.string().default(""),
});

export type Booking = z.infer<typeof BookingSchema>;

export const AvailabilitySlotSchema = z.object({
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
});

export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const CreateResourcesInput = z.object({
  names: z.array(z.string().min(1)).min(1, "At least one name is required"),
  parentId: z.string().nullable(),
});

export type CreateResourcesInput = z.infer<typeof CreateResourcesInput>;

export const AddRuleInput = z.object({
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
  blocking: z.boolean().default(false),
});

export type AddRuleInput = z.infer<typeof AddRuleInput>;

export const BookSlotInput = z.object({
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
  label: z.string().default(""),
});

export const RecurringRuleInput = z.object({
  resourceId: z.string(),
  daysOfWeek: z.array(z.number().min(0).max(6)),
  startTime: z.string(),
  endTime: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  blocking: z.boolean(),
});

export type BookSlotInput = z.infer<typeof BookSlotInput>;

export const HoldSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  start: z.number(),
  end: z.number(),
  expiresAt: z.number(),
});

export type Hold = z.infer<typeof HoldSchema>;
