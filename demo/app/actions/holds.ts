"use server";

import { dt } from "@/lib/deltat";
import type { Hold } from "@open-tap/client";

export async function placeHold(input: {
  resourceId: string;
  start: number;
  end: number;
  durationMinutes: number;
}): Promise<Hold> {
  const expiresAt = Date.now() + input.durationMinutes * 60_000;
  return dt.placeHold({
    resourceId: input.resourceId,
    start: input.start,
    end: input.end,
    expiresAt,
  });
}

export async function releaseHold(id: string): Promise<void> {
  await dt.releaseHold(id);
}

export async function getHoldsForResource(
  resourceId: string
): Promise<Hold[]> {
  return dt.getHolds(resourceId);
}
