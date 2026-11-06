import { daily } from "../../actions/schedule-window";
import type { DaySchedule } from "../../actions/schedule-window";

// The flights' shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

/** Turnaround after each flight, kept free on every seat. */
export const TURNAROUND_MINUTES = 45;

/** Rows 10 to 30. */
export const ECON_ROWS = Array.from({ length: 21 }, (_, i) => 10 + i);
const NARROW = ["A", "B", "E", "F"];
const WIDE = ["A", "B", "C", "D", "E", "F"];

export interface Cabin {
  name: string;
  rows: number[];
  seats: string[];
  price: number;
}

export interface Flight {
  name: string;
  /** Flight time; every seat is booked for the whole flight. */
  durationMinutes: number;
  /** Departures every day, inherited by every seat. */
  departures: DaySchedule;
  /** A wide-body layout: First (2-2), Business (2-2), Economy (3-3), about 150 seats. */
  cabins: Cabin[];
  /** Seats already taken when the demo opens: how many in which cabin, on the departure at that hour. */
  prebooked: { cabin: string; count: number; hour: number }[];
}

export const FLIGHTS: Flight[] = [
  {
    name: "AA-100 JFK → LAX",
    durationMinutes: 360,
    departures: daily([
      { h: 6, m: 0, dur: 360 },
      { h: 14, m: 30, dur: 360 },
    ]),
    cabins: [
      { name: "First Class", rows: [1, 2], seats: NARROW, price: 1200 },
      { name: "Business", rows: [3, 4, 5, 6], seats: NARROW, price: 650 },
      { name: "Economy", rows: ECON_ROWS, seats: WIDE, price: 220 },
    ],
    // The 06:00 departure opens partly full: a first-class window seat and several economy seats taken.
    prebooked: [
      { cabin: "First Class", count: 2, hour: 6 },
      { cabin: "Economy", count: 28, hour: 6 },
    ],
  },
  {
    name: "AA-205 LAX → JFK",
    durationMinutes: 300,
    departures: daily([
      { h: 8, m: 0, dur: 300 },
      { h: 16, m: 0, dur: 300 },
    ]),
    cabins: [
      { name: "First Class", rows: [1, 2], seats: NARROW, price: 1100 },
      { name: "Business", rows: [3, 4, 5, 6], seats: NARROW, price: 580 },
      { name: "Economy", rows: ECON_ROWS, seats: WIDE, price: 189 },
    ],
    // The 08:00 departure opens lightly booked.
    prebooked: [{ cabin: "Economy", count: 14, hour: 8 }],
  },
];
