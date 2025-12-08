# TAP Core Specification

**Version:** 0.1.0
**Status:** Draft

TAP Core defines the data model for time-slot allocation. It is transport-agnostic.

---

## Entities

### Tenant

An owner of resources.

```
Tenant {
  id: string (unique)
}
```

### Resource

A bookable entity. Resources form a tree via `parentId`.

```
Resource {
  id: string (unique)
  tenantId: string
  parentId: string | null
  timezone: string (IANA)
  slotMinutes: 5 | 10 | 15 | 30 | 60
  disabled: boolean
}
```

**Rules:**
- Leaf resources (no children) are bookable
- Container resources (have children) are for grouping
- `disabled` resources and their descendants are not bookable

### Offer

Defines when a resource is available. Offers are inherited and additive.

```
Offer {
  id: string (unique)
  tenantId: string
  resourceId: string
  type: "weekly" | "range"
  config: WeeklyConfig | RangeConfig
  bufferBeforeMinutes: integer (default: 0)
  bufferAfterMinutes: integer (default: 0)
}

WeeklyConfig {
  daysOfWeek: integer[] (0-6, Sunday = 0)
  startTime: string (HH:MM)
  endTime: string (HH:MM)
}

RangeConfig {
  start: string (ISO 8601)
  end: string (ISO 8601)
}
```

**Rules:**
- No offers = no availability
- Offers ADD availability (never subtract)
- Children inherit ancestor offers
- Multiple offers stack (union)

**Buffer Time:**
- `bufferBeforeMinutes`: Time blocked before a booking (prep time)
- `bufferAfterMinutes`: Time blocked after a booking (cleanup/travel)
- Buffer expands the blocked interval when calculating availability
- Max buffer from all offers is used when multiple offers apply

### Hold

A temporary, exclusive reservation.

```
Hold {
  id: string (unique)
  tenantId: string
  resourceId: string
  start: integer (unix ms)
  end: integer (unix ms)
  expiresAt: integer (unix ms)
}
```

**Rules:**
- Holds expire automatically
- Holds block availability
- One hold per slot per session

### Booking

A confirmed allocation.

```
Booking {
  id: string (unique)
  tenantId: string
  resourceId: string
  start: integer (unix ms)
  end: integer (unix ms)
  status: "CONFIRMED" | "CANCELLED"
}
```

---

## Slot

A contiguous time window. Slots are derived, not stored.

```
Slot {
  id: string ({ISO_start}_{ISO_end})
  resourceId: string
  start: integer (unix ms)
  end: integer (unix ms)
}
```

**Slot ID is deterministic:** Same time range = same ID.

---

## State Machine

Slots have three states:

```
OPEN → HELD → BOOKED
       ↓
      OPEN (expired/released)
```

Transitions:

| From | Event | To |
|------|-------|----|
| OPEN | HoldPlaced | HELD |
| HELD | HoldExpired | OPEN |
| HELD | HoldReleased | OPEN |
| HELD | BookingConfirmed | BOOKED |
| OPEN | BookingConfirmed | BOOKED (fast path) |
| BOOKED | BookingCancelled | OPEN |

---

## Events

All state changes emit events. Events are append-only.

```
Event {
  id: string (unique, sortable)
  tenantId: string
  resourceId: string
  type: EventType
  payload: object
  createdAt: integer (unix ms)
}
```

**Event Types:**

| Type | Payload |
|------|---------|
| HoldPlaced | { holdId, start, end, expiresAt } |
| HoldExpired | { holdId } |
| HoldReleased | { holdId } |
| BookingConfirmed | { bookingId, start, end } |
| BookingCancelled | { bookingId } |

---

## Availability Calculation

```
availability(resource, timeRange) =
  offers(resource, timeRange)
  − expand(holds(resource, timeRange), buffer)
  − expand(bookings(resource, timeRange), buffer)
```

Where:
- `offers` = union of all applicable offers (self + ancestors)
- `holds` = active holds on this resource
- `bookings` = confirmed bookings on this resource
- `buffer` = max(bufferBeforeMinutes, bufferAfterMinutes) from offers
- `expand(intervals, buffer)` = extend each interval by buffer time

---

## Hierarchy Rules

1. **Inheritance:** Children inherit all ancestor offers
2. **Querying:** Query a container = query all descendants
3. **Booking:** Only leaf resources are bookable
4. **Disabling:** `disabled` cascades to all descendants

---

## Constraints

- Slot duration must align with `slotMinutes`
- Hold TTL is implementation-defined (recommended: 5 minutes)
- Event IDs must be sortable (ULID recommended)
- Times are always UTC (unix milliseconds)

---

## Non-Goals

TAP Core does NOT define:
- Transport (HTTP, WebSocket, etc.)
- Authentication
- Payment processing
- UI/UX concerns
- Pricing logic beyond `priceCents` storage

---

*This specification defines WHAT, not HOW. See TAP Protocol for transport bindings.*

