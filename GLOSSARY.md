# TAP Protocol Glossary

A comprehensive guide to all terminology used in the TAP (Time Allocation Protocol) codebase.

## Core Entities

### Tenant
An organization, company, or entity that owns and manages resources. Each tenant has a unique `tenantId` and can have multiple resources. Tenants are the top-level organizational unit in TAP.

**Properties:**
- `id` (TenantId): Unique identifier (ULID)
- `name`: Display name
- `slug`: URL-friendly identifier (min 3 characters)

**Example:** A medical clinic, a co-working space, or a marketplace platform.

---

### Resource
A bookable entity that represents something that can be scheduled. Resources belong to tenants and define the granularity of booking (e.g., a specific room, doctor, stylist, or API endpoint).

**Properties:**
- `id` (ResourceId): Unique identifier (ULID)
- `tenantId`: Owner tenant
- `name`: Display name
- `slug`: URL-friendly identifier
- `timezone`: IANA timezone string (e.g., "America/New_York")
- `slotMinutes`: Granularity of time slots ('5', '10', '15', '30', '60')
- `horizonDays`: How far in advance bookings can be made (default: 90)
- `requiresPayment`: Whether payment is required for bookings
- `metadata`: Optional key-value pairs for custom data

**Example:** "Conference Room A", "Dr. Smith", "Haircut Station 3"

---

### Slot
A contiguous time window that can be booked. Slots are the atomic unit of time allocation in TAP. Each slot has a deterministic `slotId` derived from its start and end times.

**Properties:**
- `slotId`: Unique identifier in format `{ISO_start}_{ISO_end}` (e.g., "2025-11-24T09:00:00.000Z_2025-11-24T10:00:00.000Z")
- `start`: Unix timestamp (milliseconds) for slot start
- `end`: Unix timestamp (milliseconds) for slot end
- `resourceId`: The resource this slot belongs to
- `tenantId`: The tenant that owns the resource

**State:** Slots can be in one of three states:
- **Open**: Available for booking
- **Held**: Temporarily reserved (via Hold)
- **Booked**: Confirmed and allocated (via Booking)

---

### Availability Slot
A slot that is currently available (not held or booked). Returned by availability queries to show what time windows can be booked.

**Note:** In the codebase, `AvailabilitySlot` is used in API responses and frontend components to represent free slots.

---

## Reservations & Bookings

### Hold
A short-lived, exclusive reservation option that temporarily blocks a slot from being booked by others. Holds expire after a set time (typically 5 minutes) and can be released explicitly or automatically on connection close.

**Properties:**
- `id` (HoldId): Unique identifier (ULID)
- `tenantId`: Owner tenant
- `resourceId`: The resource being held
- `startUnix`: Start time (Unix milliseconds)
- `endUnix`: End time (Unix milliseconds)
- `expiresAt`: When the hold expires (Unix milliseconds)
- `clientRef`: Optional client-provided reference
- `sessionId`: WebSocket session that owns this hold

**Lifecycle:**
- Created via WebSocket connection to `/hold-ws`
- Automatically expires after TTL
- Can be explicitly released
- Automatically released on WebSocket disconnect

**Events:**
- `HoldPlaced`: When a hold is successfully created
- `HoldExpired`: When a hold times out
- `HoldReleased`: When a hold is explicitly released

---

### Booking (Order)
A confirmed, permanent allocation of a slot. Bookings are created by converting a Hold (or directly, in rare fast-path cases) and represent a committed reservation.

**Properties:**
- `id` (BookingId): Unique identifier (ULID)
- `tenantId`: Owner tenant
- `resourceId`: The resource being booked
- `holdId`: Optional reference to the hold that was converted
- `start`: Start time (Unix milliseconds)
- `end`: End time (Unix milliseconds)
- `status`: 'CONFIRMED' or 'CANCELLED'
- `paymentStatus`: 'NONE', 'PENDING', or 'PAID'
- `customerName`, `customerEmail`, `customerPhone`: Optional customer information
- `externalRef`: Optional external system reference

**Events:**
- `BookingConfirmed`: When a booking is created
- `BookingCancelled`: When a booking is cancelled

**Note:** In the README, bookings are referred to as "Orders" in the protocol specification, but the codebase uses "Booking" terminology.

---

## Time & Scheduling

### Capacity
The maximum number of concurrent bookings allowed for a single time slot. This enables high-volume resources like flights or concerts to be modeled as a single resource with multiple "seats" per slot.

- **Default:** 1 (Single booking per slot)
- **Varying:** Can vary per offer (e.g., Morning flight has 100 seats, Evening flight has 50)
- **Usage:** Checked against current usage count in the inventory bitmap (Uint16Array). If `usage < capacity`, the slot is available.

---

### Offer
A published availability template that defines when a resource is available. Offers specify recurring patterns (days of week, time ranges), pricing information, and capacity.

**Properties:**
- `id`: Unique identifier (ULID)
- `tenantId`: Owner tenant
- `resourceId`: The resource this offer applies to
- `daysOfWeek`: Array of day numbers (0=Sunday, 6=Saturday)
- `startTime`: Start time string (e.g., "09:00")
- `endTime`: End time string (e.g., "17:00")
- `priceCents`: Optional price in cents
- `currency`: Currency code (default: 'USD')
- `capacity`: Maximum concurrent bookings (default: 1)

**Purpose:** Offers define the base availability pattern for a resource. The availability calculator uses offers to determine which slots are available and checks usage against the offer's capacity.

---

### Availability
The set of time slots that are currently available (not held or booked) for a given resource within a time range. Availability is calculated by:
1. Starting with slots defined by Offers
2. Subtracting slots that are Held
3. Subtracting slots that are Booked

**Query:** Availability is requested via `POST /availability` with:
- `tenantId`, `resourceId`
- `from`, `to`: Time range (Unix timestamps)
- `slotDurationMs`: Optional slot duration override

**Response:** Returns `freeSlots` array with available time windows.

---

### Resource Availability
The availability of a specific resource. This is what clients query to see what time slots can be booked for a particular resource.

**Distinction:**
- **Availability** (general): The concept of free time
- **Resource Availability**: Availability for a specific resource
- **Schedule**: Not used in current codebase (may refer to recurring patterns, which are handled by Offers)
- **Template**: Not used in current codebase (Offers serve this purpose)

---

## State & Events

### Ledger
The append-only event log that records all state transitions in the TAP system. The ledger is the source of truth for all changes to slots, holds, and bookings.

**Structure:** Ordered sequence of `LedgerEvent` records, each with:
- `eventId`: Unique identifier (ULID, used for ordering)
- `tenantId`, `resourceId`: Scope
- `type`: Event type
- `version`: Protocol version (currently 1)
- `createdAt`: Timestamp
- `payload`: Event-specific data

**Purpose:**
- Enables event sourcing and replay
- Provides audit trail
- Supports distributed synchronization

---

### Ledger Event
A single entry in the ledger representing a state transition. Events are immutable and append-only.

**Event Types:**
- `ResourceCreated`: A new resource was created
- `HoldPlaced`: A hold was created
- `HoldExpired`: A hold timed out
- `HoldReleased`: A hold was explicitly released
- `BookingConfirmed`: A booking was created
- `BookingCancelled`: A booking was cancelled

**Properties:**
- All events share base properties (eventId, tenantId, resourceId, version, createdAt)
- Each event type has specific payload fields

---

### Event Log
The chronological record of all ledger events. In the UI, this is displayed as the "Live Protocol Stream" showing real-time events.

**Note:** "Event Log" in the UI context refers to the visual display of events, while "Ledger" refers to the underlying data structure.

---

### Inventory
The internal state tracking which time slots are held or booked. The inventory uses a bitmap data structure for efficient storage and querying.

**Structure:** `InventoryState` is a `Map<DayKey, BitmapDay>` where:
- `DayKey`: Date string in format "YYYY-MM-DD"
- `BitmapDay`: Bitmap tracking minute-by-minute availability for that day

**Purpose:**
- Fast availability calculations
- Efficient storage of slot states
- Used by availability calculator to determine free slots

---

### Inventory State
The current snapshot of which slots are held/booked for a tenant+resource combination. Reconstructed by replaying ledger events.

**Access:** Via `getState(tenantId, resourceId)` which returns the bitmap state for that resource.

---

## Infrastructure & Data Structures

### Bitmap
A space-efficient data structure used to track minute-by-minute availability within a day. Each day has a bitmap where each bit represents a minute (0-1439 minutes per day).

**Operations:**
- `setBitRange`: Mark a range of minutes as held/booked
- `getBit`: Check if a specific minute is available
- `subtractRange`: Remove a time range (make unavailable)
- `addRange`: Add a time range (make available)

**Purpose:** Enables efficient storage and querying of availability without storing individual slot records.

---

### BitmapDay
The bitmap data structure for a single day, containing:
- `available`: Bitmap of free minutes
- `held`: Bitmap of held minutes
- `booked`: Bitmap of booked minutes

---

### DayKey
A string identifier for a specific day in format "YYYY-MM-DD" (e.g., "2025-11-24"). Used as keys in the `InventoryState` map.

**Note:** DayKeys are in UTC to ensure consistency across timezones.

---

### Session
A WebSocket connection session that can own holds. When a client connects to `/hold-ws`, a session is created and can place holds. All holds from a session are automatically released when the session disconnects.

**Properties:**
- `sessionId`: Unique identifier (format: `session_{UUID}`)
- Associated with WebSocket connection
- Can own multiple holds

**Purpose:**
- Groups related holds together
- Enables bulk release on disconnect
- Provides session-scoped hold management

---

### Cursor
A position marker in the event stream (ledger). Used to track which events have been processed and to enable incremental synchronization.

**Format:** EventId (ULID string)

**Usage:**
- Clients track their cursor to know which events they've seen
- Used in `getAfterCursor` queries to fetch only new events
- Enables efficient event streaming without replaying entire history

---

### Snapshot
A point-in-time view of availability state. Snapshots contain:
- `slots`: Array of available time ranges
- `cursor`: The event ID this snapshot is based on

**Purpose:**
- Provides initial state for clients
- Enables fast startup without replaying all events
- Used by `AvailabilityStore` for client-side state management

---

## Protocol & Communication

### Delta
A change notification in availability. Deltas are sent via WebSocket to notify clients when slots become available or unavailable.

**Types:**
- `HoldPlaced`: Slot became unavailable (held)
- `HoldReleased`: Slot became available (hold released)
- `HoldExpired`: Slot became available (hold expired)
- `BookingConfirmed`: Slot became unavailable (booked)
- `BookingCancelled`: Slot became available (booking cancelled)

**Format:** `AvailabilityDeltaPayload` with:
- `kind`: Delta type
- `slotId`, `resourceId`, `tenantId`
- `startUnix`, `endUnix`: Time range
- `holdId` or `bookingId`: Optional reference

---

### Stream
A WebSocket connection that delivers real-time availability deltas. Clients subscribe to a stream for a specific tenant+resource combination.

**Endpoint:** `/availability-ws`

**Messages:**
- `stream.subscribe`: Client subscribes to a tenant+resource
- `stream.hello`: Server acknowledges subscription
- `stream.delta`: Server sends availability change
- `stream.error`: Server sends error

**Topic:** `availability:{tenantId}:{resourceId}` - Used for pub/sub distribution

---

### Availability Store
A client-side state management class that maintains the current availability state by applying ledger events. Used in the frontend to track which slots are available.

**Operations:**
- `setSnapshot`: Initialize with snapshot
- `applyEvent`: Apply a ledger event to update state
- `getSnapshot`: Get current availability state

**Purpose:**
- Maintains client-side availability state
- Applies deltas to keep state synchronized
- Provides efficient slot availability queries

---

## Identifiers

### TenantId
A branded string type representing a unique tenant identifier. Format: ULID.

**Type:** `string & { __brand: 'TenantId' }`

---

### ResourceId
A branded string type representing a unique resource identifier. Format: ULID.

**Type:** `string & { __brand: 'ResourceId' }`

---

### SlotId
A unique identifier for a time slot. Format: `{ISO_start}_{ISO_end}` where both timestamps are in ISO 8601 format.

**Example:** `"2025-11-24T09:00:00.000Z_2025-11-24T10:00:00.000Z"`

**Type:** `string & { __brand: 'SlotId' }`

**Deterministic:** The same time range always produces the same SlotId.

---

### HoldId
A branded string type representing a unique hold identifier. Format: ULID.

**Type:** `string & { __brand: 'HoldId' }`

---

### BookingId
A branded string type representing a unique booking identifier. Format: ULID.

**Type:** `string & { __brand: 'BookingId' }`

**Note:** Also referred to as "OrderId" in protocol spec, but codebase uses "BookingId".

---

### EventId
A unique identifier for a ledger event. Format: ULID. Used for ordering and as cursor position.

**Type:** `string & { __brand: 'EventId' }` (implicitly, via ULIDSchema)

---

### SessionId
A unique identifier for a WebSocket session. Format: `session_{UUID}`.

**Type:** `string & { __brand: 'SessionId' }`

---

## Time Representation

### Unix Timestamp (milliseconds)
The standard time representation in TAP. All times are stored and transmitted as Unix timestamps in milliseconds (number of milliseconds since 1970-01-01 00:00:00 UTC).

**Rationale:**
- Consistent across timezones
- Supports multi-day ranges
- Efficient for calculations
- Language-agnostic

**Fields using Unix timestamps:**
- `startUnix`, `endUnix`: Slot/hold/booking time ranges
- `expiresAt`: Hold expiration time
- `createdAt`: Creation timestamps
- `start`, `end`: Booking time ranges

**Note:** Previously used day/minute-based representation, but migrated to Unix timestamps for consistency and multi-day support.

---

## State Machine

### Slot State Transitions

```
Open (available)
  ↓ [HoldPlaced]
Held (temporarily reserved, expires after TTL)
  ↓ [HoldExpired | HoldReleased]
Open
  ↓ [BookingConfirmed]
Booked (permanently allocated)
  ↓ [BookingCancelled]
Open (or Closed, depending on policy)
```

**Fast Path:**
```
Open → [BookingConfirmed] → Booked
```
(Rare direct booking without hold)

---

## Terminology Clarifications

### Availability vs Resource Availability
- **Availability**: The general concept of free time slots
- **Resource Availability**: Availability specifically for a given resource (what you query)

### Schedule vs Template vs Offer
- **Schedule**: Not used in current codebase
- **Template**: Not used in current codebase
- **Offer**: The actual mechanism for defining recurring availability patterns

### Booking vs Order
- **Booking**: Term used in codebase
- **Order**: Term used in protocol specification (README)
- **Same concept**: Both refer to confirmed, permanent slot allocation

### Ledger vs Event Log
- **Ledger**: The underlying append-only data structure
- **Event Log**: The UI display of events (visual representation)
- **Ledger Events**: Individual entries in the ledger

### Slot vs Availability Slot
- **Slot**: Any time window (can be open, held, or booked)
- **Availability Slot**: A slot that is currently available (open state)

### Inventory vs Inventory State
- **Inventory**: The general concept of tracking slot states
- **Inventory State**: The specific bitmap data structure for a tenant+resource

---

## Related Concepts

### Timezone
Resources have an associated timezone (IANA string) that determines how time slots are interpreted. Slots are stored in UTC but displayed in the resource's timezone.

**Example:** A resource in "America/New_York" with a slot at 09:00 local time is stored as 14:00 UTC (during standard time).

### Slot Duration
The granularity of time slots for a resource. Defined by `slotMinutes` ('5', '10', '15', '30', '60'). Can be overridden in availability queries via `slotDurationMs`.

### Horizon
The `horizonDays` property of a resource defines how far in advance bookings can be made (default: 90 days).

### Client Reference
Optional string (`clientRef`) that clients can attach to holds/bookings for their own tracking purposes. Not used by the protocol but preserved for client convenience.

