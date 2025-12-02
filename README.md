# TAP (Time Allocation Protocol)

A federated booking protocol for real-time availability and bookings across untrusted parties. TAP treats time as inventory, enabling real-time discovery, holds, and confirmations in a distributed system with multiple sources of truth.

## Specifications

| Spec | Description |
|------|-------------|
| [**specs/CORE.md**](./specs/CORE.md) | Data model — entities, state machine, events |
| [**specs/PROTOCOL.md**](./specs/PROTOCOL.md) | Transport — HTTP/WebSocket API bindings |
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Design philosophy — hierarchy, offers, scale |
| [**GLOSSARY.md**](./GLOSSARY.md) | Terminology reference |

## Problem

Multi-tenant, multi-platform scheduling creates a distributed system with multiple sources of truth (Google/Microsoft, vertical SaaS, marketplaces, in-house tools). Today's status quo includes:

- Walled-garden APIs (Google/Microsoft)
- Legacy .ics polling (high latency, race conditions)
- Human fallbacks (phone/fax/desk)

TAP provides a neutral, open protocol for availability and bookings that enables real-time discovery, holds, and confirmations across untrusted parties.

## Core Principles

- **Safety over liveness** at confirmation boundary: no double-books
- **Best-effort freshness** everywhere else: eventual consistency with explicit conflict semantics
- **Low-PII by default**, GDPR-aware; tenants can run sovereign nodes
- **Backward-compat bridges** to .ics/CalDAV with clear degradation rules

## Architecture

> **Deep Dive:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete design philosophy, including hierarchical resources and the add-only offer model.

### Core Domain Model

- **Tenant**: Organization that owns resources (clinic, venue, airline)
- **Resource**: Bookable entity with optional hierarchy (room, doctor, seat) — can contain child resources via `parentId`
- **Slot**: Contiguous time window with deterministic slotId
- **Offer**: Defines when a resource is available — inherited by children, stackable, add-only
- **Hold**: Short-lived, exclusive reservation option
- **Booking**: Confirmed allocation with payment/attestation references
- **LedgerEvent**: Append-only events for state transitions
- **Capacity**: How many concurrent bookings per slot (1 for unique items, N for fungible)

### State Machine (Slot-scoped)

```
Open → (HoldPlaced) → Held (ttl)
Held → (HoldExpired|HoldReleased) → Open
Held → (OrderConfirmed) → Booked
Open → (OrderConfirmed – rare fast-path) → Booked
Booked → (OrderCancelled[policy]) → Open or Closed
```

### Transport & Topology

- **HTTPS JSON APIs** for baseline interoperability
- **Event distribution**: Webhooks + Server-Sent Events (SSE) for near-real-time availability deltas
- **Outbox pattern** at each node for reliable event delivery
- **Discovery**: `/.well-known/timebook.json` advertises endpoints and capabilities

## Message Verbs

- `PUBLISH /offers`: Provider advertises Offers
- `SUBSCRIBE /events`: SSE stream of LedgerEvents
- `HOLD /slots/{slotId}`: Request/renew/release a Hold
- `CONFIRM /orders`: Promote Hold → Order with payment references
- `CANCEL /orders/{orderId}`: Cancel per policy
- `QUERY /availability`: Range queries with filters
- `HEALTH /status`: Liveness, clock skew hints, version

## Security & Trust

- **mTLS** between servers for inter-org links
- **OAuth2 client-credentials** for public-internet actors
- **JWS-signed events** for integrity and non-repudiation
- **Replay protection** with nonce + event timestamps
- **PII minimization** with contactToken resolution

## Installation

```bash
bun install
```

## Development

```bash
# Build all packages
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck

# Linting and formatting
bun run lint
bun run format

# Development mode with watch
bun run dev
```

## Project Structure

```
tap/
├── packages/
│   └── core/          # Core TAP protocol implementation
├── turbo.json         # Turborepo configuration
├── tsconfig.json      # Central TypeScript configuration
├── biome.json         # Central linting/formatting configuration
└── package.json       # Monorepo workspace configuration
```

## License

MIT