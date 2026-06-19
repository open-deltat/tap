import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedCinema } from "@/app/actions/seed-cinema";

export default function CinemaPage() {
  return (
    <SeatBookingPage
      seedFn={seedCinema}
      primitive={{ label: "Collision + Hold · assigned seating", specId: "AVAIL-02" }}
    />
  );
}
