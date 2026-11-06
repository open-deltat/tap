import { daily } from "../../actions/schedule-window";

// The stadium's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

export const NAME = "Olympia Stadium";
export const EVENT_DUR = 210; // minutes

/**
 * Concentric oval tiers. Each "section" is ONE resource:
 *   - pool tiers  → capacity-N  (general admission: book K of N, fungible)
 *   - premium     → capacity-1  (a box you reserve outright, assigned)
 * Capacities sum to ~80,000 across ~92 sections, a stadium as a handful of capacity numbers, not
 * 80,000 individual seat rows.
 */
export const TIERS: {
  name: string;
  sections: number;
  capacity: number;
  price: number;
  assigned: boolean;
}[] = [
  { name: "Lower Bowl", sections: 30, capacity: 1400, price: 150, assigned: false },
  { name: "Club Level", sections: 20, capacity: 600, price: 350, assigned: false },
  { name: "Upper Deck", sections: 34, capacity: 750, price: 65, assigned: false },
  { name: "Premium Boxes", sections: 8, capacity: 1, price: 1200, assigned: true },
];

/** Two events a day, inherited by every section. */
export const EVENT_DAYS = daily([
  { h: 13, m: 0, dur: EVENT_DUR },
  { h: 19, m: 0, dur: EVENT_DUR },
]);
