import { seedAirline } from "./airline/seed";
import { seedTheater } from "./theater/seed";
import { seedCinema } from "./cinema/seed";
import { seedStadium } from "./stadium/seed";
import { ensureHotel } from "./hotel/seed";
import { seedRestaurant } from "./restaurant/seed";
import { seedParking } from "./parking/seed";
import { seedAvailabilityScheduler } from "./availability/seed";
import { ensureMeetFriends } from "./meet/seed";
import { seedLive } from "./live/seed";
import { ensureGym } from "./gym/seed";
import { ensureBuilderCalendar } from "./builder/seed";
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
  gym: ensureGym,
  builder: ensureBuilderCalendar,
};
