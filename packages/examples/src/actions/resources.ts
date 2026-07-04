"use server";

import { dt } from "../lib/deltat";
import * as store from "../lib/store";
import { CreateResourcesInput, type Resource, type ResourceMeta } from "../lib/schemas";
import type { Resource as DeltaTResource } from "@open-deltat/client";

function toResource(r: DeltaTResource, meta?: ResourceMeta): Resource {
  return {
    ...r,
    slotMinutes: meta?.slotMinutes ?? 60,
    bufferMinutes: (r.bufferAfter ?? 0) / 60_000,
    price: meta?.price ?? null,
    maxGuests: meta?.maxGuests,
    section: meta?.section,
  };
}

export async function createResources(input: {
  names: string[];
  parentId: string | null;
}): Promise<Resource[]> {
  const parsed = CreateResourcesInput.parse(input);
  const created: Resource[] = [];
  for (const name of parsed.names) {
    const r = await dt.resources.create({ parentId: parsed.parentId, name });
    const meta: ResourceMeta = { slotMinutes: 60, price: null };
    store.set(r.id, meta);
    created.push(toResource(r, meta));
  }
  return created;
}

export async function deleteResource(id: string): Promise<void> {
  const children = await dt.resources.get({ parentId: id });
  for (const child of children) {
    await deleteResource(child.id);
  }
  await dt.resources.delete(id);
  store.remove(id);
}

export async function updateResourceSettings(
  id: string,
  settings: { slotMinutes: number; bufferMinutes: number }
): Promise<Resource> {
  const meta = store.get(id);
  if (!meta) throw new Error("Resource not found");
  const updated = { ...meta, slotMinutes: settings.slotMinutes };
  store.set(id, updated);
  await dt.resources.update(id, { bufferAfter: settings.bufferMinutes * 60_000 });
  const all = await dt.resources.get();
  const r = all.find((r) => r.id === id);
  if (!r) throw new Error("Resource not found in Δt");
  return toResource(r, updated);
}

export async function getResources(): Promise<Resource[]> {
  const dtResources = await dt.resources.get();
  const allMeta = store.getAll();
  return dtResources.map((r) => toResource(r, allMeta.get(r.id)));
}
