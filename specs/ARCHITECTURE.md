# TAP Architecture

TAP treats **time as inventory** through hierarchical resources.

## Core Insight

```
Time slots are like tokens:
├── Fungible:     "Any yoga class spot" → N identical leaf resources
└── Non-fungible: "Seat 12A specifically" → Unique leaf resource
```

## Hierarchical Resources

Resources form a tree via `parentId`:

```
Venue (container)
  └── VIP Section (container)
  │     └── Seat A1 (bookable leaf)
  │     └── Seat A2 (bookable leaf)
  └── General Admission (container)
        └── ga-spot-1 (bookable leaf)
        └── ga-spot-2 (bookable leaf)
```

**Rules:**
1. Leaf resources are bookable (no children)
2. Container resources are for grouping
3. Each leaf = one bookable unit

## Add-Only Offers

Offers define **when** resources are available:

```
Venue: Offer 9am-9pm (base hours)
  └── VIP: Offer 8am-9am (early access) ← ADDS to parent
        └── Seat A1: inherits 8am-9pm
```

**Rules:**
- No offer = no availability
- Offers ADD (never subtract)
- Children inherit ancestor offers
- To block: use `disabled` flag

## Modeling Guide

| Scenario | Strategy |
|----------|----------|
| Single calendar | One leaf resource |
| Fungible (yoga spots) | N identical leaves under container |
| Non-fungible (seats) | Uniquely named leaves |
| Hierarchical | Nested containers + leaves |

**Ask:** "Does customer need to know WHICH one?"
- No → Fungible (identical leaves)
- Yes → Non-fungible (unique leaves)

## Scale

| Scale | Resources | Strategy |
|-------|-----------|----------|
| Small | < 1K | Direct queries |
| Medium | 1K-100K | Index on parentId |
| Large | 100K-10M | Hierarchy queries, pagination |
| Global | 10M-100M | Single Postgres cluster |

See [FEDERATION.md](./specs/federation/FEDERATION.md) for global scale architecture.

## Design Principles

1. **Uniform interface** — Same API works at any hierarchy level
2. **Leaf-only booking** — All bookings are 1:1 with leaf resources
3. **Add-only offers** — No conflicts, no precedence, no surprises
4. **Minimal surface** — One field (`parentId`) enables full hierarchy
