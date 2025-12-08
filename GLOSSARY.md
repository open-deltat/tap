# TAP Glossary

Quick reference for TAP terminology.

## Core Entities

| Term | Description |
|------|-------------|
| **Tenant** | Organization that owns resources (clinic, venue, marketplace) |
| **Resource** | Bookable entity with optional hierarchy via `parentId` |
| **Offer** | Defines when a resource is available (weekly or date range) |
| **Slot** | Contiguous time window with deterministic `slotId` |
| **Hold** | Temporary reservation (5 min TTL, auto-releases) |
| **Booking** | Confirmed, permanent allocation |

## Resource Types

| Type | Description | Example |
|------|-------------|---------|
| **Container** | Has children, used for grouping | Venue, Section |
| **Leaf** | No children, bookable | Seat, Room, Doctor |
| **Fungible** | Interchangeable units | Yoga class spots |
| **Non-fungible** | Unique identity | Specific seat "A14" |

## State Machine

```
OPEN  ──hold──▶  HELD  ──book──▶  BOOKED
  ▲                │                  │
  └───expire───────┘                  │
  └──────────cancel───────────────────┘
```

| Event | Transition |
|-------|------------|
| HoldPlaced | OPEN → HELD |
| HoldExpired | HELD → OPEN |
| HoldReleased | HELD → OPEN |
| BookingConfirmed | HELD → BOOKED |
| BookingCancelled | BOOKED → OPEN |

## Identifiers

| ID | Format | Example |
|----|--------|---------|
| TenantId | ULID | `01AN4Z07BY79KA1307SR9X4MV3` |
| ResourceId | ULID | `01AN4Z07BY79KA1307SR9X4MV3` |
| SlotId | `{ISO_start}_{ISO_end}` | `2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z` |
| HoldId | ULID | `01AN4Z07BY79KA1307SR9X4MV3` |
| BookingId | ULID | `01AN4Z07BY79KA1307SR9X4MV3` |
| SessionId | `sess_{ULID}` | `sess_01AN4Z07BY79KA1307SR9X4MV3` |

## Time Representation

All times are **Unix milliseconds** (UTC):

```typescript
startUnix: 1736931600000  // 2025-01-15T09:00:00.000Z
endUnix:   1736935200000  // 2025-01-15T10:00:00.000Z
```

## Offer Types

| Type | Config | Use Case |
|------|--------|----------|
| **weekly** | `daysOfWeek`, `startTime`, `endTime` | Recurring schedule |
| **range** | `start`, `end` (ISO dates) | One-time availability |

## Add-Only Model

Offers only ADD availability:

```
Parent: 9am-5pm
Child:  +8am-9am (early access)
Result: 8am-5pm for child
```

To block availability: use `resource.disabled = true`

## WebSocket Streams

| Endpoint | Purpose |
|----------|---------|
| `/hold-ws` | Place and manage holds |
| `/availability-ws` | Real-time availability updates |

## Events

All state changes emit events (broadcast via WebSocket):

```typescript
{
  eventId: "01AN4Z...",      // ULID (sortable)
  tenantId: "...",
  resourceId: "...",
  type: "HoldPlaced",
  payload: { holdId, start, end, expiresAt },
  createdAt: 1736931600000
}
```

## Key Properties

| Property | Description |
|----------|-------------|
| `parentId` | Links resource to parent (hierarchy) |
| `slotMinutes` | Slot granularity: 5, 10, 15, 30, 60 |
| `horizonDays` | How far ahead bookings allowed (default: 90) |
| `disabled` | If true, resource not bookable |
| `clientRef` | Client-provided reference for idempotency |
| `bufferBeforeMinutes` | Prep time blocked before bookings |
| `bufferAfterMinutes` | Cleanup time blocked after bookings |
