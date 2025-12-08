# TAP: Time Allocation Protocol

**The TCP/IP of Time**

---

## One Page. Three Primitives. Universal Time.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    OPEN  ───hold───▶  HELD  ───book───▶  BOOKED        │
│      ▲                  │                    │          │
│      └────expire────────┘                    │          │
│      └──────────────cancel───────────────────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Three Operations

| Operation | What It Does | Auth Required |
|-----------|--------------|---------------|
| **Availability** | Query open slots | None |
| **Hold** | Temporarily reserve | Session |
| **Book** | Confirm allocation | Payment/Proof |

---

## Data Model

```
Tenant (owner)
  └── Resource (bookable thing)
        └── Offer (when it's available)
              └── Slot (specific time window)
                    └── Hold → Booking
```

---

## Core Guarantees

1. **Reads are free** — Availability is public
2. **Holds are ephemeral** — Auto-expire, no commitment
3. **Bookings need proof** — Payment, signature, or policy
4. **Events are truth** — Append-only, auditable

---

## Scale Reality

```
Western world resources:  ~100 million
Storage required:         ~150 GB
Infrastructure:           One PostgreSQL server
Cost:                     $150 SSD

This is not big data. This is a coordination problem.
```

---

## What TAP Defines

- ✅ How to query availability
- ✅ How to hold time slots
- ✅ How to confirm bookings
- ✅ Event format for sync

## What TAP Doesn't Define

- ❌ Authentication (use yours)
- ❌ Payment rails (Stripe, x402, free)
- ❌ UI/UX (build yours)
- ❌ Pricing (provider decides)

---

## Why TAP?

**Today:** Every booking system is a silo.

```
Calendly ←✗→ Airbnb ←✗→ OpenTable ←✗→ Zocdoc
```

**With TAP:** Universal protocol, any client.

```
Any Client ←→ TAP ←→ Any Provider
```

---

## The Bet

```
Email:    SMTP (1982) → Universal
Web:      HTTP (1991) → Universal
Payments: x402 (2024) → Maybe universal

Time:     TAP (2025)  → ?
```

**If time is the next universal primitive, TAP is how it moves.**

---

*Full specs: CORE.md | PROTOCOL.md | FEDERATION.md*

