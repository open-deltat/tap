import { BookingList } from "@/components/booking-list";

export default function BookingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Bookings</h1>
      <BookingList />
    </div>
  );
}
