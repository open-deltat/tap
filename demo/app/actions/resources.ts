"use server";

import * as db from "@/lib/db";
import * as store from "@/lib/store";
import { CreateResourcesInput, type Resource } from "@/lib/schemas";

export async function createResources(input: {
  names: string[];
  parentId: string | null;
}): Promise<Resource[]> {
  const parsed = CreateResourcesInput.parse(input);
  const created: Resource[] = [];
  for (const name of parsed.names) {
    const id = await db.createResource(parsed.parentId);
    const resource: Resource = {
      id,
      name,
      parentId: parsed.parentId,
      slotMinutes: 60,
      bufferMinutes: 0,
      price: null,
    };
    store.setResource(resource);
    created.push(resource);
  }
  return created;
}

export async function deleteResource(id: string): Promise<void> {
  // Delete children first (depth-first)
  const children = store
    .getResources()
    .filter((r) => r.parentId === id);
  for (const child of children) {
    await deleteResource(child.id);
  }
  await db.deleteResource(id);
  store.removeResource(id);
}

export async function updateResourceSettings(
  id: string,
  settings: { slotMinutes: number; bufferMinutes: number }
): Promise<Resource> {
  const resource = store.getResource(id);
  if (!resource) throw new Error("Resource not found");
  const updated = { ...resource, ...settings };
  store.setResource(updated);
  return updated;
}

export async function getResources(): Promise<Resource[]> {
  return store.getResources();
}
