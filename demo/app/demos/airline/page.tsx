"use client";

import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedAirline } from "@/app/actions/seed-airline";

export default function AirlinePage() {
  return (
    <SeatBookingPage
      seedFn={seedAirline}
      primitive={{ label: "Collision + Hold · seat timeline", specId: "AVAIL-02" }}
    />
  );
}
