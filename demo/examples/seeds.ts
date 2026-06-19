import { seedAirline } from "@/examples/airline/seed";
import { seedTheater } from "@/examples/theater/seed";
import { seedCinema } from "@/examples/cinema/seed";
import { seedStadium } from "@/examples/stadium/seed";
import { ensureHotel } from "@/examples/hotel/seed";
import { seedRestaurant } from "@/examples/restaurant/seed";
import { seedParking } from "@/examples/parking/seed";
import { seedAvailabilityScheduler } from "@/examples/availability/seed";
import { ensureMeetCalendars } from "@/examples/meet/seed";
import { seedLive } from "@/examples/live/seed";
import { ensureRulesExample } from "@/examples/rules/seed";
import { ensureExplainerCalendars } from "@/examples/explainer/seed";
// Calendar's seed is the SHARED personal calendar (also the mirror target for the provider),
// so it stays in app/actions rather than moving into examples/calendar/.
import { ensurePersonalCalendar } from "@/app/actions/seed-personal-calendar";
import type { ExampleId } from "./config";

// Maps each example to its (idempotent) seed action. Seeding a deployment = run the seeds for
// the enabled examples only; each demo also self-seeds on mount, so this is for pre-population.
export const SEEDS: Record<ExampleId, () => Promise<unknown>> = {
  airline: seedAirline,
  theater: seedTheater,
  cinema: seedCinema,
  stadium: seedStadium,
  hotel: ensureHotel,
  restaurant: seedRestaurant,
  parking: seedParking,
  calendar: ensurePersonalCalendar,
  availability: seedAvailabilityScheduler,
  meet: ensureMeetCalendars,
  live: seedLive,
  rules: ensureRulesExample,
  explainer: ensureExplainerCalendars,
};
