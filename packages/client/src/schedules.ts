import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { DayName, Schedule } from "./types.js";

const DAY_BITS: Record<DayName, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const BIT_DAYS: DayName[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Build a days_of_week bitmask from day names. Bit 0 = Sun, bit 6 = Sat. */
export function daysOfWeekMask(...days: DayName[]): number {
  let mask = 0;
  for (const d of days) mask |= 1 << DAY_BITS[d];
  return mask;
}

export function daysFromMask(mask: number): DayName[] {
  const days: DayName[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(BIT_DAYS[i]);
  }
  return days;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export class Schedules {
  constructor(private readonly sql: Sql) {}

  async set(opts: {
    resourceId: string;
    days: DayName[];
    startTime: string;
    endTime: string;
    utcOffsetMinutes?: number;
  }): Promise<Schedule> {
    const id = ulid();
    const offset = opts.utcOffsetMinutes ?? 0;
    const mask = daysOfWeekMask(...opts.days);
    const startMinutes = timeToMinutes(opts.startTime);
    const endMinutes = timeToMinutes(opts.endTime);

    await this.sql.unsafe(
      `INSERT INTO schedules (id, resource_id, days_of_week, start_minutes, end_minutes, utc_offset_minutes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, opts.resourceId, mask, startMinutes, endMinutes, offset]
    );

    return {
      id,
      resourceId: opts.resourceId,
      days: opts.days,
      startTime: opts.startTime,
      endTime: opts.endTime,
      utcOffsetMinutes: offset,
    };
  }

  async remove(resourceId: string): Promise<void> {
    await this
      .sql`DELETE FROM schedules WHERE resource_id = ${resourceId}`;
  }

  async get(resourceId: string): Promise<Schedule | null> {
    const rows = await this
      .sql`SELECT * FROM schedules WHERE resource_id = ${resourceId}`;
    if (rows.length === 0) return null;
    return mapSchedule(rows[0]);
  }
}

function mapSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    days: daysFromMask(Number(row.days_of_week)),
    startTime: minutesToTime(Number(row.start_minutes)),
    endTime: minutesToTime(Number(row.end_minutes)),
    utcOffsetMinutes: Number(row.utc_offset_minutes),
  };
}
