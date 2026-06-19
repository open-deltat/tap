import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedTheater } from "@/app/actions/seed-theater";

export default function TheaterPage() {
  return (
    <SeatBookingPage
      seedFn={seedTheater}
      primitive={{ label: "Collision + Hold · assigned seating", specId: "AVAIL-02" }}
    />
  );
}
