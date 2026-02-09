# TAP — Time Allocation Protocol

Protocol, SDK, and demo applications for [deltat](https://github.com/open-tap/deltat), a time-allocation database.

## Structure

```
demo/       Next.js demo app showcasing deltat capabilities
```

## Demo App

Interactive demos: airline seat booking, theater reservations, stadium events, resource calendars, multi-resource scheduling, and temporary holds.

### Prerequisites

- [Bun](https://bun.sh)
- A running [deltat](https://github.com/open-tap/deltat) instance

### Run

```bash
cd demo
bun install
bun dev      # starts deltat + Next.js dev server
```

The dev script builds and starts deltat automatically if the binary is available.

## License

MIT
