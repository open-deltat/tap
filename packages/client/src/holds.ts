import type { Sql } from "postgres";
import { ulid } from "ulid";
import { MAX_IN_CLAUSE_IDS, chunk } from "./chunk.js";
import type { Hold } from "./types.js";
import { valuesOf } from "./values.js";

export class Holds {
  constructor(private readonly sql: Sql) {}

  /**
   * Place a hold over `[start, end)` that reserves the resource until it expires, when the server
   * reaper releases it automatically. A hold removes availability but is not a booking; to keep
   * the slot, convert the hold with {@link commit}.
   *
   * `expiresAt` (Unix ms) is a request, not an assignment: the server clamps it to its own clock
   * plus a maximum hold TTL (`DELTAT_MAX_HOLD_TTL_MS`, default 1 hour). The returned `Hold` echoes
   * the requested value, so for countdown UIs and renewal logic read the hold back with
   * {@link get} and trust the server's `expiresAt`; a far-future request silently comes back as
   * now plus the cap. A hold that must outlive the cap has to be re-placed or renewed before it
   * expires.
   */
  async place(opts: Omit<Hold, "id">): Promise<Hold> {
    const [hold] = await this.placeMany([opts]);
    return hold;
  }

  /**
   * Hold several resources at once, all or none: a camera body, its lens and the crew. Needs deltat
   * 0.4.0 for more than one row; a single row is what {@link place} sends, which every deltat takes.
   *
   * One multi-row INSERT, because the server makes a statement all-or-nothing, never a sequence of
   * them. That is why this is not chunked like the reads, and why a refused kit leaves nothing held.
   * The same expiry rule as {@link place} applies to every hold.
   */
  async placeMany(requests: readonly Omit<Hold, "id">[]): Promise<Hold[]> {
    if (requests.length === 0) return [];
    const holds = requests.map((r) => ({ id: ulid(), ...r }));
    const { list, params } = valuesOf(holds.map((h) => [h.id, h.resourceId, h.start, h.end, h.expiresAt]));
    await this.sql.unsafe(`INSERT INTO holds (id, resource_id, start, "end", expires_at) VALUES ${list}`, params);
    return holds;
  }

  /**
   * Convert a live hold into a booking in one atomic server-side statement. The booking takes over
   * the hold's resource and span, and the hold is consumed, so no competing writer can grab the
   * span in between; this replaces the old two-step of releasing the hold and re-inserting a
   * booking, which left a window where the holder could lose the very slot the hold protected.
   * Rejects if the hold is unknown, already released, or expired (place a new hold and retry).
   */
  async commit(holdId: string, opts?: { label?: string }): Promise<{ bookingId: string }> {
    const bookingId = ulid();
    const label = opts?.label;

    if (label != null) {
      await this
        .sql`UPDATE holds SET booking_id = ${bookingId}, label = ${label} WHERE id = ${holdId}`;
    } else {
      await this
        .sql`UPDATE holds SET booking_id = ${bookingId} WHERE id = ${holdId}`;
    }

    return { bookingId };
  }

  /**
   * Book several holds at once, all or none (deltat 0.4.0+). Each booking takes its hold's resource
   * and span, and `label` applies to every one. One INSERT for the same reason as
   * {@link placeMany}, and the server writes it as one record, so even a crash keeps every booking
   * or none. Rejects, booking nothing, if any hold is unknown, released, expired, or lost its span.
   * `bookingIds` come back in the order of `holdIds`.
   */
  async commitMany(holdIds: readonly string[], opts?: { label?: string }): Promise<{ bookingIds: string[] }> {
    if (holdIds.length === 0) return { bookingIds: [] };
    const label = opts?.label;
    const bookingIds = holdIds.map(() => ulid());
    const { list, params } = valuesOf(
      holdIds.map((holdId, i) => (label != null ? [bookingIds[i], holdId, label] : [bookingIds[i], holdId]))
    );
    const columns = label != null ? "id, hold_id, label" : "id, hold_id";
    await this.sql.unsafe(`INSERT INTO bookings (${columns}) VALUES ${list}`, params);
    return { bookingIds };
  }

  /** Release a hold by id before it expires. Expiry is otherwise automatic via the server reaper. */
  async release(id: string): Promise<void> {
    await this.sql`DELETE FROM holds WHERE id = ${id}`;
  }

  /**
   * Holds for one resource, optionally filtered to those overlapping a half-open `{ start, end }`
   * window (pushed down to the kernel, and applied again client-side so the result is correct
   * against kernels older than the span-predicate fix). Rows carry the
   * server's effective `expiresAt` (possibly clamped below what {@link place} requested), so this
   * is the authoritative read for countdowns and renewals. Not-yet-reaped expired holds can still
   * appear; check `expiresAt` if that matters.
   */
  async get(
    resourceId: string,
    filter?: { start?: number; end?: number }
  ): Promise<Hold[]> {
    // Pushed down to the kernel, which honours span predicates (it used to drop them silently,
    // which is why this filtered client-side). The window is a half-open OVERLAP, so it asks for
    // rows that begin before the window ends and end after it begins, not containment.
    const start = filter?.start;
    const end = filter?.end;
    if (start == null || end == null) {
      const rows = await this.sql`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
      return rows.map(mapHold);
    }
    const rows = await this.sql.unsafe(
      `SELECT * FROM holds WHERE resource_id = $1 AND start < $2 AND "end" > $3`,
      [resourceId, end, start]
    );
    // Applied again client-side: a no-op against a kernel that honours the predicate, and the
    // correctness guarantee against one older than the fix. See bookings.get for the reasoning.
    return rows.map(mapHold).filter((h) => h.start < end && h.end > start);
  }

  /** Holds for many resources in one round-trip, grouped by resource id. Every requested id is
   *  present in the result (empty array if it has none). Ids are positional ($N) params, never
   *  spliced into the SQL. */
  async getMany(resourceIds: string[]): Promise<Record<string, Hold[]>> {
    const grouped: Record<string, Hold[]> = {};
    for (const id of resourceIds) grouped[id] = [];
    if (resourceIds.length === 0) return grouped;

    const batches = await Promise.all(
      chunk(resourceIds, MAX_IN_CLAUSE_IDS).map((ids) => {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        return this.sql.unsafe(
          `SELECT * FROM holds WHERE resource_id IN (${placeholders})`,
          [...ids]
        );
      })
    );
    for (const rows of batches) {
      for (const row of rows) {
        const h = mapHold(row);
        (grouped[h.resourceId] ??= []).push(h);
      }
    }
    return grouped;
  }
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
