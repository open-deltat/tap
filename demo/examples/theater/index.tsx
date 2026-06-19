import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedTheater } from "./seed";

export default function TheaterExample() {
  return (
    <SeatBookingPage
      seedFn={seedTheater}
      primitive={{ label: "Collision + Hold · assigned seating", specId: "AVAIL-02" }}
    />
  );
}
