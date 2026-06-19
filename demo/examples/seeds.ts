import { seedAirline } from "@/app/actions/seed-airline";
import { seedTheater } from "@/app/actions/seed-theater";
import { seedCinema } from "@/app/actions/seed-cinema";
import { seedStadium } from "@/app/actions/seed-stadium";
import { ensureHotel } from "@/app/actions/seed-hotel";
import { seedRestaurant } from "@/app/actions/seed-restaurant";
import { seedParking } from "@/app/actions/seed-parking";
import { ensurePersonalCalendar } from "@/app/actions/seed-personal-calendar";
import { seedAvailabilityScheduler } from "@/app/actions/seed-availability-scheduler";
import { ensureMeetCalendars } from "@/app/actions/seed-meet";
import { seedLive } from "@/app/actions/seed-live";
import { ensureExplainerCalendars } from "@/app/actions/seed-explainer";
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
  explainer: ensureExplainerCalendars,
};
