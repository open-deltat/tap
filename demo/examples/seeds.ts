import { seedAirline } from "@/examples/airline/seed";
import { seedTheater } from "@/examples/theater/seed";
import { seedCinema } from "@/examples/cinema/seed";
import { seedStadium } from "@/examples/stadium/seed";
import { ensureHotel } from "@/examples/hotel/seed";
import { seedRestaurant } from "@/examples/restaurant/seed";
import { seedParking } from "@/examples/parking/seed";
import { seedAvailabilityScheduler } from "@/examples/availability/seed";
import { ensureMeetFriends } from "@/examples/meet/seed";
import { seedLive } from "@/examples/live/seed";
import { ensureBuilderCalendar } from "@/examples/builder/seed";
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
  availability: seedAvailabilityScheduler,
  meet: ensureMeetFriends,
  live: seedLive,
  builder: ensureBuilderCalendar,
};
