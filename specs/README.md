# TAP Specifications

## Quick Start

**One-pager:** [`federation/ONE_PAGER.md`](./federation/ONE_PAGER.md)

## Specs

| Spec | What It Defines |
|------|-----------------|
| [`CORE.md`](./CORE.md) | Data model (entities, state machine) |
| [`PROTOCOL.md`](./PROTOCOL.md) | HTTP/WebSocket API bindings |
| [`AUTH.md`](./AUTH.md) | Authentication and authorization |
| [`federation/FEDERATION.md`](./federation/FEDERATION.md) | Network coordination |

## Reference

| Doc | Purpose |
|-----|---------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Hierarchical resource design |
| [`GLOSSARY.md`](./GLOSSARY.md) | Terminology quick reference |

## State Machine

```
OPEN ←→ HELD → BOOKED
```

## Design Principles

1. **Reads are free** — Availability is public
2. **Holds are ephemeral** — Auto-expire, no commitment
3. **Bookings need proof** — Payment or authentication
4. **Real-time sync** — WebSocket for instant updates
5. **Add-only offers** — No conflicts, no precedence rules
