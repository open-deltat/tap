"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";

export async function getTablesForPartySize(
  restaurantId: string,
  partySize: number
): Promise<{ id: string; name: string; section: string; maxGuests: number }[]> {
  const sections = await dt.resources.get({ parentId: restaurantId });
  const result: { id: string; name: string; section: string; maxGuests: number }[] = [];

  for (const section of sections) {
    const tables = await dt.resources.get({ parentId: section.id });
    for (const table of tables) {
      const meta = store.get(table.id);
      const maxGuests = meta?.maxGuests ?? 99;
      if (maxGuests >= partySize) {
        result.push({
          id: table.id,
          name: table.name ?? table.id,
          section: section.name ?? "Unknown",
          maxGuests,
        });
      }
    }
  }

  return result.sort((a, b) => a.maxGuests - b.maxGuests);
}
