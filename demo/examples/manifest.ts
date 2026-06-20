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
  Layers,
  CalendarCog,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import { ALL_EXAMPLE_IDS, isExampleEnabled, type ExampleId } from "./config";

// Client-safe catalog (label + icon + spec tag) for each example. Nav, the home page, and any
// example switcher render from `enabledExamples()` so a single-purpose deployment shows only
// what DEMO_EXAMPLES allows. Route + seed live alongside each example (see examples/<id>/).
export interface ExampleMeta {
  id: ExampleId;
  label: string;
  href: string;
  icon: LucideIcon;
  specId?: string;
}

const META: Record<ExampleId, Omit<ExampleMeta, "id" | "href">> = {
  airline: { label: "Airline", icon: Plane, specId: "AVAIL-02" },
  theater: { label: "Theater", icon: Theater, specId: "AVAIL-02" },
  cinema: { label: "Cinema", icon: Film, specId: "AVAIL-02" },
  stadium: { label: "Stadium", icon: LandPlot, specId: "AVAIL-06" },
  hotel: { label: "Hotel", icon: Hotel, specId: "AVAIL-04" },
  restaurant: { label: "Restaurant", icon: UtensilsCrossed, specId: "AVAIL-03" },
  parking: { label: "Parking", icon: Car, specId: "AVAIL-05" },
  availability: { label: "Availability", icon: Clock, specId: "AVAIL-01" },
  meet: { label: "Meet", icon: Users, specId: "AVAIL-08" },
  live: { label: "Live", icon: Radio, specId: "PROTO-01" },
  rules: { label: "Rules", icon: Layers, specId: "AVAIL-08" },
  builder: { label: "Builder", icon: CalendarCog, specId: "EDGE-03" },
  explainer: { label: "How it works", icon: Sigma, specId: "AVAIL-01" },
};

export function enabledExamples(): ExampleMeta[] {
  return ALL_EXAMPLE_IDS.filter(isExampleEnabled).map((id) => ({
    id,
    href: `/demos/${id}`,
    ...META[id],
  }));
}
