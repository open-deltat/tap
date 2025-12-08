# TAP Federation Specification

**Version:** 0.1.0
**Status:** Draft

TAP Federation defines how TAP servers discover, sync, and coordinate across the network.

---

## TL;DR

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   100M resources in the Western world                  │
│   = 150 GB of data                                     │
│   = One PostgreSQL server                              │
│   = $150 SSD                                           │
│                                                         │
│   Federation is about OWNERSHIP, not SCALE.            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Key Insights

### 1. Scale Is Trivial

| Scope | Resources | Storage | Infrastructure |
|-------|-----------|---------|----------------|
| City (1M pop) | ~50K | <1 GB | Cache on phone |
| Country | ~5M | ~10 GB | Single server |
| Western world | ~100M | ~150 GB | Single cluster |
| + Personal calendars | ~500M | ~750 GB | Small cluster |

**The entire Western world's bookable resources fit on a laptop SSD.**

### 2. Queries Are Local-First

```
User: "Find me a dermatologist tomorrow within 10km"

100,000,000 resources (global)
        │
        ▼ Location filter (cached, instant)
   50,000 resources (city)
        │
        ▼ Category filter (cached, instant)
       30 resources (dermatologists nearby)
        │
        ▼ Schedule filter (cached offers)
       15 resources (open tomorrow)
        │
        ▼ LIVE availability query
      ~150 slots (only this is real-time!)

Cache hit rate: 99.99%
Live data touched: <0.01%
```

### 3. Federation Is for Ownership

```
READS: Centralized (for simplicity)
├── Global index of all resources
├── Cached, replicated, fast
└── Free to query

WRITES: Federated (for ownership)
├── Bookings go to actual provider
├── Provider controls their data
└── Payment goes to provider
```

### 4. Holds Solve Race Conditions

```
Without holds:  User A and User B both click "book" → race condition
With holds:     User A holds → User B sees "held" → no conflict

Holds + WebSocket deltas = near-zero race conditions
```

---

## Architecture

### Single Index Model (Recommended Start)

```
┌─────────────────────────────────────────────────────────┐
│                   TAP GLOBAL INDEX                      │
│              (Central PostgreSQL cluster)               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   tenants        →  Providers (doctors, hotels, etc.)  │
│   resources      →  Bookable things (10-100M rows)     │
│   offers         →  Availability rules                 │
│   holds          →  Temporary reservations             │
│   bookings       →  Confirmed allocations              │
│                                                         │
│   Total size: 50-150 GB                                │
│   Single server: Yes, up to 100M resources             │
│                                                         │
└─────────────────────────────────────────────────────────┘
              │
              │  WebSocket sync
              ▼
┌─────────────────────────────────────────────────────────┐
│                    PROVIDERS                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Dr. Smith    Yoga Studio    Airbnb     Restaurant    │
│       │             │            │            │         │
│       └─────────────┴────────────┴────────────┘         │
│                      │                                  │
│              Push updates to index                      │
│              Receive bookings                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Data Freshness Layers

| Layer | Data | TTL | Strategy |
|-------|------|-----|----------|
| **1. Static** | Location, category | Forever | Cache globally |
| **2. Stable** | Resource metadata | Hours | Cache locally |
| **3. Scheduled** | Offers (open hours) | Minutes | Cache with refresh |
| **4. Live** | Holds, bookings | Real-time | WebSocket deltas |

### Scaling Path

```
STAGE 1: Single Server (0 → 100M resources)
├── One PostgreSQL instance
├── Read replicas for queries
├── Cost: $200-500/month

STAGE 2: Regional (100M → 500M resources)
├── Clusters per region (US, EU, APAC)
├── Cross-region sync
├── Cost: $2-5K/month

STAGE 3: Full Federation (500M+ resources)
├── Provider-hosted nodes (optional)
├── Central index aggregates
├── Hybrid model
```

---

## Access Model

### For Humans (Free)

```
Human → Aggregator (Zocdoc, Google) → TAP Index
                                         │
        Free search ◄────────────────────┘
```

Humans don't pay for queries. Aggregators monetize via:
- Booking fees (5-15%)
- Provider listings
- Ads / promoted results
- Premium features

### For Machines (Metered)

```
AI Agent → TAP API → Pay per query (x402 or subscription)
```

| Access Type | Payment | Use Case |
|-------------|---------|----------|
| Aggregator subscription | $500/month (Stripe) | Zocdoc, Google |
| API access | $0.01/query (x402) | AI agents, developers |
| Provider direct | Free | Own data only |
| Reciprocal | Free | Peer exchange |

### Why x402 for Machines

```
Humans: Can't require wallets (kills adoption)
Machines: Can't use credit cards (no forms, no OAuth)

Solution:
├── Humans pay with Stripe/Apple Pay
└── Machines pay with x402/stablecoins
```

---

## Trust & Security

### Trust Hierarchy

```typescript
interface TrustLevels {
  anonymous: {
    can: ["read"],
    limit: "100 queries/hour",
  },
  session: {
    can: ["read", "hold"],
    limit: "5 concurrent holds",
    holdTTL: "5 minutes",
  },
  verified: {
    can: ["read", "hold", "book"],
    requires: "payment_method",
  },
  provider: {
    can: ["read", "hold", "book", "publish"],
    requires: "identity_verified",
  },
}
```

### Bad Actor Mitigation

| Attack | Mitigation |
|--------|------------|
| Hold spam | Session limits, short TTL, rate limit |
| Fake bookings | Require payment/deposit |
| No-shows | Charge card, reputation system |
| Scraping | Rate limit, auth for bulk |
| Bot attacks | Rate limit, proof-of-work |
| Fake providers | Verification, reviews, escrow |

### Payment as Commitment

```
Hold:    Free (or card auth hold)
Book:    Charge captured
No-show: Charge enforced
Cancel:  Policy-based refund

Payment ensures skin in the game.
```

---

## Sync Protocol

### Provider → Index (Push)

```typescript
// Provider pushes updates
POST /sync/resources
POST /sync/offers
WebSocket /sync-ws  // Real-time

// Events
{
  type: "offer.created" | "offer.updated" | "offer.deleted",
  resourceId: "...",
  data: { ... }
}
```

### Index → Consumers (Push)

```typescript
// Already exists: availability-ws
WebSocket /availability-ws

// Delta events
{
  type: "stream.delta",
  payload: {
    kind: "HoldPlaced" | "HoldReleased" | "BookingConfirmed",
    slotId: "...",
    resourceId: "..."
  }
}
```

### Consistency Model

```
Availability data: Eventually consistent (seconds)
Holds: Strongly consistent (server is authority)
Bookings: Strongly consistent (server is authority)

If stale cache shows "available" but hold fails:
→ UI shows "Slot just taken, please select another"
→ Acceptable UX for rare edge case
```

---

## Discovery

### Well-Known Endpoint

```
GET /.well-known/tap.json

{
  "version": "0.1.0",
  "server_id": "tap-global-index",
  "endpoints": {
    "availability": "/availability",
    "book": "/book",
    "sync": "/sync-ws"
  },
  "coverage": {
    "regions": ["US", "EU", "APAC"],
    "categories": ["healthcare", "fitness", "hospitality", ...]
  },
  "access": {
    "reads": "free",
    "writes": "authenticated",
    "bulk": "subscription"
  }
}
```

### Search API

```typescript
POST /search/availability

{
  "location": {
    "lat": 40.7128,
    "lng": -74.0060,
    "radiusKm": 10
  },
  "category": "dermatologist",
  "from": "2025-01-15T09:00:00Z",
  "to": "2025-01-15T17:00:00Z"
}

// Response
{
  "resources": [
    {
      "id": "res_123",
      "name": "Dr. Smith Dermatology",
      "distance": 2.3,
      "slots": [
        { "slotId": "...", "start": 1234567890, "end": 1234567890 }
      ]
    }
  ]
}
```

---

## Non-Goals

TAP Federation does NOT define:

- **Payment processing** — Use Stripe, x402, or none
- **Identity verification** — Use existing KYC providers
- **Dispute resolution** — Platform-specific
- **Pricing strategies** — Provider decides
- **UI/UX** — Build your own

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  TAP Federation in One Sentence:                       │
│                                                         │
│  "A global index of bookable time that fits on one     │
│   server, with federated writes for ownership."        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  The Hard Problems:                                    │
│  1. Getting providers to publish (adoption)            │
│  2. Payment integration (Stripe for humans)            │
│  3. Bad actor mitigation (verification + deposits)     │
│                                                         │
│  The Easy Problems:                                    │
│  1. Scale (one server handles 100M resources)          │
│  2. Queries (local-first reduces load 99.99%)          │
│  3. Real-time (WebSocket deltas already built)         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

*This specification defines HOW TAP servers federate. See TAP Core for the data model and TAP Protocol for transport bindings.*

