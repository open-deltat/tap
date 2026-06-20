import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedCinema } from "./seed";

export default function CinemaExample() {
  return (
    <SeatBookingPage
      seedFn={seedCinema}
      primitive={{ label: "Collision + Hold · assigned seating", specId: "AVAIL-02" }}
    />
  );
}
