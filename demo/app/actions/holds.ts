"use server";

import { dt } from "@/lib/deltat";
import type { Hold } from "@open-tap/client";

export async function getHoldsForResource(
  resourceId: string
): Promise<Hold[]> {
  return dt.holds.get(resourceId);
}

export async function getMultiResourceHolds(
  resourceIds: string[]
): Promise<Record<string, Hold[]>> {
  const results = await Promise.all(
    resourceIds.map(async (id) => [id, await dt.holds.get(id)] as const)
  );
  return Object.fromEntries(results);
}
