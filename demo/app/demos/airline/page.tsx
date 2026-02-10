"use client";

import { SeatBookingPage } from "@/components/seat-booking-page";
import { seedAirline } from "@/app/actions/seed-airline";

export default function AirlinePage() {
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 border-r">
        <div className="flex items-center justify-center gap-1.5 border-b px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium dark:bg-blue-950 dark:text-blue-300">
          Client A
        </div>
        <div className="h-[calc(100%-28px)]">
          <SeatBookingPage seedFn={seedAirline} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-center gap-1.5 border-b px-3 py-1 bg-violet-50 text-violet-700 text-xs font-medium dark:bg-violet-950 dark:text-violet-300">
          Client B
        </div>
        <div className="h-[calc(100%-28px)]">
          <SeatBookingPage seedFn={seedAirline} />
        </div>
      </div>
    </div>
  );
}
