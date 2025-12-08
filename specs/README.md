# TAP Specifications

**Start here:** [ONE_PAGER.md](./federation/ONE_PAGER.md) — TAP in one page.

---

## Specs Overview

| Spec | Defines | Concerns |
|------|---------|----------|
| [**CORE.md**](./CORE.md) | Data model | What exists |
| [**PROTOCOL.md**](./PROTOCOL.md) | HTTP/WS API | How to communicate |
| [**AUTH.md**](./AUTH.md) | Authentication | Who can do what |
| [**FEDERATION.md**](./federation/FEDERATION.md) | Network coordination | How servers sync |

---

## Core (The What)

Entities and rules:

```
Tenant
  └── Resource (tree via parentId)
        └── Offer (inherited, additive)
        └── Hold (temporary)
        └── Booking (permanent)
```

State machine:

```
OPEN ←→ HELD → BOOKED
```

---

## Protocol (The How)

Transport bindings:

```
HTTP:  /availability, /book, /cancel, /health
WS:    /hold-ws, /availability-ws
```

---

## Federation (The Scale)

```
100M resources = 150 GB = One server

Federation is about OWNERSHIP, not SCALE.
Reads: Centralized index
Writes: Federated to providers
```

---

## Design Principles

1. **Separate concerns** — Core is abstract, Protocol is concrete
2. **Minimal surface** — Few entities, few endpoints
3. **Add-only offers** — No subtraction, no conflicts
4. **Real-time sync** — WebSocket deltas for instant updates
5. **Hierarchy is optional** — Single resource works, tree scales
6. **Local-first queries** — 99.99% cache hits
7. **Holds solve races** — No distributed locks needed

---

## Key Insights

| Assumption | Reality |
|------------|---------|
| "We need big data infra" | 150 GB for Western world |
| "We need complex federation" | One Postgres cluster |
| "We need micropayments for queries" | Queries are free |
| "We need wallets for everyone" | Only machines need x402 |

---

## Future Specs

| Spec | Purpose | Status |
|------|---------|--------|
| SYNC.md | Offline-first reconciliation | Planned |
| PAYMENTS.md | Stripe/x402 integration | Planned |
