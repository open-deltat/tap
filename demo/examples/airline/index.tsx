"use client";

import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedAirline } from "./seed";

export default function AirlineExample() {
  return (
    <SeatBookingPage
      seedFn={seedAirline}
      primitive={{ label: "Collision + Hold · seat timeline", specId: "AVAIL-02" }}
    />
  );
}
