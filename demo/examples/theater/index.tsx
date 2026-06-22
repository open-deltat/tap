import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedTheater } from "./seed";

export default function TheaterExample() {
  return (
    <SeatBookingPage
      seedFn={seedTheater}
      primitive={{ label: "Hold a seat, then book it", specId: "AVAIL-02" }}
    />
  );
}
