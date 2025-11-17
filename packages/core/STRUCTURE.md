# TAP Core Structure

## Architecture Overview

The codebase is organized into three main layers following clean architecture principles:

```
src/
├── domain/          # Pure domain models (no dependencies)
├── infrastructure/   # Low-level utilities and implementations
└── application/     # Application logic and use cases
```

## Directory Structure

### Domain Layer (`domain/`)
Pure domain models with no external dependencies.

- **`ids.ts`** - ID types and ULID validation
  - `ULIDSchema` - Zod schema for ULID validation
  - Branded types: `TenantId`, `ResourceId`, `BookingId`, `HoldId`, `EventId`
  - Utility types: `DayKey`, `Minute`

- **`schemas.ts`** - Domain entity schemas
  - `TenantSchema` - Tenant validation
  - `ResourceSchema` - Resource validation
  - Exported types: `Tenant`, `Resource`

- **`events.ts`** - Event definitions
  - `LedgerEventSchema` - Discriminated union of all event types
  - Event types: `ResourceCreated`, `HoldPlaced`, `HoldExpired`, `BookingConfirmed`, `BookingCancelled`

- **`types.ts`** - Re-exports all domain types

### Infrastructure Layer (`infrastructure/`)
Low-level utilities and implementations.

- **`bitmap/`** - Bitmap operations for time slot allocation
  - `types.ts` - `BitmapDay` type
  - `operations.ts` - Bitmap manipulation functions
    - `createEmptyBitmap()` - Create 180-byte bitmap
    - `getBit()` - Read bit at minute
    - `setBitRange()` - Set/clear bit range
    - `isRangeFree()` - Check if range is available
    - `createBitmapDay()` - Create bitmap day structure
  - `index.ts` - Re-exports

- **`mutex.ts`** - Async mutex for concurrency control
  - `createMutex()` - Create mutex instance

- **`event-store.ts`** - Event store interface and implementation
  - `EventStore` type - Interface for event storage
  - `createInMemoryEventStore()` - In-memory implementation

### Application Layer (`application/`)
Application logic and use cases.

- **`event-factory.ts`** - Event creation utilities
  - `createHoldPlacedEvent()` - Create HoldPlaced event
  - `createBookingConfirmedEvent()` - Create BookingConfirmed event

- **`allocator/`** - Allocation logic (broken into concerns)
  - **`types.ts`** - Allocator-specific types
    - `AllocatorState` - Map of days to bitmap states
    - `HoldMetadata` - Hold tracking metadata
  
  - **`state-manager.ts`** - State management
    - `createStateManager()` - Creates state manager with getState function
  
  - **`hold-manager.ts`** - Hold placement logic
    - `createHoldManager()` - Creates hold manager
    - `placeHold()` - Place a hold on a time slot
  
  - **`booking-manager.ts`** - Booking confirmation logic
    - `createBookingManager()` - Creates booking manager
    - `confirmBooking()` - Confirm a booking from a hold
  
  - **`expiry-manager.ts`** - Hold expiry logic
    - `createExpiryManager()` - Creates expiry manager
    - `expireHolds()` - Expire holds based on timestamp
  
  - **`allocator.ts`** - Main allocator (orchestrator)
    - `createAllocator()` - Creates allocator instance
    - Composes: state-manager, hold-manager, booking-manager, expiry-manager
  
  - **`index.ts`** - Re-exports

## Benefits of This Structure

### 1. **Separation of Concerns**
Each module has a single, well-defined responsibility:
- Domain: Pure business logic
- Infrastructure: Technical implementations
- Application: Use cases and orchestration

### 2. **Unit Testability**
Each module can be tested in isolation:
- `hold-manager.test.ts` - Test hold placement logic
- `booking-manager.test.ts` - Test booking confirmation
- `expiry-manager.test.ts` - Test hold expiry
- `state-manager.test.ts` - Test state management

### 3. **Logging Ready**
Each module can have its own logger:
```typescript
// Future: Each manager can have its own logger
const holdManager = createHoldManager({
  getState,
  holds,
  withLock,
  logger: createLogger('hold-manager'), // Easy to add
});
```

### 4. **Easy to Extend**
- Add new event types: `domain/events.ts`
- Add new managers: `application/allocator/new-manager.ts`
- Swap implementations: Replace `infrastructure/event-store.ts`

### 5. **Clear Dependencies**
- Domain → No dependencies
- Infrastructure → Only domain types
- Application → Domain + Infrastructure

## File Count

- **Domain**: 4 files (ids, schemas, events, types)
- **Infrastructure**: 4 files (bitmap: 3, mutex: 1, event-store: 1)
- **Application**: 7 files (event-factory: 1, allocator: 6)
- **Total**: 15 source files (vs 6 before)

## Test Coverage

All 37 tests pass with the new structure:
- Domain tests: `types.test.ts`, `events.test.ts`
- Infrastructure tests: `bitmap.test.ts`, `mutex.test.ts`, `event-store.test.ts`
- Application tests: `allocator.test.ts`, `e2e.test.ts`

## Future Enhancements

With this structure, it's easy to:
1. Add logging to each manager independently
2. Add metrics/monitoring per module
3. Add caching layers
4. Swap implementations (e.g., Postgres event store)
5. Add new allocation strategies
6. Add new event types

