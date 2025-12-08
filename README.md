# TAP: Time Allocation Protocol

**Version 0.1.0 · Draft**

TAP is an open protocol for allocating time across distributed systems.

---

## Abstract

TAP defines three primitives for time allocation:

1. **Availability** — Query open time slots
2. **Hold** — Temporarily reserve a slot
3. **Booking** — Permanently confirm a slot

These primitives enable real-time coordination of bookable resources (calendars, rooms, seats, appointments) across untrusted parties without a central authority.

---

## State Machine

```
OPEN  ───hold───▶  HELD  ───book───▶  BOOKED
  ▲                  │                    │
  └────expire────────┘                    │
  └──────────────cancel───────────────────┘
```

---

## Protocol

### Query Availability

```http
POST /availability
Content-Type: application/json

{ "resourceId": "...", "from": "2025-01-15T00:00:00Z", "to": "2025-01-16T00:00:00Z" }
```

### Place Hold

```http
WebSocket /hold-ws?resourceId=...&slotId=...
← { "type": "hold.confirmed", "holdId": "...", "expiresAt": 1736931600000 }
```

### Confirm Booking

```http
POST /book
Content-Type: application/json

{ "resourceId": "...", "holdId": "...", "slotId": "..." }
```

---

## Data Model

```
Tenant
  └── Resource (bookable thing)
        └── Offer (when it's available)
              └── Slot → Hold → Booking
```

---

## Design Principles

1. **Reads are free** — Availability is public
2. **Holds are ephemeral** — Auto-expire, no commitment required
3. **Bookings need proof** — Payment, signature, or policy
4. **Real-time sync** — WebSocket deltas for instant updates

---

## Scale

```
100 million resources = 150 GB = One PostgreSQL server
```

TAP is not a big data problem. It's a coordination problem.

---

## What TAP Defines

- ✅ Availability queries
- ✅ Hold/release mechanics
- ✅ Booking confirmation
- ✅ Real-time sync (WebSocket)
- ✅ Event format

## What TAP Does Not Define

- ❌ Authentication (bring your own)
- ❌ Payment rails (Stripe, x402, or free)
- ❌ UI/UX
- ❌ Pricing

---

## Links

| Document | Description |
|----------|-------------|
| [CORE.md](./specs/CORE.md) | Data model specification |
| [PROTOCOL.md](./specs/PROTOCOL.md) | HTTP/WebSocket bindings |
| [FEDERATION.md](./specs/federation/FEDERATION.md) | Network coordination |

---

## License

MIT
