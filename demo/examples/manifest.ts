import {
  Plane,
  Theater,
  Film,
  LandPlot,
  Hotel,
  UtensilsCrossed,
  Car,
  Clock,
  Users,
  Radio,
  CalendarCog,
  type LucideIcon,
} from "lucide-react";
import { ALL_EXAMPLE_IDS, isExampleEnabled, type ExampleId } from "./config";

// Client-safe catalog (label + icon + tag + grouping) for each example. Nav, the landing gallery,
// and any example switcher render from `enabledExamples()` so a single-purpose deployment shows only
// what DEMO_EXAMPLES allows. Route + seed live alongside each example (see examples/<id>/).
//   featured: the headline demos (shown large on the landing gallery)
//   seats:    assigned-seat / ticket maps
//   spaces:   capacity + scheduling (rooms, tables, hours)
export type ExampleGroup = "featured" | "seats" | "spaces";

export interface ExampleMeta {
  id: ExampleId;
  label: string;
  href: string;
  icon: LucideIcon;
  specId?: string;
  group: ExampleGroup;
  tagline: string;
}

const META: Record<ExampleId, Omit<ExampleMeta, "id" | "href">> = {
  availability: { label: "Appointments", icon: Clock, specId: "AVAIL-01", group: "featured", tagline: "Open hours, minus what is booked" },
  meet: { label: "Group bookings", icon: Users, specId: "AVAIL-08", group: "featured", tagline: "A time the whole group is free" },
  live: { label: "Realtime seats", icon: Radio, specId: "PROTO-01", group: "featured", tagline: "Holds that update live for everyone" },
  airline: { label: "Flight seats", icon: Plane, specId: "AVAIL-02", group: "seats", tagline: "Pick a seat on a flight" },
  cinema: { label: "Movie seats", icon: Film, specId: "AVAIL-02", group: "seats", tagline: "Hold seats for a showtime" },
  theater: { label: "Theater seats", icon: Theater, specId: "AVAIL-02", group: "seats", tagline: "Pick your seats for a show" },
  stadium: { label: "Stadium tickets", icon: LandPlot, specId: "AVAIL-06", group: "seats", tagline: "Find seats in a huge crowd" },
  hotel: { label: "Hotel rooms", icon: Hotel, specId: "AVAIL-04", group: "spaces", tagline: "Book a room for a few nights" },
  restaurant: { label: "Restaurant tables", icon: UtensilsCrossed, specId: "AVAIL-03", group: "spaces", tagline: "Tables plus a walk-up bar" },
  parking: { label: "Parking spots", icon: Car, specId: "AVAIL-05", group: "spaces", tagline: "Grab a spot in a zone" },
  builder: { label: "Weekly hours", icon: CalendarCog, specId: "EDGE-03", group: "spaces", tagline: "Set your weekly hours once" },
};

export function enabledExamples(): ExampleMeta[] {
  return ALL_EXAMPLE_IDS.filter(isExampleEnabled).map((id) => ({
    id,
    href: `/demos/${id}`,
    ...META[id],
  }));
}
