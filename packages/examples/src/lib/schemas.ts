import { z } from "zod";
import type { Resource as DeltaTResource } from "@open-deltat/client";

export type {
  Rule,
  Booking,
  Hold,
  AvailabilitySlot,
} from "@open-deltat/client";

/** Oval-layout descriptor for stadium sections (a UI concern deltat doesn't track). */
export interface SectionLayout {
  tier: string; // e.g. "Lower Bowl"
  ring: number; // 0 = innermost ring
  idx: number; // position within the ring
  ringCount: number; // sections in this ring
  assigned: boolean; // true = capacity-1 premium box, false = capacity-N pool
}

export interface ResourceMeta {
  slotMinutes: number;
  price: number | null;
  maxGuests?: number;
  section?: SectionLayout;
}

// The demo's Resource = deltat Resource + app metadata + derived bufferMinutes
export type Resource = DeltaTResource & ResourceMeta & { bufferMinutes: number };

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
