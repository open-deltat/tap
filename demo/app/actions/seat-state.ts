"use server";

import type { AvailabilitySlot, Booking, Hold } from "@open-tap/client";
import { getMultiResourceAvailability } from "./availability";
import { getMultiResourceBookings } from "./bookings";
import { getMultiResourceHolds } from "./holds";

export interface SeatStateMaps {
  availability: Record<string, AvailabilitySlot[]>;
  bookings: Record<string, Booking[]>;
  holds: Record<string, Hold[]>;
}

/**
 * Everything a seat map needs in ONE round-trip. The three reads run concurrently server-side, so
 * the client pays a single browser→server hop instead of three. (Next serializes separate server
 * actions, so the previous Promise.all of three actions cost three sequential round-trips, that
 * was the real latency, not the queries, which the engine answers in single-digit ms.)
 */
export async function getSeatState(
  seatIds: string[],
  start: number,
  end: number
): Promise<SeatStateMaps> {
  const [availability, bookings, holds] = await Promise.all([
    getMultiResourceAvailability(seatIds, start, end),
    getMultiResourceBookings(seatIds),
    getMultiResourceHolds(seatIds),
  ]);
  return { availability, bookings, holds };
}
