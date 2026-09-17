# Changelog

All notable changes to `@open-deltat/client` are documented here.

## [Unreleased]

### Added
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
