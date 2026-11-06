import { daily } from "../../actions/schedule-window";

// The cinema's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

export const NAME = "Cineplex Odeon";

/**
 * A multiplex: one cinema, four screens. Each screen shows a different film on its OWN showtimes
 * (a per-resource schedule), with its own seating; the deltat tree models this as
 * Cinema → Screen → Seats, where seats inherit their screen's showtimes.
 */
export const SCREENS = [
  { film: "Dune: Part Two", firstShow: 12, price: 17 },
  { film: "Inside Out 2", firstShow: 13, price: 15 },
  { film: "The Batman", firstShow: 14, price: 15 },
  { film: "Oppenheimer", firstShow: 18, price: 16 },
];

export const RUNTIME = 150; // minutes
export const BUFFER_MINUTES = 30;

/** Every screen's seating: rows A to E, seats 1 to 8. */
export const SEAT_ROWS = ["A", "B", "C", "D", "E"];
export const SEAT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The cinema is open 08:00 to 01:00; each screen runs two staggered showtimes inside that. */
export const HOUSE_HOURS = daily([{ h: 8, m: 0, dur: 1020 }]);
export const showtimes = (firstShow: number) =>
  daily([
    { h: firstShow, m: 0, dur: RUNTIME },
    { h: firstShow + 4, m: 0, dur: RUNTIME },
  ]);
