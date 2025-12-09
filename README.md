# TAP — Time Allocation Protocol

**The TCP/IP of Time**

An open protocol for allocating time across distributed systems.

```
OPEN  ───hold───▶  HELD  ───book───▶  BOOKED
  ▲                  │                    │
  └────expire────────┘                    │
  └──────────────cancel───────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| [`@tap/protocol`](./packages/protocol) | Zod schemas, types, constants |
| [`@tap/core`](./packages/core) | Business logic, availability calculation |
| [`@tap/client`](./packages/client) | Browser/Node.js SDK |

## Quick Start

```bash
# Install
bun install

# Development
bun run dev          # Start API + App
bun run dev:api      # API only (port 3000)
bun run dev:app      # App only (port 3001)

# Test
bun run test

# Build
bun run build
```

## Protocol

```http
POST /availability    # Query open slots
POST /book           # Confirm booking
POST /cancel         # Cancel booking
WS   /hold-ws        # Place/release holds
WS   /availability-ws # Real-time updates
```

## Data Model

```
Tenant
  └── Resource (bookable thing)
        └── Offer (when it's available)
              └── Slot → Hold → Booking
```

## Specs

- [`specs/CORE.md`](./specs/CORE.md) — Data model
- [`specs/PROTOCOL.md`](./specs/PROTOCOL.md) — HTTP/WebSocket API
- [`specs/AUTH.md`](./specs/AUTH.md) — Authentication
- [`specs/federation/`](./specs/federation/) — Network coordination

## License

MIT
