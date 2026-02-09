import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedStadium } from "@/app/actions/seed-stadium";

export default function StadiumPage() {
  return <SeatBookingPage seedFn={seedStadium} />;
}
