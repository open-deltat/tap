# TAP Core Test Coverage

## Test Summary

**Total: 37 tests, all passing** ✅

## Test Files

### 1. `bitmap.test.ts` (6 tests)
Tests the core bitmap operations for time slot allocation:
- ✅ Creates 180-byte bitmap arrays (1440 bits = 1 day)
- ✅ Sets and gets bit ranges correctly
- ✅ Clears bits properly
- ✅ Detects free ranges (not booked or held)
- ✅ Detects held ranges
- ✅ Creates bitmap day structure with resolution

**Protocol relevance:** Bitmaps are the foundation of the allocation system - they prevent double-bookings at the bit level.

### 2. `allocator.test.ts` (7 tests)
Tests the core allocation logic with concurrency:
- ✅ Concurrent hold requests → only one wins (race condition protection)
- ✅ Hold placement flips bits correctly
- ✅ Hold → confirm is atomic (no double-booking)
- ✅ Cannot double-book same slot
- ✅ Overlapping holds are rejected
- ✅ Non-overlapping holds are allowed
- ✅ Expired holds are cleaned up

**Protocol relevance:** These are the critical path tests - they ensure the protocol's core guarantee: zero double-bookings.

### 3. `event-store.test.ts` (3 tests)
Tests the event store interface:
- ✅ Append and retrieve all events
- ✅ Filter events by resource (tenantId + resourceId)
- ✅ Filter events by tenant

**Protocol relevance:** Event store is the source of truth - all state changes are recorded as immutable events.

### 4. `mutex.test.ts` (3 tests) - NEW
Tests the mutex/locking mechanism:
- ✅ Serializes concurrent operations on same key
- ✅ Allows parallel operations on different keys
- ✅ Handles rapid sequential operations

**Protocol relevance:** Mutex ensures thread-safe operations - critical for preventing race conditions in concurrent hold placements.

### 5. `events.test.ts` (5 tests) - NEW
Tests event schema validation:
- ✅ Validates HoldPlaced event structure
- ✅ Validates BookingConfirmed event structure
- ✅ Rejects invalid event types
- ✅ Rejects events with invalid data (e.g., startMinute > 1439)
- ✅ Validates ResourceCreated event structure

**Protocol relevance:** Event validation ensures data integrity - all events must conform to the protocol schema.

### 6. `types.test.ts` (8 tests) - NEW
Tests type schemas and validation:
- ✅ Validates valid ULID format
- ✅ Rejects invalid ULID format
- ✅ Rejects ULID with wrong length
- ✅ Validates Tenant schema
- ✅ Rejects Tenant with invalid data (short slug)
- ✅ Validates Resource schema
- ✅ Rejects Resource with invalid slotMinutes
- ✅ Resource schema applies defaults (horizonDays, requiresPayment)

**Protocol relevance:** Type validation ensures all IDs and entities conform to protocol requirements.

### 7. `e2e.test.ts` (5 tests) - NEW
End-to-end integration tests:
- ✅ Full workflow: place hold → confirm booking → check events
- ✅ Concurrent holds: only one succeeds (race condition)
- ✅ Hold expiry workflow: expired holds are cleaned up
- ✅ Multiple non-overlapping holds: all succeed
- ✅ Event store filtering: by tenant and resource

**Protocol relevance:** These tests verify the complete protocol flow works correctly in realistic scenarios.

## Running Tests

### Run all tests (from root):
```bash
bun test
# or
bun run test  # via turbo
```

### Run tests in core package:
```bash
cd packages/core
bun test
```

### Run tests in watch mode:
```bash
bun test --watch
```

### Run tests with coverage:
```bash
bun test --coverage
```

## Test Coverage by Protocol Feature

| Feature | Tests | Status |
|---------|-------|--------|
| Bitmap allocation | 6 | ✅ |
| Hold placement | 4 | ✅ |
| Booking confirmation | 2 | ✅ |
| Concurrency/race conditions | 3 | ✅ |
| Hold expiry | 2 | ✅ |
| Event store | 3 | ✅ |
| Event validation | 5 | ✅ |
| Type validation | 8 | ✅ |
| E2E workflows | 5 | ✅ |
| **Total** | **37** | **✅** |

## Critical Protocol Guarantees Tested

1. **Zero double-bookings** ✅
   - Tested in: `allocator.test.ts` (concurrent holds, double-booking prevention)
   - Verified: Bitmap + mutex ensures only one hold succeeds for same slot

2. **Atomic operations** ✅
   - Tested in: `allocator.test.ts` (hold → confirm atomicity)
   - Verified: Hold confirmation is atomic - either succeeds or fails cleanly

3. **Event immutability** ✅
   - Tested in: `events.test.ts`, `event-store.test.ts`
   - Verified: Events are validated and stored immutably

4. **Concurrency safety** ✅
   - Tested in: `mutex.test.ts`, `allocator.test.ts` (concurrent operations)
   - Verified: Mutex serializes operations on same resource/day

5. **Hold expiry** ✅
   - Tested in: `allocator.test.ts`, `e2e.test.ts`
   - Verified: Expired holds are cleaned up and bits are freed

All tests are protocol-relevant and verify the core guarantees of TAP v0.1.

