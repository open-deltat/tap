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
  const results = await Promise.all(
    resourceIds.map(async (id) => [id, await dt.availability.get({ resourceId: id, start, end })] as const)
  );
  return Object.fromEntries(results);
}

export async function getCombinedAvailability(
  resourceIds: string[],
  start: number,
  end: number,
  minAvailable?: number
): Promise<{ start: number; end: number }[]> {
  return dt.availability.getCombined({ resourceIds, start, end, minAvailable });
}
