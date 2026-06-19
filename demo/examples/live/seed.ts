"use server";

import { seedCinema } from "@/examples/cinema/seed";

/**
 * The realtime demo reuses the Cinema example rather than seeding its own venue: it takes one of
 * the cinema's screens (a venue with real seats + showtimes) and shows it twice — an interactive
 * booker on the left and a read-only live mirror on the right. Reusing the cinema keeps the data
 * in one place and matches exactly what a visitor sees at /demos/cinema. Returns the screen id.
 */
export async function seedLive(): Promise<string> {
  const screens = await seedCinema();
  return screens[0];
}
