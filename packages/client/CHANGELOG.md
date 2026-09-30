# Changelog

All notable changes to `@open-deltat/client` are documented here.

## [0.4.0] - Unreleased

Works against deltat 0.3.0. The fields marked deltat#42 below need a kernel with that change; on an
older one they are absent and everything else behaves as described.

### Added
- **`events.watch(resourceId, onChange, options)`.** A calendar's changes as `Change` values:
  `held`, `booked`, `hold_ended` and `cancelled`, each with its time, optionally filtered to a
  window. A commit is reported once, as `booked`, never as a release followed by a booking. After a
  reconnect or a `Lagged` notice the calendar is re-read before anything more is delivered, and the
  gap is said out loud: `onResubscribed` and `onLagged` mean "changes in between were not seen".
  `onReady` runs before the first change, `onDisconnected` when the connection drops, `onGone` when
  the calendar is deleted, and `onRetryFailing` when deltat answers the reconnect with an error
  (a changed password, say). Silence means nothing changed, never that the watch quietly died.
- **`ChangeTracker` and the `Change` type**, the interpreter `watch` is built on, for an adapter
  that reads the raw stream itself.
- **`DeltaTOptions.tls`**: `true` verifies against the system's authorities, `{ ca }` trusts the
  given certificate (a self-signed deltat). There is no way to skip verification. `tlsSetting()`
  and `passwordInClear()` read `DELTAT_TLS` and `DELTAT_TLS_CA` the same way for every adapter.
- **`resources.find(id)`**: the resource, or `null` for an id that does not exist. Reads of an
  unknown id come back empty rather than as an error, so check with this first. A direct lookup on
  kernels with deltat#42, a full scan on older ones.
- **`classifyRefusal(err)`**: every failure as one of `CONFLICT`, `EXPIRED`, `INVALID`,
  `NOT_FOUND` or `INTERNAL`, SQLSTATE first, with the counter-offer attached. The CLI and the MCP
  server both report through it. Also `parseInstant(text)` and `ADAPTER_DEFAULTS`.
- **`DeltaTEvent`**: a `Lagged { missed }` member, and `span`, `reason` and `booking_id` on
  `HoldReleased`, `span` on `BookingCancelled` (deltat#42).
- **`counterOffer(err)` and `sqlstateOf(err)`.** deltat now answers a refused hold or booking with
  the times that would have worked, carried in the standard PostgreSQL `DETAIL` field
  (open-deltat/deltat#39). `counterOffer` turns that into a typed `CounterOffer`, and
  `sqlstateOf` reads the error's SQLSTATE so callers branch on a code rather than on message text.

  `counterOffer` returns `null` and never throws for every off-path case: a plain `Error`, a kernel
  older than the feature, one with counter-offers disabled, a different Postgres, a non-JSON
  `DETAIL`, or a payload version this build does not understand. It runs inside a caller's `catch`,
  where throwing a second error would be the worst thing it could do. A refusal with nothing to
  offer legitimately carries no `DETAIL`, so `null` is an ordinary outcome.

  An alternative is a time that **was** free, not a time held for you: `reserved` is always `false`,
  and acting on one is a race you can still lose. Place a hold before promising it. `schedule:
  "unscheduled"` means the calendar publishes no opening hours, so there were no windows to
  enumerate; it does not mean the calendar is full.

### Changed
- **`DeltaTEvent` has a new member, `Lagged`.** A `switch` over the event kinds that TypeScript
  checks for exhaustiveness needs a case for it.
- **`close()` also ends every subscription** and its retries, and forces the connections closed
  after 5 s, so an unreachable deltat cannot hang shutdown.
- **Notification payloads are shape-checked.** One that is not a well-formed event of a known kind
  is skipped, like unparseable JSON, instead of reaching the callback.

### Fixed
- **`events.listen` no longer goes silent when deltat restarts.** It rode on postgres.js's own
  listen, which re-subscribes once when the connection closes and gives up without a word if deltat
  is still down at that moment: measured at 10 s and 40 s of downtime. Subscriptions now have their
  own connection and retry until deltat is back. A 10 s timeout on every statement (plus the connect
  time on a fresh connection) and a heartbeat every 30 s catch a connection that died without
  closing, which TCP alone notices only after minutes. New options: `onDisconnected`, `onResubscribed` (re-read whatever you show: changes in
  between were missed), `onGone` and `onRetryFailing`.

## [0.3.0] - 2026-09-17

Two commits landed in this package after `0.2.1` was published and neither bumped the version, so
the registry has carried a copy missing the API below since 2026-07-03. Anything resolving
`@open-deltat/client` from npm, rather than through a workspace symlink, has been getting it.

### Added
- **`Holds.commit(holdId, { label })`** turns a live hold into a booking in one atomic server-side
  statement. This is the only way to create a booking from a hold, and it was absent from the
  published package entirely: `0.2.1` on the registry exposes `place`, `release`, `get` and
  `getMany` and nothing else. Calling it threw `TypeError: dt.holds.commit is not a function`.
- **`RecurrencePattern.timeZone`** so a weekly pattern expands against a named IANA zone instead of
  whatever zone the host process happens to run in. Without it, the same pattern produced different
  absolute instants depending on where it ran.

### Changed
- `bookings.get()` and `holds.get()` push their `{ start, end }` window down to the kernel as a span
  predicate and also apply it client-side, so the result is correct against kernels older than
  deltat #36 (which used to drop range predicates from a `SELECT` silently).

### Removed
- `daysOfWeekMask`, `daysFromMask`, `timeToMinutes`, `minutesToTime` and `localUtcOffsetMinutes` are
  no longer exported. They are still present in `0.2.1` on the registry, so this is the breaking
  half of the bump.

## [0.2.1] - 2026-07-03

Initial published release.
