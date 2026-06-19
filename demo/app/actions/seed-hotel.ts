"use server";

import { dt } from "@/lib/deltat";
import { findRootByName, baseMs } from "./seed-helpers";

const DAY = 86_400_000;
const NAME = "Grand Hotel";

// Room TYPES, not individual rooms: capacity = how many rooms of that type exist.
// Booking a stay consumes one unit; the capacity sweep prevents overbooking past N.
const TYPES = [
  { name: "Standard Room", capacity: 5 },
  { name: "Deluxe Room", capacity: 3 },
  { name: "Suite", capacity: 1 },
];

export type HotelRoomType = { id: string; name: string; capacity: number };

export async function ensureHotel(): Promise<HotelRoomType[]> {
  let hotelId = await findRootByName(NAME);

  if (!hotelId) {
    const hotel = await dt.resources.create({ name: NAME });
    hotelId = hotel.id;
    // One long "always open" rule on the hotel; room types inherit it from the parent.
    const start = baseMs();
    await dt.rules.create([{ resourceId: hotelId, start, end: start + 60 * DAY, blocking: false }]);

    const created: HotelRoomType[] = [];
    for (const t of TYPES) {
      const r = await dt.resources.create({ parentId: hotelId, name: t.name, capacity: t.capacity });
      created.push({ id: r.id, name: t.name, capacity: t.capacity });
    }
    // Make the Suite (capacity 1) sold out tomorrow night, so "sold out" is demonstrable.
    const suite = created.find((c) => c.name === "Suite");
    if (suite) {
      const t0 = baseMs() + DAY;
      await dt.bookings.create([{ resourceId: suite.id, start: t0, end: t0 + DAY, label: "Existing reservation" }]);
    }
    return created;
  }

  const children = await dt.resources.get({ parentId: hotelId });
  return children.map((c) => ({ id: c.id, name: c.name ?? "Room", capacity: c.capacity }));
}
