import type { DaySchedule } from "../../actions/schedule-window";

// The theater's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

export const NAME = "Hamilton";
export const SHOW_MINUTES = 165;
export const BUFFER_MINUTES = 20;

/** The run's weekly performance grid: matinees Wed/Sat/Sun, dark on Mondays. */
export const SHOWTIMES: DaySchedule = {
  0: [{ h: 15, m: 0, dur: SHOW_MINUTES }],
  2: [{ h: 19, m: 0, dur: SHOW_MINUTES }],
  3: [{ h: 14, m: 0, dur: SHOW_MINUTES }, { h: 19, m: 0, dur: SHOW_MINUTES }],
  4: [{ h: 19, m: 0, dur: SHOW_MINUTES }],
  5: [{ h: 20, m: 0, dur: SHOW_MINUTES }],
  6: [{ h: 14, m: 0, dur: SHOW_MINUTES }, { h: 20, m: 0, dur: SHOW_MINUTES }],
};

/** Each section is a calendar with one seat calendar per row and number. */
export const SECTIONS: { name: string; rows: string[]; seats: number[]; price: number }[] = [
  { name: "Orchestra", rows: ["A", "B", "C", "D"], seats: Array.from({ length: 10 }, (_, i) => i + 1), price: 349 },
  { name: "Mezzanine", rows: ["E", "F"], seats: Array.from({ length: 8 }, (_, i) => i + 1), price: 199 },
  { name: "Balcony", rows: ["G", "H"], seats: Array.from({ length: 6 }, (_, i) => i + 1), price: 79 },
];
