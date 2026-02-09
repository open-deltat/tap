"use server";

import { ulid } from "ulid";
import * as db from "@/lib/db";
import type { Hold } from "@/lib/schemas";

export async function placeHold(input: {
  resourceId: string;
  start: number;
  end: number;
  durationMinutes: number;
}): Promise<Hold> {
  const id = ulid();
  const expiresAt = Date.now() + input.durationMinutes * 60_000;
  await db.placeHold(id, input.resourceId, input.start, input.end, expiresAt);
  return {
    id,
    resourceId: input.resourceId,
    start: input.start,
    end: input.end,
    expiresAt,
  };
}

export async function releaseHold(id: string): Promise<void> {
  await db.releaseHold(id);
}

export async function getHoldsForResource(
  resourceId: string
): Promise<Hold[]> {
  return db.getHoldsForResource(resourceId);
}
