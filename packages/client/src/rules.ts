import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Rule } from "./types.js";

export class Rules {
  constructor(private readonly sql: Sql) {}

  /**
   * Create one or more rules in a single round-trip. `blocking` defaults to false (an open-hours
   * window); a blocking rule subtracts from availability. Takes an array, unlike `Resources.create`
   * which is single-item. Times are Unix ms over `[start, end)`.
   */
  async create(
    items: {
      resourceId: string;
      start: number;
      end: number;
      blocking?: boolean;
    }[]
  ): Promise<Rule[]> {
    if (items.length === 0) return [];

    const rules: Rule[] = items.map((item) => ({
      id: ulid(),
      resourceId: item.resourceId,
      start: item.start,
      end: item.end,
      blocking: item.blocking ?? false,
    }));

    if (rules.length === 1) {
      const r = rules[0];
      await this
        .sql`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${r.id}, ${r.resourceId}, ${r.start}, ${r.end}, ${r.blocking})`;
    } else {
      // One multi-row INSERT: deltat now honors multi-row rule inserts (BatchInsertRules), so a
      // 90-day schedule projection is a single round-trip instead of one INSERT per rule.
      const params: (string | number | boolean)[] = [];
      const valueRows: string[] = [];
      for (const r of rules) {
        const i = params.length;
        params.push(r.id, r.resourceId, r.start, r.end, r.blocking);
        valueRows.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
      }
      await this.sql.unsafe(
        `INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES ${valueRows.join(", ")}`,
        params
      );
    }

    return rules;
  }

  /**
   * Replace a resource's non-blocking (open-hours) rules with `segments`, the cal.com-style "save my
   * weekly hours". Creates the new rules before deleting the old, so a mid-run failure leaves the
   * previous hours (worst case, duplicate open rules that merge in availability) rather than an empty
   * schedule. Blocking rules and bookings are untouched; callers expand their own recurrence first.
   */
  async replaceOpenHours(
    resourceId: string,
    segments: { start: number; end: number }[]
  ): Promise<Rule[]> {
    const stale = (await this.get(resourceId)).filter((r) => !r.blocking).map((r) => r.id);
    const created = segments.length
      ? await this.create(
          segments.map((s) => ({ resourceId, start: s.start, end: s.end, blocking: false }))
        )
      : [];
    await Promise.all(stale.map((id) => this.delete(id)));
    return created;
  }

  /** Overwrite a rule's window and blocking flag by id. */
  async update(
    id: string,
    opts: { start: number; end: number; blocking: boolean }
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE rules SET start = $1, "end" = $2, blocking = $3 WHERE id = $4`,
      [opts.start, opts.end, opts.blocking, id]
    );
  }

  /** Delete a rule by id. */
  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM rules WHERE id = ${id}`;
  }

  /** All rules for a resource, open-hours and blocking alike. */
  async get(resourceId: string): Promise<Rule[]> {
    const rows = await this
      .sql`SELECT * FROM rules WHERE resource_id = ${resourceId}`;
    return rows.map(mapRule);
  }
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
