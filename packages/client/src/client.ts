import postgres, { type Sql } from "postgres";
import { Resources } from "./resources.js";
import { Rules } from "./rules.js";
import { Bookings } from "./bookings.js";
import { Holds } from "./holds.js";
import { Availability } from "./availability.js";
import { Events } from "./events.js";
import { Schedules } from "./schedules.js";

export interface DeltaTOptions {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export class DeltaT {
  readonly sql: Sql;
  readonly resources: Resources;
  readonly rules: Rules;
  readonly bookings: Bookings;
  readonly holds: Holds;
  readonly availability: Availability;
  readonly events: Events;
  readonly schedules: Schedules;

  constructor(options?: DeltaTOptions | Sql) {
    if (options && "begin" in options) {
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

    this.resources = new Resources(this.sql);
    this.rules = new Rules(this.sql);
    this.bookings = new Bookings(this.sql);
    this.holds = new Holds(this.sql);
    this.availability = new Availability(this.sql);
    this.events = new Events(this.sql);
    this.schedules = new Schedules(this.sql);
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
