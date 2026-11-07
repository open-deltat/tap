import { openBookingDetailsStore, type BookingDetailsStore } from "./booking-details";

// The one process-wide booking-details store, on the data volume beside the registry. On globalThis
// for the registry's reason (public-registry.ts): the custom server and the Next app are separate
// module graphs in one process, and two copies of this map would overwrite each other's file.
const shared = globalThis as typeof globalThis & { __deltatBookingDetails?: BookingDetailsStore };

export const bookingDetails: BookingDetailsStore = (shared.__deltatBookingDetails ??= openBookingDetailsStore(
  process.env.BOOKING_DETAILS_PATH?.trim() || "./data/booking-details.json"
));
