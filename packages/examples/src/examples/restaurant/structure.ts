import { daily } from "../../actions/schedule-window";

// The restaurant's shape: the seed builds it, and the hosted MCP's modelling guide describes it,
// from these same values (a plain module: a "use server" seed may only export async functions).

export const NAME = "Bella Cucina";

/** Open 11:00 to 22:00 every day. */
export const SERVICE_HOURS = daily([{ h: 11, m: 0, dur: 660 }]);

/** One seating, and the time to reset a table after it. */
export const SEATING_MINUTES = 90;
export const TURNOVER_MINUTES = 30;

/** The dining table closed for tonight's service, to demo "block a table tonight". */
export const BLOCKED_TABLE = "D1";

/** The walk-up bar: one calendar with ten places, not ten tables. */
export const BAR = { section: "Bar", name: "Bar", capacity: 10, price: 0 } as const;

export interface TableDef {
  name: string;
  maxGuests: number;
}

export const SECTIONS: { name: string; tables: TableDef[] }[] = [
  {
    name: "Patio",
    tables: [
      { name: "P1", maxGuests: 2 },
      { name: "P2", maxGuests: 2 },
      { name: "P3", maxGuests: 4 },
      { name: "P4", maxGuests: 4 },
    ],
  },
  {
    name: "Dining Room",
    tables: [
      { name: "D1", maxGuests: 2 },
      { name: "D2", maxGuests: 4 },
      { name: "D3", maxGuests: 4 },
      { name: "D4", maxGuests: 6 },
      { name: "D5", maxGuests: 6 },
      { name: "D6", maxGuests: 8 },
    ],
  },
  {
    name: "Private Room",
    tables: [
      { name: "VIP1", maxGuests: 8 },
      { name: "VIP2", maxGuests: 12 },
    ],
  },
];
