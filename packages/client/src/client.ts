import postgres, { type Sql } from "postgres";
import { Resources } from "./resources.js";
import { Rules } from "./rules.js";
import { Bookings } from "./bookings.js";
import { Holds } from "./holds.js";
import { Availability } from "./availability.js";
import { Events } from "./events.js";

export interface DeltaTOptions {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  /**
   * Encrypt the connection and verify the server's certificate: `true` trusts the system's
   * certificate authorities, `{ ca }` trusts the given PEM instead (a deltat with a self-signed
   * certificate). There is deliberately no way to skip verification: an unverified TLS link hands
   * the password to whoever answers. Without it the password crosses the network in the clear.
   */
  tls?: boolean | { ca: string };
}

const sslFor = (tls: DeltaTOptions["tls"]) =>
  tls ? { rejectUnauthorized: true, ...(typeof tls === "object" ? { ca: tls.ca } : {}) } : false;

/**
 * Entry point to a deltat database. Holds one pgwire connection and exposes the typed sub-APIs
 * (`resources`, `rules`, `bookings`, `holds`, `availability`, `events`) over it. Pass connection
 * options, or an existing postgres `Sql` to reuse a pool.
 */
export class DeltaT {
  readonly sql: Sql;
  readonly resources: Resources;
  readonly rules: Rules;
  readonly bookings: Bookings;
  readonly holds: Holds;
  readonly availability: Availability;
  readonly events: Events;

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
        ssl: sslFor(opts.tls),
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
  }

  /**
   * Close the connection and every subscription, including any retry waiting for deltat to come
   * back, forcing them closed after 5 s so an unreachable host cannot hang shutdown. The instance is
   * unusable afterward, so call it once at shutdown.
   */
  async close(): Promise<void> {
    await Promise.all([this.events.close(), this.sql.end({ timeout: 5 })]);
  }
}
