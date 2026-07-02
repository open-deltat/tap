"use server";

import { dt } from "@/lib/deltat";
import type { AvailabilitySlot } from "@open-tap/client";

export async function getAvailability(
  resourceId: string,
  start: number,
  end: number
): Promise<AvailabilitySlot[]> {
  return dt.availability.get({ resourceId, start, end });
}

export async function getMultiResourceAvailability(
  resourceIds: string[],
  start: number,
  end: number
): Promise<Record<string, AvailabilitySlot[]>> {
  // One round-trip (IN-clause) instead of one query per resource, this is the seat-map hot path,
  // re-run on every NOTIFY, so the fan-out mattered.
  return dt.availability.getMany({ resourceIds, start, end });
}

export async function getCombinedAvailability(
  resourceIds: string[],
  start: number,
  end: number,
  minAvailable?: number
): Promise<{ start: number; end: number }[]> {
  return dt.availability.getCombined({ resourceIds, start, end, minAvailable });
}
