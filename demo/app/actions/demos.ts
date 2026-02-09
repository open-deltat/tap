"use server";

import * as store from "@/lib/store";

export async function getDemoVenueIds(demo: string): Promise<string[]> {
  return store.getDemoVenueIds(demo);
}
