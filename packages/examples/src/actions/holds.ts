"use server";

import { dt } from "../lib/deltat";
import type { Hold } from "@open-deltat/client";

export async function getHoldsForResource(
  resourceId: string
): Promise<Hold[]> {
  return dt.holds.get(resourceId);
}

export async function getMultiResourceHolds(
  resourceIds: string[]
): Promise<Record<string, Hold[]>> {
  return dt.holds.getMany(resourceIds);
}
