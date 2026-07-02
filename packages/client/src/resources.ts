import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Resource } from "./types.js";

export class Resources {
  constructor(private readonly sql: Sql) {}

  /**
   * Create a single resource under an optional parent. `capacity` defaults to 1 (a booking takes the
   * whole resource); a higher capacity lets that many bookings overlap. Use `createMany` for batches.
   */
  async create(opts?: {
    parentId?: string | null;
    name?: string | null;
    capacity?: number;
    bufferAfter?: number | null;
  }): Promise<Resource> {
    const id = ulid();
    const parentId = opts?.parentId ?? null;
    const name = opts?.name ?? null;
    const capacity = opts?.capacity ?? 1;
    const bufferAfter = opts?.bufferAfter ?? null;

    await this
      .sql`INSERT INTO resources (id, parent_id, name, capacity, buffer_after) VALUES (${id}, ${parentId}, ${name}, ${capacity}, ${bufferAfter})`;

    return { id, parentId, name, capacity, bufferAfter };
  }

  /**
   * Create several resources in one round-trip, applied in input order so an item may reference a
   * parent created earlier in the same call. Returns them in that order. Resources splits single
   * `create` from batch `createMany`, unlike `rules`/`bookings` whose `create` is always a batch.
   * The kernel batch size is 1000; chunk larger seeds.
   */
  async createMany(
    items: {
      parentId?: string | null;
      name?: string | null;
      capacity?: number;
      bufferAfter?: number | null;
    }[]
  ): Promise<Resource[]> {
    if (items.length === 0) return [];

    const resources: Resource[] = items.map((o) => ({
      id: ulid(),
      parentId: o.parentId ?? null,
      name: o.name ?? null,
      capacity: o.capacity ?? 1,
      bufferAfter: o.bufferAfter ?? null,
    }));

    if (resources.length === 1) {
      const r = resources[0];
      await this
        .sql`INSERT INTO resources (id, parent_id, name, capacity, buffer_after) VALUES (${r.id}, ${r.parentId}, ${r.name}, ${r.capacity}, ${r.bufferAfter})`;
    } else {
      const params: (string | number | null)[] = [];
      const valueRows: string[] = [];
      for (const r of resources) {
        const i = params.length;
        params.push(r.id, r.parentId, r.name, r.capacity, r.bufferAfter);
        valueRows.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
      }
      await this.sql.unsafe(
        `INSERT INTO resources (id, parent_id, name, capacity, buffer_after) VALUES ${valueRows.join(", ")}`,
        params
      );
    }

    return resources;
  }

  /** Patch a resource in place. Only the fields you pass change; a call with no fields is a no-op. */
  async update(
    id: string,
    opts: {
      name?: string | null;
      capacity?: number;
      bufferAfter?: number | null;
    }
  ): Promise<void> {
    const parts: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (opts.name !== undefined) {
      values.push(opts.name);
      parts.push(`name = $${values.length}`);
    }
    if (opts.capacity !== undefined) {
      values.push(opts.capacity);
      parts.push(`capacity = $${values.length}`);
    }
    if (opts.bufferAfter !== undefined) {
      values.push(opts.bufferAfter);
      parts.push(`buffer_after = $${values.length}`);
    }

    if (parts.length === 0) return;

    values.push(id);
    const sql = `UPDATE resources SET ${parts.join(", ")} WHERE id = $${values.length}`;
    await this.sql.unsafe(sql, values);
  }

  /** Delete a resource by id. */
  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM resources WHERE id = ${id}`;
  }

  /** List resources: all of them, only roots (`{ roots: true }`), or the direct children of a parent. */
  async get(
    filter?: { parentId: string } | { roots: true }
  ): Promise<Resource[]> {
    let rows: Record<string, unknown>[];

    if (!filter) {
      rows = await this.sql`SELECT * FROM resources`;
    } else if ("roots" in filter) {
      rows = await this.sql`SELECT * FROM resources WHERE parent_id IS NULL`;
    } else {
      rows = await this
        .sql`SELECT * FROM resources WHERE parent_id = ${filter.parentId}`;
    }

    return rows.map(mapResource);
  }
}

function mapResource(row: Record<string, unknown>): Resource {
  return {
    id: String(row.id),
    parentId: row.parent_id != null ? String(row.parent_id) : null,
    name: row.name != null ? String(row.name) : null,
    capacity: Number(row.capacity),
    bufferAfter: row.buffer_after != null ? Number(row.buffer_after) : null,
  };
}
