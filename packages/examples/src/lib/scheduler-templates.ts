import type { WeekHours } from "../examples/builder/schedule";
import { DEFAULT_WEEK } from "../examples/builder/schedule";

// The templates a signed-in user can turn into a real, owned schedule in one click. Each is a pure
// data structure (a weekly-hours shape + slot length), NOT a migration: picking one runs the same
// createBookable path the secret-link form uses, so the result renders in the /b/<id> viewer today.
// Icons are lucide NAMES, resolved in the client picker, so this module stays server-safe (the
// create action imports it).
//
// The scheduler family below instantiates end to end now. The seat-map and multi-resource examples
// (airline, hotel, restaurant, ...) have bespoke viewers and are surfaced in the dashboard as
// "explore the demo" until each grows an owned viewer.

export interface SchedulerTemplate {
  id: string;
  label: string;
  tagline: string;
  icon: string;
  slotMinutes: number;
  week: WeekHours;
  /** The default name pre-filled in the create field; the user can change it. */
  defaultName: string;
}

const WEEKDAYS_9_5: WeekHours = {
  1: [{ start: "09:00", end: "17:00" }],
  2: [{ start: "09:00", end: "17:00" }],
  3: [{ start: "09:00", end: "17:00" }],
  4: [{ start: "09:00", end: "17:00" }],
  5: [{ start: "09:00", end: "17:00" }],
};

const AFTERNOONS: WeekHours = {
  2: [{ start: "14:00", end: "17:00" }],
  4: [{ start: "14:00", end: "17:00" }],
};

const SIX_DAY_SHOP: WeekHours = {
  1: [{ start: "09:00", end: "18:00" }],
  2: [{ start: "09:00", end: "18:00" }],
  3: [{ start: "09:00", end: "18:00" }],
  4: [{ start: "09:00", end: "18:00" }],
  5: [{ start: "09:00", end: "18:00" }],
  6: [{ start: "10:00", end: "14:00" }],
};

/** Personal is first by intent: the simplest thing a person wants is one calendar for themselves. */
export const SCHEDULER_TEMPLATES: readonly SchedulerTemplate[] = [
  {
    id: "personal",
    label: "Personal schedule",
    tagline: "One calendar for you, weekday hours, 30-minute slots",
    icon: "CalendarDays",
    slotMinutes: 30,
    week: DEFAULT_WEEK,
    defaultName: "My schedule",
  },
  {
    id: "meetings",
    label: "Meetings",
    tagline: "Let anyone book a 30-minute meeting in your working hours",
    icon: "Users",
    slotMinutes: 30,
    week: WEEKDAYS_9_5,
    defaultName: "Book a meeting",
  },
  {
    id: "consults",
    label: "Consultations",
    tagline: "Hour-long sessions across the working week",
    icon: "Clock",
    slotMinutes: 60,
    week: WEEKDAYS_9_5,
    defaultName: "Consultations",
  },
  {
    id: "office-hours",
    label: "Office hours",
    tagline: "A couple of afternoons a week, 15-minute drop-ins",
    icon: "GraduationCap",
    slotMinutes: 15,
    week: AFTERNOONS,
    defaultName: "Office hours",
  },
  {
    id: "business",
    label: "Business hours",
    tagline: "Six days a week, hour-long appointments",
    icon: "Store",
    slotMinutes: 60,
    week: SIX_DAY_SHOP,
    defaultName: "Appointments",
  },
];

export function getSchedulerTemplate(id: string): SchedulerTemplate | undefined {
  return SCHEDULER_TEMPLATES.find((t) => t.id === id);
}
