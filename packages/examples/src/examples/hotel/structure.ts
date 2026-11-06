// The hotel's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values. Check-in and check-out hours live beside it in ./policy.

export const NAME = "Grand Hotel";

/**
 * Room TYPES, not individual rooms: capacity = how many rooms of that type exist. Booking a stay
 * consumes one unit; the capacity sweep prevents overbooking past N.
 */
export const ROOM_TYPES = [
  { name: "Standard Room", capacity: 5 },
  { name: "Deluxe Room", capacity: 3 },
  { name: "Suite", capacity: 1 },
] as const;
