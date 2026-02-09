"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import { CreateResourcesInput, type Resource, type ResourceMeta } from "@/lib/schemas";

function toResource(
  r: { id: string; parentId: string | null; name: string | null; capacity: number; bufferAfter: number | null },
  meta?: ResourceMeta
): Resource {
  return {
    ...r,
    slotMinutes: meta?.slotMinutes ?? 60,
    bufferMinutes: meta?.bufferMinutes ?? 0,
    price: meta?.price ?? null,
  };
}

export async function createResources(input: {
  names: string[];
  parentId: string | null;
}): Promise<Resource[]> {
  const parsed = CreateResourcesInput.parse(input);
  const created: Resource[] = [];
  for (const name of parsed.names) {
    const r = await dt.createResource({ parentId: parsed.parentId, name });
    const meta: ResourceMeta = { slotMinutes: 60, bufferMinutes: 0, price: null };
    store.setMeta(r.id, meta);
    created.push(toResource(r, meta));
  }
  return created;
}

export async function deleteResource(id: string): Promise<void> {
  // Delete children first (depth-first)
  const children = await dt.getResources({ parentId: id });
  for (const child of children) {
    await deleteResource(child.id);
  }
  await dt.deleteResource(id);
  store.removeMeta(id);
}

export async function updateResourceSettings(
  id: string,
  settings: { slotMinutes: number; bufferMinutes: number }
): Promise<Resource> {
  const meta = store.getMeta(id);
  if (!meta) throw new Error("Resource not found");
  const updated = { ...meta, ...settings };
  store.setMeta(id, updated);
  // Sync buffer to deltat
  await dt.updateResource(id, { bufferAfter: settings.bufferMinutes * 60_000 });
  // Return full resource
  const resources = await dt.getResources();
  const r = resources.find((r) => r.id === id);
  if (!r) throw new Error("Resource not found in deltat");
  return toResource(r, updated);
}

export async function getResources(): Promise<Resource[]> {
  const dtResources = await dt.getResources();
  const allMeta = store.getAllMeta();
  return dtResources.map((r) => toResource(r, allMeta.get(r.id)));
}
