# TAP Architecture: Time as an Asset

TAP (Time Allocation Protocol) treats **time as inventory**—a tradeable asset modeled through hierarchical resources.

## The Core Insight

Time slots are like tokens:
- **Fungible**: "A yoga class spot" (any spot will do) → Model as N identical leaf resources
- **Non-fungible**: "Seat 12A" (this specific seat) → Model as unique leaf resource

TAP uses the same primitive—**leaf resources**—for both models.

## Hierarchical Resources

Resources can contain other resources via `parentId`:

```
Venue (container)
  └── VIP Section (container)
  │     └── Row A (container)
  │           └── Seat A1 (bookable leaf)
  │           └── Seat A2 (bookable leaf)
  │
  └── General Admission (container)
        └── ga-spot-1 (bookable leaf)
        └── ga-spot-2 (bookable leaf)
        └── ... (5000 spots)
```

### Rules

1. **Leaf resources are bookable**: Resources with no children
2. **Container resources are for grouping**: Query, organize, cascade offers
3. **Each leaf = one bookable unit**: No capacity > 1, just more resources

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

## Modeling Strategies

| Scenario | Strategy | Example |
|----------|----------|---------|
| **Single resource** | One leaf | Doctor's calendar |
| **Fungible inventory** | N identical leaves under container | 20 yoga class spots |
| **Non-fungible inventory** | Unique leaves | Specific concert seats |
| **Hierarchical** | Nested containers + leaves | Venue → Section → Row → Seat |

### Decision Guide

Ask: "Does the customer need to know WHICH one they got?"
- **No** → Create N identical leaf resources (fungible)
- **Yes** → Create uniquely named leaf resources (non-fungible)

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

### 4. Leaf-Only Booking
All bookable units are leaf resources. Simple, trackable, no hidden capacity.

### 5. Add-Only Offers
No conflicts, no precedence, no surprises.

## Comparison to Other Systems

| System | Model | TAP Equivalent |
|--------|-------|----------------|
| Airline GDS | Flights with seat maps | Resource hierarchy |
| Hotel PMS | Room inventory | Resources per room |
| Calendar (ICS) | Single resource | One leaf resource |
| Ticketmaster | Sections + seats | Hierarchical leaves |

TAP unifies these into one simple model.

## Summary

```
Time = Asset (modeled through resources)
Resource = Container or Leaf
Leaf = Bookable unit (always 1:1)
Hierarchy = Simple parentId reference
Offers = Add-only, inherited, stackable
```

This is the foundation of TAP: treating time as inventory with a simple, composable model that scales from a single doctor's calendar to a 50,000-seat stadium.
