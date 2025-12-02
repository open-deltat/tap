# TAP Architecture: Time as an Asset

TAP (Time Allocation Protocol) treats **time as inventory**—a tradeable asset that can be fungible or non-fungible depending on how you model it.

## The Core Insight

Time slots are like tokens:
- **Fungible**: "A seat in economy" (any seat will do)
- **Non-fungible**: "Seat 12A" (this specific seat)

TAP doesn't care which model you use. It provides the same primitives for both.

## Hierarchical Resources

Resources can contain other resources via `parentId`:

```
Venue (container)
  └── VIP Section (container)
  │     └── Row A (container)
  │           └── Seat A1 (bookable)
  │           └── Seat A2 (bookable)
  │
  └── General Admission (bookable, capacity: 5000)
```

### Rules

1. **Leaf resources are bookable**: Resources with no children
2. **Container resources are for grouping**: Query, organize, cascade offers
3. **Capacity enables fungible booking**: GA with capacity 5000 = 5000 interchangeable spots
4. **Individual resources enable non-fungible**: Each seat is its own resource

### Querying

```
GET /availability?resourceId=seat-a1        → Single seat
GET /availability?resourceId=row-a          → All seats in Row A
GET /availability?resourceId=vip-section    → All VIP seats
GET /availability?resourceId=venue          → Entire venue
```

## Offers: Add-Only Model

Offers define **when** resources are available. They follow an add-only stacking model:

### Inheritance

Child resources inherit all ancestor offers automatically:

```
Venue: Offer 9am-9pm (base hours)
  └── VIP: Offer 8am-9am (early access)     ← ADDS to parent
        └── Seat A1: (inherits 8am-9pm)
        └── Seat A2: Offer 9pm-10pm         ← ADDS more (8am-10pm total)
```

### Stacking Rules

- **No offer = no availability** (not inherited, must be explicit or from ancestor)
- **Offers ADD availability** (union of all applicable offers)
- **No subtraction** (to block, use `disabled` flag or remove resource)

### Why Add-Only?

- No precedence conflicts
- No complex override logic
- Predictable behavior
- Simple implementation

## Capacity vs Hierarchy

| Model | When to Use | Example |
|-------|-------------|---------|
| **Capacity > 1** | Fungible, no identity needed | Yoga class (20 spots) |
| **Many resources** | Non-fungible, identity matters | Concert seats (each unique) |
| **Hybrid** | Mix of both | GA floor + reserved VIP seats |

### Decision Guide

Ask: "Does the customer care WHICH one they get?"
- **No** → Use capacity (one resource, capacity: N)
- **Yes** → Use individual resources (N resources, capacity: 1 each)

## Scale Considerations

TAP supports large resource counts with proper indexing:

| Scale | Resources | Strategy |
|-------|-----------|----------|
| Small | < 100 | Direct queries |
| Medium | 100-10,000 | Index on `parentId` |
| Large | 10,000+ | Hierarchical queries, pagination |

For stadium-scale (50k+ seats):
- Group by section in hierarchy
- Query sections first, drill into seats
- Consider summary endpoints for overview

## Disabling Resources

To block availability without offer subtraction:

```typescript
resource.disabled = true  // This resource (and children) not bookable
```

Simple, explicit, no complex logic.

## Design Principles

### 1. Uniform Interface
Same `/availability`, `/book`, `/hold` work at any hierarchy level.

### 2. Single Concept
Resource is resource—whether leaf (bookable) or container (grouping).

### 3. Minimal Surface
One field (`parentId`) unlocks full hierarchy.

### 4. Composable
Combine fungible + non-fungible in same tree.

### 5. Add-Only Offers
No conflicts, no precedence, no surprises.

## Comparison to Other Systems

| System | Model | TAP Equivalent |
|--------|-------|----------------|
| Airline GDS | Flights with seat maps | Resource hierarchy + capacity |
| Hotel PMS | Room inventory | Resources per room |
| Calendar (ICS) | Single resource | One resource, offers define hours |
| Ticketmaster | Sections + seats | Hierarchy with mixed capacity |

TAP unifies these into one simple model.

## Summary

```
Time = Asset (fungible or non-fungible)
Resource = Container or Bookable
Hierarchy = Simple parentId reference
Offers = Add-only, inherited, stackable
Capacity = For fungible within a resource
```

This is the foundation of TAP: treating time as inventory with a simple, composable model that scales from a single doctor's calendar to a 50,000-seat stadium.

