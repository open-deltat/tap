import { SeatBookingPage } from "@open-deltat/examples/components/seat-booking-page";
import { seedCinema } from "./seed";

export default function CinemaExample() {
  return (
    <SeatBookingPage
      seedFn={seedCinema}
      primitive={{ label: "Hold a seat, then book it", specId: "AVAIL-02" }}
    />
  );
}
