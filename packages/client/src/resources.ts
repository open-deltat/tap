import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Resource } from "./types.js";

export class Resources {
  constructor(private readonly sql: Sql) {}

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

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM resources WHERE id = ${id}`;
  }

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
