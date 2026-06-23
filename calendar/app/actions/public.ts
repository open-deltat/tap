"use server";

import { z } from "zod/v4";
import { dt } from "@/lib/deltat";
import { config } from "@/lib/config";
import { dayBounds } from "@/lib/time";
import { findCalendarResource } from "@/lib/calendar-resource";

const BookingInput = z.object({
  start: z.number(),
  end: z.number(),
  name: z.string().min(1, "Name is required").max(100),
  email: z.email("Invalid email address"),
});

export async function getPublicSlots(slug: string, dateStr: string) {
  const resourceId = await findCalendarResource(slug);
  if (!resourceId) return [];

  const d = new Date(dateStr + "T00:00:00");
  const { dayStart, dayEnd } = dayBounds(d);
  const slotMs = config.slotMinutes * 60_000;
  const now = Date.now();

  const raw = await dt.availability.get({ resourceId, start: dayStart, end: dayEnd });

  const slots: { start: number; end: number }[] = [];
  for (const slot of raw) {
    let cursor = slot.start;
    while (cursor + slotMs <= slot.end) {
      if (cursor >= now) {
        slots.push({ start: cursor, end: cursor + slotMs });
      }
      cursor += slotMs;
    }
  }
  return slots;
}

export async function createPublicBooking(input: {
  slug: string;
  start: number;
  end: number;
  name: string;
  email: string;
}) {
  const parsed = BookingInput.parse(input);

  const resourceId = await findCalendarResource(input.slug);
  if (!resourceId) throw new Error("Calendar not found");

  const label = `${parsed.name} <${parsed.email}>`;
  await dt.bookings.create([
    { resourceId, start: parsed.start, end: parsed.end, label },
  ]);
}

export async function getPublicCalendarInfo(slug: string) {
  const resourceId = await findCalendarResource(slug);
  if (!resourceId) return null;
  return { displayName: config.displayName, slotMinutes: config.slotMinutes };
}
