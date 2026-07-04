"use server";

import { dt } from "@open-deltat/examples/lib/deltat";
import * as store from "@open-deltat/examples/lib/store";

const BAR_SECTION = "Bar";

export async function getTablesForPartySize(
  restaurantId: string,
  partySize: number
): Promise<{ id: string; name: string; section: string; maxGuests: number }[]> {
  const sections = await dt.resources.get({ parentId: restaurantId });
  const result: { id: string; name: string; section: string; maxGuests: number }[] = [];

  for (const section of sections) {
    if (section.name === BAR_SECTION) continue; // the Bar is a capacity-N pool, not a table
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

export async function getBar(
  restaurantId: string
): Promise<{ id: string; name: string; capacity: number; price: number | null } | null> {
  const sections = await dt.resources.get({ parentId: restaurantId });
  const barSection = sections.find((s) => s.name === BAR_SECTION);
  if (!barSection) return null;
  const [bar] = await dt.resources.get({ parentId: barSection.id });
  if (!bar) return null;
  return {
    id: bar.id,
    name: bar.name ?? "Bar",
    capacity: bar.capacity,
    price: store.get(bar.id)?.price ?? null,
  };
}
