import type { ExampleId } from "../examples/config";
import type { Outcome } from "./bookable-service";

// How a calendar's public booking page looks: its display. The one list of views, read by the MCP
// tool schema, the stored record, the public page's renderers and the modelling guide.
//
// A view is on the list only when the public page renders it and books correctly for every shape
// create_calendar can make. Adding one is an entry here plus its renderer on the public page (whose
// renderer map is typed over this list, so a view without a renderer does not compile), and taking
// it off NOT_YET.

export const DISPLAY_NAMES = ["appointments"] as const;
export type Display = (typeof DISPLAY_NAMES)[number];

export const DEFAULT_DISPLAY: Display = "appointments";

/** What a view needs to know about a calendar to say whether it fits. */
export interface CalendarShape {
  capacity: number;
  bufferMinutes: number;
  takesMeetingRequests: boolean;
}

interface DisplayDef {
  /** The example on delt.at that is this view. */
  example: ExampleId;
  /** When to pick it, in plain words. */
  pick: string;
  /** Null when the view fits the shape, else the plain reason it does not. */
  misfit: (shape: CalendarShape) => string | null;
}

export const DISPLAYS: Record<Display, DisplayDef> = {
  appointments: {
    example: "availability",
    pick: "One person, room or thing people book a time on: a month and the free times of the chosen day. It also takes meeting requests, and places at the same time.",
    misfit: () => null,
  },
};

/**
 * The views the examples on delt.at are, that a created calendar cannot have yet, and why. Each
 * example's page reads the curated demo data, not a calendar someone created.
 */
export const NOT_YET: readonly { display: string; examples: readonly ExampleId[]; why: string }[] = [
  { display: "seats", examples: ["airline", "theater", "cinema", "live"], why: "A seat map is a calendar per seat under sections, a shape create_calendar cannot build yet." },
  { display: "tables", examples: ["restaurant"], why: "Tables under rooms, a shape create_calendar cannot build yet." },
  { display: "stays", examples: ["hotel"], why: "A stay lasts nights; the longest booking create_calendar offers is two hours." },
  { display: "class", examples: ["gym"], why: "The shape exists (a calendar with places), but the booking page has no view that shows places left yet. A class calendar books correctly as appointments today." },
  { display: "group", examples: ["meet"], why: "Finding the time several calendars share is not on the booking page yet." },
];

export const isDisplay =(value: unknown): value is Display => DISPLAY_NAMES.some((d) => d === value);

/** The view, when it is on the list and can show this calendar; else the plain reason it cannot. */
export function checkDisplay(display: string, shape: CalendarShape): Outcome<Display> {
  if (!isDisplay(display)) return { ok: false, error: `A calendar shows as one of: ${DISPLAY_NAMES.join(", ")}.` };
  const misfit = DISPLAYS[display].misfit(shape);
  return misfit ? { ok: false, error: misfit } : { ok: true, value: display };
}
