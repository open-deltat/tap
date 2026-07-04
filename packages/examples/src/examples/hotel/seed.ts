"use server";

import { dt } from "../../lib/deltat";
import { findRootByName, baseMs } from "../../actions/seed-helpers";

import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from "./policy";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NAME = "Grand Hotel";

// Room TYPES, not individual rooms: capacity = how many rooms of that type exist.
// Booking a stay consumes one unit; the capacity sweep prevents overbooking past N.
const TYPES = [
  { name: "Standard Room", capacity: 5 },
  { name: "Deluxe Room", capacity: 3 },
  { name: "Suite", capacity: 1 },
];

export type HotelRoomType = { id: string; name: string; capacity: number };

export async function ensureHotel(): Promise<{ rootId: string; rooms: HotelRoomType[] }> {
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
    // Intermittent multi-night stays so the "find N consecutive nights in the same room" finder
    // has real gaps to thread. Each [startOffset, nights]; enough overlap to fully book some
    // stretches (so a stable run must route around them) while leaving openings elsewhere.
    const base = baseMs();
    // A stay runs check-in 3 PM → check-out 11 AM (the hotel's policy), so a booking spans
    // [day 15:00, (day+nights) 11:00). occupancyByNight keys by date, so it still counts exactly
    // `nights` nights and the checkout morning frees the room.
    const bookStays = async (id: string, stays: [number, number][]) => {
      // Sequential single bookings: the capacity sweep accepts overlaps up to N per type.
      for (const [off, nights] of stays) {
        await dt.bookings.create([
          {
            resourceId: id,
            start: base + off * DAY + CHECK_IN_HOUR * HOUR,
            end: base + (off + nights) * DAY + CHECK_OUT_HOUR * HOUR,
            label: "Reservation",
          },
        ]);
      }
    };
    const byName = (n: string) => created.find((c) => c.name === n)!;
    // Standard (5 rooms): nights [6,10) and [20,24) fully booked; partials elsewhere.
    await bookStays(byName("Standard Room").id, [
      [6, 4], [6, 4], [6, 4], [6, 4], [6, 4],
      [2, 3], [2, 3], [3, 2],
      [12, 3], [12, 3], [13, 4], [16, 2],
      [20, 4], [20, 4], [20, 4], [20, 4], [20, 4],
    ]);
    // Deluxe (3 rooms): nights [3,6) and [14,18) fully booked.
    await bookStays(byName("Deluxe Room").id, [
      [3, 3], [3, 3], [3, 3],
      [8, 3], [9, 2],
      [14, 4], [14, 4], [14, 4],
      [22, 2],
    ]);
    // Suite (1 room): each stay fully blocks it.
    await bookStays(byName("Suite").id, [[1, 2], [7, 2], [12, 2], [20, 5]]);
    return { rootId: hotelId, rooms: created };
  }

  const children = await dt.resources.get({ parentId: hotelId });
  return {
    rootId: hotelId,
    rooms: children.map((c) => ({ id: c.id, name: c.name ?? "Room", capacity: c.capacity })),
  };
}
