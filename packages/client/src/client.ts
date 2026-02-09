import postgres, { type Sql } from "postgres";
import { ulid } from "ulid";
import type {
  Resource,
  Rule,
  Booking,
  Hold,
  AvailabilitySlot,
  DeltaTEvent,
} from "./types.js";

export interface DeltaTOptions {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export class DeltaT {
  readonly sql: Sql;

  constructor(options?: DeltaTOptions | Sql) {
    if (options && "begin" in options) {
      // Pre-existing postgres.Sql instance
      this.sql = options as Sql;
    } else {
      const opts = (options as DeltaTOptions | undefined) ?? {};
      this.sql = postgres({
        hostname: opts.host ?? "localhost",
        port: opts.port ?? 5433,
        database: opts.database ?? "default",
        username: opts.username ?? "user",
        password: opts.password ?? "deltat",
        fetch_types: false,
        prepare: false,
      });
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  // ── Resources ──────────────────────────────────────────────────

  async createResource(opts?: {
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

  async updateResource(
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

  async deleteResource(id: string): Promise<void> {
    await this.sql`DELETE FROM resources WHERE id = ${id}`;
  }

  async getResources(
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

  // ── Rules ──────────────────────────────────────────────────────

  async addRule(opts: {
    resourceId: string;
    start: number;
    end: number;
    blocking?: boolean;
  }): Promise<Rule> {
    const id = ulid();
    const blocking = opts.blocking ?? false;

    await this
      .sql`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${blocking})`;

    return {
      id,
      resourceId: opts.resourceId,
      start: opts.start,
      end: opts.end,
      blocking,
    };
  }

  async updateRule(
    id: string,
    opts: { start: number; end: number; blocking: boolean }
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE rules SET start = $1, "end" = $2, blocking = $3 WHERE id = $4`,
      [opts.start, opts.end, opts.blocking, id]
    );
  }

  async deleteRule(id: string): Promise<void> {
    await this.sql`DELETE FROM rules WHERE id = ${id}`;
  }

  async getRules(resourceId: string): Promise<Rule[]> {
    const rows = await this
      .sql`SELECT * FROM rules WHERE resource_id = ${resourceId}`;
    return rows.map(mapRule);
  }

  // ── Bookings ───────────────────────────────────────────────────

  async createBooking(opts: {
    resourceId: string;
    start: number;
    end: number;
    label?: string;
  }): Promise<Booking> {
    const id = ulid();
    const label = opts.label ?? null;

    if (label) {
      await this
        .sql`INSERT INTO bookings (id, resource_id, start, "end", label) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${label})`;
    } else {
      await this
        .sql`INSERT INTO bookings (id, resource_id, start, "end") VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end})`;
    }

    return { id, resourceId: opts.resourceId, start: opts.start, end: opts.end, label };
  }

  async createBookings(
    items: {
      resourceId: string;
      start: number;
      end: number;
      label?: string;
    }[]
  ): Promise<Booking[]> {
    if (items.length === 0) return [];
    if (items.length === 1) return [await this.createBooking(items[0])];

    const bookings: Booking[] = items.map((item) => ({
      id: ulid(),
      resourceId: item.resourceId,
      start: item.start,
      end: item.end,
      label: item.label ?? null,
    }));

    const valuesList = bookings
      .map(
        (b) =>
          `('${b.id}', '${b.resourceId}', ${b.start}, ${b.end})`
      )
      .join(", ");

    await this.sql.unsafe(
      `INSERT INTO bookings (id, resource_id, start, "end") VALUES ${valuesList}`
    );

    return bookings;
  }

  async cancelBooking(id: string): Promise<void> {
    await this.sql`DELETE FROM bookings WHERE id = ${id}`;
  }

  async getBookings(resourceId: string): Promise<Booking[]> {
    const rows = await this
      .sql`SELECT * FROM bookings WHERE resource_id = ${resourceId}`;
    return rows.map(mapBooking);
  }

  // ── Holds ──────────────────────────────────────────────────────

  async placeHold(opts: {
    resourceId: string;
    start: number;
    end: number;
    expiresAt: number;
  }): Promise<Hold> {
    const id = ulid();

    await this
      .sql`INSERT INTO holds (id, resource_id, start, "end", expires_at) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${opts.expiresAt})`;

    return {
      id,
      resourceId: opts.resourceId,
      start: opts.start,
      end: opts.end,
      expiresAt: opts.expiresAt,
    };
  }

  async releaseHold(id: string): Promise<void> {
    await this.sql`DELETE FROM holds WHERE id = ${id}`;
  }

  async getHolds(resourceId: string): Promise<Hold[]> {
    const rows = await this
      .sql`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
    return rows.map(mapHold);
  }

  // ── Availability ───────────────────────────────────────────────

  async getAvailability(opts: {
    resourceId: string;
    start: number;
    end: number;
    minDuration?: number;
  }): Promise<AvailabilitySlot[]> {
    let rows: Record<string, unknown>[];

    if (opts.minDuration != null) {
      rows = await this
        .sql`SELECT * FROM availability WHERE resource_id = ${opts.resourceId} AND start >= ${opts.start} AND "end" <= ${opts.end} AND min_duration = ${opts.minDuration}`;
    } else {
      rows = await this
        .sql`SELECT * FROM availability WHERE resource_id = ${opts.resourceId} AND start >= ${opts.start} AND "end" <= ${opts.end}`;
    }

    return rows.map(mapAvailabilitySlot);
  }

  async getCombinedAvailability(opts: {
    resourceIds: string[];
    start: number;
    end: number;
    minAvailable?: number;
    minDuration?: number;
  }): Promise<AvailabilitySlot[]> {
    if (opts.resourceIds.length === 0) return [];

    const inList = opts.resourceIds.map((id) => `'${id}'`).join(", ");
    const minAvail = opts.minAvailable ?? opts.resourceIds.length;

    let sql = `SELECT * FROM availability WHERE resource_id IN (${inList}) AND start >= ${opts.start} AND "end" <= ${opts.end} AND min_available = ${minAvail}`;

    if (opts.minDuration != null) {
      sql += ` AND min_duration = ${opts.minDuration}`;
    }

    const rows = await this.sql.unsafe(sql);
    return rows.map(mapAvailabilitySlot);
  }

  // ── Real-time (LISTEN/NOTIFY) ──────────────────────────────────

  async listen(
    resourceId: string,
    callback: (event: DeltaTEvent) => void
  ): Promise<() => Promise<void>> {
    const channel = `resource_${resourceId}`;

    const meta = await this.sql.listen(
      channel,
      (payload: string) => {
        try {
          const event = JSON.parse(payload) as DeltaTEvent;
          callback(event);
        } catch {
          // Ignore malformed payloads
        }
      }
    );

    return async () => {
      await meta.unlisten();
    };
  }
}

// ── Row mappers (snake_case wire → camelCase) ────────────────────

function mapResource(row: Record<string, unknown>): Resource {
  return {
    id: String(row.id),
    parentId: row.parent_id != null ? String(row.parent_id) : null,
    name: row.name != null ? String(row.name) : null,
    capacity: Number(row.capacity),
    bufferAfter: row.buffer_after != null ? Number(row.buffer_after) : null,
  };
}

function mapRule(row: Record<string, unknown>): Rule {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    blocking: row.blocking === true || row.blocking === "t",
  };
}

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    label: row.label != null ? String(row.label) : null,
  };
}

function mapHold(row: Record<string, unknown>): Hold {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    expiresAt: Number(row.expires_at),
  };
}

function mapAvailabilitySlot(row: Record<string, unknown>): AvailabilitySlot {
  return {
    start: Number(row.start),
    end: Number(row.end),
  };
}
