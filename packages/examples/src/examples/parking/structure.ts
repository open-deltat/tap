import { daily } from "../../actions/schedule-window";

// The garage's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

export const NAME = "Downtown Garage";

/** One booking is one hour. */
export const SLOT_MINUTES = 60;

/**
 * Open 24/7, inherited by every zone. dur 1440 (a full day) so consecutive days abut and merge into
 * one continuous window; 1439 left a 1-minute gap at every midnight, so any window crossing midnight
 * (an evening park, or "All day" from the afternoon) found no covering slot, every zone wrongly read
 * "closed".
 */
export const ALWAYS_OPEN = daily([{ h: 0, m: 0, dur: 1440 }]);

/**
 * A zone is ONE capacity-N resource (N = spots in the zone). Booking one car is one booking on the
 * zone; the engine's capacity sweep blocks the (N+1)th overlapping booking. Floors are purely
 * structural parents, only zones carry capacity.
 */
export const FLOORS: { name: string; zones: { name: string; capacity: number; price: number }[] }[] = [
  {
    name: "Floor 1 · Street",
    zones: [
      { name: "Zone A", capacity: 48, price: 8 },
      { name: "Zone B", capacity: 36, price: 8 },
      { name: "Zone C", capacity: 30, price: 6 },
    ],
  },
  {
    name: "Floor 2 · Mezzanine",
    zones: [
      { name: "Zone D", capacity: 54, price: 6 },
      { name: "Zone E", capacity: 42, price: 5 },
    ],
  },
  {
    name: "Floor 3 · Tower",
    zones: [
      { name: "Zone F", capacity: 60, price: 5 },
      { name: "Zone G", capacity: 45, price: 4 },
      { name: "Zone H", capacity: 32, price: 4 },
    ],
  },
  {
    name: "Floor 4 · Rooftop",
    zones: [
      { name: "Zone J", capacity: 40, price: 4 },
      { name: "Zone K", capacity: 30, price: 4 },
    ],
  },
];

/** One zone is closed for maintenance tonight (18:00 to 23:00 today) via a blocking rule. */
export const MAINTENANCE_ZONE = "Zone E";
