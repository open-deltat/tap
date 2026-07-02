# Changelog

All notable changes to `@open-deltat/client` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Being pre-1.0, minor versions
may still carry breaking changes.

## [Unreleased]

## [0.2.1] - 2026-07-02

The typed TypeScript SDK for [deltat](https://github.com/open-deltat/deltat), a time-allocation
database, over its PostgreSQL wire protocol. All times are Unix milliseconds over half-open
`[start, end)` intervals.

### Changed
- Renamed from `@open-tap/client` to `@open-deltat/client`, matching the `open-deltat` GitHub
  organization. The old `@open-tap/client` (0.2.0) is deprecated; install `@open-deltat/client`.

### Added
- `DeltaT` client: one connection exposing `resources`, `rules`, `bookings`, `holds`,
  `availability`, and `events`. Accepts connection options or an existing postgres `Sql`.
- `resources`: hierarchical `create` / `createMany` / `update` / `delete` / `get` (all, roots, or a
  parent's children), with per-resource capacity and buffer.
- `rules`: batch `create`, `update`, `delete`, `get`, and `replaceOpenHours` for cal.com-style
  weekly hours (new rules created before old ones are removed, so a failure never empties the
  schedule).
- `bookings` and `holds`: batch creation with all-or-nothing semantics, cancel/release, single and
  `getMany` reads. Holds carry an `expiresAt` and are reaped server-side.
- `availability`: single-resource `get`, `getCombined` across resources with `minAvailable` for
  "any k of N free", and per-resource `getMany`.
- `events.listen`: real-time LISTEN/NOTIFY subscriptions returning an unsubscribe function.
- `expandRecurrence`: expand a recurring pattern into concrete `[start, end)` rule segments at the
  edge, since the kernel stores only flat segments.

### Security
- All queries use positional (`$N`) parameters; caller ids and values are never spliced into SQL.

[Unreleased]: https://github.com/open-deltat/tap/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/open-deltat/tap/releases/tag/v0.2.1
