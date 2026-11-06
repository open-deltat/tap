// The group-booking example's shape: five friends, five calendars. The seed builds them, and the
// hosted MCP's modelling guide describes them, from these same values.

export const SLOT_MINUTES = 30;

/** An evening commitment that eats part of a friend's free band: dinner at home, kids, a standing call. */
export interface Commitment {
  h: [number, number]; // hours within the evening that are spoken for, e.g. [18, 19]
  dows?: number[]; // only on these weekdays (0=Sun..6=Sat); omitted means every evening
}

export interface Friend {
  name: string;
  /** Free evening band, e.g. [18, 23]. */
  open: [number, number];
  /** Weekdays (0=Sun..6=Sat) the whole evening is gone. */
  busyDows: number[];
  /** Partial-evening commitments that trim the free window. */
  commitments: Commitment[];
  /** Extra full evenings blocked: the nth upcoming occurrence of a weekday. */
  awayOn: { dow: number; nth: number }[];
}

/**
 * Five friends, each busy a different weeknight, each with a standing evening commitment that trims
 * their free band. The weekday blocks leave only weekends open; the commitments make the shared
 * window 19:00-21:30 on Saturdays but only 19:30-21:30 on Sundays, so a 2.5 hr dinner fits Saturdays
 * and not Sundays. Two one-offs knock out a weekend night apiece.
 */
export const FRIENDS: Friend[] = [
  { name: "dinner-1", open: [18, 23], busyDows: [1], commitments: [{ h: [18, 19] }], awayOn: [{ dow: 0, nth: 3 }] }, // busy Mon; eats in until 7; away the 3rd Sunday
  { name: "dinner-2", open: [17, 22], busyDows: [2], commitments: [{ h: [21.5, 22] }], awayOn: [] }, // busy Tue; early night, gone by 9:30
  { name: "dinner-3", open: [18, 23], busyDows: [3], commitments: [], awayOn: [{ dow: 6, nth: 2 }] }, // busy Wed; away the 2nd Saturday
  { name: "dinner-4", open: [18, 23], busyDows: [4], commitments: [{ h: [18, 19.5], dows: [0] }], awayOn: [] }, // busy Thu; Sunday call until 7:30
  { name: "dinner-5", open: [18, 23], busyDows: [5], commitments: [{ h: [22, 23] }], awayOn: [] }, // busy Fri; turns in at 10
];
