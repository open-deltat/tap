Δt speaks the PostgreSQL wire protocol. There is no Postgres underneath, no fork and no extension: a purpose-built engine answers the same handshake a Postgres server would. The practical payoff is that the client ecosystem already exists. `psql` connects. Ordinary Postgres drivers connect. Decades of tooling treat Δt as just another database on just another port.

This page is the tour of that front door: connecting, the whole SQL surface, and where the edges are.

## Connect

A default install listens on port 5433 with password auth (set `DELTAT_PASSWORD`; see [Self-host](/docs/sdk/self-host) for the rest of the configuration):

```bash
psql -h localhost -p 5433 -U deltat
```

The database name you connect to is your tenant. Connect to `acme` and you are in an isolated world with its own state and its own durable log; connect to a name nobody has used and Δt creates that tenant on the spot. Both the simple and the extended query protocol are supported, so parameterized queries (`$1`, `$2`) from ordinary drivers work. This is exactly how the [TypeScript SDK](/docs/sdk/quickstart) gets in: it rides a normal Postgres driver connection and turns typed verbs into these statements.

## The SQL surface

The engine exposes its model as five tables and a notification channel. Times are integer Unix milliseconds, spans are half-open `[start, end)`, and `"end"` needs its quotes because it is a reserved word. Over raw SQL you supply ids yourself, and they must be ULIDs, 26 characters of Crockford base32; anything else is rejected with a `bad ULID` error (the SDK generates valid ones for you).

**Resources**, the bookable tree:

```sql
INSERT INTO resources (id, parent_id, name, capacity, buffer_after)
VALUES ('01J9G6Z5R80000000000000001', NULL, 'Flight AA-100', 1, 2700000);

SELECT * FROM resources WHERE parent_id IS NULL;  -- roots
SELECT * FROM resources                           -- children
WHERE parent_id = '01J9G6Z5R80000000000000001';
```

**Rules**, painting time open or closed:

```sql
INSERT INTO rules (id, resource_id, start, "end", blocking)
VALUES ('01J9G6Z5R80000000000000003', '01J9G6Z5R80000000000000002',
        1706000000000, 1706028800000, false);
```

**Bookings**, including the all-or-nothing batch: a multi-row insert is checked as a unit, and one conflict rejects the lot:

```sql
INSERT INTO bookings (id, resource_id, start, "end", label)
VALUES ('01J9G6Z5R80000000000000004', '01J9G6Z5R80000000000000002',
        1706000000000, 1706003600000, 'order-4417');

DELETE FROM bookings WHERE id = '01J9G6Z5R80000000000000004';
```

**Holds**, tentative claims with an expiry instant. The server keeps the expiry no later than its own clock plus `DELTAT_MAX_HOLD_TTL_MS` (one hour by default), and a multi-row insert holds every row or none, even across resources:

```sql
INSERT INTO holds (id, resource_id, start, "end", expires_at)
VALUES ('01J9G6Z5R80000000000000005', '01J9G6Z5R80000000000000002',
        1706000000000, 1706003600000, 1706000900000);

DELETE FROM holds WHERE id = '01J9G6Z5R80000000000000005';  -- release it now
```

**Committing a hold** turns it into a booking in one step, with no moment where the slot is free. Insert a booking that names the hold instead of a span; several rows commit all together or not at all:

```sql
INSERT INTO bookings (id, hold_id, label)
VALUES ('01J9G6Z5R80000000000000009', '01J9G6Z5R80000000000000005', 'order-4417');
```

**Availability**, the derived one. There is no availability table to write; selecting from it computes [the gaps](/docs/holds-and-availability) fresh:

```sql
SELECT * FROM availability
WHERE resource_id = '01J9G6Z5R80000000000000002'
  AND start >= 1706000000000 AND "end" <= 1706086400000
  AND min_duration = 3600000;          -- optional: only gaps >= 1 hour

-- across resources: min_available = N ids for all-free, 1 for a pool, k for at-least-k;
-- omit min_available and you get per-resource rows (tagged with resource_id) instead
SELECT * FROM availability
WHERE resource_id IN ('01J9G6Z5R80000000000000006',
                      '01J9G6Z5R80000000000000007',
                      '01J9G6Z5R80000000000000008')
  AND start >= 1706000000000 AND "end" <= 1706086400000
  AND min_available = 2;
```

**Events**, pushed over the same connection. A change on a resource is also sent to every resource above it, and you only listen: Δt sends the notifications itself, and `NOTIFY` is not accepted.

```sql
LISTEN resource_01J9G6Z5R80000000000000002;
UNLISTEN resource_01J9G6Z5R80000000000000002;
```

`UPDATE` works on resources and rules, with one edge: resources accept a partial `SET`, while a rules `UPDATE` must set `start`, `"end"`, and `blocking` together. That is the entire surface.

## The edges, stated plainly

This is a small dialect wearing Postgres clothing, and it is deliberately not SQL in the general sense. Reads are `SELECT *` only; there are no joins, no aggregates, no `ORDER BY` or `LIMIT`, no `RETURNING`, and only one statement per query. Anything outside the shapes above is refused with an error rather than quietly ignored, so a query that runs is a query that means what it says. There is no `pg_catalog`, so graphical database browsers that inspect the schema will not connect; `psql` and drivers do. A few limits are worth knowing before you hit them: availability queries are capped at a 90-day window, batch inserts at 1,000 rows, and `IN` lists at 1,000 ids.

When a booking or hold collides, the error carries times that still work in its detail, as JSON; the TypeScript client's `counterOffer(err)` reads it, and any driver can read the same detail field.

The wire protocol is the current transport, not the final one; an HTTP/JSON way in is planned and not built. The typed SDK and the [MCP server](/docs/quickstart) are the surfaces built to outlast a change of transport, which is why the [reference](/docs/sdk/reference) documents verbs instead of statements. Treat raw SQL as a power tool for poking at a node and for languages without an SDK yet.

For what actually answers these queries (one binary, in-memory state, an append-only log), see [Under the hood](/docs/protocol-and-engine). For why the model is five tables and not fifty, start at [What is Δt](/docs).
