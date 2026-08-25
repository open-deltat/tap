Δt speaks the PostgreSQL wire protocol. There is no Postgres underneath, no fork and no extension: a purpose-built engine answers the same handshake a Postgres server would. The practical payoff is that the client ecosystem already exists. `psql` connects. Ordinary Postgres drivers connect. Decades of tooling treat Δt as just another database on just another port.

This page is the tour of that front door: connecting, the whole SQL surface, and where the edges are.

## Connect

A default install listens on port 5433 with password auth (set `DELTAT_PASSWORD`; see [Self-host](/docs/sdk/self-host) for the rest of the configuration):

```bash
psql -h localhost -p 5433 -U deltat
```

The database name you connect to is your tenant. Connect to `acme` and you are in an isolated world with its own state and its own durable log; connect to a name nobody has used and Δt creates that tenant on the spot. Both the simple and the extended query protocol are supported, so parameterized queries (`$1`, `$2`) from ordinary drivers work. This is exactly how the [TypeScript SDK](/docs/sdk/quickstart) gets in: it rides a normal Postgres driver connection and turns typed verbs into these statements.

## The SQL surface

The engine exposes its model as five tables and a notification channel. Times are integer Unix milliseconds, spans are half-open `[start, end)`, and `"end"` needs its quotes because it is a reserved word. Over raw SQL you supply ids yourself (the SDK generates them for you).

**Resources**, the bookable tree:

```sql
INSERT INTO resources (id, parent_id, name, capacity, buffer_after)
VALUES ('01J_FLIGHT', NULL, 'Flight AA-100', 1, 2700000);

SELECT * FROM resources WHERE parent_id IS NULL;       -- roots
SELECT * FROM resources WHERE parent_id = '01J_FLIGHT'; -- children
```

**Rules**, painting time open or closed:

```sql
INSERT INTO rules (id, resource_id, start, "end", blocking)
VALUES ('01J_R1', '01J_SEAT1', 1706000000000, 1706028800000, false);
```

**Bookings**, including the all-or-nothing batch: a multi-row insert is checked as a unit, and one conflict rejects the lot:

```sql
INSERT INTO bookings (id, resource_id, start, "end", label)
VALUES ('01J_B1', '01J_SEAT1', 1706000000000, 1706003600000, 'order-4417');

DELETE FROM bookings WHERE id = '01J_B1';
```

**Holds**, tentative claims with an expiry instant:

```sql
INSERT INTO holds (id, resource_id, start, "end", expires_at)
VALUES ('01J_H1', '01J_SEAT1', 1706000000000, 1706003600000, 1706000900000);
```

**Availability**, the derived one. There is no availability table to write; selecting from it computes [the gaps](/docs/holds-and-availability) fresh:

```sql
SELECT * FROM availability
WHERE resource_id = '01J_SEAT1'
  AND start >= 1706000000000 AND "end" <= 1706086400000
  AND min_duration = 3600000;          -- optional: only gaps >= 1 hour

-- across resources: all free by default, min_available = 1 for a pool, k for at-least-k
SELECT * FROM availability
WHERE resource_id IN ('01J_A', '01J_B', '01J_C')
  AND start >= 1706000000000 AND "end" <= 1706086400000
  AND min_available = 2;
```

**Events**, pushed over the same connection:

```sql
LISTEN resource_01J_SEAT1;
UNLISTEN resource_01J_SEAT1;
```

`UPDATE` works on resources and rules the way you would expect. That is the entire surface.

## The edges, stated plainly

This is a small dialect wearing Postgres clothing, and it is deliberately not SQL in the general sense. There are no joins, no aggregates, and no arbitrary expressions; one statement per query; anything outside the surface above is rejected with an error rather than half-executed. A few limits are worth knowing before you hit them: availability queries are capped at a 90-day window, batch inserts at 1,000 rows, and `IN` lists at 1,000 ids.

The wire protocol itself is a transitional choice, and the project says so openly. A framed v2 protocol with HTTP and MCP adapters is planned to replace it; the SQL layer goes when it lands. The typed SDK is the surface built to outlast that swap, which is why the [reference](/docs/sdk/reference) documents verbs instead of statements. Treat raw SQL as a power tool for poking at a node and for clients that do not have an SDK yet.

For what actually answers these queries (one binary, in-memory state, an append-only log), see [Under the hood](/docs/protocol-and-engine). For why the model is five tables and not fifty, start at [What is Δt](/docs).
