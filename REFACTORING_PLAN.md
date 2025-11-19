# Comprehensive Refactoring & Testing Plan

## Goals
1. **100% test coverage** for all API routes with every possible use case
2. **Isolated, testable modules** for all functionality
3. **Perfect separation of concerns** between API, core, and app layers
4. **Comprehensive integration tests** for stream + delta + hold flow

## Current Issues

### 1. API Routes (`@api`)
- **Missing test coverage** for:
  - Hold endpoints (POST /hold, DELETE /hold/:holdId)
  - Edge cases in availability endpoint
  - Error handling in all routes
  - Validation edge cases
- **Route handlers are monolithic** - need to extract into isolated functions
- **No integration tests** for full request/response cycles

### 2. Stream Client (`@app`)
- **Stream connection logic** needs isolation and testing
- **Delta application** needs comprehensive unit tests
- **Hold management** needs to properly track hold metadata for HoldExpired events

### 3. Delta Application (`@app`)
- **Bug**: `HoldExpired` removes ALL held minutes, not just the specific hold
- **Missing**: Hold metadata tracking (holdId -> day/startMinute/endMinute)
- **Needs**: Comprehensive test suite for all event types

## Refactoring Steps

### Phase 1: Fix Critical Bugs
1. ✅ Fix `HoldExpired` event handling to track hold metadata
2. ✅ Create comprehensive tests for `availability-state.ts`

### Phase 2: Extract API Route Handlers
1. Extract each route handler into isolated, pure functions
2. Create comprehensive test suite for each handler
3. Test all edge cases, error conditions, validation

### Phase 3: Isolate Stream Client
1. Extract stream connection logic into testable module
2. Create mock EventSource for testing
3. Test reconnection, error handling, event parsing

### Phase 4: Integration Tests
1. Test full hold flow: place hold → emit delta → update all UIs
2. Test concurrent holds
3. Test hold expiration
4. Test booking from hold

## File Structure

```
packages/api/src/
  handlers/
    routes/
      availability.ts      # Isolated availability handler
      hold.ts              # Isolated hold handlers
      booking.ts           # Isolated booking handler
      stream.ts            # Already isolated
    __tests__/
      routes/
        availability.test.ts
        hold.test.ts
        booking.test.ts
        stream.test.ts
    public.ts             # Route dispatcher
    private.ts            # Route dispatcher

packages/app/src/
  lib/
    availability-state.ts  # Already isolated, needs tests
    stream-client.ts       # New: isolated stream client
    hold-manager.ts        # New: isolated hold management
    __tests__/
      availability-state.test.ts
      stream-client.test.ts
      hold-manager.test.ts
```



