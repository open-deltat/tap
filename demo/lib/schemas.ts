import { z } from "zod";
import type { Resource as DeltaTResource } from "@open-tap/client";

// Re-export SDK types used by pages/components
export type {
  Rule,
  Booking,
  Hold,
  AvailabilitySlot,
} from "@open-tap/client";

// App-level metadata not stored in deltat
export interface ResourceMeta {
  slotMinutes: number;
  bufferMinutes: number;
  price: number | null;
}

// The demo's Resource = deltat Resource + app metadata
export type Resource = DeltaTResource & ResourceMeta;

// ── Input schemas (form validation) ──────────────────────────

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
