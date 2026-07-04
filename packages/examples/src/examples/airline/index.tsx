"use client";

import { SeatBookingPage } from "../../components/seat-booking-page";
import { seedAirline } from "./seed";

export default function AirlineExample() {
  return (
    <SeatBookingPage
      seedFn={seedAirline}
      primitive={{ label: "Hold a seat, then book it", specId: "AVAIL-02" }}
    />
  );
}
